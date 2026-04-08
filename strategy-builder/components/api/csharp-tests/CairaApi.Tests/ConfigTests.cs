/// <summary>
/// Tests for ApiConfig.FromEnvironment() — env var parsing, defaults, validation.
///
/// Mirrors the TypeScript config.test.ts patterns:
///   - Required vars throw when missing
///   - Defaults applied when optionals are absent
///   - URL trailing slashes stripped
///   - SKIP_AUTH only true for literal "true"
///   - PORT parsing (valid, invalid, missing)
///
/// Uses [Collection("EnvironmentTests")] to prevent parallel execution
/// since tests mutate Environment variables.
/// </summary>

using Xunit;

namespace CairaApi.Tests;

[Collection("EnvironmentTests")]
public class ConfigTests : IDisposable
{
    // All env vars that FromEnvironment() reads
    private static readonly string[] AllVars =
    [
        "AGENT_SERVICE_URL",
        "PORT",
        "HOST",
        "AGENT_TOKEN_SCOPE",
        "INBOUND_AUTH_TENANT_ID",
        "INBOUND_AUTH_ALLOWED_AUDIENCES",
        "INBOUND_AUTH_ALLOWED_CALLER_APP_IDS",
        "INBOUND_AUTH_AUTHORITY_HOST",
        "LOG_LEVEL",
        "SKIP_AUTH",
    ];

    public ConfigTests()
    {
        // Clear all env vars before each test
        foreach (var v in AllVars)
            Environment.SetEnvironmentVariable(v, null);
    }

    public void Dispose()
    {
        // Clean up after each test
        foreach (var v in AllVars)
            Environment.SetEnvironmentVariable(v, null);
    }

    // ---- Required vars ----

    [Fact]
    public void FromEnvironment_ThrowsWhenAgentServiceUrlMissing()
    {
        var ex = Assert.Throws<InvalidOperationException>(() => ApiConfig.FromEnvironment());
        Assert.Contains("AGENT_SERVICE_URL", ex.Message);
    }

    [Fact]
    public void FromEnvironment_ThrowsWhenAgentServiceUrlEmpty()
    {
        Environment.SetEnvironmentVariable("AGENT_SERVICE_URL", "");
        var ex = Assert.Throws<InvalidOperationException>(() => ApiConfig.FromEnvironment());
        Assert.Contains("AGENT_SERVICE_URL", ex.Message);
    }

    [Fact]
    public void FromEnvironment_ThrowsWhenAgentServiceUrlWhitespace()
    {
        Environment.SetEnvironmentVariable("AGENT_SERVICE_URL", "   ");
        var ex = Assert.Throws<InvalidOperationException>(() => ApiConfig.FromEnvironment());
        Assert.Contains("AGENT_SERVICE_URL", ex.Message);
    }

    // ---- Defaults ----

    [Fact]
    public void FromEnvironment_WithAuthBypass_ReturnsDefaults()
    {
        Environment.SetEnvironmentVariable("AGENT_SERVICE_URL", "http://localhost:3000");
        Environment.SetEnvironmentVariable("SKIP_AUTH", "true");
        var config = ApiConfig.FromEnvironment();

        Assert.Equal("http://localhost:3000", config.AgentServiceUrl);
        Assert.Equal(4000, config.Port);
        Assert.Equal("0.0.0.0", config.Host);
        Assert.Equal("Debug", config.LogLevel);
        Assert.True(config.SkipAuth);
        Assert.Null(config.AgentTokenScope);
        Assert.Null(config.InboundAuthTenantId);
        Assert.Empty(config.InboundAuthAllowedAudiences);
        Assert.Empty(config.InboundAuthAllowedCallerAppIds);
        Assert.Equal("https://login.microsoftonline.com", config.InboundAuthAuthorityHost);
    }

    // ---- All optional fields ----

    [Fact]
    public void FromEnvironment_OverridesAllOptionalFields()
    {
        Environment.SetEnvironmentVariable("AGENT_SERVICE_URL", "http://agent:3000");
        Environment.SetEnvironmentVariable("PORT", "5000");
        Environment.SetEnvironmentVariable("HOST", "127.0.0.1");
        Environment.SetEnvironmentVariable("AGENT_TOKEN_SCOPE", "api://test-scope/.default");
        Environment.SetEnvironmentVariable("INBOUND_AUTH_TENANT_ID", "tenant-123");
        Environment.SetEnvironmentVariable("INBOUND_AUTH_ALLOWED_AUDIENCES", "api://caira-api/.default,api://caira-api");
        Environment.SetEnvironmentVariable("INBOUND_AUTH_ALLOWED_CALLER_APP_IDS", "bff-app-1,bff-app-2");
        Environment.SetEnvironmentVariable("INBOUND_AUTH_AUTHORITY_HOST", "https://login.microsoftonline.us/");
        Environment.SetEnvironmentVariable("LOG_LEVEL", "Warning");
        Environment.SetEnvironmentVariable("SKIP_AUTH", "false");

        var config = ApiConfig.FromEnvironment();

        Assert.Equal("http://agent:3000", config.AgentServiceUrl);
        Assert.Equal(5000, config.Port);
        Assert.Equal("127.0.0.1", config.Host);
        Assert.Equal("api://test-scope/.default", config.AgentTokenScope);
        Assert.Equal("tenant-123", config.InboundAuthTenantId);
        Assert.Equal(new[] { "api://caira-api/.default", "api://caira-api" }, config.InboundAuthAllowedAudiences);
        Assert.Equal(new[] { "bff-app-1", "bff-app-2" }, config.InboundAuthAllowedCallerAppIds);
        Assert.Equal("https://login.microsoftonline.us", config.InboundAuthAuthorityHost);
        Assert.Equal("Warning", config.LogLevel);
        Assert.False(config.SkipAuth);
    }

