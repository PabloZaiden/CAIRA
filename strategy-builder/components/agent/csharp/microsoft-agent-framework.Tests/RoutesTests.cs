/// <summary>
/// Tests for Routes.cs — endpoint registration, validation, and behaviour.
///
/// Mirrors the TypeScript routes.test.ts patterns:
///   - POST /conversations → 201 with conversation object
///   - GET /conversations → list with pagination
///   - GET /conversations/{id} → 404 for missing, 400 for invalid, 200 for found
///   - POST /conversations/{id}/messages → 400 for missing content, 404 for missing conversation
///   - POST /conversations/{id}/messages (SSE) → text/event-stream format
///   - GET /health → healthy/degraded
///   - GET /metrics → Prometheus text format
///   - Auth middleware (when enabled)
///
/// Uses a real WebApplication with Routes.MapRoutes() and Moq mocks of
/// ConversationStore and WorkflowRunner (all public methods are virtual).
/// This bypasses Program.cs entirely, testing only route logic.
/// </summary>

using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Agents.AI.Workflows;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace CairaAgent.Tests;

public class RoutesTests : IDisposable
{
    private readonly Mock<ConversationStore> _mockStore;
    private readonly Mock<WorkflowRunner> _mockRunner;
    private readonly HttpClient _httpClient;
    private readonly WebApplication _app;

