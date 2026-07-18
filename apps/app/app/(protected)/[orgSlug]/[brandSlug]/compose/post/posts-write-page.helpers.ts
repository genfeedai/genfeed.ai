import { getChannelCapability } from '@api-types/contracts';
import type {
  DesktopContentPlatform,
  DesktopContentType,
  IDesktopGeneratedContent,
  IGenfeedDesktopBridge,
} from '@genfeedai/desktop-contracts';
import { CredentialPlatform } from '@genfeedai/enums';
import type { ICredential } from '@genfeedai/interfaces';

export type Tone =
  | 'professional'
  | 'casual'
  | 'viral'
  | 'educational'
  | 'humorous';
export type GenerationFormat = 'post' | 'thread' | 'x-article';

export const TONE_OPTIONS: Array<{ label: string; value: Tone }> = [
  { label: 'Professional', value: 'professional' },
  { label: 'Casual', value: 'casual' },
  { label: 'Viral', value: 'viral' },
  { label: 'Educational', value: 'educational' },
  { label: 'Humorous', value: 'humorous' },
];

export const PLATFORM_LABELS: Partial<Record<CredentialPlatform, string>> = {
  [CredentialPlatform.DISCORD]: 'Discord',
  [CredentialPlatform.FACEBOOK]: 'Facebook',
  [CredentialPlatform.INSTAGRAM]: 'Instagram',
  [CredentialPlatform.LINKEDIN]: 'LinkedIn',
  [CredentialPlatform.MEDIUM]: 'Medium',
  [CredentialPlatform.PINTEREST]: 'Pinterest',
  [CredentialPlatform.REDDIT]: 'Reddit',
  [CredentialPlatform.TELEGRAM]: 'Telegram',
  [CredentialPlatform.TIKTOK]: 'TikTok',
  [CredentialPlatform.TWITCH]: 'Twitch',
  [CredentialPlatform.TWITTER]: 'X',
  [CredentialPlatform.YOUTUBE]: 'YouTube',
};

export const DESKTOP_PLATFORM_OPTIONS: Array<{
  label: string;
  value: DesktopContentPlatform;
}> = [
  { label: 'X', value: 'twitter' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'YouTube', value: 'youtube' },
];

export const SOCIAL_FORMAT_LABELS: Record<GenerationFormat, string> = {
  post: 'Post',
  thread: 'Thread',
  'x-article': 'X Article',
};

export const THREAD_DRAFT_SEPARATOR = '\n\n';

export function splitDraftSegments(content: string): string[] {
  const segments = content.split(/\n{2,}/).map((segment) => segment.trim());
  return segments.length ? segments : [''];
}

export function joinDraftSegments(segments: string[]): string {
  return segments.join(THREAD_DRAFT_SEPARATOR);
}

export function applyDraftSuggestionToText(
  currentContent: string,
  payload: { text: string; selectedText?: string },
): string {
  const suggestion = payload.text.trim();
  const selectedText = payload.selectedText?.trim();

  if (selectedText && currentContent.includes(selectedText)) {
    return currentContent.replace(selectedText, suggestion);
  }

  if (!currentContent.trim()) {
    return suggestion;
  }

  return [currentContent.trimEnd(), suggestion].join(THREAD_DRAFT_SEPARATOR);
}

export function getCharacterLimit(
  credential: ICredential | undefined,
  platform: DesktopContentPlatform,
): number | null {
  const activePlatform = credential?.platform
    ? String(credential.platform).toLowerCase()
    : platform;

  return getChannelCapability(activePlatform)?.caption.maxLength ?? null;
}

export function toDesktopPlatform(
  platform?: CredentialPlatform | string,
): DesktopContentPlatform {
  const value = String(platform ?? '').toLowerCase();
  return DESKTOP_PLATFORM_OPTIONS.some((option) => option.value === value)
    ? (value as DesktopContentPlatform)
    : 'twitter';
}

export function getDesktopContentType(
  mode: 'post' | 'thread',
): DesktopContentType {
  return mode === 'thread' ? 'thread' : 'caption';
}

export function isXPlatform(platform?: CredentialPlatform | string): boolean {
  return String(platform ?? '').toLowerCase() === CredentialPlatform.TWITTER;
}

export function isThreadsPlatform(
  platform?: CredentialPlatform | string,
): boolean {
  return String(platform ?? '').toLowerCase() === CredentialPlatform.THREADS;
}

export function getFormatOptions(
  credential: ICredential | undefined,
  isDesktop: boolean,
): Array<{ label: string; value: GenerationFormat }> {
  if (!credential) {
    return isDesktop
      ? [
          { label: SOCIAL_FORMAT_LABELS.post, value: 'post' },
          { label: SOCIAL_FORMAT_LABELS.thread, value: 'thread' },
        ]
      : [{ label: SOCIAL_FORMAT_LABELS.post, value: 'post' }];
  }

  if (isXPlatform(credential.platform)) {
    return [
      { label: SOCIAL_FORMAT_LABELS.post, value: 'post' },
      { label: SOCIAL_FORMAT_LABELS.thread, value: 'thread' },
      { label: SOCIAL_FORMAT_LABELS['x-article'], value: 'x-article' },
    ];
  }

  if (isThreadsPlatform(credential.platform)) {
    return [
      { label: SOCIAL_FORMAT_LABELS.post, value: 'post' },
      { label: SOCIAL_FORMAT_LABELS.thread, value: 'thread' },
    ];
  }

  return [{ label: SOCIAL_FORMAT_LABELS.post, value: 'post' }];
}

export function getCredentialLabel(credential: ICredential): string {
  const platform =
    PLATFORM_LABELS[credential.platform as CredentialPlatform] ??
    credential.platform;
  const handle =
    'externalHandle' in credential && credential.externalHandle
      ? `@${credential.externalHandle}`
      : null;

  return handle ? `${platform} ${handle}` : String(platform);
}

export async function generateDesktopContent(params: {
  bridge: IGenfeedDesktopBridge;
  mode: 'post' | 'thread';
  platform: DesktopContentPlatform;
  prompt: string;
  tone: Tone;
}): Promise<IDesktopGeneratedContent> {
  const promptWithTone = [`Tone: ${params.tone}`, params.prompt].join('\n');

  return params.bridge.cloud.generateContent({
    platform: params.platform,
    prompt: promptWithTone,
    publishIntent: 'review',
    type: getDesktopContentType(params.mode),
  });
}
