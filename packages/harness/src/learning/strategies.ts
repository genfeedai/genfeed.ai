import type { ContentHarnessContribution } from '../types';
export const LEARNING_ARMS = [
  'baseline-v1',
  'question-example-v1',
  'proof-steps-v1',
] as const;
export type LearningArmId = (typeof LEARNING_ARMS)[number];
export const LEARNING_CONFIG_VERSION = 'rl-reward-v1-experimental';
export function learningContribution(
  armId: string,
): ContentHarnessContribution {
  if (armId === 'baseline-v1') return {};
  const style =
    armId === 'question-example-v1'
      ? 'Where relevant, open with a question and include one concrete example. Use only the existing permitted call to action.'
      : armId === 'proof-steps-v1'
        ? 'Where supported by supplied evidence, open with that evidence and include up to three actionable steps. Use only the existing permitted call to action.'
        : '';
  if (!style) throw new Error('unsupported_arm');
  return {
    styleDirectives: [style],
    guardrails: [
      'Learning guidance is subordinate to explicit user instructions and approved brand voice. Do not invent evidence, claims, offers, overlays or text. For media, guide caption/opening scene structure only.',
    ],
  };
}