    public RoutesTests()
    {
        _mockStore = new Mock<ConversationStore>();
        _mockRunner = CreateMockRunner();

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = "Testing",
        });
        builder.WebHost.UseTestServer();
        builder.Logging.SetMinimumLevel(LogLevel.Warning);

        var app = builder.Build();
        var config = CreateTestConfig();
        Routes.MapRoutes(app, _mockStore.Object, _mockRunner.Object, config);
        app.StartAsync().GetAwaiter().GetResult();

        _app = app;
        _httpClient = app.GetTestClient();
    }

    public void Dispose()
    {
        _httpClient.Dispose();
        _app.StopAsync().GetAwaiter().GetResult();
        _app.DisposeAsync().GetAwaiter().GetResult();
        GC.SuppressFinalize(this);
    }

    private static AgentConfig CreateTestConfig()
    {
        return new AgentConfig
        {
            AzureEndpoint = "https://test.openai.azure.com",
            SkipAuth = true,
        };
    }

    /// <summary>
    /// Create a mock WorkflowRunner. WorkflowRunner requires an AgentSetupResult,
    /// ConversationStore, and ILogger in its constructor. We pass null-safe values
    /// via Moq's loose behaviour.
    /// </summary>
    private static Mock<WorkflowRunner> CreateMockRunner()
    {
        var setupResult = new AgentSetupResult
        {
            Workflow = null,
            CheckpointManager = CheckpointManager.CreateInMemory(),
            WorkflowsByMode = new Dictionary<string, Workflow>(),
        };
        var store = new ConversationStore();
        var logger = Mock.Of<ILogger<WorkflowRunner>>();
        return new Mock<WorkflowRunner>(setupResult, store, logger, new System.Diagnostics.ActivitySource("CairaAgent.Tests")) { CallBase = false };
    }

    // ========================================================================
    // POST /conversations
    // ========================================================================

    [Fact]
    public async Task PostConversations_Returns201WithConversation()
    {
        var expected = new Conversation("conv_123", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z");
        _mockStore.Setup(s => s.Create(null)).Returns(expected);

        var response = await _httpClient.PostAsync("/conversations", null);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("conv_123", body.GetProperty("id").GetString());
        Assert.Equal("2026-01-01T00:00:00Z", body.GetProperty("createdAt").GetString());
    }

    [Fact]
    public async Task PostConversations_WithMetadata_PassesMetadataToStore()
    {
        var metadata = new Dictionary<string, object> { ["mode"] = "shanty" };
        _mockStore.Setup(s => s.Create(It.IsAny<Dictionary<string, object>?>()))
            .Returns(new Conversation("conv_456", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z", metadata));

        var content = new StringContent(
            JsonSerializer.Serialize(new { metadata }),
            Encoding.UTF8, "application/json");
        var response = await _httpClient.PostAsync("/conversations", content);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task PostConversations_Returns500OnStoreException()
    {
        _mockStore.Setup(s => s.Create(null))
            .Throws(new Exception("DB error"));

        var response = await _httpClient.PostAsync("/conversations", null);

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("internal_error", body.GetProperty("code").GetString());
    }

    // ========================================================================
    // GET /conversations
    // ========================================================================

    [Fact]
    public async Task GetConversations_ReturnsListWithPagination()
    {
        var list = new ConversationList(
            [new Conversation("conv_1", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z")],
            0, 20, 1);
        _mockStore.Setup(s => s.List(0, 20)).Returns(list);

        var response = await _httpClient.GetAsync("/conversations");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, body.GetProperty("total").GetInt32());
        Assert.Single(body.GetProperty("items").EnumerateArray());
    }

    [Fact]
    public async Task GetConversations_PassesOffsetAndLimit()
    {
        var list = new ConversationList([], 10, 5, 0);
        _mockStore.Setup(s => s.List(10, 5)).Returns(list);

        var response = await _httpClient.GetAsync("/conversations?offset=10&limit=5");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(10, body.GetProperty("offset").GetInt32());
        Assert.Equal(5, body.GetProperty("limit").GetInt32());
    }

    // ========================================================================
    // GET /conversations/{conversationId}
    // ========================================================================

    [Fact]
    public async Task GetConversation_Returns200WhenFound()
    {
        var detail = new ConversationDetail("conv_1", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z", []);
        _mockStore.Setup(s => s.Get("conv_1")).Returns(detail);

        var response = await _httpClient.GetAsync("/conversations/conv_1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("conv_1", body.GetProperty("id").GetString());
    }

    [Fact]
    public async Task GetConversation_Returns404WhenNotFound()
    {
        _mockStore.Setup(s => s.Get("conv_missing")).Returns((ConversationDetail?)null);

        var response = await _httpClient.GetAsync("/conversations/conv_missing");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("not_found", body.GetProperty("code").GetString());
    }

    [Fact]
    public async Task GetConversation_Returns400ForInvalidId()
    {
        var response = await _httpClient.GetAsync("/conversations/invalid%20id%21");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("bad_request", body.GetProperty("code").GetString());
    }

    // ========================================================================
    // POST /conversations/{conversationId}/messages — JSON
    // ========================================================================

    [Fact]
    public async Task PostMessages_Returns200WithMessage()
    {
        var msg = new Message("msg_1", "assistant", "Ahoy!", "2026-01-01T00:00:00Z");
        _mockRunner.Setup(r => r.SendMessageAsync("conv_1", "Hello"))
            .ReturnsAsync(msg);

        var content = new StringContent(
            JsonSerializer.Serialize(new { content = "Hello" }),
            Encoding.UTF8, "application/json");
        var response = await _httpClient.PostAsync("/conversations/conv_1/messages", content);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("assistant", body.GetProperty("role").GetString());
        Assert.Equal("Ahoy!", body.GetProperty("content").GetString());
    }

    [Fact]
    public async Task PostMessages_Returns400WhenContentMissing()
    {
        var content = new StringContent(
            JsonSerializer.Serialize(new { }),
            Encoding.UTF8, "application/json");
        var response = await _httpClient.PostAsync("/conversations/conv_1/messages", content);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("bad_request", body.GetProperty("code").GetString());
        Assert.Contains("content", body.GetProperty("message").GetString()!);
    }

    [Fact]
    public async Task PostMessages_Returns400ForInvalidConversationId()
    {
        var content = new StringContent(
            JsonSerializer.Serialize(new { content = "Hello" }),
            Encoding.UTF8, "application/json");
        var response = await _httpClient.PostAsync("/conversations/bad%20id%21/messages", content);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task PostMessages_Returns404WhenConversationNotFound()
    {
        _mockRunner.Setup(r => r.SendMessageAsync("conv_missing", "Hello"))
            .ReturnsAsync((Message?)null);

        var content = new StringContent(
            JsonSerializer.Serialize(new { content = "Hello" }),
            Encoding.UTF8, "application/json");
        var response = await _httpClient.PostAsync("/conversations/conv_missing/messages", content);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task PostMessages_Returns500OnRunnerException()
    {
        _mockRunner.Setup(r => r.SendMessageAsync("conv_1", "Hello"))
            .ThrowsAsync(new Exception("Agent error"));

        var content = new StringContent(
            JsonSerializer.Serialize(new { content = "Hello" }),
            Encoding.UTF8, "application/json");
        var response = await _httpClient.PostAsync("/conversations/conv_1/messages", content);

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("internal_error", body.GetProperty("code").GetString());
    }

    // ========================================================================
    // POST /conversations/{conversationId}/messages — SSE
    // ========================================================================

    [Fact]
    public async Task PostMessages_SSE_ReturnsEventStream()
    {
        _mockRunner.Setup(r => r.SendMessageStreamAsync("conv_1", "Hello", It.IsAny<Func<string, Task>>()))
            .Returns(async (string _, string _, Func<string, Task> onChunk) =>
            {
                await onChunk("event: message.delta\ndata: {\"content\":\"Ahoy\"}\n\n");
                await onChunk("event: message.complete\ndata: {\"messageId\":\"msg_1\",\"content\":\"Ahoy\"}\n\n");
            });

        var request = new HttpRequestMessage(HttpMethod.Post, "/conversations/conv_1/messages")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new { content = "Hello" }),
                Encoding.UTF8, "application/json"),
        };
        request.Headers.Accept.ParseAdd("text/event-stream");

        var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/event-stream", response.Content.Headers.ContentType?.MediaType);

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("event: message.delta", body);
        Assert.Contains("event: message.complete", body);
    }

    [Fact]
    public async Task PostMessages_SSE_EmitsErrorEventOnException()
    {
        _mockRunner.Setup(r => r.SendMessageStreamAsync("conv_1", "Hello", It.IsAny<Func<string, Task>>()))
            .ThrowsAsync(new Exception("Stream error"));

        var request = new HttpRequestMessage(HttpMethod.Post, "/conversations/conv_1/messages")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new { content = "Hello" }),
                Encoding.UTF8, "application/json"),
        };
        request.Headers.Accept.ParseAdd("text/event-stream");

        var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);

        // SSE always returns 200, errors are in the stream
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("event: error", body);
        Assert.Contains("agent_error", body);
    }

    // ========================================================================
    // GET /health
    // ========================================================================

    [Fact]
    public async Task GetHealth_ReturnsHealthyStatus()
    {
        _mockRunner.Setup(r => r.CheckHealth())
            .Returns(new HealthResponse("healthy", [new HealthCheck("azure-openai", "healthy", 0)]));

        var response = await _httpClient.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("healthy", body.GetProperty("status").GetString());
    }

    [Fact]
    public async Task GetHealth_Returns503WhenUnhealthy()
    {
        _mockRunner.Setup(r => r.CheckHealth())
            .Returns(new HealthResponse("unhealthy", [new HealthCheck("azure-openai", "unhealthy")]));

        var response = await _httpClient.GetAsync("/health");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact]
    public async Task GetHealth_Returns200WhenDegraded()
    {
        _mockRunner.Setup(r => r.CheckHealth())
            .Returns(new HealthResponse("degraded", [new HealthCheck("azure-openai", "unhealthy")]));

        var response = await _httpClient.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("degraded", body.GetProperty("status").GetString());
    }

    // ========================================================================
    // GET /metrics
    // ========================================================================

    [Fact]
    public async Task GetMetrics_ReturnsPrometheusFormat()
    {
        var response = await _httpClient.GetAsync("/metrics");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/plain", response.Content.Headers.ContentType?.MediaType);

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("agent_requests_total", body);
        Assert.Contains("agent_conversations_created_total", body);
        Assert.Contains("agent_messages_sent_total", body);
        Assert.Contains("agent_errors_total", body);
    }

    [Fact]
    public async Task GetMetrics_IncrementsRequestCount()
    {
        _mockRunner.Setup(r => r.CheckHealth())
            .Returns(new HealthResponse("healthy"));
        await _httpClient.GetAsync("/health");
        await _httpClient.GetAsync("/health");

        var response = await _httpClient.GetAsync("/metrics");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Contains("agent_requests_total", body);
    }

    // ========================================================================
    // Auth middleware
    // ========================================================================

    /// <summary>
    /// Helper to create a separate app with auth enabled (SkipAuth = false).
    /// Used by auth tests that need different config from the default test fixture.
    /// </summary>
    private static (WebApplication app, HttpClient client, Mock<ConversationStore> store, Mock<WorkflowRunner> runner) CreateAuthApp()
    {
        var config = new AgentConfig
        {
            AzureEndpoint = "https://test.openai.azure.com",
            SkipAuth = false,
        };
        var mockStore = new Mock<ConversationStore>();
        var mockRunner = CreateMockRunner();

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = "Testing",
        });
        builder.WebHost.UseTestServer();
        builder.Logging.SetMinimumLevel(LogLevel.Warning);
        var app = builder.Build();
        Routes.MapRoutes(app, mockStore.Object, mockRunner.Object, config);
        app.StartAsync().GetAwaiter().GetResult();

        return (app, app.GetTestClient(), mockStore, mockRunner);
    }

    [Fact]
    public async Task Auth_Returns401WithoutBearerToken()
    {
        var (app, client, _, _) = CreateAuthApp();
        try
        {
            var response = await client.PostAsync("/conversations", null);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("unauthorized", body.GetProperty("code").GetString());
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    [Fact]
    public async Task Auth_Returns401WhenBearerTokenIsEmpty()
    {
        var (app, client, _, _) = CreateAuthApp();
        try
        {
            var request = new HttpRequestMessage(HttpMethod.Post, "/conversations");
            request.Headers.TryAddWithoutValidation("Authorization", "Bearer ");
            var response = await client.SendAsync(request);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("unauthorized", body.GetProperty("code").GetString());
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    [Fact]
    public async Task Auth_AllowsRequestWithBearerToken()
    {
        var (app, client, mockStore, _) = CreateAuthApp();
        mockStore.Setup(s => s.Create(null))
            .Returns(new Conversation("conv_1", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"));
        try
        {
            var request = new HttpRequestMessage(HttpMethod.Post, "/conversations");
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "test-token");
            var response = await client.SendAsync(request);
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    [Fact]
    public async Task Auth_AllowsHealthWithoutToken()
    {
        var (app, client, _, mockRunner) = CreateAuthApp();
        mockRunner.Setup(r => r.CheckHealth())
            .Returns(new HealthResponse("healthy"));
        try
        {
            var response = await client.GetAsync("/health");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    [Fact]
    public async Task Auth_AllowsMetricsWithoutToken()
    {
        var (app, client, _, _) = CreateAuthApp();
        try
        {
            var response = await client.GetAsync("/metrics");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    // ========================================================================
    // ID validation
    // ========================================================================

    [Theory]
    [InlineData("valid-id-123")]
    [InlineData("conv_123")]
    [InlineData("abc")]
    public async Task ValidId_IsAccepted(string id)
    {
        _mockStore.Setup(s => s.Get(id)).Returns((ConversationDetail?)null);

        // Should get 404 (not found), not 400 (bad request)
        var response = await _httpClient.GetAsync($"/conversations/{id}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData("has spaces")]
    [InlineData("has!special")]
    [InlineData("has@chars")]
    public async Task InvalidId_Returns400(string id)
    {
        var response = await _httpClient.GetAsync($"/conversations/{Uri.EscapeDataString(id)}");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
