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
  SCHNELL_ABLATION_MODEL_KEY,
  SCHNELL_ABLATION_SCENARIOS,
  type SchnellAblationArmResult,
  type SchnellAblationScenarioResult,
  summarizeSchnellAblation,
} from '@api/services/generation-brief/schnell-live-ablation';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, '../../../..');
const OUTPUT_PATH = join(
  homedir(),
  '.codex/artifacts/schnell-ablation-3470.json',
);

interface ReplicatePrediction {
  error?: string | null;
  output?: unknown;
  status?: string;
  urls?: { get?: string };
}

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

function firstOutputUrl(output: unknown): string | undefined {
  if (typeof output === 'string' && output.startsWith('http')) {
    return output.split('?')[0];
  }
  if (Array.isArray(output)) {
    const first = output[0];
    return typeof first === 'string' ? first.split('?')[0] : undefined;
  }
  return undefined;
}

async function createSchnellPrediction(
  token: string,
  prompt: string,
  seed: number,
): Promise<ReplicatePrediction> {
  const response = await fetch(
    `https://api.replicate.com/v1/models/${SCHNELL_ABLATION_MODEL_KEY}/predictions`,
    {
      body: JSON.stringify({
        input: {
          aspect_ratio: '1:1',
          output_format: 'webp',
          prompt,
          seed,
        },
      }),
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        prefer: 'wait=60',
      },
      method: 'POST',
    },
  );
  return (await response.json()) as ReplicatePrediction;
}

async function waitForPrediction(
  token: string,
  prediction: ReplicatePrediction,
): Promise<ReplicatePrediction> {
  let current = prediction;
  const getUrl = current.urls?.get;
  const deadline = Date.now() + 120_000;
  while (
    getUrl &&
    (current.status === 'starting' || current.status === 'processing') &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const response = await fetch(getUrl, {
      headers: { authorization: `Bearer ${token}` },
    });
    current = (await response.json()) as ReplicatePrediction;
  }
  return current;
}

async function dispatchArm(
  token: string,
  arm: SchnellAblationArmResult,
  seed: number,
): Promise<SchnellAblationArmResult> {
  const prediction = await waitForPrediction(
    token,
    await createSchnellPrediction(token, arm.prompt, seed),
  );
  const outputUrl = firstOutputUrl(prediction.output);
  const visualPassed = Boolean(outputUrl) && arm.contractPassed;
  return {
    ...arm,
    outputUrl,
    visualPassed,
  };
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

  const compiled = compileSchnellAblationCorpus();
  const liveScenarios: SchnellAblationScenarioResult[] = [];
  for (const scenario of compiled.scenarios) {
    const definition = SCHNELL_ABLATION_SCENARIOS.find(
      (entry) => entry.id === scenario.id,
    );
    if (!definition) {
      continue;
    }
    const legacy = await dispatchArm(
      token,
      scenario.arms.legacy,
      definition.seed,
    );
    const compiledArm = await dispatchArm(
      token,
      scenario.arms.compiled,
      definition.seed,
    );
    liveScenarios.push({
      ...scenario,
      arms: { compiled: compiledArm, legacy },
    });
  }

  const summary = summarizeSchnellAblation(liveScenarios);
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
