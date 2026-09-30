import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { StoryboardEditorSeedInput } from '@genfeedai/props/studio/storyboard.props';

export function getStoryboardEditorSeed(input: StoryboardEditorSeedInput) {
  if (!input.isReady)
    return {
      reason: 'Finish generating the storyboard before opening it in Editor.',
    };
  const clips = input.shotIds.map((id) => input.videos[id]);
  if (
    clips.length &&
    clips.every((clip) => clip?.state === 'ready' && clip.assetId)
  ) {
    const ids = clips.flatMap((clip) => (clip.assetId ? [clip.assetId] : []));
    return {
      href: `${APP_ROUTES.STUDIO.EDITOR_NEW}?${new URLSearchParams(ids.map((id) => ['video', id]))}`,
      ids,
    };
  }
  if (clips.some((clip) => Boolean(clip?.assetId)))
    return {
      reason:
        'Some shot clips are incomplete. Finish or repair them before opening Editor.',
    };
  if (input.assembly?.state === 'ready' && input.assembly.assetId) {
    const ids = [input.assembly.assetId];
    return {
      href: `${APP_ROUTES.STUDIO.EDITOR_NEW}?${new URLSearchParams({ video: input.assembly.assetId })}`,
      ids,
    };
  }
  return {
    reason: 'The storyboard has no ready shot clips or assembled video.',
  };
}