    [Fact]
    public void FromEnvironment_RequiresAuthSettingsWhenSkipAuthDisabled()
    {
        Environment.SetEnvironmentVariable("AGENT_SERVICE_URL", "http://localhost:3000");

        var noScope = Assert.Throws<InvalidOperationException>(() => ApiConfig.FromEnvironment());
        Assert.Contains("AGENT_TOKEN_SCOPE", noScope.Message);

        Environment.SetEnvironmentVariable("AGENT_TOKEN_SCOPE", "api://agent/.default");
        var noTenant = Assert.Throws<InvalidOperationException>(() => ApiConfig.FromEnvironment());
        Assert.Contains("INBOUND_AUTH_TENANT_ID", noTenant.Message);

        Environment.SetEnvironmentVariable("INBOUND_AUTH_TENANT_ID", "tenant-123");
        var noAudience = Assert.Throws<InvalidOperationException>(() => ApiConfig.FromEnvironment());
        Assert.Contains("INBOUND_AUTH_ALLOWED_AUDIENCES", noAudience.Message);
    }

    // ---- URL trailing slash stripping ----

    [Fact]
    public void FromEnvironment_StripsTrailingSlash()
    {
        Environment.SetEnvironmentVariable("AGENT_SERVICE_URL", "http://localhost:3000/");
        Environment.SetEnvironmentVariable("SKIP_AUTH", "true");
        var config = ApiConfig.FromEnvironment();
        Assert.Equal("http://localhost:3000", config.AgentServiceUrl);
    }

    [Fact]
    public void FromEnvironment_StripsMultipleTrailingSlashes()
    {
        Environment.SetEnvironmentVariable("AGENT_SERVICE_URL", "http://localhost:3000///");
        Environment.SetEnvironmentVariable("SKIP_AUTH", "true");
        var config = ApiConfig.FromEnvironment();
        Assert.Equal("http://localhost:3000", config.AgentServiceUrl);
    }

    // ---- PORT parsing ----

    [Fact]
    public void FromEnvironment_ParsesPortAsInteger()
    {
        Environment.SetEnvironmentVariable("AGENT_SERVICE_URL", "http://localhost:3000");
        Environment.SetEnvironmentVariable("SKIP_AUTH", "true");
        Environment.SetEnvironmentVariable("PORT", "8080");
        var config = ApiConfig.FromEnvironment();
        Assert.Equal(8080, config.Port);
    }

    [Fact]
    public void FromEnvironment_DefaultsPortTo4000WhenNotSet()
    {
        Environment.SetEnvironmentVariable("AGENT_SERVICE_URL", "http://localhost:3000");
        Environment.SetEnvironmentVariable("SKIP_AUTH", "true");
        var config = ApiConfig.FromEnvironment();
        Assert.Equal(4000, config.Port);
    }

    [Fact]
    public void FromEnvironment_DefaultsPortTo4000WhenInvalid()
    {
        Environment.SetEnvironmentVariable("AGENT_SERVICE_URL", "http://localhost:3000");
        Environment.SetEnvironmentVariable("SKIP_AUTH", "true");
        Environment.SetEnvironmentVariable("PORT", "not-a-number");
        var config = ApiConfig.FromEnvironment();
        Assert.Equal(4000, config.Port);
    }

    // ---- SKIP_AUTH ----

    [Fact]
    public void FromEnvironment_SkipAuth_TrueOnlyForLiteralTrue()
    {
        Environment.SetEnvironmentVariable("AGENT_SERVICE_URL", "http://localhost:3000");
        Environment.SetEnvironmentVariable("SKIP_AUTH", "true");
        var config = ApiConfig.FromEnvironment();
        Assert.True(config.SkipAuth);
    }

    [Fact]
    public void FromEnvironment_SkipAuth_FalseWhenNotSet_RequiresAuthSettings()
    {
        Environment.SetEnvironmentVariable("AGENT_SERVICE_URL", "http://localhost:3000");
        var ex = Assert.Throws<InvalidOperationException>(() => ApiConfig.FromEnvironment());
        Assert.Contains("AGENT_TOKEN_SCOPE", ex.Message);
    }

    [Theory]
    [InlineData("TRUE")]
    [InlineData("True")]
    [InlineData("yes")]
    [InlineData("1")]
    [InlineData("false")]
    [InlineData("")]
    public void FromEnvironment_SkipAuth_FalseForNonTrueValues(string value)
    {
        Environment.SetEnvironmentVariable("AGENT_SERVICE_URL", "http://localhost:3000");
        Environment.SetEnvironmentVariable("SKIP_AUTH", value);
        var ex = Assert.Throws<InvalidOperationException>(() => ApiConfig.FromEnvironment());
        Assert.Contains("AGENT_TOKEN_SCOPE", ex.Message);
    }
}
