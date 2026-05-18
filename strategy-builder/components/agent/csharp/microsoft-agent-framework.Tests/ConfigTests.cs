/// <summary>
/// Tests for Config.cs — environment variable loading and validation.
///
/// Mirrors the TypeScript config.test.ts patterns:
///   - Loads with all defaults when only required vars are set
///   - Throws when required vars are missing
///   - Overrides all optional fields
///   - Strips trailing slashes from endpoint
///   - Treats SKIP_AUTH as false for any non-"true" value
///   - Parses PORT as integer
/// </summary>

using Xunit;

namespace CairaAgent.Tests;

/// <summary>
/// AgentConfig.Load() reads directly from Environment.GetEnvironmentVariable(),
/// so we must set/clear env vars around each test. The collection attribute
/// ensures these tests run sequentially (not in parallel) to avoid conflicts.
/// </summary>
[Collection("EnvironmentTests")]
public class ConfigTests : IDisposable
{
    // All env vars that AgentConfig.Load() reads — cleared in Dispose()
    private static readonly string[] AllEnvVars =
    [
        "AZURE_OPENAI_ENDPOINT",
        "PORT",
        "HOST",
        "AZURE_OPENAI_API_VERSION",
        "AGENT_MODEL",
        "AGENT_NAME",
        "SHARED_INSTRUCTIONS",
        "DISCOVERY_INSTRUCTIONS",
        "PLANNING_INSTRUCTIONS",
        "STAFFING_INSTRUCTIONS",
        "INBOUND_AUTH_TENANT_ID",
        "INBOUND_AUTH_ALLOWED_AUDIENCES",
        "INBOUND_AUTH_ALLOWED_CALLER_APP_IDS",
        "INBOUND_AUTH_AUTHORITY_HOST",
        "LOG_LEVEL",
        "SKIP_AUTH",
    ];

    public ConfigTests()
    {
        // Start each test with a clean slate
        ClearAll();
    }

    public void Dispose()
    {
        ClearAll();
        GC.SuppressFinalize(this);
    }

    private static void ClearAll()
    {
        foreach (var key in AllEnvVars)
            Environment.SetEnvironmentVariable(key, null);
    }

    private static void SetRequired()
    {
        Environment.SetEnvironmentVariable("AZURE_OPENAI_ENDPOINT", "https://test.openai.azure.com");
        Environment.SetEnvironmentVariable("INBOUND_AUTH_TENANT_ID", "tenant-123");
        Environment.SetEnvironmentVariable("INBOUND_AUTH_ALLOWED_AUDIENCES", "api://caira-agent");
    }

    // ---- Default values ----

