/**
 * Provider-specific rules a channel target must satisfy beyond the shared
 * setting checks (type, options, required). Split from the capability catalog
 * so that file holds the catalog and its lookups.
 */

import { CredentialPlatform } from '../..';
import type { ChannelValidationIssue } from './channel-setting-validation.contract';
import { validateInstagramAudioSettings } from './instagram-publishing.contract';
import { validateXQuotedPost } from './x-quote-post.contract';

/** The parts of a validated target that provider rules read. */
interface ProviderConstraintInput {
  publishMode?: string;
  settings?: Record<string, unknown>;
}

/**
 * The first provider rule the target breaks, as issues, or none. One rule is
 * reported at a time because the rules cover different providers.
 */
export function validateProviderConstraints(
  input: ProviderConstraintInput,
  platform: CredentialPlatform | string,
): ChannelValidationIssue[] {
  const quotedIssue = validateXQuotedPost(platform, input.settings);
  if (quotedIssue) {
    return [quotedIssue];
  }

  if (platform === CredentialPlatform.INSTAGRAM) {
    const audioIssues = validateInstagramAudioSettings(input.settings ?? {});
    if (audioIssues.length > 0) {
      return audioIssues.map((message) => ({
        code: 'channel_target.instagram_invalid_audio',
        field: 'settings',
        message,
        severity: 'error' as const,
      }));
    }
  }

  if (
    platform === CredentialPlatform.BEEHIIV &&
    input.publishMode === 'scheduled' &&
    input.settings?.providerStatus === 'draft'
  ) {
    return [
      {
        code: 'channel_target.beehiiv_draft_cannot_be_scheduled',
        field: 'settings.providerStatus',
        message:
          'Beehiiv drafts cannot carry a scheduled send time. Choose Send or publish the target immediately as a provider draft.',
        severity: 'error',
      },
    ];
  }

  return [];
}
