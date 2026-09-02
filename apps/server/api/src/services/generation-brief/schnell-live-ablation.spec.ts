import {
  compileSchnellAblationCorpus,
  countBrandTokens,
  SCHNELL_ABLATION_BRAND_KIT,
  SCHNELL_ABLATION_SCENARIOS,
  SCHNELL_GUIDED_LIFT_THRESHOLD,
  SCHNELL_UNBRANDED_REGRESSION_LIMIT,
} from '@api/services/generation-brief/schnell-live-ablation';
import { FLUX_SCHNELL_MODEL_KEY } from '@genfeedai/contracts/api-types/contracts/generation-capability-profile.contract';
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
