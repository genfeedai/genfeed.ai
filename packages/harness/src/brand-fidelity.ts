import type {
  ContentHarnessContribution,
  ContentHarnessInput,
  ContentHarnessPack,
} from './types';

function buildBrandFidelityContribution(
  input: ContentHarnessInput,
): ContentHarnessContribution {
  const brandName = input.brandName?.trim() || 'the brand';
  const guardrails = [
    'Reject generic motivational filler, generic listicles, and interchangeable hook patterns.',
    'When confidence in brand fidelity is low, prefer narrower claims over invented certainty.',
  ];
  const evaluationCriteria = [
    `The output should feel specific enough that someone familiar with ${brandName} would recognize it.`,
    'Use internet-native phrasing only when it matches the persona instead of copying the platform average.',
    'Keep messaging compact, opinionated, and commercially useful.',
  ];

  const styleDirectives: string[] = [];
  if (input.intent.audienceHint?.trim()) {
    styleDirectives.push(
      `Audience sharpening hint: ${input.intent.audienceHint.trim()}.`,
    );
  }

  return {
    evaluationCriteria,
    guardrails,
    styleDirectives,
    systemDirectives: [
      'Favor distinctive positioning over safe consensus phrasing.',
      'If you cannot sound like the brand yet, fail conservatively instead of fabricating personality.',
    ],
  };
}

/**
 * Built-in brand-fidelity pack: stricter anti-genericity and brand-recognition
 * directives layered on top of the core baseline. Registered by default in the
 * API harness service alongside `CORE_CONTENT_HARNESS_PACK` and
 * `X_PLATFORM_HARNESS_PACK`.
 */
export const BRAND_FIDELITY_HARNESS_PACK: ContentHarnessPack = {
  capabilities: ['brand-fidelity-evaluation', 'brand-fidelity-guardrails'],
  contribute: buildBrandFidelityContribution,
  description:
    'Brand-fidelity content harness pack with stricter anti-genericity directives.',
  id: 'brand-fidelity',
  version: '1.0.0',
};
