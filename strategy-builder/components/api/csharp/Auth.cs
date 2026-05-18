using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;

namespace CairaApi;

public interface IIncomingTokenValidator
{
    Task ValidateAccessTokenAsync(string token, CancellationToken cancellationToken = default);
}

public sealed class UnauthorizedTokenException : Exception
{
    public UnauthorizedTokenException(string message)
        : base(message)
    {
    }
}

public sealed class EntraIncomingTokenValidator : IIncomingTokenValidator
{
    private readonly ConfigurationManager<OpenIdConnectConfiguration> _configurationManager;
    private readonly string[] _validIssuers;
    private readonly string[] _validAudiences;
    private readonly string[] _allowedCallerAppIds;
    private readonly JwtSecurityTokenHandler _tokenHandler = new();

    public EntraIncomingTokenValidator(ApiConfig config)
    {
        var authorityHost = config.InboundAuthAuthorityHost.TrimEnd('/');
        var metadataAddress = $"{authorityHost}/{config.InboundAuthTenantId}/v2.0/.well-known/openid-configuration";

        _configurationManager = new ConfigurationManager<OpenIdConnectConfiguration>(
            metadataAddress,
            new OpenIdConnectConfigurationRetriever());

        _validIssuers =
        [
            $"{authorityHost}/{config.InboundAuthTenantId}/v2.0",
            $"https://sts.windows.net/{config.InboundAuthTenantId}/",
        ];
        _validAudiences = config.InboundAuthAllowedAudiences.ToArray();
        _allowedCallerAppIds = config.InboundAuthAllowedCallerAppIds.ToArray();
    }

    public async Task ValidateAccessTokenAsync(string token, CancellationToken cancellationToken = default)
    {
        try
        {
            var openIdConfiguration = await _configurationManager.GetConfigurationAsync(cancellationToken);
            var validationParameters = new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKeys = openIdConfiguration.SigningKeys,
                ValidateIssuer = true,
                ValidIssuers = _validIssuers,
                ValidateAudience = true,
                ValidAudiences = _validAudiences,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromMinutes(5),
                RequireExpirationTime = true,
            };

            var principal = _tokenHandler.ValidateToken(token, validationParameters, out _);
            if (_allowedCallerAppIds.Length > 0)
            {
                var callerAppId = principal.FindFirst("azp")?.Value ?? principal.FindFirst("appid")?.Value;
                if (string.IsNullOrWhiteSpace(callerAppId) || !_allowedCallerAppIds.Contains(callerAppId, StringComparer.Ordinal))
                {
                    throw new UnauthorizedTokenException("Token caller is not allowed to access this service.");
                }
            }
        }
        catch (UnauthorizedTokenException)
        {
            throw;
        }
        catch (Exception ex) when (ex is SecurityTokenException || ex is ArgumentException || ex is InvalidOperationException)
        {
            throw new UnauthorizedTokenException(ex.Message);
        }
    }
}

public sealed class NoOpIncomingTokenValidator : IIncomingTokenValidator
{
    public Task ValidateAccessTokenAsync(string token, CancellationToken cancellationToken = default) => Task.CompletedTask;
}

public static class AuthHelpers
{
    public static string? ExtractBearerToken(string? authHeader)
    {
        if (string.IsNullOrWhiteSpace(authHeader) ||
            !authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ||
            authHeader.Length <= "Bearer ".Length)
        {
            return null;
        }

        var token = authHeader["Bearer ".Length..].Trim();
        return token.Length > 0 ? token : null;
    }
}
