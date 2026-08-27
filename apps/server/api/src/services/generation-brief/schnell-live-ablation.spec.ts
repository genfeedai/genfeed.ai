import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileSchnellAblationCorpus,
  countBrandTokens,
  runSchnellLiveAblation,
  SCHNELL_ABLATION_BRAND_KIT,
  SCHNELL_ABLATION_SCENARIOS,
  SCHNELL_GUIDED_LIFT_THRESHOLD,
  SCHNELL_UNBRANDED_REGRESSION_LIMIT,
} from '@api/services/generation-brief/schnell-live-ablation';
import { FLUX_SCHNELL_MODEL_KEY } from '@api-types/contracts/generation-capability-profile.contract';
import { describe, expect, it } from 'vitest';

describe('Schnell live ablation corpus (#3470)', () => {
  it('covers 12 Schnell image scenarios split guided and unbranded', () => {
    expect(SCHNELL_ABLATION_SCENARIOS).toHaveLength(12);
    expect(
      SCHNELL_ABLATION_SCENARIOS.filter(
        (scenario) => scenario.cohort === 'guided',
      ),
    ).toHaveLength(6);
    expect(
      SCHNELL_ABLATION_SCENARIOS.filter(
        (scenario) => scenario.cohort === 'unbranded',
      ),
    ).toHaveLength(6);
  });

  it('compiles the corpus against FLUX Schnell without provider dispatch', () => {
    const summary = compileSchnellAblationCorpus();
    expect(summary.modelKey).toBe(FLUX_SCHNELL_MODEL_KEY);
    expect(summary.promptEnhancementEnabled).toBe(false);
    expect(summary.scenarios).toHaveLength(12);
  });

  it('puts brand-kit tokens on Guided compiled prompts and keeps them off Off', () => {
    const summary = compileSchnellAblationCorpus();
    for (const scenario of summary.scenarios) {
      const compiledTokens = countBrandTokens(scenario.arms.compiled.prompt);
      const legacyTokens = countBrandTokens(scenario.arms.legacy.prompt);
      expect(legacyTokens).toBe(0);
      if (scenario.cohort === 'guided') {
        expect(compiledTokens).toBeGreaterThanOrEqual(2);
        expect(scenario.arms.compiled.prompt).toContain(
          SCHNELL_ABLATION_BRAND_KIT,
        );
        expect(scenario.arms.compiled.contractPassed).toBe(true);
        expect(scenario.arms.legacy.contractPassed).toBe(false);
      } else {
        expect(compiledTokens).toBe(0);
        expect(scenario.arms.compiled.prompt).not.toContain(
          SCHNELL_ABLATION_BRAND_KIT,
        );
        expect(scenario.arms.compiled.contractPassed).toBe(true);
        expect(scenario.arms.legacy.contractPassed).toBe(true);
      }
    }
  });

  it('meets the +15 Guided / −5 unbranded contract thresholds', () => {
    const summary = compileSchnellAblationCorpus();
    expect(summary.guidedLiftPercentagePoints).toBeGreaterThanOrEqual(
      SCHNELL_GUIDED_LIFT_THRESHOLD,
    );
    expect(summary.unbrandedRegressionPercentagePoints).toBeGreaterThanOrEqual(
      -SCHNELL_UNBRANDED_REGRESSION_LIMIT,
    );
    expect(summary.meetsGuidedLift).toBe(true);
    expect(summary.meetsUnbrandedRegression).toBe(true);
  });
});

describe.skipIf(process.env.GENERATION_BRIEF_LIVE_EVAL !== '1')(
  'Schnell live ablation dispatch (#3470)',
  () => {
    it('meets +15 Guided / −5 unbranded on live FLUX Schnell outputs', async () => {
      const envPath = join(
        dirname(fileURLToPath(import.meta.url)),
        '../../../../../../.env.local',
      );
      const raw = await readFile(envPath, 'utf8');
      const tokenLine = raw
        .split('\n')
        .find((line) => line.startsWith('REPLICATE_KEY='));
      const token = tokenLine
        ?.slice('REPLICATE_KEY='.length)
        .replace(/^['"]|['"]$/g, '');
      expect(token).toBeTruthy();
      const summary = await runSchnellLiveAblation(token ?? '');
      const outputPath = join(
        homedir(),
        '.codex/artifacts/schnell-ablation-3470.json',
      );
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
      expect(summary.meetsGuidedLift).toBe(true);
      expect(summary.meetsUnbrandedRegression).toBe(true);
    }, 900_000);
  },
);
