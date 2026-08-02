import {
  decodeProtectedHeader,
  importSPKI,
  type JWTPayload,
  jwtVerify,
} from 'jose';
import { setLicenseVerificationVerdict } from './license-state';

export const LICENSE_ISSUER = 'genfeed.ai';
export const LICENSE_AUDIENCE = 'genfeed-selfhosted-ee';
export const LICENSE_ALGORITHM = 'EdDSA';

export type LicensePublicKey = Readonly<{
  kid: string;
  publicKey: string;
}>;

/**
 * Production fails closed until the operator public key is added here as a
 * one-line entry after keypair generation.
 */
export const LICENSE_PUBLIC_KEYS: readonly LicensePublicKey[] = [];

export type LicenseClaims = Readonly<{
  email: string;
  exp: number;
  iat: number;
  jti: string;
  plan: string;
  seats: number;
  sub: string;
}>;

export type LicenseFailureReason =
  | 'expired'
  | 'invalid_algorithm'
  | 'invalid_claims'
  | 'invalid_signature'
  | 'malformed'
  | 'missing'
  | 'unknown_key';

export type LicenseVerificationResult =
  | Readonly<{ isValid: true; license: LicenseClaims }>
  | Readonly<{ isValid: false; reason: LicenseFailureReason }>;

export type LicenseWarningLogger = Readonly<{
  warn(message: string, context?: unknown): void;
}>;

export type InitializeLicenseVerificationOptions = Readonly<{
  currentDate?: Date;
  licenseKey?: string;
  logger?: LicenseWarningLogger;
}>;

class LicenseVerificationError extends Error {
  constructor(readonly reason: LicenseFailureReason) {
    super(`License verification failed: ${reason}`);
    this.name = 'LicenseVerificationError';
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

let initializationPromise: Promise<LicenseVerificationResult> | undefined;
let pendingWarningReason: Exclude<LicenseFailureReason, 'missing'> | undefined;
let hasEmittedWarning = false;
let activeLicensePublicKeys = LICENSE_PUBLIC_KEYS;

function requireNonEmptyString(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new LicenseVerificationError('invalid_claims');
  }

  return value;
}

function requireInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new LicenseVerificationError('invalid_claims');
  }

  return value;
}

function parseLicenseClaims(payload: JWTPayload): LicenseClaims {
  const sub = requireNonEmptyString(payload.sub);
  const jti = requireNonEmptyString(payload.jti);
  const email = requireNonEmptyString(payload.email);
  const plan = requireNonEmptyString(payload.plan);
  const iat = requireInteger(payload.iat);
  const exp = requireInteger(payload.exp);
  const seats = requireInteger(payload.seats);

  if (
    !UUID_PATTERN.test(jti) ||
    !EMAIL_PATTERN.test(email) ||
    iat <= 0 ||
    exp <= iat ||
    seats <= 0
  ) {
    throw new LicenseVerificationError('invalid_claims');
  }

  return { email, exp, iat, jti, plan, seats, sub };
}

function classifyVerificationError(error: unknown): LicenseFailureReason {
  if (error instanceof LicenseVerificationError) {
    return error.reason;
  }

  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return 'malformed';
  }

  const code = (error as { code?: unknown }).code;
  if (code === 'ERR_JWT_EXPIRED') {
    return 'expired';
  }
  if (code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') {
    return 'invalid_signature';
  }
  if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
    return 'invalid_claims';
  }

  return 'malformed';
}

export async function verifyLicenseToken(
  token: string,
  currentDate?: Date,
): Promise<LicenseClaims> {
  let protectedHeader: ReturnType<typeof decodeProtectedHeader>;

  try {
    protectedHeader = decodeProtectedHeader(token);
  } catch {
    throw new LicenseVerificationError('malformed');
  }

  if (
    protectedHeader.alg !== LICENSE_ALGORITHM ||
    protectedHeader.typ !== 'JWT'
  ) {
    throw new LicenseVerificationError('invalid_algorithm');
  }

  if (typeof protectedHeader.kid !== 'string') {
    throw new LicenseVerificationError('unknown_key');
  }

  const pinnedKey = activeLicensePublicKeys.find(
    ({ kid }) => kid === protectedHeader.kid,
  );
  if (!pinnedKey) {
    throw new LicenseVerificationError('unknown_key');
  }

  try {
    const publicKey = await importSPKI(pinnedKey.publicKey, LICENSE_ALGORITHM);
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: [LICENSE_ALGORITHM],
      audience: LICENSE_AUDIENCE,
      currentDate,
      issuer: LICENSE_ISSUER,
    });

    return parseLicenseClaims(payload);
  } catch (error: unknown) {
    throw new LicenseVerificationError(classifyVerificationError(error));
  }
}

async function verifyAndCacheLicense(
  token: string | undefined,
  currentDate?: Date,
): Promise<LicenseVerificationResult> {
  if (!token?.trim()) {
    setLicenseVerificationVerdict(false);
    return { isValid: false, reason: 'missing' };
  }

  try {
    const license = await verifyLicenseToken(token, currentDate);
    setLicenseVerificationVerdict(true);
    return { isValid: true, license };
  } catch (error: unknown) {
    const reason = classifyVerificationError(error);
    setLicenseVerificationVerdict(false);
    pendingWarningReason = reason === 'missing' ? undefined : reason;
    return { isValid: false, reason };
  }
}

export function reportLicenseVerificationWarning(
  logger: LicenseWarningLogger,
): void {
  if (!pendingWarningReason || hasEmittedWarning) {
    return;
  }

  hasEmittedWarning = true;
  logger.warn('Enterprise license verification failed; EE features disabled', {
    event: 'license_verification_failed',
    reason: pendingWarningReason,
    service: 'LicenseVerification',
  });
}

export async function initializeLicenseVerification(
  options: InitializeLicenseVerificationOptions = {},
): Promise<LicenseVerificationResult> {
  initializationPromise ??= verifyAndCacheLicense(
    options.licenseKey ?? process.env.GENFEED_LICENSE_KEY,
    options.currentDate,
  );

  const result = await initializationPromise;
  if (options.logger) {
    reportLicenseVerificationWarning(options.logger);
  }

  return result;
}

function assertTestEnvironment(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('License verification test helpers require NODE_ENV=test');
  }
}

export function resetLicenseVerificationForTests(): void {
  assertTestEnvironment();
  initializationPromise = undefined;
  pendingWarningReason = undefined;
  hasEmittedWarning = false;
  activeLicensePublicKeys = LICENSE_PUBLIC_KEYS;
  setLicenseVerificationVerdict(false);
}

export function setLicensePublicKeysForTests(
  keys: readonly LicensePublicKey[],
): void {
  assertTestEnvironment();
  activeLicensePublicKeys = keys;
}

export function setLicenseVerificationVerdictForTests(isValid: boolean): void {
  assertTestEnvironment();
  setLicenseVerificationVerdict(isValid);
}
