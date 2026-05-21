import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTVerifyGetKey, JWTVerifyOptions } from 'jose';

export interface IncomingTokenValidator {
  validateAccessToken(token: string): Promise<void>;
}

export interface IncomingTokenValidatorConfig {
  readonly tenantId: string;
  readonly authorityHost: string;
  readonly allowedAudiences: readonly string[];
  readonly allowedCallerAppIds: readonly string[];
}

export class UnauthorizedTokenError extends Error {}

function normalizeAuthorityHost(authorityHost: string): string {
  return authorityHost.replace(/\/+$/, '');
}

function resolveAcceptedIssuers(authorityHost: string, tenantId: string): string[] {
  const normalizedHost = normalizeAuthorityHost(authorityHost);
  return [`${normalizedHost}/${tenantId}/v2.0`, `https://sts.windows.net/${tenantId}/`];
}

function readStringClaim(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function extractBearerToken(authHeader: string | string[] | undefined): string | undefined {
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ') || authHeader.length <= 'Bearer '.length) {
    return undefined;
  }

  return authHeader.slice('Bearer '.length).trim() || undefined;
}

class EntraIncomingTokenValidator implements IncomingTokenValidator {
  private readonly jwks: JWTVerifyGetKey;
  private readonly acceptedIssuers: string[];
  private readonly allowedAudiences: string[];
  private readonly allowedCallerAppIds: string[];

  constructor(config: IncomingTokenValidatorConfig) {
    const authorityHost = normalizeAuthorityHost(config.authorityHost);
    this.jwks = createRemoteJWKSet(new URL(`${authorityHost}/${config.tenantId}/discovery/v2.0/keys`));
    this.acceptedIssuers = resolveAcceptedIssuers(authorityHost, config.tenantId);
    this.allowedAudiences = [...config.allowedAudiences];
    this.allowedCallerAppIds = [...config.allowedCallerAppIds];
  }

  async validateAccessToken(token: string): Promise<void> {
    try {
      const getKey: JWTVerifyGetKey = (protectedHeader, jwt) => this.jwks(protectedHeader, jwt);
      const verify = jwtVerify as (
        jwt: string,
        key: JWTVerifyGetKey,
        options: JWTVerifyOptions
      ) => Promise<{ payload: Record<string, unknown> }>;
      const { payload } = await verify(token, getKey, {
        issuer: this.acceptedIssuers,
        audience: this.allowedAudiences
      });

      if (this.allowedCallerAppIds.length > 0) {
        const callerAppId = readStringClaim(payload.azp) ?? readStringClaim(payload.appid);
        if (!callerAppId || !this.allowedCallerAppIds.includes(callerAppId)) {
          throw new UnauthorizedTokenError('Token caller is not allowed to access this service.');
        }
      }
    } catch (error) {
      if (error instanceof UnauthorizedTokenError) {
        throw error;
      }

      throw new UnauthorizedTokenError(
        error instanceof Error ? error.message : 'The bearer token could not be validated.'
      );
    }
  }
}

export function createIncomingTokenValidator(config: IncomingTokenValidatorConfig): IncomingTokenValidator {
  return new EntraIncomingTokenValidator(config);
}
