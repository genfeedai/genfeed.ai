import { CredentialPlatform } from '@genfeedai/contracts';
import { getPlatformPreviewLimit } from '@genfeedai/contracts/constants';
import type {
  ContentHarnessContribution,
  ContentHarnessInput,
  ContentHarnessPack,
} from '../types';
import { isMotionFormat, matchesPlatform } from './platform-match';

export function isInstagramPlatform(
  platform: string | null | undefined,
): boolean {
  return matchesPlatform(platform, ['instagram', 'reels']);
}

function buildInstagramPlatformContribution(
  input: ContentHarnessInput,
): ContentHarnessContribution {
  if (!isInstagramPlatform(input.intent.platform)) {
    return {};
  }

  const limit = getPlatformPreviewLimit(CredentialPlatform.INSTAGRAM);

  const styleDirectives = [
    'Land the hook in the first 125 characters of the caption; that is all a reader sees before "more".',
    'The caption adds to the visual (context, story, the takeaway); it does not repeat what is already on screen.',
    'For carousels: slide one is the hook, one idea per slide, the last slide gives the next step.',
  ];

  if (isMotionFormat(input.intent.contentType)) {
    styleDirectives.push(
      'For Reels: the hook lands in the first 3 seconds, spoken and as on-screen text; cut fast and end on one clear call to action.',
    );
  }

  const guardrails = [
    'Use a few specific hashtags, not a long block of generic tags.',
    'Do not write "link in bio" without saying what the link gives the reader.',
  ];

  if (limit) {
    guardrails.push(
      `Stay within ${limit.captionMaxLength} characters for the caption.`,
    );
  }

  return {
    evaluationCriteria: [
      'Instagram fold: does the first line stop the scroll before "more"?',
      'Instagram save and share: is there something worth saving or sending to a friend?',
      'Instagram visual fit: do caption and visual make one idea together?',
    ],
    guardrails,
    styleDirectives,
    systemDirectives: [
      'Optimize for Instagram: saves, shares and watch time beat likes.',
    ],
  };
}

/**
 * Platform pack: contributes only when intent.platform is Instagram or Reels.
 * Short runtime form of the `instagram-content-creator` product skill.
 */
export const INSTAGRAM_PLATFORM_HARNESS_PACK: ContentHarnessPack = {
  capabilities: ['platform-instagram', 'evaluation-baseline'],
  contribute: buildInstagramPlatformContribution,
  description:
    'Instagram platform pack: a hook before the caption fold, captions that add to the visual, save and share worth.',
  id: 'platform-instagram',
  surfaces: ['copy'],
  version: '1.0.0',
};
