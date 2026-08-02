import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LICENSE_ALGORITHM,
  LICENSE_AUDIENCE,
  LICENSE_ISSUER,
} from '@genfeedai/config/license-server';
import { exportPKCS8, generateKeyPair, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { parseSignLicenseArgs, signLicense } from './sign-license';

describe('signLicense', () => {
  it('verifies CLI signing output against the runtime public key', async () => {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
      extractable: true,
    });
    const privateKeyPem = await exportPKCS8(privateKey);
    const fixtureDirectory = await mkdtemp(
      join(tmpdir(), 'genfeed-license-test-'),
    );
    const privateKeyPath = join(fixtureDirectory, 'private-key.pem');
    await writeFile(privateKeyPath, privateKeyPem, { mode: 0o600 });

    const issuedAt = Math.floor(Date.now() / 1000);
    try {
      const options = parseSignLicenseArgs([
        '--email',
        'operator-fixture@example.com',
        '--expires-at',
        String(issuedAt + 86_400),
        '--issued-at',
        String(issuedAt),
        '--kid',
        'test-runtime-v1',
        '--license-id',
        'b4ad2bdc-6751-4f67-b70d-f64c9387202f',
        '--licensee',
        'Operator Fixture',
        '--plan',
        'ee',
        '--private-key',
        privateKeyPath,
        '--seats',
        '25',
      ]);
      const token = await signLicense(options);
      const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
        algorithms: [LICENSE_ALGORITHM],
        audience: LICENSE_AUDIENCE,
        issuer: LICENSE_ISSUER,
      });

      expect(options.privateKeyPath).toBe(privateKeyPath);
      expect(protectedHeader.kid).toBe('test-runtime-v1');
      expect(payload).toEqual(
        expect.objectContaining({
          email: 'operator-fixture@example.com',
          plan: 'ee',
          seats: 25,
          sub: 'Operator Fixture',
        }),
      );
    } finally {
      await rm(fixtureDirectory, { force: true, recursive: true });
    }
  });
});
