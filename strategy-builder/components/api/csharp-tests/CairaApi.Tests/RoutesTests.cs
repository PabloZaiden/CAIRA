/// <summary>
/// Tests for Routes.cs — health, start adventure, adventure CRUD, parley, stats.
///
/// Uses WebApplicationFactory to spin up the API in-process with a mocked
/// AgentHttpClient. Since AgentHttpClient is sealed and registered via
/// AddHttpClient (typed client), we replace the underlying HttpMessageHandler
/// to control agent responses.
///
/// Mirrors the TypeScript routes.test.ts patterns:
///   - Health endpoint returns status from agent health check
///   - Start adventure (discovery/planning/staffing) creates conversation and returns 201
///   - List adventures, get adventure detail
///   - Parley (JSON and SSE modes)
///   - Stats computed from adventure state
/// </summary>

using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace CairaApi.Tests;

public class RoutesTests : IClassFixture<RoutesTests.ApiFactory>, IDisposable
{
    private readonly ApiFactory _factory;
    private readonly HttpClient _client;

    public RoutesTests(ApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
        // Clear adventure store between tests
        Routes.AdventureStore.Clear();
    }

    public void Dispose()
    {
        _client.Dispose();
        Routes.AdventureStore.Clear();
    }

    // ========================================================================
    // Health endpoint
    // ========================================================================

    [Fact]
    public async Task GetHealth_ReturnsHealthyWhenAgentHealthy()
    {
        _factory.AgentHandler.Enqueue(HttpStatusCode.OK,
            new { status = "healthy", checks = new[] { new { name = "azure-openai", status = "healthy" } } });

        var response = await _client.GetAsync("/health");
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("healthy", body.GetProperty("status").GetString());
    }

    [Fact]
    public async Task GetHealth_Returns503WhenAgentUnhealthy()
    {
        _factory.AgentHandler.Enqueue(HttpStatusCode.ServiceUnavailable,
            new { status = "degraded", checks = new[] { new { name = "azure-openai", status = "unhealthy" } } });

        var response = await _client.GetAsync("/health");
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("degraded", body.GetProperty("status").GetString());
    }

    [Fact]
    public async Task GetHealthDeep_ReturnsHealthyWhenAgentBusinessEndpointHealthy()
    {
        _factory.AgentHandler.Enqueue(HttpStatusCode.OK, new
        {
            items = Array.Empty<object>(),
            offset = 0,
            limit = 1,
            total = 0,
        });

        var response = await _client.GetAsync("/health/deep");
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("healthy", body.GetProperty("status").GetString());
        var dependencies = body.GetProperty("dependencies");
        Assert.Equal("agent-container-auth", dependencies[0].GetProperty("name").GetString());
        Assert.Equal("healthy", dependencies[0].GetProperty("status").GetString());
    }

    // ========================================================================
    // Auth middleware parity with TypeScript API
    // ========================================================================

    [Fact]
    public async Task AuthMiddleware_Returns401WithoutBearerOnBusinessRoute()
    {
        using var authFactory = new AuthApiFactory();
        using var client = authFactory.CreateClient();

        var response = await client.GetAsync("/api/activities/adventures");
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("unauthorized", body.GetProperty("code").GetString());
    }

