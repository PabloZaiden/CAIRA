/// <summary>
/// Types matching contracts/agent-api.openapi.yaml schemas.
/// </summary>

using System.Text.Json.Serialization;

namespace CairaAgent;

// ---------- Conversation types ----------

public sealed record Conversation(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("createdAt")] string CreatedAt,
    [property: JsonPropertyName("updatedAt")] string UpdatedAt,
    [property: JsonPropertyName("metadata")][property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    Dictionary<string, object>? Metadata = null);

public sealed record ConversationList(
    [property: JsonPropertyName("items")] List<Conversation> Items,
    [property: JsonPropertyName("offset")] int Offset,
    [property: JsonPropertyName("limit")] int Limit,
    [property: JsonPropertyName("total")] int Total);

public sealed record ConversationDetail(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("createdAt")] string CreatedAt,
    [property: JsonPropertyName("updatedAt")] string UpdatedAt,
    [property: JsonPropertyName("messages")] List<Message> Messages,
    [property: JsonPropertyName("metadata")][property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    Dictionary<string, object>? Metadata = null);

public sealed record Message(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("role")] string Role,
    [property: JsonPropertyName("content")] string Content,
    [property: JsonPropertyName("createdAt")] string CreatedAt,
    [property: JsonPropertyName("usage")][property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    TokenUsage? Usage = null,
    [property: JsonPropertyName("resolution")][property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    ActivityResolution? Resolution = null);

public sealed record ActivityResolution(
    [property: JsonPropertyName("tool")] string Tool,
    [property: JsonPropertyName("result")] Dictionary<string, object> Result);

public sealed record TokenUsage(
    [property: JsonPropertyName("promptTokens")][property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    int? PromptTokens = null,
    [property: JsonPropertyName("completionTokens")][property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    int? CompletionTokens = null);

// ---------- Health types ----------

public sealed record HealthResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("checks")][property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    List<HealthCheck>? Checks = null);

public sealed record HealthCheck(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("latencyMs")][property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    int? LatencyMs = null);

// ---------- Error types ----------

public sealed record ErrorResponse(
    [property: JsonPropertyName("code")] string Code,
    [property: JsonPropertyName("message")] string Message);

// ---------- SSE event payloads ----------

public sealed record SseDeltaEvent(
    [property: JsonPropertyName("content")] string Content);

public sealed record SseCompleteEvent(
    [property: JsonPropertyName("messageId")] string MessageId,
    [property: JsonPropertyName("content")] string Content,
    [property: JsonPropertyName("usage")][property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    TokenUsage? Usage = null);

public sealed record SseErrorEvent(
    [property: JsonPropertyName("code")] string Code,
    [property: JsonPropertyName("message")] string Message);

public sealed record SseResolvedEvent(
    [property: JsonPropertyName("tool")] string Tool,
    [property: JsonPropertyName("result")] Dictionary<string, object> Result);

public sealed record SseToolCalledEvent(
    [property: JsonPropertyName("toolName")] string ToolName);

public sealed record SseToolDoneEvent(
    [property: JsonPropertyName("toolName")] string ToolName);

// ---------- Request body types ----------

public sealed record CreateConversationRequest(
    [property: JsonPropertyName("metadata")] Dictionary<string, object>? Metadata = null);

public sealed record SendMessageRequest(
    [property: JsonPropertyName("content")] string Content);

// Note: ConversationRecord (internal mutable state) lives in ConversationStore.cs
