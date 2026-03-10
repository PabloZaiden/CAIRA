/// <summary>
/// Configuration loader for the API container.
///
/// Reads environment variables and validates required settings.
/// Fails fast if required variables are missing.
/// </summary>

namespace CairaApi;

public sealed class ApiConfig
{
    /// <summary>Server port.</summary>
    public int Port { get; init; } = 4000;

    /// <summary>Server bind address.</summary>
    public string Host { get; init; } = "0.0.0.0";

    /// <summary>Base URL of the agent container (e.g., http://localhost:3000).</summary>
    public string AgentServiceUrl { get; init; } = string.Empty;

    /// <summary>Azure AD token scope for agent auth (e.g., api://&lt;client-id&gt;/.default).</summary>
    public string? AgentTokenScope { get; init; }

    /// <summary>Application Insights connection string for Azure Monitor OTEL export.</summary>
    public string? ApplicationInsightsConnectionString { get; init; }

    /// <summary>Minimum log level.</summary>
    public string LogLevel { get; init; } = "Debug";

    /// <summary>Skip token acquisition (for local dev with mocks).</summary>
    public bool SkipAuth { get; init; }

    /// <summary>
    /// Load configuration from environment variables.
    /// Throws if required variables are missing.
    /// </summary>
    public static ApiConfig FromEnvironment()
    {
        var agentServiceUrl = Environment.GetEnvironmentVariable("AGENT_SERVICE_URL");
        if (string.IsNullOrWhiteSpace(agentServiceUrl))
        {
            throw new InvalidOperationException(
                "AGENT_SERVICE_URL environment variable is required. " +
                "Set it to the base URL of the agent container (e.g., http://localhost:3000).");
        }

        // Strip trailing slashes for consistency
        agentServiceUrl = agentServiceUrl.TrimEnd('/');

        return new ApiConfig
        {
            Port = int.TryParse(Environment.GetEnvironmentVariable("PORT"), out var port) ? port : 4000,
            Host = Environment.GetEnvironmentVariable("HOST") ?? "0.0.0.0",
            AgentServiceUrl = agentServiceUrl,
            AgentTokenScope = Environment.GetEnvironmentVariable("AGENT_TOKEN_SCOPE"),
            ApplicationInsightsConnectionString = Environment.GetEnvironmentVariable("APPLICATIONINSIGHTS_CONNECTION_STRING"),
            LogLevel = Environment.GetEnvironmentVariable("LOG_LEVEL") ?? "Debug",
            SkipAuth = Environment.GetEnvironmentVariable("SKIP_AUTH") == "true",
        };
    }
}
