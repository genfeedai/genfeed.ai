import {
  activateComposer,
  insertContentIntoComposer,
  markWrittenByGenfeed,
} from '~platforms/composer-helpers';
import type { PlatformConfig } from '~platforms/config';
import { attachMediaToComposer } from '~platforms/media-attach';
import { extractPostContext } from '~platforms/post-context';
import { showToast } from '~platforms/ui/toast';
import type { MenuItemControls } from '~types/genfeed-menu';
import { logger } from '~utils/logger.util';

export type ReplyMediaKind = 'gif' | 'image' | 'video';

interface ReplyMediaPlan {
  /** What the file is called to the page's upload control. */
  filename: string;
  /** Short noun used in messages, e.g. "image". */
  noun: string;
  /** Message sent to the background to write the reply and make the media. */
  request: (content: string) => Record<string, unknown>;
  startToast: string;
  statusLabel: string;
}

const PLANS: Record<ReplyMediaKind, ReplyMediaPlan> = {
  gif: {
    filename: 'genfeed-image.png',
    noun: 'GIF',
    request: (content) => ({
      event: 'generateReplyWithMedia',
      imagePrompt: `Create a fun, expressive animated-style image perfect for a GIF reaction that complements this context: "${content.substring(0, 100)}"`,
      mediaType: 'gif',
    }),
    startToast: 'Generating your reply with GIF...',
    statusLabel: 'Generating GIF...',
  },
  image: {
    filename: 'genfeed-image.png',
    noun: 'image',
    request: () => ({ event: 'generateReplyWithMedia', mediaType: 'image' }),
    startToast: 'Generating your reply with image...',
    statusLabel: 'Generating reply & image...',
  },
  video: {
    filename: 'genfeed-video.mp4',
    noun: 'video',
    request: () => ({ duration: 5, event: 'generateReplyWithVideo' }),
    startToast:
      'Generating your reply with video... This may take up to a minute.',
    statusLabel: 'Generating video (~30-60s)...',
  },
};

async function openInNewTab(dataUrl: string): Promise<void> {
  const blob = await fetch(dataUrl).then((response) => response.blob());
  window.open(URL.createObjectURL(blob), '_blank');
}

interface ReplyMediaResponse {
  error?: string;
  mediaDataUrl?: string;
  reply?: string;
  success?: boolean;
  videoUrl?: string;
}

/**
 * Writes a reply to the post on screen and attaches a generated image, GIF or
 * video to the reply box. It only fills the box: the user reads the result and
 * posts it themselves. When the page cannot take the file, the file is opened
 * in a tab so nothing the user waited for is lost.
 */
export async function runReplyWithMedia(
  kind: ReplyMediaKind,
  options: {
    controls: MenuItemControls;
    platform: PlatformConfig | null;
    platformName: string;
  },
): Promise<void> {
  const { controls, platform, platformName } = options;
  const plan = PLANS[kind];
  controls.setStatus('busy', plan.statusLabel);
  showToast(plan.startToast);

  const context = extractPostContext(platform);
  const response = (await chrome.runtime.sendMessage({
    ...plan.request(context.content),
    platform: platformName,
    postAuthor: context.author,
    postContent: context.content,
    postId: window.location.pathname,
    url: window.location.href,
  })) as ReplyMediaResponse | undefined;

  if (!response?.success || !response.reply) {
    showToast(response?.error || 'Failed to generate', true);
    controls.setStatus('error', 'Failed');
    return;
  }

  await activateComposer(platform);
  const inserted = insertContentIntoComposer(response.reply, platform);
  if (inserted.success) {
    markWrittenByGenfeed(response.reply);
  } else {
    logger.warn('Could not place the generated reply', inserted.error);
  }

  if (!response.mediaDataUrl) {
    if (response.videoUrl) {
      window.open(response.videoUrl, '_blank');
      showToast(
        'Reply ready! Video opened in new tab - download and attach manually.',
      );
    } else {
      showToast(`Reply generated! ${response.error || ''}`.trim());
    }
    controls.setStatus('done', 'Reply ready');
    return;
  }

  const outcome = inserted.success
    ? await attachMediaToComposer(
        platform,
        response.mediaDataUrl,
        plan.filename,
      )
    : 'failed';
  if (outcome === 'attached') {
    showToast(`Reply and ${plan.noun} ready! Review and post.`);
    controls.setStatus('done', 'Ready!');
    return;
  }

  // The page took the text but not the file, or neither.
  if (response.videoUrl && kind === 'video') {
    window.open(response.videoUrl, '_blank');
  } else {
    await openInNewTab(response.mediaDataUrl);
  }
  showToast(
    inserted.success
      ? `Reply ready! The ${plan.noun} opened in a new tab - attach it manually.`
      : (inserted.error ?? 'Could not find the reply box.'),
    true,
  );
  controls.setStatus('done', 'Reply ready');
}
