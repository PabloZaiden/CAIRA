/// <summary>
/// ASP.NET Core Minimal API route definitions for the fictional sales/account-team sample API.
///
/// Maps business endpoints to agent container operations:
///   POST /api/activities/discovery              -> create conv, return syntheticMessage
///   POST /api/activities/planning            -> create conv, return syntheticMessage
///   POST /api/activities/staffing                -> create conv, return syntheticMessage
///   GET  /api/activities/adventures          -> GET  /conversations (enriched)
///   GET  /api/activities/adventures/:id      -> GET  /conversations/:id (enriched)
///   POST /api/activities/adventures/:id/parley -> POST /conversations/:id/messages (SSE parsed)
///   GET  /api/activities/stats               -> computed from adventures
///   GET  /health                         -> checks agent /health
///   GET  /health/deep                    -> auth-required check of agent business endpoint
/// </summary>

using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;

namespace CairaApi;

public static class Routes
{
    // ---------- In-memory adventure state ----------

    internal static readonly ConcurrentDictionary<string, AdventureRecord> AdventureStore = new();

    // ---------- Synthetic first messages ----------

    private static readonly Dictionary<string, string> SyntheticMessages = new()
    {
        ["discovery"] = "I am qualifying a new customer opportunity. Lead a short discovery conversation, ask targeted questions, and conclude with a concise qualification summary.",
        ["planning"] = "I need an account plan for an active customer. Guide me through priorities, risks, and next steps, then conclude with a concise planning summary.",
        ["staffing"] = "I need to staff an account team for a customer engagement. Interview me for the needed context and conclude with a clear staffing recommendation.",
    };

    // ---------- Route registration ----------