    [Fact]
    public void Load_WithOnlyRequiredVars_ReturnsDefaults()
    {
        SetRequired();
        var config = AgentConfig.Load();

        Assert.Equal(3000, config.Port);
        Assert.Equal("0.0.0.0", config.Host);
        Assert.Equal("https://test.openai.azure.com", config.AzureEndpoint);
        Assert.Equal("2025-03-01-preview", config.ApiVersion);
        Assert.Equal("gpt-5.2-chat", config.Model);
        Assert.Equal("CAIRA Account Team Agent", config.AgentName);
        Assert.Contains("discrete specialist", config.SharedInstructions, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("opportunity discovery", config.DiscoveryInstructions, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("account planning", config.PlanningInstructions, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("account team staffing", config.StaffingInstructions, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("Debug", config.LogLevel);
        Assert.False(config.SkipAuth);
        Assert.Equal("tenant-123", config.InboundAuthTenantId);
        Assert.Equal(new[] { "api://caira-agent" }, config.InboundAuthAllowedAudiences);
        Assert.Empty(config.InboundAuthAllowedCallerAppIds);
        Assert.Equal("https://login.microsoftonline.com", config.InboundAuthAuthorityHost);
    }

    // ---- Required vars ----

    [Fact]
    public void Load_ThrowsWhenAzureEndpointMissing()
    {
        var ex = Assert.Throws<InvalidOperationException>(() => AgentConfig.Load());
        Assert.Contains("AZURE_OPENAI_ENDPOINT", ex.Message);
    }

    // ---- Override all optional fields ----

    [Fact]
    public void Load_OverridesAllOptionalFields()
    {
        SetRequired();
        Environment.SetEnvironmentVariable("PORT", "8080");
        Environment.SetEnvironmentVariable("HOST", "127.0.0.1");
        Environment.SetEnvironmentVariable("AZURE_OPENAI_API_VERSION", "2024-10-01");
        Environment.SetEnvironmentVariable("AGENT_MODEL", "gpt-4o");
        Environment.SetEnvironmentVariable("AGENT_NAME", "Test Agent");
        Environment.SetEnvironmentVariable("SHARED_INSTRUCTIONS", "Custom shared prompt.");
        Environment.SetEnvironmentVariable("DISCOVERY_INSTRUCTIONS", "Custom discovery prompt.");
        Environment.SetEnvironmentVariable("PLANNING_INSTRUCTIONS", "Custom planning prompt.");
        Environment.SetEnvironmentVariable("STAFFING_INSTRUCTIONS", "Custom staffing prompt.");
        Environment.SetEnvironmentVariable("INBOUND_AUTH_TENANT_ID", "tenant-123");
        Environment.SetEnvironmentVariable("INBOUND_AUTH_ALLOWED_AUDIENCES", "api://caira-agent,api://caira-agent/.default");
        Environment.SetEnvironmentVariable("INBOUND_AUTH_ALLOWED_CALLER_APP_IDS", "api-client-1,api-client-2");
        Environment.SetEnvironmentVariable("INBOUND_AUTH_AUTHORITY_HOST", "https://login.microsoftonline.us/");
        Environment.SetEnvironmentVariable("LOG_LEVEL", "info");
        Environment.SetEnvironmentVariable("SKIP_AUTH", "true");

        var config = AgentConfig.Load();

        Assert.Equal(8080, config.Port);
        Assert.Equal("127.0.0.1", config.Host);
        Assert.Equal("2024-10-01", config.ApiVersion);
        Assert.Equal("gpt-4o", config.Model);
        Assert.Equal("Test Agent", config.AgentName);
        Assert.Equal("Custom shared prompt.", config.SharedInstructions);
        Assert.Equal("Custom discovery prompt.", config.DiscoveryInstructions);
        Assert.Equal("Custom planning prompt.", config.PlanningInstructions);
        Assert.Equal("Custom staffing prompt.", config.StaffingInstructions);
        Assert.Equal("info", config.LogLevel);
        Assert.True(config.SkipAuth);
        Assert.Equal("tenant-123", config.InboundAuthTenantId);
        Assert.Equal(new[] { "api://caira-agent", "api://caira-agent/.default" }, config.InboundAuthAllowedAudiences);
        Assert.Equal(new[] { "api-client-1", "api-client-2" }, config.InboundAuthAllowedCallerAppIds);
        Assert.Equal("https://login.microsoftonline.us", config.InboundAuthAuthorityHost);
    }

    // ---- URL normalisation ----

    [Fact]
    public void Load_StripsTrailingSlashFromEndpoint()
    {
        SetRequired();
        Environment.SetEnvironmentVariable("AZURE_OPENAI_ENDPOINT", "https://test.openai.azure.com/");
        var config = AgentConfig.Load();
        Assert.Equal("https://test.openai.azure.com", config.AzureEndpoint);
    }

    [Fact]
    public void Load_StripsMultipleTrailingSlashes()
    {
        SetRequired();
        Environment.SetEnvironmentVariable("AZURE_OPENAI_ENDPOINT", "https://test.openai.azure.com///");
        // TrimEnd('/') removes all trailing slashes
        var config = AgentConfig.Load();
        Assert.Equal("https://test.openai.azure.com", config.AzureEndpoint);
    }

    // ---- SKIP_AUTH boolean parsing ----

    [Theory]
    [InlineData("false")]
    [InlineData("1")]
    [InlineData("")]
    [InlineData("TRUE")]
    [InlineData("True")]
    [InlineData("yes")]
    public void Load_SkipAuth_FalseForNonTrueValues(string value)
    {
        SetRequired();
        Environment.SetEnvironmentVariable("SKIP_AUTH", value);
        var config = AgentConfig.Load();
        Assert.False(config.SkipAuth);
    }

    [Fact]
    public void Load_SkipAuth_TrueOnlyForLiteralTrue()
    {
        SetRequired();
        Environment.SetEnvironmentVariable("SKIP_AUTH", "true");
        var config = AgentConfig.Load();
        Assert.True(config.SkipAuth);
    }

    [Fact]
    public void Load_SkipAuth_FalseWhenNotSet()
    {
        SetRequired();
        var config = AgentConfig.Load();
        Assert.False(config.SkipAuth);
    }

    [Fact]
    public void Load_RequiresInboundAuthSettingsWhenSkipAuthDisabled()
    {
        Environment.SetEnvironmentVariable("AZURE_OPENAI_ENDPOINT", "https://test.openai.azure.com");

        var noTenant = Assert.Throws<InvalidOperationException>(() => AgentConfig.Load());
        Assert.Contains("INBOUND_AUTH_TENANT_ID", noTenant.Message);

        Environment.SetEnvironmentVariable("INBOUND_AUTH_TENANT_ID", "tenant-123");
        var noAudience = Assert.Throws<InvalidOperationException>(() => AgentConfig.Load());
        Assert.Contains("INBOUND_AUTH_ALLOWED_AUDIENCES", noAudience.Message);
    }

    // ---- PORT parsing ----

    [Fact]
    public void Load_ParsesPortAsInteger()
    {
        SetRequired();
        Environment.SetEnvironmentVariable("PORT", "9999");
        var config = AgentConfig.Load();
        Assert.Equal(9999, config.Port);
    }

    [Fact]
    public void Load_DefaultsPortTo3000WhenNotSet()
    {
        SetRequired();
        var config = AgentConfig.Load();
        Assert.Equal(3000, config.Port);
    }

    [Fact]
    public void Load_DefaultsPortTo3000WhenInvalid()
    {
        SetRequired();
        Environment.SetEnvironmentVariable("PORT", "not-a-number");
        var config = AgentConfig.Load();
        Assert.Equal(3000, config.Port);
    }
}
