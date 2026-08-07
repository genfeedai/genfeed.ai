#!/usr/bin/env bun

import { readFile } from 'node:fs/promises';
import { importPKCS8, SignJWT } from 'jose';

const LICENSE_ALGORITHM = 'EdDSA';
const LICENSE_AUDIENCE = 'genfeed-selfhosted-ee';
const LICENSE_ISSUER = 'genfeed.ai';

export type SignLicenseOptions = Readonly<{
  email: string;
  expiresAt: number;
  issuedAt: number;
  kid: string;
  licenseId: string;
  licensee: string;
  plan: string;
  privateKeyPath: string;
  seats: number;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function getFlag(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function requireFlag(argv: string[], flag: string): string {
  const value = getFlag(argv, flag)?.trim();
  if (!value) {
    throw new Error(`Missing required argument: ${flag}`);
  }

  return value;
}

function parseTimestamp(value: string, flag: string): number {
  const numericValue = Number(value);
  // ISO-8601 input may carry milliseconds; floor to whole Unix seconds so a
  // valid `…T00:00:00.500Z` is accepted instead of failing the integer check.
  // `Math.floor(NaN)` stays `NaN`, so unparseable strings are still rejected.
  const timestamp = Number.isFinite(numericValue)
    ? numericValue
    : Math.floor(Date.parse(value) / 1_000);

  if (!Number.isInteger(timestamp) || timestamp <= 0) {
    throw new Error(`${flag} must be a Unix timestamp or ISO-8601 date`);
  }

  return timestamp;
}

export function parseSignLicenseArgs(argv: string[]): SignLicenseOptions {
  const issuedAtValue = getFlag(argv, '--issued-at');
  const issuedAt = issuedAtValue
    ? parseTimestamp(issuedAtValue, '--issued-at')
    : Math.floor(Date.now() / 1_000);

  return {
    email: requireFlag(argv, '--email'),
    expiresAt: parseTimestamp(
      requireFlag(argv, '--expires-at'),
      '--expires-at',
    ),
    issuedAt,
    kid: requireFlag(argv, '--kid'),
    licenseId: requireFlag(argv, '--license-id'),
    licensee: requireFlag(argv, '--licensee'),
    plan: requireFlag(argv, '--plan'),
    privateKeyPath: requireFlag(argv, '--private-key'),
    seats: Number(requireFlag(argv, '--seats')),
  };
}

function validateSignOptions(options: SignLicenseOptions): void {
  if (!EMAIL_PATTERN.test(options.email)) {
    throw new Error('email must be a valid email address');
  }
  if (!UUID_PATTERN.test(options.licenseId)) {
    throw new Error('license-id must be a UUID');
  }
  if (!Number.isInteger(options.seats) || options.seats <= 0) {
    throw new Error('seats must be a positive integer');
  }
  if (options.expiresAt <= options.issuedAt) {
    throw new Error('expires-at must be later than issued-at');
  }
}

export async function signLicense(
  options: SignLicenseOptions,
): Promise<string> {
  validateSignOptions(options);
  const privateKeyPem = await readFile(options.privateKeyPath, 'utf8');
  const privateKey = await importPKCS8(privateKeyPem, LICENSE_ALGORITHM);

  return new SignJWT({
    email: options.email,
    plan: options.plan,
    seats: options.seats,
  })
    .setProtectedHeader({
      alg: LICENSE_ALGORITHM,
      kid: options.kid,
      typ: 'JWT',
    })
    .setIssuer(LICENSE_ISSUER)
    .setAudience(LICENSE_AUDIENCE)
    .setSubject(options.licensee)
    .setJti(options.licenseId)
    .setIssuedAt(options.issuedAt)
    .setExpirationTime(options.expiresAt)
    .sign(privateKey);
}

async function main(): Promise<void> {
  const options = parseSignLicenseArgs(process.argv.slice(2));
  const token = await signLicense(options);
  process.stdout.write(`${token}\n`);
}

if (import.meta.main) {
  await main();
}
