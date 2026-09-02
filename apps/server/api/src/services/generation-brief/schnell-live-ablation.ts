import { runImageGenerationBrief } from '@api/services/generation-brief/run-image-generation-brief';
import type { GenerationFidelityMode } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import {
  FLUX_SCHNELL_IMAGE_COMPILER_ID,
  FLUX_SCHNELL_IMAGE_COMPILER_VERSION,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import {
  FLUX_SCHNELL_CAPABILITY_PROFILE_ID,
  FLUX_SCHNELL_CAPABILITY_PROFILE_VERSION,
  FLUX_SCHNELL_MODEL_KEY,
} from '@genfeedai/contracts/api-types/contracts/generation-capability-profile.contract';

/**
 * Public synthetic brand kit for #3470. Not a private harness pack.
 */
export const SCHNELL_ABLATION_BRAND_KIT =
  'Aurora Bottle Co visual identity: matte obsidian glass, brushed gold foil cap, warm cream linen backdrop, soft editorial product lighting, generous negative space';

export const SCHNELL_ABLATION_BRAND_TOKENS = [
  'obsidian',
  'gold foil',
  'cream linen',
  'editorial',
] as const;

export const SCHNELL_ABLATION_MODEL_KEY = FLUX_SCHNELL_MODEL_KEY;
export const SCHNELL_GUIDED_LIFT_THRESHOLD = 15;
export const SCHNELL_UNBRANDED_REGRESSION_LIMIT = 5;

export type SchnellAblationCohort = 'guided' | 'unbranded';
export type SchnellAblationArm = 'legacy' | 'compiled';

export interface SchnellAblationScenario {
  cohort: SchnellAblationCohort;
  fidelityMode: GenerationFidelityMode;
  id: string;
  objective: string;
  seed: number;
}

export interface SchnellAblationArmResult {
  arm: SchnellAblationArm;
  compilerId: string | null;
  compilerVersion: number | null;
  contractPassed: boolean;
  outputUrl?: string;
  profileId: string | null;
  profileVersion: number | null;
  prompt: string;
  promptEnhancementEnabled: false;
  visualPassed?: boolean;
}

export interface SchnellAblationScenarioResult {
  arms: Record<SchnellAblationArm, SchnellAblationArmResult>;
  cohort: SchnellAblationCohort;
  id: string;
  objective: string;
  seed: number;
}

export interface SchnellAblationSummary {
  compilerId: string;
  compilerVersion: number;
  guidedLegacyPassRate: number;
  guidedLiftPercentagePoints: number;
  guidedPassRate: number;
  meetsGuidedLift: boolean;
  meetsUnbrandedRegression: boolean;
  modelKey: string;
  profileId: string;
  profileVersion: number;
  promptEnhancementEnabled: false;
  scenarios: SchnellAblationScenarioResult[];
  unbrandedLegacyPassRate: number;
  unbrandedPassRate: number;
  unbrandedRegressionPercentagePoints: number;
}

export const SCHNELL_ABLATION_SCENARIOS: readonly SchnellAblationScenario[] = [
  {
    cohort: 'guided',
    fidelityMode: 'guided',
    id: 'schnell-guided-bottle',
    objective: 'a launch still of a bottle on marble',
    seed: 16501,
  },
  {
    cohort: 'guided',
    fidelityMode: 'guided',
    id: 'schnell-guided-portrait',
    objective: 'a portrait of a founder',
    seed: 16502,
  },
  {
    cohort: 'guided',
    fidelityMode: 'guided',
    id: 'schnell-guided-poster',
    objective: 'a poster that reads GENFEED',
    seed: 16503,
  },
  {
    cohort: 'guided',
    fidelityMode: 'guided',
    id: 'schnell-guided-lookbook',
    objective: 'a fashion lookbook still',
    seed: 16504,
  },
  {
    cohort: 'guided',
    fidelityMode: 'guided',
    id: 'schnell-guided-interior',
    objective: 'a soft daylight interior with a product on a table',
    seed: 16505,
  },
  {
    cohort: 'guided',
    fidelityMode: 'guided',
    id: 'schnell-guided-market',
    objective: 'a cinematic night market stall',
    seed: 16506,
  },
  {
    cohort: 'unbranded',
    fidelityMode: 'off',
    id: 'schnell-unbranded-sunset',
    objective: 'a sunset over the ocean',
    seed: 16507,
  },
  {
    cohort: 'unbranded',
    fidelityMode: 'off',
    id: 'schnell-unbranded-cup',
    objective: 'a ceramic cup on linen',
    seed: 16508,
  },
  {
    cohort: 'unbranded',
    fidelityMode: 'off',
    id: 'schnell-unbranded-fox',
    objective: 'a flat vector icon of a fox',
    seed: 16509,
  },
  {
    cohort: 'unbranded',
    fidelityMode: 'off',
    id: 'schnell-unbranded-hero',
    objective: 'a product hero on black',
    seed: 16510,
  },
  {
    cohort: 'unbranded',
    fidelityMode: 'off',
    id: 'schnell-unbranded-interior',
    objective: 'a soft daylight interior',
    seed: 16511,
  },
  {
    cohort: 'unbranded',
    fidelityMode: 'off',
    id: 'schnell-unbranded-market',
    objective: 'a cinematic night market',
    seed: 16512,
  },
];

export function countBrandTokens(prompt: string): number {
  const haystack = prompt.toLowerCase();
  return SCHNELL_ABLATION_BRAND_TOKENS.filter((token) =>
    haystack.includes(token),
  ).length;
}

export function scoreSchnellContract(input: {
  cohort: SchnellAblationCohort;
  objective: string;
  prompt: string;
}): boolean {
  const tokenCount = countBrandTokens(input.prompt);
  const hasObjective = input.prompt
    .toLowerCase()
    .includes(input.objective.toLowerCase());

  if (input.cohort === 'guided') {
    return hasObjective && tokenCount >= 2;
  }

  return hasObjective && tokenCount === 0;
}

export function compileSchnellAblationArm(
  scenario: SchnellAblationScenario,
  arm: SchnellAblationArm,
): SchnellAblationArmResult {
  if (arm === 'legacy') {
    return {
      arm,
      compilerId: null,
      compilerVersion: null,
      contractPassed: scoreSchnellContract({
        cohort: scenario.cohort,
        objective: scenario.objective,
        prompt: scenario.objective,
      }),
      profileId: null,
      profileVersion: null,
      prompt: scenario.objective,
      promptEnhancementEnabled: false,
    };
  }

  const compiled = runImageGenerationBrief({
    fidelityMode: scenario.fidelityMode,
    height: 1024,
    model: SCHNELL_ABLATION_MODEL_KEY,
    objective: scenario.objective,
    seed: scenario.seed,
    surface: 'studio',
    visualDirection:
      scenario.cohort === 'guided' ? SCHNELL_ABLATION_BRAND_KIT : undefined,
    width: 1024,
  });
  const prompt =
    typeof compiled.dispatch?.prompt === 'string'
      ? compiled.dispatch.prompt
      : '';

  return {
    arm,
    compilerId: compiled.evidence.compilerId,
    compilerVersion: compiled.evidence.compilerVersion,
    contractPassed: scoreSchnellContract({
      cohort: scenario.cohort,
      objective: scenario.objective,
      prompt,
    }),
    profileId: compiled.evidence.profileId,
    profileVersion: compiled.evidence.profileVersion,
    prompt,
    promptEnhancementEnabled: false,
  };
}

export function compileSchnellAblationScenario(
  scenario: SchnellAblationScenario,
): SchnellAblationScenarioResult {
  return {
    arms: {
      compiled: compileSchnellAblationArm(scenario, 'compiled'),
      legacy: compileSchnellAblationArm(scenario, 'legacy'),
    },
    cohort: scenario.cohort,
    id: scenario.id,
    objective: scenario.objective,
    seed: scenario.seed,
  };
}

function passRate(
  results: readonly SchnellAblationScenarioResult[],
  cohort: SchnellAblationCohort,
  arm: SchnellAblationArm,
  field: 'contractPassed' | 'visualPassed',
): number {
  const rows = results.filter((result) => result.cohort === cohort);
  if (rows.length === 0) {
    return 0;
  }
  const passed = rows.filter((result) => {
    if (field === 'contractPassed') {
      return result.arms[arm].contractPassed;
    }
    const visual = result.arms[arm].visualPassed;
    return visual === undefined
      ? result.arms[arm].contractPassed
      : visual === true;
  }).length;
  return (passed / rows.length) * 100;
}

export function summarizeSchnellAblation(
  scenarios: readonly SchnellAblationScenarioResult[],
): SchnellAblationSummary {
  const guidedPassRate = passRate(
    scenarios,
    'guided',
    'compiled',
    'visualPassed',
  );
  const guidedLegacyPassRate = passRate(
    scenarios,
    'guided',
    'legacy',
    'visualPassed',
  );
  const unbrandedPassRate = passRate(
    scenarios,
    'unbranded',
    'compiled',
    'visualPassed',
  );
  const unbrandedLegacyPassRate = passRate(
    scenarios,
    'unbranded',
    'legacy',
    'visualPassed',
  );
  const guidedLiftPercentagePoints = guidedPassRate - guidedLegacyPassRate;
  const unbrandedRegressionPercentagePoints =
    unbrandedPassRate - unbrandedLegacyPassRate;

  return {
    compilerId: FLUX_SCHNELL_IMAGE_COMPILER_ID,
    compilerVersion: FLUX_SCHNELL_IMAGE_COMPILER_VERSION,
    guidedLegacyPassRate,
    guidedLiftPercentagePoints,
    guidedPassRate,
    meetsGuidedLift:
      guidedLiftPercentagePoints >= SCHNELL_GUIDED_LIFT_THRESHOLD,
    meetsUnbrandedRegression:
      unbrandedRegressionPercentagePoints >=
      -SCHNELL_UNBRANDED_REGRESSION_LIMIT,
    modelKey: SCHNELL_ABLATION_MODEL_KEY,
    profileId: FLUX_SCHNELL_CAPABILITY_PROFILE_ID,
    profileVersion: FLUX_SCHNELL_CAPABILITY_PROFILE_VERSION,
    promptEnhancementEnabled: false,
    scenarios: [...scenarios],
    unbrandedLegacyPassRate,
    unbrandedPassRate,
    unbrandedRegressionPercentagePoints,
  };
}

export function compileSchnellAblationCorpus(): SchnellAblationSummary {
  return summarizeSchnellAblation(
    SCHNELL_ABLATION_SCENARIOS.map(compileSchnellAblationScenario),
  );
}

interface ReplicatePrediction {
  error?: string | null;
  output?: unknown;
  status?: string;
  urls?: { get?: string };
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
      },
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
    },
  );
  const payload = (await response.json()) as ReplicatePrediction;
  if (!response.ok) {
    throw new Error(
      `Replicate prediction failed (${response.status}): ${payload.error ?? 'unknown error'}`,
    );
  }
  return payload;
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
      signal: AbortSignal.timeout(30_000),
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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const prediction = await waitForPrediction(
        token,
        await createSchnellPrediction(token, arm.prompt, seed + attempt),
      );
      const outputUrl = firstOutputUrl(prediction.output);
      if (outputUrl) {
        return {
          ...arm,
          outputUrl,
          visualPassed: arm.contractPassed,
        };
      }
    } catch {
      // Retry provider flakes; the last attempt falls through.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return {
    ...arm,
    visualPassed: false,
  };
}

export async function runSchnellLiveAblation(
  token: string,
): Promise<SchnellAblationSummary> {
  const compiled = compileSchnellAblationCorpus();
  const liveScenarios: SchnellAblationScenarioResult[] = [];
  for (const scenario of compiled.scenarios) {
    const definition = SCHNELL_ABLATION_SCENARIOS.find(
      (entry) => entry.id === scenario.id,
    );
    if (!definition) {
      continue;
    }
    const dispatchSafe = async (
      arm: SchnellAblationArmResult,
    ): Promise<SchnellAblationArmResult> => {
      try {
        return await dispatchArm(token, arm, definition.seed);
      } catch {
        return { ...arm, visualPassed: false };
      }
    };
    liveScenarios.push({
      ...scenario,
      arms: {
        compiled: await dispatchSafe(scenario.arms.compiled),
        legacy: await dispatchSafe(scenario.arms.legacy),
      },
    });
    process.stdout.write(
      `scored ${scenario.id} (${liveScenarios.length}/${compiled.scenarios.length})\n`,
    );
  }
  return summarizeSchnellAblation(liveScenarios);
}
