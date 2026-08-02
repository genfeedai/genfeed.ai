import {
  exportPKCS8,
  exportSPKI,
  generateKeyPair,
  importPKCS8,
  SignJWT,
} from 'jose';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { hasOrganizationBilling, isEEEnabled } from './license';
import {
  initializeLicenseVerification,
  LICENSE_ALGORITHM,
  LICENSE_AUDIENCE,
  LICENSE_ISSUER,
  LICENSE_PUBLIC_KEYS,
  resetLicenseVerificationForTests,
  setLicensePublicKeysForTests,
} from './license-server';

const LICENSE_ID = '9c981b90-4acc-41f5-9a31-493e0b6285cf';
const RUNTIME_LICENSE_KID = 'test-runtime-v1';
const ORIGINAL_ENV = { ...process.env };
let runtimePrivateKey: Awaited<ReturnType<typeof importPKCS8>>;
let runtimePublicKeyPem: string;

type TestLicenseOverrides = Readonly<{
  email?: string;
  expirationTime?: number;
  kid?: string;
  plan?: string;
  seats?: number;
  signingKey?: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
}>;

async function createLicenseToken(
  overrides: TestLicenseOverrides = {},
): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);

  return new SignJWT({
    email: overrides.email ?? 'fixture@example.com',
    plan: overrides.plan ?? 'ee',
    seats: overrides.seats ?? 12,
  })
    .setProtectedHeader({
      alg: LICENSE_ALGORITHM,
      kid: overrides.kid ?? RUNTIME_LICENSE_KID,
      typ: 'JWT',
    })
    .setIssuer(LICENSE_ISSUER)
    .setAudience(LICENSE_AUDIENCE)
    .setSubject('Fixture Licensee')
    .setJti(LICENSE_ID)
    .setIssuedAt(issuedAt)
    .setExpirationTime(overrides.expirationTime ?? issuedAt + 3_600)
    .sign(overrides.signingKey ?? runtimePrivateKey);
}

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
    extractable: true,
  });
  const [privateKeyPem, publicKeyPem] = await Promise.all([
    exportPKCS8(privateKey),
    exportSPKI(publicKey),
  ]);
  runtimePrivateKey = await importPKCS8(privateKeyPem, LICENSE_ALGORITHM);
  runtimePublicKeyPem = publicKeyPem;
});

beforeEach(() => {
  resetLicenseVerificationForTests();
  setLicensePublicKeysForTests([
    { kid: RUNTIME_LICENSE_KID, publicKey: runtimePublicKeyPem },
  ]);
  delete process.env.GENFEED_CLOUD;
  delete process.env.NEXT_PUBLIC_GENFEED_CLOUD;
  delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetLicenseVerificationForTests();
  vi.restoreAllMocks();
});

afterAll(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('initializeLicenseVerification', () => {
  it('rejects garbage without enabling EE', async () => {
    const logger = { warn: vi.fn() };

    const result = await initializeLicenseVerification({
      licenseKey: 'garbage',
      logger,
    });

    expect(result).toEqual({ isValid: false, reason: 'malformed' });
    expect(isEEEnabled()).toBe(false);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('accepts a token signed by an injected runtime key', async () => {
    const logger = { warn: vi.fn() };
    const token = await createLicenseToken();

    const result = await initializeLicenseVerification({
      licenseKey: token,
      logger,
    });

    expect(result).toEqual(
      expect.objectContaining({
        isValid: true,
        license: expect.objectContaining({
          email: 'fixture@example.com',
          jti: LICENSE_ID,
          plan: 'ee',
          seats: 12,
          sub: 'Fixture Licensee',
        }),
      }),
    );
    expect(isEEEnabled()).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('ships without pinned keys and fails closed without injection', async () => {
    const token = await createLicenseToken();
    setLicensePublicKeysForTests(LICENSE_PUBLIC_KEYS);

    const result = await initializeLicenseVerification({
      licenseKey: token,
      logger: { warn: vi.fn() },
    });

    expect(result).toEqual({ isValid: false, reason: 'unknown_key' });
    expect(LICENSE_PUBLIC_KEYS).toEqual([]);
    expect(isEEEnabled()).toBe(false);
  });

  it('rejects a token after its signed payload is tampered with', async () => {
    const token = await createLicenseToken();
    const [protectedHeader, payload, signature] = token.split('.');
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    claims.plan = 'tampered';
    const tamperedPayload = Buffer.from(JSON.stringify(claims)).toString(
      'base64url',
    );

    const result = await initializeLicenseVerification({
      licenseKey: `${protectedHeader}.${tamperedPayload}.${signature}`,
      logger: { warn: vi.fn() },
    });

    expect(result).toEqual({ isValid: false, reason: 'invalid_signature' });
    expect(isEEEnabled()).toBe(false);
  });

  it('rejects a token with the wrong signature', async () => {
    const { privateKey } = await generateKeyPair('EdDSA', {
      extractable: true,
    });
    const token = await createLicenseToken({ signingKey: privateKey });

    const result = await initializeLicenseVerification({
      licenseKey: token,
      logger: { warn: vi.fn() },
    });

    expect(result).toEqual({ isValid: false, reason: 'invalid_signature' });
    expect(isEEEnabled()).toBe(false);
  });

  it('rejects a token with an unknown key id', async () => {
    const token = await createLicenseToken({ kid: 'unknown-runtime-key' });

    const result = await initializeLicenseVerification({
      licenseKey: token,
      logger: { warn: vi.fn() },
    });

    expect(result).toEqual({ isValid: false, reason: 'unknown_key' });
    expect(isEEEnabled()).toBe(false);
  });

  it('rejects invalid signed claims', async () => {
    const token = await createLicenseToken({ email: 'invalid-email' });

    const result = await initializeLicenseVerification({
      licenseKey: token,
      logger: { warn: vi.fn() },
    });

    expect(result).toEqual({ isValid: false, reason: 'invalid_claims' });
    expect(isEEEnabled()).toBe(false);
  });

  it('rejects an expired token and emits one structured warning', async () => {
    const logger = { warn: vi.fn() };
    const token = await createLicenseToken({
      expirationTime: Math.floor(Date.now() / 1000) - 1,
    });

    await initializeLicenseVerification({ licenseKey: token, logger });
    await initializeLicenseVerification({ licenseKey: token, logger });

    expect(isEEEnabled()).toBe(false);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Enterprise license verification failed; EE features disabled',
      expect.objectContaining({
        event: 'license_verification_failed',
        reason: 'expired',
        service: 'LicenseVerification',
      }),
    );
  });

  it('leaves cloud organization billing unaffected without a license', async () => {
    process.env.GENFEED_CLOUD = '1';
    const logger = { warn: vi.fn() };

    await initializeLicenseVerification({ logger });

    expect(isEEEnabled()).toBe(false);
    expect(hasOrganizationBilling()).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('fails closed when the license key is missing', async () => {
    const result = await initializeLicenseVerification({
      logger: { warn: vi.fn() },
    });

    expect(result).toEqual({ isValid: false, reason: 'missing' });
    expect(isEEEnabled()).toBe(false);
  });
});
