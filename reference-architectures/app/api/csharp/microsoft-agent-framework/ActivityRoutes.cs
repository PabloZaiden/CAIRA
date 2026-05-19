using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace CairaAgent;

public static class ActivityRoutes
{
    private sealed class ActivityRecord
    {
        public required string Mode { get; init; }
        public string Status { get; set; } = "active";
        public ActivityOutcome? Outcome { get; set; }
    }

    private static readonly ConcurrentDictionary<string, ActivityRecord> Store = new();

    private static readonly Dictionary<string, string> SyntheticMessages = new()
    {
        ["discovery"] = "I am qualifying a new customer opportunity. Lead a short discovery conversation, ask targeted questions, and conclude with a concise qualification summary.",
        ["planning"] = "I need an account plan for an active customer. Guide me through priorities, risks, and next steps, then conclude with a concise planning summary.",
        ["staffing"] = "I need to staff an account team for a customer engagement. Interview me for the needed context and conclude with a clear staffing recommendation.",
    };

    public static void MapRoutes(WebApplication app, ConversationStore conversations, WorkflowRunner runner)
    {
        app.MapGet("/health/deep", () =>
        {
            var health = runner.CheckHealth();
            var ok = health.Status == "healthy";
            return ok
                ? Results.Ok(new ApiHealthResponse("healthy", [new DependencyHealth("agent-runtime", health.Status)]))
                : Results.Json(new ApiHealthResponse("degraded", [new DependencyHealth("agent-runtime", health.Status)]), statusCode: 503);
        });

        app.MapPost("/api/activities/discovery", () => Start("discovery", conversations));
        app.MapPost("/api/activities/planning", () => Start("planning", conversations));
        app.MapPost("/api/activities/staffing", () => Start("staffing", conversations));

        app.MapGet("/api/activities/conversations", (int? offset, int? limit) =>
        {
            var list = conversations.List(offset ?? 0, limit ?? 20);
            return Results.Ok(new ActivityConversationList(
                list.Items.Select(ToActivityConversation).ToList(),
                list.Offset,
                list.Limit,
                list.Total));
        });

        app.MapGet("/api/activities/conversations/{conversationId}", (string conversationId) =>
        {
            var detail = conversations.Get(conversationId);
            return detail == null
                ? Results.Json(new ErrorResponse("not_found", $"Conversation {conversationId} not found"), statusCode: 404)
                : Results.Ok(ToActivityConversationDetail(detail));
        });

        app.MapPost("/api/activities/conversations/{conversationId}/messages", async (
            string conversationId,
            HttpContext context) =>
        {
            var body = await context.Request.ReadFromJsonAsync<ActivityMessageRequest>();
            if (string.IsNullOrWhiteSpace(body?.Message))
            {
                return Results.Json(new ErrorResponse("bad_request", "Missing required field: message"), statusCode: 400);
            }

            if (context.Request.Headers.Accept.ToString().Contains("text/event-stream"))
            {
                return Results.Stream(async stream =>
                {
                    ActivityOutcome? captured = null;
                    await runner.SendMessageStreamAsync(conversationId, body.Message, async chunk =>
                    {
                        captured ??= TryCaptureOutcome(chunk);
                        await stream.WriteAsync(Encoding.UTF8.GetBytes(chunk));
                        await stream.FlushAsync();
                    });
                    MarkResolved(conversationId, captured);
                }, contentType: "text/event-stream");
            }

            var message = await runner.SendMessageAsync(conversationId, body.Message);
            if (message == null)
            {
                return Results.Json(new ErrorResponse("not_found", $"Conversation {conversationId} not found"), statusCode: 404);
            }

            MarkResolved(conversationId, message.Resolution == null
                ? null
                : new ActivityOutcome(message.Resolution.Tool, message.Resolution.Result));
            return Results.Ok(message);
        });

        app.MapGet("/api/activities/stats", () =>
        {
            var list = conversations.List(0, 100);
            var modes = new Dictionary<string, ModeStats>
            {
                ["discovery"] = new(0, 0, 0),
                ["planning"] = new(0, 0, 0),
                ["staffing"] = new(0, 0, 0),
            };

            foreach (var conversation in list.Items)
            {
                var record = Store.GetValueOrDefault(conversation.Id);
                var mode = record?.Mode ?? ModeFrom(conversation.Metadata);
                var current = modes[mode];
                modes[mode] = record?.Status == "resolved"
                    ? current with { Total = current.Total + 1, Resolved = current.Resolved + 1 }
                    : current with { Total = current.Total + 1, Active = current.Active + 1 };
            }

            var resolved = modes.Values.Sum(m => m.Resolved);
            return Results.Ok(new ActivityStats(list.Items.Count, list.Items.Count - resolved, resolved, modes));
        });

        app.MapPost("/chat", async (ActivityMessageRequest request) =>
        {
            var conversation = conversations.Create(new() { ["mode"] = "discovery", ["chat"] = true });
            var message = await runner.SendMessageAsync(conversation.Id, request.Message);
            return Results.Ok(new ChatResponse(conversation.Id, message?.Content ?? "", "microsoft-agent-framework"));
        });
    }

