#!/usr/bin/env bun

import { access, writeFile } from 'node:fs/promises';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';

type GenerateKeypairOptions = Readonly<{
  privateKeyPath: string;
  publicKeyPath: string;
}>;

function getFlag(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

export function parseGenerateKeypairArgs(
  argv: string[],
): GenerateKeypairOptions {
  const privateKeyPath = getFlag(argv, '--private-key');
  const publicKeyPath = getFlag(argv, '--public-key');

  if (!privateKeyPath || !publicKeyPath) {
    throw new Error(
      'Usage: bun run scripts/license/generate-keypair.ts --private-key <path> --public-key <path>',
    );
  }

  return { privateKeyPath, publicKeyPath };
}

async function assertPathDoesNotExist(filePath: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    return;
  }

  throw new Error(`Refusing to overwrite existing key file: ${filePath}`);
}

export async function generateLicenseKeypair(
  options: GenerateKeypairOptions,
): Promise<void> {
  await Promise.all([
    assertPathDoesNotExist(options.privateKeyPath),
    assertPathDoesNotExist(options.publicKeyPath),
  ]);

  const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
    extractable: true,
  });
  const [privateKeyPem, publicKeyPem] = await Promise.all([
    exportPKCS8(privateKey),
    exportSPKI(publicKey),
  ]);

  await writeFile(options.privateKeyPath, privateKeyPem, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  await writeFile(options.publicKeyPath, publicKeyPem, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o644,
  });
}

async function main(): Promise<void> {
  const options = parseGenerateKeypairArgs(process.argv.slice(2));
  await generateLicenseKeypair(options);
  process.stdout.write(
    `License keypair generated. Keep ${options.privateKeyPath} outside every repository.\n`,
  );
}

if (import.meta.main) {
  await main();
}
