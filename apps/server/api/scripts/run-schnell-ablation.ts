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

import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  compileSchnellAblationCorpus,
  runSchnellLiveAblation,
} from '@api/services/generation-brief/schnell-live-ablation';
import { ConfigService } from '@libs/config/config.service';

const OUTPUT_PATH = join(
  homedir(),
  '.codex/artifacts/schnell-ablation-3470.json',
);

const configService = new ConfigService();

async function runLive(): Promise<void> {
  const token =
    configService.get('REPLICATE_KEY')?.trim() ||
    configService.get('REPLICATE_API_TOKEN')?.trim();
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

if (configService.get('GENERATION_BRIEF_LIVE_EVAL') === '1') {
  await runLive();
} else {
  runCompileOnly();
}
