'use client';

import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { useTranslations } from 'next-intl';
import type { StoryboardPreviewPanelProps } from '@/features/studio/props/storyboard.props';
import StoryboardAnimatic from '@/features/studio/storyboard/components/StoryboardAnimatic';

/**
 * The docked third pane: what the board will become. The final video leads
 * once it exists; until then the animatic is the preview and a short note
 * says where the final video will land.
 */
export default function StoryboardPreviewPanel({
  animatic,
  finalVideoUrl,
}: StoryboardPreviewPanelProps) {
  const translate = useTranslations('pages.studioStoryboard.preview');

  const finalVideo = finalVideoUrl ? (
    <section aria-label={translate('finalTitle')} className="space-y-3">
      <h2 className="text-sm font-medium text-foreground">
        {translate('finalTitle')}
      </h2>
      <VideoPlayer src={finalVideoUrl} ariaLabel={translate('finalTitle')} />
    </section>
  ) : null;

  return (
    <div className="flex flex-col gap-6 p-4">
      {finalVideo}
      {animatic ? (
        <StoryboardAnimatic scope={animatic.scope} shots={animatic.shots} />
      ) : null}
      {finalVideo ? null : (
        <p role="status" className="text-xs text-muted-foreground">
          {animatic ? translate('finalPending') : translate('noAnimatic')}
        </p>
      )}
    </div>
  );
}
