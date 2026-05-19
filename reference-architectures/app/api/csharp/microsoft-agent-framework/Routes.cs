/// <summary>
/// Endpoint registration for the agent container API.
///
/// Implements the core agent API described in reference-architectures/app/API_CONTRACT.md:
///   POST   /conversations                          -> createConversation
///   GET    /conversations                          -> listConversations
///   GET    /conversations/{conversationId}          -> getConversation
///   POST   /conversations/{conversationId}/messages -> sendMessage (SSE or JSON)
///   GET    /health                                 -> health check
///   GET    /metrics                                -> Prometheus metrics
///   GET    /identity                               -> credential diagnostics
///
/// Routes are thin — they parse HTTP, delegate to ConversationStore for
/// CRUD and WorkflowRunner for agent execution, and format responses.
/// No agent logic lives here.
/// </summary>

using Azure.Core;
using Azure.Identity;
using System.IdentityModel.Tokens.Jwt;

namespace CairaAgent;

public static class Routes
{
    // Metrics counters
    private static long _requestCount;
    private static long _conversationsCreated;
    private static long _messagesSent;
    private static long _errorsTotal;

    public static void MapRoutes(
        WebApplication app,
        ConversationStore store,
        WorkflowRunner runner,
        AgentConfig config,
        IIncomingTokenValidator incomingTokenValidator)
    {
        // Track all requests
        app.Use(async (context, next) =>
        {
            Interlocked.Increment(ref _requestCount);
            await next();
        });

        // Auth middleware — skipped when SKIP_AUTH=true (mock/dev mode)
        if (!config.SkipAuth)
        {
            app.Use(async (context, next) =>
            {
                var path = context.Request.Path.Value ?? "";
                if (path is "/health" or "/metrics" or "/identity")
                {
                    await next();
                    return;
                }

                var authHeader = context.Request.Headers.Authorization.ToString();
                var token = AuthHelpers.ExtractBearerToken(authHeader);
                if (string.IsNullOrWhiteSpace(token))
                {
                    Interlocked.Increment(ref _errorsTotal);
                    context.Response.StatusCode = 401;
                    await context.Response.WriteAsJsonAsync(
                        new ErrorResponse("unauthorized", "Missing or invalid Authorization header"));
                    return;
                }

                try
                {
                    await incomingTokenValidator.ValidateAccessTokenAsync(token, context.RequestAborted);
                }
                catch
                {
                    Interlocked.Increment(ref _errorsTotal);
                    context.Response.StatusCode = 401;
                    await context.Response.WriteAsJsonAsync(
                        new ErrorResponse("unauthorized", "Invalid or unauthorized bearer token"));
                    return;
                }

                await next();
            });
        }

        // POST /conversations
        app.MapPost("/conversations", async (HttpContext ctx) =>
        {
            try
            {
                CreateConversationRequest? body = null;
                try
                {
                    body = await ctx.Request.ReadFromJsonAsync<CreateConversationRequest>();
                }
                catch { /* Empty body is fine */ }

                var conversation = store.Create(body?.Metadata);
                Interlocked.Increment(ref _conversationsCreated);
                ctx.Response.StatusCode = 201;
                await ctx.Response.WriteAsJsonAsync(conversation);
            }
            catch (Exception ex)
            {
                Interlocked.Increment(ref _errorsTotal);
                ctx.Response.StatusCode = 500;
                await ctx.Response.WriteAsJsonAsync(
                    new ErrorResponse("internal_error", $"Failed to create conversation: {ex.Message}"));
            }
        });

        // GET /conversations
        app.MapGet("/conversations", (int? offset, int? limit) =>
        {
            try
            {
                var list = store.List(offset ?? 0, limit ?? 20);
                return Results.Ok(list);
            }
            catch
            {
                Interlocked.Increment(ref _errorsTotal);
                return Results.Json(new ErrorResponse("internal_error", "Failed to list conversations"), statusCode: 500);
            }
        });

        // GET /conversations/{conversationId}
        app.MapGet("/conversations/{conversationId}", (string conversationId) =>
        {
            if (string.IsNullOrEmpty(conversationId) || !IsValidId(conversationId))
            {
                return Results.Json(new ErrorResponse("bad_request", "Invalid conversation ID format"), statusCode: 400);
            }

            var detail = store.Get(conversationId);
            if (detail == null)
            {
                return Results.Json(new ErrorResponse("not_found", $"Conversation {conversationId} not found"), statusCode: 404);
            }

            return Results.Ok(detail);
        });

        // POST /conversations/{conversationId}/messages
        app.MapPost("/conversations/{conversationId}/messages", async (HttpContext ctx, string conversationId) =>
        {
            if (string.IsNullOrEmpty(conversationId) || !IsValidId(conversationId))
            {
                ctx.Response.StatusCode = 400;
                await ctx.Response.WriteAsJsonAsync(
                    new ErrorResponse("bad_request", "Invalid conversation ID format"));
                return;
            }

            var body = await ctx.Request.ReadFromJsonAsync<SendMessageRequest>();
            if (body == null || string.IsNullOrEmpty(body.Content))
            {
                ctx.Response.StatusCode = 400;
                await ctx.Response.WriteAsJsonAsync(
                    new ErrorResponse("bad_request", "Missing required field: content"));
                return;
            }

            var acceptHeader = ctx.Request.Headers.Accept.ToString();
            var wantsStream = acceptHeader.Contains("text/event-stream");

            if (wantsStream)
            {
                // SSE streaming response
                ctx.Response.ContentType = "text/event-stream";
                ctx.Response.Headers.CacheControl = "no-cache";
                ctx.Response.Headers.Connection = "keep-alive";

                try
                {
                    await runner.SendMessageStreamAsync(conversationId, body.Content, async chunk =>
                    {
                        await ctx.Response.WriteAsync(chunk);
                        await ctx.Response.Body.FlushAsync();
                    });
                    Interlocked.Increment(ref _messagesSent);
                }
                catch (Exception ex)
                {
                    Interlocked.Increment(ref _errorsTotal);
                    try
                    {
                        var errorSse = $"event: error\ndata: {{\"code\":\"agent_error\",\"message\":\"{ex.Message.Replace("\"", "\\\"")}\"}}\n\n";
                        await ctx.Response.WriteAsync(errorSse);
                    }
                    catch { /* Connection already closed */ }
                }
            }
            else
            {
                // JSON response (non-streaming)
                try
                {
                    var message = await runner.SendMessageAsync(conversationId, body.Content);
                    if (message == null)
                    {
                        ctx.Response.StatusCode = 404;
                        await ctx.Response.WriteAsJsonAsync(
                            new ErrorResponse("not_found", $"Conversation {conversationId} not found"));
                        return;
                    }
                    Interlocked.Increment(ref _messagesSent);
                    await ctx.Response.WriteAsJsonAsync(message);
                }
                catch (Exception ex)
                {
                    Interlocked.Increment(ref _errorsTotal);
                    ctx.Response.StatusCode = 500;
                    await ctx.Response.WriteAsJsonAsync(
                        new ErrorResponse("internal_error", $"Failed to send message: {ex.Message}"));
                }
            }
        });

        // GET /health
        app.MapGet("/health", () =>
        {
            var health = runner.CheckHealth();
            return health.Status == "unhealthy"
                ? Results.Json(health, statusCode: 503)
                : Results.Ok(health);
        });

        // GET /metrics — Prometheus-compatible text format
        app.MapGet("/metrics", () =>
        {
            var lines = new[]
            {
                "# HELP agent_requests_total Total number of requests",
                "# TYPE agent_requests_total counter",
                $"agent_requests_total {Interlocked.Read(ref _requestCount)}",
                "",
                "# HELP agent_conversations_created_total Conversations created",
                "# TYPE agent_conversations_created_total counter",
                $"agent_conversations_created_total {Interlocked.Read(ref _conversationsCreated)}",
                "",
                "# HELP agent_messages_sent_total Messages sent",
                "# TYPE agent_messages_sent_total counter",
                $"agent_messages_sent_total {Interlocked.Read(ref _messagesSent)}",
                "",
                "# HELP agent_errors_total Total errors",
                "# TYPE agent_errors_total counter",
                $"agent_errors_total {Interlocked.Read(ref _errorsTotal)}",
                "",
            };
            return Results.Text(string.Join('\n', lines), "text/plain");
        });

        // GET /identity
        app.MapGet("/identity", async (ILogger<Program> logger) =>
        {
            try
            {
                var credential = CreateAzureCredential();
                var tokenResponse = await credential.GetTokenAsync(
                    new TokenRequestContext(["https://management.azure.com/.default"]),
                    CancellationToken.None);

                if (string.IsNullOrWhiteSpace(tokenResponse.Token))
                {
                    throw new InvalidOperationException("Failed to acquire Azure management token");
                }

                var claims = DecodeJwtPayload(tokenResponse.Token);
                return Results.Ok(new
                {
                    authenticated = true,
                    identity = new
                    {
                        tenantId = GetClaimValue(claims, "tid"),
                        objectId = GetClaimValue(claims, "oid"),
                        displayName = GetClaimValue(claims, "name") ?? GetClaimValue(claims, "appid"),
                        type = InferIdentityType(claims),
                    },
                });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to get identity");
                return Results.Ok(new
                {
                    authenticated = false,
                    reason = $"Credential error: {ex.Message}",
                });
            }
        });
    }

    private static bool IsValidId(string s)
    {
        return s.Length > 0 && System.Text.RegularExpressions.Regex.IsMatch(s, @"^[\w-]+$");
    }

    private static TokenCredential CreateAzureCredential()
    {
        var clientId = Environment.GetEnvironmentVariable("AZURE_CLIENT_ID");
        return string.IsNullOrWhiteSpace(clientId)
            ? new DefaultAzureCredential()
            : new DefaultAzureCredential(new DefaultAzureCredentialOptions
            {
                ManagedIdentityClientId = clientId,
            });
    }

    private static JwtPayload DecodeJwtPayload(string token)
    {
        try
        {
            return new JwtSecurityTokenHandler().ReadJwtToken(token).Payload;
        }
        catch
        {
            return new JwtPayload();
        }
    }

    private static string? GetClaimValue(JwtPayload claims, string claimName)
    {
        return claims.TryGetValue(claimName, out var value) ? value?.ToString() : null;
    }

    private static string InferIdentityType(JwtPayload claims)
    {
        if (claims.ContainsKey("xms_mirid")) return "managedIdentity";
        if (claims.ContainsKey("appid") && !claims.ContainsKey("name")) return "servicePrincipal";
        if (claims.ContainsKey("name")) return "user";
        return "unknown";
    }
}
