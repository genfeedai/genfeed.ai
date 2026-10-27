import { CredentialPlatform } from '@genfeedai/contracts';
import { getPlatformPreviewLimit } from '@genfeedai/contracts/constants';
import type {
  ContentHarnessContribution,
  ContentHarnessInput,
  ContentHarnessPack,
} from '../types';
import { matchesPlatform } from './platform-match';

export function isLinkedInPlatform(
  platform: string | null | undefined,
): boolean {
  return matchesPlatform(platform, ['linkedin']);
}

function buildLinkedInPlatformContribution(
  input: ContentHarnessInput,
): ContentHarnessContribution {
  if (!isLinkedInPlatform(input.intent.platform)) {
    return {};
  }

  const isArticle =
    input.intent.contentType === 'article' ||
    input.intent.contentType === 'newsletter';
  const limit = getPlatformPreviewLimit(CredentialPlatform.LINKEDIN);

  const styleDirectives = [
    'The first two lines must work on their own: most readers decide there whether to tap "see more".',
    'Use short paragraphs and white space; one idea per paragraph.',
    'Tie a specific experience, number or decision to a lesson the reader can use at work.',
    'Write like a sharp colleague talking, not a press release.',
  ];

  if (isArticle) {
    styleDirectives.push(
      'For articles and newsletters: a benefit-clear title under 70 characters, scannable subheads, and a takeaway in every section.',
    );
  }

  const guardrails = [
    'Keep external links out of the post body; put them in the first comment.',
    'Use at most 5 hashtags, placed at the end.',
    'Do not open with corporate filler such as "I\'m excited to share" or "I\'m humbled to announce".',
    'Do not ask for engagement pods or "comment YES" style bait.',
  ];

  if (limit && !isArticle) {
    guardrails.push(`Stay within ${limit.captionMaxLength} characters.`);
  }

  return {
    evaluationCriteria: [
      'LinkedIn expansion: would the first two lines make a professional tap "see more"?',
      'LinkedIn dwell: does every line earn the next one?',
      'LinkedIn comment depth: does it invite a substantive reply from the target buyer or peer?',
    ],
    guardrails,
    styleDirectives,
    systemDirectives: [
      'Optimize for LinkedIn: reading time and thoughtful comments from the right professionals beat broad reach.',
    ],
  };
}

/**
 * Platform pack: contributes only when intent.platform is LinkedIn.
 * Short runtime form of the `linkedin-content-creator` product skill.
 */
export const LINKEDIN_PLATFORM_HARNESS_PACK: ContentHarnessPack = {
  capabilities: ['platform-linkedin', 'evaluation-baseline'],
  contribute: buildLinkedInPlatformContribution,
  description:
    'LinkedIn platform pack: a hook that survives the "see more" fold, readable structure, no links in the body.',
  id: 'platform-linkedin',
  surfaces: ['copy'],
  version: '1.0.0',
};
