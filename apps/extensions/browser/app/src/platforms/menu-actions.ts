import { markWrittenByGenfeed } from '~platforms/composer-helpers';
import type { PlatformConfig } from '~platforms/config';
import { buildImagePrompt } from '~platforms/image-prompt';
import { extractPostContext } from '~platforms/post-context';
import { type ReplyMediaKind, runReplyWithMedia } from '~platforms/reply-media';
import { createSourceMenuItem } from '~platforms/source-capture-control';
import { runPageTextAction } from '~platforms/text-action-flow';
import { icons } from '~platforms/ui/icons';
import { showToast } from '~platforms/ui/toast';
import type { MenuGroupSpec, MenuItemSpec } from '~types/genfeed-menu';

interface MenuGroupsOptions {
  platform: PlatformConfig | null;
  platformName: string;
  postUrl?: string;
}

const MEDIA_ITEMS: {
  hint?: string;
  icon: string;
  kind: ReplyMediaKind;
  label: string;
}[] = [
  { icon: icons.image, kind: 'image', label: 'Image' },
  { hint: '~30-60s', icon: icons.video, kind: 'video', label: 'Video' },
  { icon: icons.gif, kind: 'gif', label: 'GIF' },
];

/** The actions in the Genfeed menu, grouped by what they do to the reply box. */
export function buildMenuGroups({
  platform,
  platformName,
  postUrl,
}: MenuGroupsOptions): MenuGroupSpec[] {
  const generateReply: MenuItemSpec = {
    icon: icons.sparkles,
    id: 'generate-reply',
    label: 'Generate reply',
    run: async () => {
      const context = extractPostContext(platform);
      try {
        const result = await chrome.runtime.sendMessage({
          event: 'SHORTCUT_REPLY',
          payload: {
            author: context.author,
            content: context.content,
            platform: platformName,
            url: postUrl || window.location.href,
          },
        });
        if (!result?.success) {
          showToast(result?.error || 'Could not open the reply composer', true);
        }
      } catch {
        showToast('Could not open the reply composer', true);
      }
    },
  };

  // Proofread and Rewrite act on the draft in the composer and only preview it.
  const textActions = (
    [
      ['proofread', 'Proofread', icons.check],
      ['rewrite', 'Rewrite in my voice', icons.edit],
    ] as const
  ).map(
    ([mode, label, icon]): MenuItemSpec => ({
      icon,
      id: mode,
      label,
      run: async (controls) => {
        controls.setStatus('busy', 'Working...');
        try {
          await runPageTextAction(mode, {
            markWritten: markWrittenByGenfeed,
            notify: showToast,
          });
        } finally {
          controls.reset();
        }
      },
    }),
  );

  const mediaItems = MEDIA_ITEMS.map(
    ({ hint, icon, kind, label }): MenuItemSpec => ({
      ariaLabel: `Reply with ${label}`,
      hint,
      icon,
      id: `reply-with-${kind}`,
      label,
      run: (controls) =>
        runReplyWithMedia(kind, { controls, platform, platformName }),
    }),
  );

  const generateImage: MenuItemSpec = {
    icon: icons.image,
    id: 'generate-image',
    label: 'Generate image',
    run: async (controls) => {
      controls.setStatus('busy', 'Generating...');
      const response = await chrome.runtime.sendMessage({
        event: 'generateImage',
        platform: platformName,
        prompt: buildImagePrompt({ platformName, postUrl }),
      });
      if (response?.success && response.imageUrl) {
        window.open(response.imageUrl, '_blank');
        controls.setStatus('done', 'Open image');
      } else {
        showToast(response?.error || 'Failed to generate image', true);
        controls.setStatus('error', 'Retry');
      }
    },
  };

  const saveSource = createSourceMenuItem(platform);

  return [
    { id: 'write', items: [generateReply, ...textActions], label: 'Write' },
    { id: 'media', items: mediaItems, label: 'Reply with media' },
    {
      id: 'create',
      items: saveSource ? [generateImage, saveSource] : [generateImage],
    },
  ];
}
