/**
 * Live FLUX Schnell A/B for #3470. Compile corpus is always available;
 * provider dispatch is opt-in.
 *
 * Usage:
 *   bun run apps/server/api/scripts/run-schnell-ablation.ts
 *   GENERATION_BRIEF_LIVE_EVAL=1 bun run apps/server/api/scripts/run-schnell-ablation.ts
 *
 * Live mode reads REPLICATE_KEY (or REPLICATE_API_TOKEN) from the
 * environment or repo-root `.env.local`. It never prints the token.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileSchnellAblationCorpus,
  runSchnellLiveAblation,
} from '@api/services/generation-brief/schnell-live-ablation';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, '../../../..');
const OUTPUT_PATH = join(
  homedir(),
  '.codex/artifacts/schnell-ablation-3470.json',
);

async function loadRootEnv(): Promise<void> {
  const envPath = join(REPO_ROOT, '.env.local');
  try {
    const raw = await readFile(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const separator = trimmed.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      const key = trimmed.slice(0, separator);
      let value = trimmed.slice(separator + 1);
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    return;
  }
}

async function runLive(): Promise<void> {
  await loadRootEnv();
  const token =
    process.env.REPLICATE_KEY?.trim() ||
    process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) {
    throw new Error(
      'REPLICATE_KEY is missing. Live eval reads root .env.local.',
    );
  }

  const summary = await runSchnellLiveAblation(token);
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify(
      {
        guidedLiftPercentagePoints: summary.guidedLiftPercentagePoints,
        meetsGuidedLift: summary.meetsGuidedLift,
        meetsUnbrandedRegression: summary.meetsUnbrandedRegression,
        outputPath: OUTPUT_PATH,
        unbrandedRegressionPercentagePoints:
          summary.unbrandedRegressionPercentagePoints,
      },
      null,
      2,
    )}\n`,
  );
}

function runCompileOnly(): void {
  const summary = compileSchnellAblationCorpus();
  process.stdout.write(
    `${JSON.stringify(
      {
        guidedLiftPercentagePoints: summary.guidedLiftPercentagePoints,
        live: false,
        meetsGuidedLift: summary.meetsGuidedLift,
        meetsUnbrandedRegression: summary.meetsUnbrandedRegression,
        scenarioCount: summary.scenarios.length,
        unbrandedRegressionPercentagePoints:
          summary.unbrandedRegressionPercentagePoints,
      },
      null,
      2,
    )}\n`,
  );
}

if (process.env.GENERATION_BRIEF_LIVE_EVAL === '1') {
  await runLive();
} else {
  runCompileOnly();
}
