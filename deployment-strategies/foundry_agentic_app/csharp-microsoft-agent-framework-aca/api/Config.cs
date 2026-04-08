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

    /// <summary>Tenant ID used to validate inbound Entra access tokens.</summary>
    public string? InboundAuthTenantId { get; init; }

    /// <summary>Accepted audiences for inbound access tokens.</summary>
    public IReadOnlyList<string> InboundAuthAllowedAudiences { get; init; } = [];

    /// <summary>Optional allowlist of caller application IDs (`azp` or `appid`).</summary>
    public IReadOnlyList<string> InboundAuthAllowedCallerAppIds { get; init; } = [];

    /// <summary>Authority host used for Entra metadata and issuer validation.</summary>
    public string InboundAuthAuthorityHost { get; init; } = "https://login.microsoftonline.com";

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
        var skipAuth = Environment.GetEnvironmentVariable("SKIP_AUTH") == "true";
        var agentTokenScope = Environment.GetEnvironmentVariable("AGENT_TOKEN_SCOPE");
        var inboundAuthTenantId = Environment.GetEnvironmentVariable("INBOUND_AUTH_TENANT_ID");
        var inboundAuthAllowedAudiences = SplitCsv(Environment.GetEnvironmentVariable("INBOUND_AUTH_ALLOWED_AUDIENCES"));
        var inboundAuthAllowedCallerAppIds = SplitCsv(Environment.GetEnvironmentVariable("INBOUND_AUTH_ALLOWED_CALLER_APP_IDS"));
        var inboundAuthAuthorityHost = (Environment.GetEnvironmentVariable("INBOUND_AUTH_AUTHORITY_HOST") ?? "https://login.microsoftonline.com").TrimEnd('/');

        if (!skipAuth)
        {
            if (string.IsNullOrWhiteSpace(agentTokenScope))
            {
                throw new InvalidOperationException(
                    "AGENT_TOKEN_SCOPE environment variable is required when SKIP_AUTH is not true. " +
                    "Set it to the Entra scope used by the API when calling the agent container.");
            }

            if (string.IsNullOrWhiteSpace(inboundAuthTenantId))
            {
                throw new InvalidOperationException(
                    "INBOUND_AUTH_TENANT_ID environment variable is required when SKIP_AUTH is not true. " +
                    "Set it to the Entra tenant ID expected to issue BFF -> API access tokens.");
            }

            if (inboundAuthAllowedAudiences.Count == 0)
            {
                throw new InvalidOperationException(
                    "INBOUND_AUTH_ALLOWED_AUDIENCES environment variable is required when SKIP_AUTH is not true. " +
                    "Set it to a comma-separated list of accepted API audiences.");
            }
        }

        return new ApiConfig
        {
            Port = int.TryParse(Environment.GetEnvironmentVariable("PORT"), out var port) ? port : 4000,
            Host = Environment.GetEnvironmentVariable("HOST") ?? "0.0.0.0",
            AgentServiceUrl = agentServiceUrl,
            AgentTokenScope = agentTokenScope,
            InboundAuthTenantId = inboundAuthTenantId,
            InboundAuthAllowedAudiences = inboundAuthAllowedAudiences,
            InboundAuthAllowedCallerAppIds = inboundAuthAllowedCallerAppIds,
            InboundAuthAuthorityHost = inboundAuthAuthorityHost,
            ApplicationInsightsConnectionString = Environment.GetEnvironmentVariable("APPLICATIONINSIGHTS_CONNECTION_STRING"),
            LogLevel = Environment.GetEnvironmentVariable("LOG_LEVEL") ?? "Debug",
            SkipAuth = skipAuth,
        };
    }

    private static IReadOnlyList<string> SplitCsv(string? rawValue)
    {
        return (rawValue ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToArray();
    }
}
