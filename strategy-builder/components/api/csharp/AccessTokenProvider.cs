using Azure.Core;
using Azure.Identity;

namespace CairaApi;

public interface IAccessTokenProvider
{
    Task<string> GetAccessTokenAsync(string scope, CancellationToken cancellationToken = default);
}

public sealed class DefaultAzureAccessTokenProvider : IAccessTokenProvider
{
    private readonly TokenCredential _credential = CreateAzureCredential();

    public async Task<string> GetAccessTokenAsync(string scope, CancellationToken cancellationToken = default)
    {
        var response = await _credential.GetTokenAsync(new TokenRequestContext([scope]), cancellationToken);
        return response.Token;
    }

    private static TokenCredential CreateAzureCredential()
    {
        var managedIdentityEndpoint = Environment.GetEnvironmentVariable("IDENTITY_ENDPOINT")
            ?? Environment.GetEnvironmentVariable("MSI_ENDPOINT");
        if (!string.IsNullOrWhiteSpace(managedIdentityEndpoint))
        {
            var clientId = Environment.GetEnvironmentVariable("AZURE_CLIENT_ID");
            return string.IsNullOrWhiteSpace(clientId)
                ? new ManagedIdentityCredential()
                : new ManagedIdentityCredential(clientId);
        }

        return new DefaultAzureCredential();
    }
}