    public static void MapRoutes(this WebApplication app)
    {
        // ---- Health ----
        app.MapGet("/health", async (AgentHttpClient agentClient) =>
        {
            var start = DateTimeOffset.UtcNow;
            var result = await agentClient.CheckHealthAsync();
            var latencyMs = (int)(DateTimeOffset.UtcNow - start).TotalMilliseconds;

            var agentStatus = result.Ok ? "healthy" : "unhealthy";
            var overallStatus = result.Ok ? "healthy" : "degraded";

            var health = new HealthResponse(overallStatus,
                [new DependencyHealth("agent-container", agentStatus, latencyMs)]);

            return overallStatus == "healthy"
                ? Results.Ok(health)
                : Results.Json(health, statusCode: 503);
        });

        app.MapGet("/health/deep", async (AgentHttpClient agentClient) =>
        {
            var start = DateTimeOffset.UtcNow;
            var result = await agentClient.ListConversationsAsync(0, 1);
            var latencyMs = (int)(DateTimeOffset.UtcNow - start).TotalMilliseconds;

            var agentStatus = result.Ok ? "healthy" : "unhealthy";
            var overallStatus = result.Ok ? "healthy" : "degraded";

            var health = new HealthResponse(overallStatus,
                [new DependencyHealth("agent-container-auth", agentStatus, latencyMs)]);

            return overallStatus == "healthy"
                ? Results.Ok(health)
                : Results.Json(health, statusCode: 503);
        });

        // ---- Business operations: start adventure ----
        app.MapPost("/api/activities/discovery", (AgentHttpClient agentClient) =>
            HandleStartAdventure("discovery", agentClient));

        app.MapPost("/api/activities/planning", (AgentHttpClient agentClient) =>
            HandleStartAdventure("planning", agentClient));

        app.MapPost("/api/activities/staffing", (AgentHttpClient agentClient) =>
            HandleStartAdventure("staffing", agentClient));

        // ---- GET /api/activities/adventures ----
        app.MapGet("/api/activities/adventures", async (AgentHttpClient agentClient, int? offset, int? limit) =>
        {
            var result = await agentClient.ListConversationsAsync(offset, limit);
            if (!result.Ok || result.Data == null)
            {
                var status = AgentHttpClient.MapAgentStatus(result.Status);
                return Results.Json(
                    result.Error ?? new ErrorResponse("agent_error", "Failed to list adventures"),
                    statusCode: status);
            }

            var adventures = result.Data.Items
                .Select(c => ConversationToAdventure(c, AdventureStore.GetValueOrDefault(c.Id)))
                .ToList();

            return Results.Ok(new AdventureList(adventures, result.Data.Offset, result.Data.Limit, result.Data.Total));
        });

        // ---- GET /api/activities/adventures/{adventureId} ----
        app.MapGet("/api/activities/adventures/{adventureId}", async (string adventureId, AgentHttpClient agentClient) =>
        {
            var result = await agentClient.GetConversationAsync(adventureId);
            if (!result.Ok || result.Data == null)
            {
                var status = AgentHttpClient.MapAgentStatus(result.Status);
                return Results.Json(
                    result.Error ?? new ErrorResponse("agent_error", "Failed to get adventure"),
                    statusCode: status);
            }

            var detail = ConversationDetailToAdventureDetail(result.Data, AdventureStore.GetValueOrDefault(adventureId));
            return Results.Ok(detail);
        });

        // ---- POST /api/activities/adventures/{adventureId}/parley ----
        app.MapPost("/api/activities/adventures/{adventureId}/parley", async (
            string adventureId,
            HttpContext httpContext,
            AgentHttpClient agentClient,
            ILogger<AgentHttpClient> logger) =>
        {
            var traceId = Guid.NewGuid().ToString();
            var acceptHeader = httpContext.Request.Headers.Accept.ToString();
            var wantsStream = acceptHeader.Contains("text/event-stream");

            // Read body
            ParleyRequest? body;
            try
            {
                body = await httpContext.Request.ReadFromJsonAsync<ParleyRequest>();
            }
            catch
            {
                body = null;
            }

            if (body == null || string.IsNullOrEmpty(body.Message))
            {
                return Results.Json(new ErrorResponse("bad_request", "Missing required field: message"), statusCode: 400);
            }

            logger.LogInformation("parley request (traceId={TraceId}, mode={Mode})",
                traceId, wantsStream ? "stream" : "json");

            if (wantsStream)
            {
                // SSE streaming with outcome capture
                return Results.Stream(async stream =>
                {
                    try
                    {
                        using var response = await agentClient.SendMessageStreamAsync(adventureId, body.Message, traceId);

                        if (!response.IsSuccessStatusCode)
                        {
                            var status = AgentHttpClient.MapAgentStatus((int)response.StatusCode);
                            var errorJson = JsonSerializer.Serialize(new ErrorResponse("agent_error", $"Agent returned status {(int)response.StatusCode}"));
                            await stream.WriteAsync(Encoding.UTF8.GetBytes($"event: error\ndata: {errorJson}\n\n"));
                            return;
                        }

                        using var agentStream = await response.Content.ReadAsStreamAsync();
                        var outcome = await PipeSSEAndCaptureOutcome(agentStream, stream);

                        if (outcome != null)
                        {
                            if (AdventureStore.TryGetValue(adventureId, out var record))
                            {
                                record.Status = "resolved";
                                record.Outcome = outcome;
                            }
                        }

                        logger.LogInformation("parley SSE complete (traceId={TraceId}, resolved={Resolved})",
                            traceId, outcome != null);
                    }
                    catch (Exception ex)
                    {
                        logger.LogError(ex, "parley SSE failed — connection error (traceId={TraceId})",
                            traceId);
                        var errorJson = JsonSerializer.Serialize(new ErrorResponse("agent_unreachable", "Failed to connect to agent container for streaming"));
                        await stream.WriteAsync(Encoding.UTF8.GetBytes($"event: error\ndata: {errorJson}\n\n"));
                    }
                }, contentType: "text/event-stream");
            }
            else
            {
                // JSON response
                var result = await agentClient.SendMessageAsync(adventureId, body.Message, traceId);
                if (!result.Ok || result.Data == null)
                {
                    var status = AgentHttpClient.MapAgentStatus(result.Status);
                    return Results.Json(
                        result.Error ?? new ErrorResponse("agent_error", "Failed to send message"),
                        statusCode: status);
                }

                if (result.Data.Resolution != null)
                {
                    if (AdventureStore.TryGetValue(adventureId, out var record))
                    {
                        record.Status = "resolved";
                        record.Outcome = new AdventureOutcome(result.Data.Resolution.Tool, result.Data.Resolution.Result);
                    }
                }

                var parley = AgentMessageToParley(result.Data);
                return Results.Ok(parley);
            }
        });

        // ---- GET /api/activities/stats ----
        app.MapGet("/api/activities/stats", async (AgentHttpClient agentClient) =>
        {
            var result = await agentClient.ListConversationsAsync(0, 100);
            if (!result.Ok || result.Data == null)
            {
                var status = AgentHttpClient.MapAgentStatus(result.Status);
                return Results.Json(
                    result.Error ?? new ErrorResponse("agent_error", "Failed to get adventure stats"),
                    statusCode: status);
            }

            var counts = new Dictionary<string, int[]>
            {
                ["discovery"] = [0, 0, 0],  // total, active, resolved
                ["planning"] = [0, 0, 0],
                ["staffing"] = [0, 0, 0],
            };

            var totalAdventures = 0;
            var activeAdventures = 0;
            var resolvedAdventures = 0;

            foreach (var conv in result.Data.Items)
            {
                var record = AdventureStore.GetValueOrDefault(conv.Id);
                var mode = record?.Mode ?? ExtractModeFromMetadata(conv.Metadata);
                var advStatus = record?.Status ?? "active";

                totalAdventures++;
                if (!counts.TryGetValue(mode, out var modeArr))
                {
                    modeArr = [0, 0, 0];
                    counts[mode] = modeArr;
                }

                modeArr[0]++;
                if (advStatus == "resolved")
                {
                    resolvedAdventures++;
                    modeArr[2]++;
                }
                else
                {
                    activeAdventures++;
                    modeArr[1]++;
                }
            }

            var byMode = counts.ToDictionary(
                kv => kv.Key,
                kv => new ModeStats(kv.Value[0], kv.Value[1], kv.Value[2]));

            return Results.Ok(new ActivityStats(totalAdventures, activeAdventures, resolvedAdventures, byMode));
        });
    }