    private static IResult Start(string mode, ConversationStore conversations)
    {
        var conversation = conversations.Create(new() { ["mode"] = mode });
        Store[conversation.Id] = new ActivityRecord { Mode = mode };
        return Results.Json(new ActivityStarted(conversation.Id, mode, "active", SyntheticMessages[mode], conversation.CreatedAt), statusCode: 201);
    }

    private static ActivityConversation ToActivityConversation(Conversation conversation)
    {
        var record = Store.GetValueOrDefault(conversation.Id);
        return new ActivityConversation(
            conversation.Id,
            record?.Mode ?? ModeFrom(conversation.Metadata),
            record?.Status ?? "active",
            conversation.CreatedAt,
            conversation.UpdatedAt,
            0,
            record?.Outcome);
    }

    private static ActivityConversationDetail ToActivityConversationDetail(ConversationDetail detail)
    {
        var baseConversation = ToActivityConversation(new Conversation(detail.Id, detail.CreatedAt, detail.UpdatedAt, detail.Metadata));
        return new ActivityConversationDetail(
            baseConversation.Id,
            baseConversation.Mode,
            baseConversation.Status,
            baseConversation.CreatedAt,
            baseConversation.LastMessageAt,
            detail.Messages.Count,
            detail.Messages,
            baseConversation.Outcome);
    }

    private static string ModeFrom(Dictionary<string, object>? metadata)
    {
        if (metadata != null && metadata.TryGetValue("mode", out var mode) && mode?.ToString() is "planning" or "staffing" or "discovery")
        {
            return mode.ToString()!;
        }
        return "discovery";
    }

    private static void MarkResolved(string conversationId, ActivityOutcome? outcome)
    {
        if (outcome == null || !Store.TryGetValue(conversationId, out var record)) return;
        record.Status = "resolved";
        record.Outcome = outcome;
    }

    private static ActivityOutcome? TryCaptureOutcome(string chunk)
    {
        if (!chunk.Contains("event: activity.resolved", StringComparison.Ordinal)) return null;
        var line = chunk.Split('\n').FirstOrDefault(l => l.StartsWith("data: ", StringComparison.Ordinal));
        if (line == null) return null;
        return JsonSerializer.Deserialize<ActivityOutcome>(line["data: ".Length..]);
    }
}

public sealed record ActivityMessageRequest([property: JsonPropertyName("message")] string Message);
public sealed record ActivityStarted(string Id, string Mode, string Status, string SyntheticMessage, string CreatedAt);
public sealed record ActivityOutcome(string Tool, Dictionary<string, object> Result);
public sealed record ActivityConversation(string Id, string Mode, string Status, string CreatedAt, string LastMessageAt, int MessageCount, ActivityOutcome? Outcome = null);
public sealed record ActivityConversationDetail(string Id, string Mode, string Status, string CreatedAt, string LastMessageAt, int MessageCount, List<Message> Messages, ActivityOutcome? Outcome = null);
public sealed record ActivityConversationList(List<ActivityConversation> Conversations, int Offset, int Limit, int Total);
public sealed record ModeStats(int Total, int Active, int Resolved);
public sealed record ActivityStats(int TotalConversations, int ActiveConversations, int ResolvedConversations, Dictionary<string, ModeStats> ByMode);
public sealed record DependencyHealth(string Name, string Status, int? LatencyMs = null);
public sealed record ApiHealthResponse(string Status, List<DependencyHealth> Dependencies);
public sealed record ChatResponse(string ConversationId, string Reply, string Model);
