import type { AccessToken, TokenCredential } from '@azure/core-auth';
import { DefaultAzureCredential, ManagedIdentityCredential } from '@azure/identity';

const ACA_MANAGED_IDENTITY_API_VERSION = '2019-08-01';

interface ManagedIdentityTokenResponse {
  access_token?: string;
  expires_on?: number | string;
  expiresOn?: number | string;
}

class IdentityEndpointCredential implements TokenCredential {
  private readonly endpoint: string;
  private readonly identityHeader: string | undefined;
  private readonly clientId: string | undefined;

  constructor(endpoint: string, identityHeader: string | undefined, clientId: string | undefined) {
    this.endpoint = endpoint;
    this.identityHeader = identityHeader;
    this.clientId = clientId;
  }

  async getToken(scopes: string | string[]): Promise<AccessToken | null> {
    const requestedScope = Array.isArray(scopes) ? scopes[0] : scopes;
    if (!requestedScope) {
      throw new Error('At least one scope is required to acquire a managed identity token.');
    }

    const resource = requestedScope.endsWith('/.default')
      ? requestedScope.slice(0, -'/.default'.length)
      : requestedScope;

    const url = new URL(this.endpoint);
    url.searchParams.set('resource', resource);
    url.searchParams.set('api-version', url.searchParams.get('api-version') ?? ACA_MANAGED_IDENTITY_API_VERSION);

    if (this.clientId && !url.searchParams.has('client_id')) {
      url.searchParams.set('client_id', this.clientId);
    }

    const requestInit: RequestInit = { method: 'GET' };
    if (this.identityHeader) {
      requestInit.headers = { 'X-IDENTITY-HEADER': this.identityHeader };
    }

    const response = await fetch(url, requestInit);

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Managed identity endpoint request failed (${response.status}): ${message}`);
    }

    const tokenResponse = (await response.json()) as ManagedIdentityTokenResponse;
    if (!tokenResponse.access_token) {
      throw new Error('Managed identity endpoint response did not include an access_token.');
    }

    return {
      token: tokenResponse.access_token,
      expiresOnTimestamp: resolveExpiresOnTimestamp(tokenResponse)
    };
  }
}

function resolveExpiresOnTimestamp(tokenResponse: ManagedIdentityTokenResponse): number {
  const parsedExpiresOn =
    parseExpiresOnTimestamp(tokenResponse.expires_on) ?? parseExpiresOnTimestamp(tokenResponse.expiresOn);

  if (!parsedExpiresOn) {
    throw new Error('Managed identity endpoint response did not include a valid expires_on or expiresOn value.');
  }

  return parsedExpiresOn;
}

function parseExpiresOnTimestamp(value: number | string | undefined): number | undefined {
  if (typeof value === 'number') {
    return value > 10_000_000_000 ? value : value * 1000;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  const numericValue = Number(value);
  if (!Number.isNaN(numericValue)) {
    return numericValue > 10_000_000_000 ? numericValue : numericValue * 1000;
  }

  const parsedDate = Date.parse(value);
  return Number.isNaN(parsedDate) ? undefined : parsedDate;
}

export function createAzureCredential(env: NodeJS.ProcessEnv = process.env): TokenCredential {
  if (env['IDENTITY_ENDPOINT']) {
    return new IdentityEndpointCredential(env['IDENTITY_ENDPOINT'], env['IDENTITY_HEADER'], env['AZURE_CLIENT_ID']);
  }

  if (env['MSI_ENDPOINT']) {
    const clientId = env['AZURE_CLIENT_ID'];
    return clientId ? new ManagedIdentityCredential(clientId) : new ManagedIdentityCredential();
  }

  return new DefaultAzureCredential();
}