    // ---------- Helpers ----------

    private static async Task<IResult> HandleStartAdventure(string mode, AgentHttpClient agentClient)
    {
        var traceId = Guid.NewGuid().ToString();
        var syntheticMessage = SyntheticMessages[mode];
        var metadata = new Dictionary<string, object> { ["mode"] = mode };

        // Only create the conversation — do NOT send the first message.
        // The frontend will send syntheticMessage via the streaming parley endpoint.
        var createResult = await agentClient.CreateConversationAsync(metadata, traceId);
        if (!createResult.Ok || createResult.Data == null)
        {
            var status = AgentHttpClient.MapAgentStatus(createResult.Status);
            return Results.Json(
                createResult.Error ?? new ErrorResponse("agent_error", "Failed to start adventure"),
                statusCode: status);
        }

        var data = createResult.Data;
        var record = new AdventureRecord { Mode = mode };
        AdventureStore[data.Id] = record;

        var response = new AdventureStarted(
            data.Id, mode, record.Status,
            syntheticMessage,
            data.CreatedAt);

        return Results.Json(response, statusCode: 201);
    }

    private static Adventure ConversationToAdventure(
        AgentConversation conv, AdventureRecord? record)
    {
        var mode = record?.Mode ?? ExtractModeFromMetadata(conv.Metadata);
        var status = record?.Status ?? "active";
        return new Adventure(conv.Id, mode, status, record?.Outcome,
            conv.CreatedAt, conv.UpdatedAt, 0);
    }

    private static AdventureDetail ConversationDetailToAdventureDetail(
        AgentConversationDetail detail, AdventureRecord? record)
    {
        var mode = record?.Mode ?? ExtractModeFromMetadata(detail.Metadata);
        var status = record?.Status ?? "active";
        return new AdventureDetail(detail.Id, mode, status, record?.Outcome,
            detail.CreatedAt, detail.UpdatedAt, detail.Messages.Count,
            detail.Messages.Select(AgentMessageToParley).ToList());
    }

    private static ParleyMessage AgentMessageToParley(AgentMessage msg)
    {
        AdventureOutcome? resolution = msg.Resolution != null
            ? new AdventureOutcome(msg.Resolution.Tool, msg.Resolution.Result)
            : null;
        return new ParleyMessage(msg.Id, msg.Role, msg.Content, msg.CreatedAt, msg.Usage, resolution);
    }

    private static string ExtractModeFromMetadata(Dictionary<string, object>? metadata)
    {
        if (metadata != null && metadata.TryGetValue("mode", out var modeObj))
        {
            var mode = modeObj?.ToString();
            if (mode is "discovery" or "planning" or "staffing") return mode;
        }
        return "discovery"; // fallback
    }

    /// <summary>
    /// Pipe SSE stream from agent to client while capturing activity.resolved events.
    /// </summary>
    private static async Task<AdventureOutcome?> PipeSSEAndCaptureOutcome(
        Stream agentStream, Stream clientStream)
    {
        AdventureOutcome? captured = null;
        var buffer = new byte[8192];
        var textBuffer = new StringBuilder();
        string? eventType = null;

        int bytesRead;
        while ((bytesRead = await agentStream.ReadAsync(buffer)) > 0)
        {
            // Write raw bytes to client immediately
            await clientStream.WriteAsync(buffer.AsMemory(0, bytesRead));
            await clientStream.FlushAsync();

            // Parse for activity.resolved events
            var chunk = Encoding.UTF8.GetString(buffer, 0, bytesRead);
            textBuffer.Append(chunk);

            // Process complete lines
            var text = textBuffer.ToString();
            var lines = text.Split('\n');
            // Keep the last partial line in the buffer
            textBuffer.Clear();
            textBuffer.Append(lines[^1]);

            for (var i = 0; i < lines.Length - 1; i++)
            {
                var line = lines[i];
                if (line.StartsWith("event: "))
                {
                    eventType = line[7..].Trim();
                }
                else if (line.StartsWith("data: ") && eventType == "activity.resolved")
                {
                    try
                    {
                        var data = JsonSerializer.Deserialize<AdventureOutcome>(line[6..]);
                        if (data != null) captured = data;
                    }
                    catch (JsonException)
                    {
                        // Malformed JSON — skip
                    }
                    eventType = null;
                }
                else if (line.Length == 0)
                {
                    eventType = null;
                }
            }
        }

        return captured;
    }
}
