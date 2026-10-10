/**
 * Build-time generator for `public/llms.txt` (the compact index).
 *
 * `/llms-full.txt` is not generated here: `app/llms-full.txt/route.ts` serves
 * it from the live public model catalog, so it never lists models the catalog
 * hides.
 *
 * Run:  bun run scripts/generate-llms-txt.ts
 * Auto: prebuild hook runs this before every `next build`
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildLlmsIndex } from '@data/llms-text.data';

const PUBLIC_DIR = resolve(process.cwd(), 'public');

function main(): void {
  const index = buildLlmsIndex();

  writeFileSync(resolve(PUBLIC_DIR, 'llms.txt'), index, 'utf-8');

  console.info(
    `llms.txt → ${index.split('\n').length} lines, ${index.length} bytes`,
  );
}

main();
