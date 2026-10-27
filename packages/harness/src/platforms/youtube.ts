import { CredentialPlatform } from '@genfeedai/contracts';
import { getPlatformPreviewLimit } from '@genfeedai/contracts/constants';
import type {
  ContentHarnessContribution,
  ContentHarnessInput,
  ContentHarnessPack,
} from '../types';
import { isMotionFormat, matchesPlatform } from './platform-match';

export function isYouTubePlatform(
  platform: string | null | undefined,
): boolean {
  return matchesPlatform(platform, ['youtube', 'shorts']);
}

function buildYouTubePlatformContribution(
  input: ContentHarnessInput,
): ContentHarnessContribution {
  if (!isYouTubePlatform(input.intent.platform)) {
    return {};
  }

  const styleDirectives = [
    'Titles: under 60 characters with the main keyword in the first words.',
    'Descriptions: the first 200 characters summarise the video with the words people search for.',
  ];

  if (isMotionFormat(input.intent.contentType)) {
    styleDirectives.push(
      'Shorts: the first second is the hook; change the visual every few seconds.',
      'Long-form: state the payoff in the first 30 seconds and skip the intro.',
    );
  }

  const limit = getPlatformPreviewLimit(CredentialPlatform.YOUTUBE);
  const guardrails = [
    'Title and thumbnail must match what the video actually shows.',
    'Use at most 3 hashtags in the description.',
  ];

  if (limit) {
    guardrails.push(
      `Stay within ${limit.captionMaxLength} characters for the description.`,
    );
  }

  return {
    evaluationCriteria: [
      'YouTube click promise: would the title make the target viewer click?',
      'YouTube delivery: does the content pay off what the title promises?',
      'YouTube retention: is there a reason to keep watching at every section?',
    ],
    guardrails,
    styleDirectives,
    systemDirectives: [
      'Optimize for YouTube: clicks that the video then keeps, through search and watch time.',
    ],
  };
}

/**
 * Platform pack: contributes only when intent.platform is YouTube or Shorts.
 * Short runtime form of the `youtube-content-creator` product skill.
 */
export const YOUTUBE_PLATFORM_HARNESS_PACK: ContentHarnessPack = {
  capabilities: ['platform-youtube', 'evaluation-baseline'],
  contribute: buildYouTubePlatformContribution,
  description:
    'YouTube platform pack: searchable titles and descriptions, a payoff that matches the click, retention.',
  id: 'platform-youtube',
  surfaces: ['copy'],
  version: '1.0.0',
};
