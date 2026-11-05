import {
  ENTERPRISE_ASSERTION_ALGORITHMS,
  ENTERPRISE_ASSERTION_MAX_LIFETIME_SECONDS,
  ENTERPRISE_ASSERTION_SKEW_SECONDS,
  ID_JAG_JWT_TYPE,
} from '@api/oauth/enterprise-managed-auth.constants';
import { readNonEmptyString } from '@genfeedai/utils/data/extract.util';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';
import { decodeJwt, decodeProtectedHeader, jwtVerify } from 'jose';
import { EnterpriseIssuerKeysService } from './enterprise-issuer-keys.service';

/** A failed assertion check. The message is for logs, never for the client. */
export class EnterpriseAssertionError extends Error {}

export type UnverifiedAssertionRouting = {
  audTenant?: string;
  issuer: string;
};

export type ExpectedAssertion = {
  /** This authorization server's issuer identifier. */
  audience: string;
  clientId: string;
  /** The issuer the workspace trusts. */
  issuer: string;
};

export type VerifiedEnterpriseAssertion = {
  audTenant?: string;
  clientId: string;
  email: string;
  expiresAt: Date;
  issuer: string;
  jti: string;
  resources: string[];
  scope?: string;
};

function readResources(value: unknown): string[] {
  if (value === undefined) return [];
  const list = Array.isArray(value) ? value : [value];
  if (list.length === 0 || list.some((entry) => typeof entry !== 'string')) {
    throw new EnterpriseAssertionError('Malformed resource claim');
  }
  return list as string[];
}

/**
 * Validates an Identity Assertion JWT Authorization Grant (ID-JAG) against the
 * issuer a workspace trusts. The workspace is chosen from the unverified
 * payload only to know which issuer to hold the assertion to; nothing from it
 * is believed until the signature and every claim check pass.
 */
@Traced()
@Injectable()
export class EnterpriseAssertionVerifier {
  constructor(private readonly issuerKeys: EnterpriseIssuerKeysService) {}

  /** Unverified `iss` and `aud_tenant`, used only to pick the workspace. */
  peek(assertion: string): UnverifiedAssertionRouting {
    let payload: ReturnType<typeof decodeJwt>;
    try {
      payload = decodeJwt(assertion);
    } catch {
      throw new EnterpriseAssertionError('Malformed assertion');
    }
    const issuer = readNonEmptyString(payload.iss);
    if (!issuer) {
      throw new EnterpriseAssertionError('Missing issuer');
    }
    const audTenant = payload.aud_tenant;
    if (audTenant !== undefined && typeof audTenant !== 'string') {
      throw new EnterpriseAssertionError('Malformed tenant claim');
    }
    return { audTenant: audTenant || undefined, issuer };
  }

  async verify(
    assertion: string,
    expected: ExpectedAssertion,
  ): Promise<VerifiedEnterpriseAssertion> {
    let header: ReturnType<typeof decodeProtectedHeader>;
    try {
      header = decodeProtectedHeader(assertion);
    } catch {
      throw new EnterpriseAssertionError('Malformed assertion');
    }
    if (
      typeof header.alg !== 'string' ||
      !ENTERPRISE_ASSERTION_ALGORITHMS.includes(header.alg)
    ) {
      throw new EnterpriseAssertionError('Unsupported signature algorithm');
    }

    // Keys come from the trusted issuer's own metadata, never from the header.
    const getKey = await this.issuerKeys.resolver(expected.issuer, header.kid);
    let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'];
    try {
      ({ payload } = await jwtVerify(assertion, getKey, {
        algorithms: ENTERPRISE_ASSERTION_ALGORITHMS,
        clockTolerance: ENTERPRISE_ASSERTION_SKEW_SECONDS,
        issuer: expected.issuer,
        requiredClaims: ['aud', 'client_id', 'exp', 'iat', 'iss', 'jti', 'sub'],
        typ: ID_JAG_JWT_TYPE,
      }));
    } catch (error) {
      throw new EnterpriseAssertionError(
        `Assertion rejected: ${error instanceof Error ? error.name : 'unknown'}`,
      );
    }

    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (audiences.length !== 1 || audiences[0] !== expected.audience) {
      throw new EnterpriseAssertionError('Audience mismatch');
    }
    if (payload.client_id !== expected.clientId) {
      throw new EnterpriseAssertionError('Client mismatch');
    }
    // Proof-of-possession binding is not supported; honouring the assertion
    // without checking the key would defeat what the issuer asked for.
    if (payload.cnf !== undefined) {
      throw new EnterpriseAssertionError(
        'Sender-constrained assertions are unsupported',
      );
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const { exp, iat } = payload;
    if (
      typeof exp !== 'number' ||
      typeof iat !== 'number' ||
      iat > nowSeconds + ENTERPRISE_ASSERTION_SKEW_SECONDS ||
      exp - nowSeconds > ENTERPRISE_ASSERTION_MAX_LIFETIME_SECONDS
    ) {
      throw new EnterpriseAssertionError('Assertion lifetime out of range');
    }

    const jti = readNonEmptyString(payload.jti);
    const email = readNonEmptyString(payload.email)?.trim();
    if (!jti || !email || email.length > 320) {
      // Users are matched by email address only. A subject alone cannot be
      // mapped to a Genfeed member.
      throw new EnterpriseAssertionError('Missing jti or email');
    }
    const audTenant = payload.aud_tenant;
    if (audTenant !== undefined && typeof audTenant !== 'string') {
      throw new EnterpriseAssertionError('Malformed tenant claim');
    }
    const scope = payload.scope;
    if (scope !== undefined && typeof scope !== 'string') {
      throw new EnterpriseAssertionError('Malformed scope claim');
    }

    return {
      audTenant: audTenant || undefined,
      clientId: expected.clientId,
      email,
      expiresAt: new Date(exp * 1000),
      issuer: expected.issuer,
      jti,
      resources: readResources(payload.resource),
      scope,
    };
  }
}
