using Azure.Core;
using Azure.Identity;

namespace CairaApi;

public interface IAccessTokenProvider
{
    Task<string> GetAccessTokenAsync(string scope, CancellationToken cancellationToken = default);
}

public sealed class DefaultAzureAccessTokenProvider : IAccessTokenProvider
{
    private readonly DefaultAzureCredential _credential = new();

    public async Task<string> GetAccessTokenAsync(string scope, CancellationToken cancellationToken = default)
    {
        var response = await _credential.GetTokenAsync(new TokenRequestContext([scope]), cancellationToken);
        return response.Token;
    }
}