    [Fact]
    public async Task AuthMiddleware_RequiresBearerForDeepHealth()
    {
        using var authFactory = new AuthApiFactory();
        using var client = authFactory.CreateClient();

        var noAuth = await client.GetAsync("/health/deep");
        Assert.Equal(HttpStatusCode.Unauthorized, noAuth.StatusCode);

        authFactory.AgentHandler.Enqueue(HttpStatusCode.OK, new
        {
            items = Array.Empty<object>(),
            offset = 0,
            limit = 1,
            total = 0,
        });

        var withAuthRequest = new HttpRequestMessage(HttpMethod.Get, "/health/deep");
        withAuthRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "bff-token");
        var withAuth = await client.SendAsync(withAuthRequest);
        Assert.Equal(HttpStatusCode.OK, withAuth.StatusCode);
    }

    [Fact]
    public async Task AuthMiddleware_AllowsBearerAndSendsFallbackBearerDownstream()
    {
        using var authFactory = new AuthApiFactory();
        authFactory.AgentHandler.Enqueue(HttpStatusCode.OK, new
        {
            items = Array.Empty<object>(),
            offset = 0,
            limit = 20,
            total = 0,
        });
        using var client = authFactory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Get, "/api/activities/adventures");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "bff-token");
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var downstreamAuth = authFactory.AgentHandler.Requests[^1].Headers.Authorization;
        Assert.NotNull(downstreamAuth);
        Assert.Equal("Bearer", downstreamAuth!.Scheme);
        Assert.Equal("test-agent-token", downstreamAuth.Parameter);
    }

    [Fact]
    public async Task AuthMiddleware_RejectsInvalidBearerTokens()
    {
        using var authFactory = new AuthApiFactory();
        using var client = authFactory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Get, "/api/activities/adventures");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "wrong-token");
        var response = await client.SendAsync(request);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("unauthorized", body.GetProperty("code").GetString());
        Assert.Equal("Invalid or unauthorized bearer token", body.GetProperty("message").GetString());
    }

    // ========================================================================
    // Start adventure
    // ========================================================================

    [Theory]
    [InlineData("/api/activities/discovery", "discovery")]
    [InlineData("/api/activities/planning", "planning")]
    [InlineData("/api/activities/staffing", "staffing")]
    public async Task StartAdventure_Returns201WithAdventureData(string endpoint, string expectedMode)
    {
        _factory.AgentHandler.Enqueue(HttpStatusCode.Created, new
        {
            id = "conv_test_1",
            createdAt = "2026-01-01T00:00:00Z",
            updatedAt = "2026-01-01T00:00:00Z",
        });

        var response = await _client.PostAsync(endpoint, null);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("conv_test_1", body.GetProperty("id").GetString());
        Assert.Equal(expectedMode, body.GetProperty("mode").GetString());
        Assert.Equal("active", body.GetProperty("status").GetString());
        Assert.True(body.TryGetProperty("syntheticMessage", out var synth));
        Assert.False(string.IsNullOrEmpty(synth.GetString()));
        Assert.True(body.TryGetProperty("createdAt", out _));
    }

    [Fact]
    public async Task StartAdventure_ReturnsErrorWhenAgentFails()
    {
        _factory.AgentHandler.Enqueue(HttpStatusCode.InternalServerError,
            new { code = "agent_error", message = "Internal error" });

        var response = await _client.PostAsync("/api/activities/discovery", null);

        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
    }

    [Fact]
    public async Task StartAdventure_StoresAdventureRecord()
    {
        _factory.AgentHandler.Enqueue(HttpStatusCode.Created, new
        {
            id = "conv_stored_1",
            createdAt = "2026-01-01T00:00:00Z",
            updatedAt = "2026-01-01T00:00:00Z",
        });

        await _client.PostAsync("/api/activities/discovery", null);

        Assert.True(Routes.AdventureStore.ContainsKey("conv_stored_1"));
        Assert.Equal("discovery", Routes.AdventureStore["conv_stored_1"].Mode);
        Assert.Equal("active", Routes.AdventureStore["conv_stored_1"].Status);
    }

    // ========================================================================
    // List adventures
    // ========================================================================

    [Fact]
    public async Task GetAdventures_ReturnsListFromAgent()
    {
        // Seed adventure store
        Routes.AdventureStore["conv_a"] = new AdventureRecord { Mode = "discovery" };

        _factory.AgentHandler.Enqueue(HttpStatusCode.OK, new
        {
            items = new[]
            {
                new { id = "conv_a", createdAt = "2026-01-01T00:00:00Z", updatedAt = "2026-01-01T00:00:00Z" },
            },
            offset = 0,
            limit = 20,
            total = 1,
        });

        var response = await _client.GetAsync("/api/activities/adventures");
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, body.GetProperty("total").GetInt32());
        var adventures = body.GetProperty("adventures");
        Assert.Equal(1, adventures.GetArrayLength());
        Assert.Equal("discovery", adventures[0].GetProperty("mode").GetString());
    }

    [Fact]
    public async Task GetAdventures_PassesPaginationParams()
    {
        _factory.AgentHandler.Enqueue(HttpStatusCode.OK, new
        {
            items = Array.Empty<object>(),
            offset = 5,
            limit = 10,
            total = 0,
        });

        var response = await _client.GetAsync("/api/activities/adventures?offset=5&limit=10");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        // Verify the agent handler got the right query params
        var agentRequest = _factory.AgentHandler.Requests[^1];
        Assert.Contains("offset=5", agentRequest.RequestUri!.ToString());
        Assert.Contains("limit=10", agentRequest.RequestUri!.ToString());
    }

    // ========================================================================
    // Get adventure detail
    // ========================================================================

    [Fact]
    public async Task GetAdventureDetail_ReturnsDetailFromAgent()
    {
        Routes.AdventureStore["conv_detail"] = new AdventureRecord { Mode = "planning" };

        _factory.AgentHandler.Enqueue(HttpStatusCode.OK, new
        {
            id = "conv_detail",
            createdAt = "2026-01-01T00:00:00Z",
            updatedAt = "2026-01-01T00:00:00Z",
            messages = new[]
            {
                new { id = "msg_1", role = "user", content = "Hello", createdAt = "2026-01-01T00:00:01Z" },
                new { id = "msg_2", role = "assistant", content = "Ahoy!", createdAt = "2026-01-01T00:00:02Z" },
            },
        });

        var response = await _client.GetAsync("/api/activities/adventures/conv_detail");
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("conv_detail", body.GetProperty("id").GetString());
        Assert.Equal("planning", body.GetProperty("mode").GetString());
        Assert.Equal(2, body.GetProperty("messageCount").GetInt32());
        Assert.Equal(2, body.GetProperty("parleys").GetArrayLength());
    }

    [Fact]
    public async Task GetAdventureDetail_Returns404WhenNotFound()
    {
        _factory.AgentHandler.Enqueue(HttpStatusCode.NotFound,
            new { code = "not_found", message = "Conversation not found" });

        var response = await _client.GetAsync("/api/activities/adventures/conv_missing");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ========================================================================
    // Parley (JSON mode)
    // ========================================================================

    [Fact]
    public async Task Parley_Returns400WhenMessageMissing()
    {
        var content = new StringContent("{}", Encoding.UTF8, "application/json");
        var response = await _client.PostAsync("/api/activities/adventures/conv_1/parley", content);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("bad_request", body.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Parley_Returns400WhenBodyEmpty()
    {
        var content = new StringContent("", Encoding.UTF8, "application/json");
        var response = await _client.PostAsync("/api/activities/adventures/conv_1/parley", content);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Parley_ReturnsMessageOnSuccess()
    {
        _factory.AgentHandler.Enqueue(HttpStatusCode.OK, new
        {
            id = "msg_parley_1",
            role = "assistant",
            content = "Yo ho ho!",
            createdAt = "2026-01-01T00:00:00Z",
        });

        var body = new StringContent(
            JsonSerializer.Serialize(new { message = "Sing me a discovery" }),
            Encoding.UTF8, "application/json");
        var response = await _client.PostAsync("/api/activities/adventures/conv_1/parley", body);
        var result = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("msg_parley_1", result.GetProperty("id").GetString());
        Assert.Equal("assistant", result.GetProperty("role").GetString());
    }

    [Fact]
    public async Task Parley_UpdatesAdventureStatusOnResolution()
    {
        Routes.AdventureStore["conv_resolve"] = new AdventureRecord { Mode = "discovery" };

        _factory.AgentHandler.Enqueue(HttpStatusCode.OK, new
        {
            id = "msg_res_1",
            role = "assistant",
            content = "Battle over!",
            createdAt = "2026-01-01T00:00:00Z",
            resolution = new
            {
                tool = "resolve_discovery",
                result = new Dictionary<string, object>
                {
                    ["winner"] = "player",
                    ["rounds"] = 3,
                    ["primary_need"] = "A fine verse",
                },
            },
        });

        var body = new StringContent(
            JsonSerializer.Serialize(new { message = "Final verse" }),
            Encoding.UTF8, "application/json");
        var response = await _client.PostAsync("/api/activities/adventures/conv_resolve/parley", body);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("resolved", Routes.AdventureStore["conv_resolve"].Status);
        Assert.NotNull(Routes.AdventureStore["conv_resolve"].Outcome);
    }

    // ========================================================================
    // Parley (SSE mode)
    // ========================================================================

    [Fact]
    public async Task Parley_SSE_ReturnsEventStream()
    {
        var sseContent = "event: message.delta\ndata: {\"delta\":\"Ahoy\"}\n\nevent: message.complete\ndata: {\"id\":\"msg_1\",\"content\":\"Ahoy\",\"role\":\"assistant\"}\n\n";
        var agentResponse = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(sseContent, Encoding.UTF8, "text/event-stream"),
        };
        _factory.AgentHandler.Enqueue(agentResponse);

        var request = new HttpRequestMessage(HttpMethod.Post, "/api/activities/adventures/conv_sse/parley")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new { message = "Hello" }),
                Encoding.UTF8, "application/json"),
        };
        request.Headers.Accept.ParseAdd("text/event-stream");

        var response = await _client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/event-stream", response.Content.Headers.ContentType?.MediaType);

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("message.delta", body);
        Assert.Contains("message.complete", body);
    }

    // ========================================================================
    // Stats
    // ========================================================================

    [Fact]
    public async Task GetStats_ReturnsComputedStats()
    {
        // Seed adventure store
        Routes.AdventureStore["conv_s1"] = new AdventureRecord { Mode = "discovery" };
        Routes.AdventureStore["conv_s2"] = new AdventureRecord { Mode = "discovery", Status = "resolved" };
        Routes.AdventureStore["conv_t1"] = new AdventureRecord { Mode = "planning" };

        _factory.AgentHandler.Enqueue(HttpStatusCode.OK, new
        {
            items = new[]
            {
                new { id = "conv_s1", createdAt = "2026-01-01T00:00:00Z", updatedAt = "2026-01-01T00:00:00Z" },
                new { id = "conv_s2", createdAt = "2026-01-01T00:00:00Z", updatedAt = "2026-01-01T00:00:00Z" },
                new { id = "conv_t1", createdAt = "2026-01-01T00:00:00Z", updatedAt = "2026-01-01T00:00:00Z" },
            },
            offset = 0,
            limit = 100,
            total = 3,
        });

        var response = await _client.GetAsync("/api/activities/stats");
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(3, body.GetProperty("totalAdventures").GetInt32());
        Assert.Equal(2, body.GetProperty("activeAdventures").GetInt32());
        Assert.Equal(1, body.GetProperty("resolvedAdventures").GetInt32());

        var byMode = body.GetProperty("byMode");
        Assert.Equal(2, byMode.GetProperty("discovery").GetProperty("total").GetInt32());
        Assert.Equal(1, byMode.GetProperty("planning").GetProperty("total").GetInt32());
    }

    // ========================================================================
    // Test infrastructure
    // ========================================================================

    /// <summary>
    /// Custom WebApplicationFactory that replaces the HttpMessageHandler used
    /// by AgentHttpClient with a controllable mock handler.
    /// </summary>
    public sealed class ApiFactory : WebApplicationFactory<Program>
    {
        /// <summary>
        /// The mock handler that controls all agent HTTP responses.
        /// Shared across all tests in this class (reset per test via Clear).
        /// </summary>
        public QueuedMockHandler AgentHandler { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            // Set required env vars for ApiConfig.FromEnvironment()
            Environment.SetEnvironmentVariable("AGENT_SERVICE_URL", "http://mock-agent:3000");
            Environment.SetEnvironmentVariable("SKIP_AUTH", "true");

            builder.ConfigureServices(services =>
            {
                // Remove existing HttpClient registrations for AgentHttpClient
                // and replace with our mock handler
                services.AddHttpClient<AgentHttpClient>()
                    .ConfigurePrimaryHttpMessageHandler(() => AgentHandler);
            });
        }
    }

    public sealed class AuthApiFactory : WebApplicationFactory<Program>
    {
        public QueuedMockHandler AgentHandler { get; } = new();

        private sealed class FakeIncomingTokenValidator : IIncomingTokenValidator
        {
            public Task ValidateAccessTokenAsync(string token, CancellationToken cancellationToken = default)
            {
                if (token != "bff-token")
                {
                    throw new UnauthorizedTokenException("bad token");
                }

                return Task.CompletedTask;
            }
        }

        private sealed class FakeAccessTokenProvider : IAccessTokenProvider
        {
            public Task<string> GetAccessTokenAsync(string scope, CancellationToken cancellationToken = default)
                => Task.FromResult("test-agent-token");
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            Environment.SetEnvironmentVariable("AGENT_SERVICE_URL", "http://mock-agent:3000");
            Environment.SetEnvironmentVariable("AGENT_TOKEN_SCOPE", "api://agent/.default");
            Environment.SetEnvironmentVariable("INBOUND_AUTH_TENANT_ID", "tenant-123");
            Environment.SetEnvironmentVariable("INBOUND_AUTH_ALLOWED_AUDIENCES", "api://caira-api");
            Environment.SetEnvironmentVariable("SKIP_AUTH", "false");

            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IIncomingTokenValidator>();
                services.RemoveAll<IAccessTokenProvider>();
                services.AddSingleton<IIncomingTokenValidator, FakeIncomingTokenValidator>();
                services.AddSingleton<IAccessTokenProvider, FakeAccessTokenProvider>();
                services.AddHttpClient<AgentHttpClient>()
                    .ConfigurePrimaryHttpMessageHandler(() => AgentHandler);
            });
        }
    }

    /// <summary>
    /// Mock handler with a FIFO queue of responses, shared across test methods.
    /// Thread-safe via ConcurrentQueue.
    /// </summary>
    public sealed class QueuedMockHandler : HttpMessageHandler
    {
        private readonly System.Collections.Concurrent.ConcurrentQueue<HttpResponseMessage> _responses = new();
        private readonly System.Collections.Concurrent.ConcurrentBag<HttpRequestMessage> _requestsBag = new();

        public IReadOnlyList<HttpRequestMessage> Requests => _requestsBag.Reverse().ToList();

        public void Enqueue(HttpResponseMessage response) => _responses.Enqueue(response);

        public void Enqueue(HttpStatusCode status, object? body = null)
        {
            var msg = new HttpResponseMessage(status);
            if (body != null)
            {
                msg.Content = new StringContent(
                    JsonSerializer.Serialize(body, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }),
                    Encoding.UTF8, "application/json");
            }
            _responses.Enqueue(msg);
        }

        public void Clear()
        {
            while (_responses.TryDequeue(out _)) { }
            while (_requestsBag.TryTake(out _)) { }
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            _requestsBag.Add(request);
            if (!_responses.TryDequeue(out var response))
            {
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.InternalServerError)
                {
                    Content = new StringContent(
                        "{\"code\":\"no_mock\",\"message\":\"No queued response\"}",
                        Encoding.UTF8, "application/json"),
                });
            }
            return Task.FromResult(response);
        }
    }
}
