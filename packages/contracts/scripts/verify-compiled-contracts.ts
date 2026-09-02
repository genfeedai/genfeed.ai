import { readFile } from 'node:fs/promises';

const COMPILED_CONTRACTS = [
  'social-warmup-capability.contract',
  'social-warmup-journey.contract',
] as const;

const UNRESOLVED_INTERNAL_ALIAS_PATTERN =
  /(?:from\s+|import\s*\()['"](?:@api-types|@genfeedai\/contracts\/api-types)\//u;

for (const contract of COMPILED_CONTRACTS) {
  for (const extension of ['js', 'd.ts'] as const) {
    const compiledUrl = new URL(
      `../dist/api-types/contracts/${contract}.${extension}`,
      import.meta.url,
    );
    const source = await readFile(compiledUrl, 'utf8');

    if (UNRESOLVED_INTERNAL_ALIAS_PATTERN.test(source)) {
      throw new Error(
        `${contract}.${extension} still contains an internal api-types alias after compilation`,
      );
    }
  }

  await import(
    new URL(`../dist/api-types/contracts/${contract}.js`, import.meta.url).href
  );
}

console.log(
  `Verified ${COMPILED_CONTRACTS.length} compiled api-types contract boundaries.`,
);
