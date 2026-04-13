import type {
  ContentHarnessContribution,
  ContentHarnessInput,
  ContentHarnessPack,
} from '@genfeedai/harness';

function buildEnterpriseContribution(
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

export const EE_CONTENT_HARNESS_PACK: ContentHarnessPack = {
  capabilities: ['enterprise-evaluation', 'brand-fidelity-guardrails'],
  contribute: buildEnterpriseContribution,
  description:
    'Enterprise content harness pack with stricter brand-fidelity and anti-genericity directives.',
  id: 'ee-brand-fidelity',
  version: '1.0.0',
};

export default EE_CONTENT_HARNESS_PACK;
