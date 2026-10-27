import { CredentialPlatform } from '@genfeedai/contracts';
import { getPlatformPreviewLimit } from '@genfeedai/contracts/constants';
import type {
  ContentHarnessContribution,
  ContentHarnessInput,
  ContentHarnessPack,
} from '../types';
import { matchesPlatform } from './platform-match';

export function isTikTokPlatform(platform: string | null | undefined): boolean {
  return matchesPlatform(platform, ['tiktok']);
}

function buildTikTokPlatformContribution(
  input: ContentHarnessInput,
): ContentHarnessContribution {
  if (!isTikTokPlatform(input.intent.platform)) {
    return {};
  }

  const limit = getPlatformPreviewLimit(CredentialPlatform.TIKTOK);

  const guardrails = [
    'The hook must be true: no promise the video does not deliver.',
    'Disclose paid partnerships and AI-generated people or voices where the content uses them.',
    "Do not reuse another creator's video or watermark; write for original footage.",
  ];

  if (limit) {
    guardrails.push(
      `Stay within ${limit.captionMaxLength} characters for the caption.`,
    );
  }

  return {
    evaluationCriteria: [
      'TikTok first seconds: would a viewer stop swiping on the opening line and frame?',
      'TikTok watch-through: is there a reason to stay to the end, or watch again?',
      'TikTok search: would someone searching the topic find and recognise this video from its caption?',
    ],
    guardrails,
    styleDirectives: [
      'Open with the payoff or the tension in the first seconds, spoken and as on-screen text.',
      'One idea per video; cut anything that does not move it forward.',
      'Sound like a person talking to camera, not an ad read.',
      'Keep the caption short: say what the video is about with the words people search for.',
    ],
    systemDirectives: [
      'Optimize for TikTok: watch-through, rewatches and shares beat likes.',
    ],
  };
}

/**
 * Platform pack: contributes only when intent.platform is TikTok.
 * Replaces the `tiktok-warmup` skill that channel defaults used to inject,
 * which is an account warm-up plan rather than writing guidance.
 */
export const TIKTOK_PLATFORM_HARNESS_PACK: ContentHarnessPack = {
  capabilities: ['platform-tiktok', 'evaluation-baseline'],
  contribute: buildTikTokPlatformContribution,
  description:
    'TikTok platform pack: a true hook in the first seconds, one idea per video, a searchable caption.',
  id: 'platform-tiktok',
  surfaces: ['copy'],
  version: '1.0.0',
};
