import { PromptCategory, SystemPromptKey } from '@genfeedai/contracts';
import type { IconType } from '@genfeedai/contracts/interfaces/ui/icon.interface';
import {
  InstagramIcon,
  TiktokIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';

export const platformIcons: Record<string, IconType> = {
  instagram: InstagramIcon,
  tiktok: TiktokIcon,
  twitter: XTwitterIcon,
  youtube: YoutubeIcon,
};

export const platformColors: Record<string, string> = {
  instagram: 'text-pink-500',
  tiktok: 'text-black', // design-system-allow-content-color -- platform mark
  twitter: 'text-blue-400',
  youtube: 'text-red-500',
};

export const PLATFORM_TO_CONTENT_CATEGORY: Record<string, PromptCategory> = {
  instagram: PromptCategory.POST_CONTENT_INSTAGRAM,
  tiktok: PromptCategory.POST_CONTENT_TIKTOK,
  twitter: PromptCategory.POST_CONTENT_TWITTER,
  youtube: PromptCategory.POST_CONTENT_YOUTUBE,
};

export const PLATFORM_TO_TITLE_CATEGORY: Record<string, PromptCategory> = {
  instagram: PromptCategory.POST_TITLE_INSTAGRAM,
  tiktok: PromptCategory.POST_TITLE_TIKTOK,
  twitter: PromptCategory.POST_TITLE_TWITTER,
  youtube: PromptCategory.POST_TITLE_YOUTUBE,
};

// Platform to system prompt key mapping with content/title variants
export const PLATFORM_TO_SYSTEM_PROMPT_KEY: Record<
  string,
  { content: SystemPromptKey; title: SystemPromptKey }
> = {
  instagram: {
    content: SystemPromptKey.INSTAGRAM_CONTENT,
    title: SystemPromptKey.INSTAGRAM_TITLE,
  },
  tiktok: {
    content: SystemPromptKey.TIKTOK_CONTENT,
    title: SystemPromptKey.TIKTOK_TITLE,
  },
  twitter: {
    content: SystemPromptKey.TWITTER_CONTENT,
    title: SystemPromptKey.TWITTER_TITLE,
  },
  youtube: {
    content: SystemPromptKey.YOUTUBE_CONTENT,
    title: SystemPromptKey.YOUTUBE_TITLE,
  },
};
