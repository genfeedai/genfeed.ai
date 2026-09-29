'use client';

import { MediaType } from '@genfeedai/contracts';
import type {
  WorkflowTemplateCardPreviewProps,
  WorkflowTemplateExampleVideoProps,
} from '@genfeedai/props/workflows/workflow-template-card-preview.props';
import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import { useIntersectionObserver } from '@hooks/ui/use-intersection-observer/use-intersection-observer';
import { usePrefersReducedMotion } from '@hooks/ui/use-prefers-reduced-motion/use-prefers-reduced-motion';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import WorkflowCardPreview from '../library/WorkflowCardPreview';

/** Card widths: the Featured carousel caps at 26rem, the grid at a third. */
const EXAMPLE_IMAGE_SIZES = '(min-width: 768px) 26rem, 85vw';

/** Share of the card that must be on screen before the video plays. */
const VIDEO_PLAY_THRESHOLD = 0.5;

/**
 * Muted, looping example video. It plays only while on screen and the viewer
 * allows motion; otherwise it rests on its poster (or first frame).
 */
function WorkflowTemplateExampleVideo({
  exampleOutput,
  label,
  onError,
}: WorkflowTemplateExampleVideoProps) {
  const isReducedMotion = usePrefersReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const { isIntersecting, ref } = useIntersectionObserver<HTMLDivElement>({
    threshold: VIDEO_PLAY_THRESHOLD,
  });
  const isPlaybackAllowed = isIntersecting && !isReducedMotion;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (!isPlaybackAllowed) {
      video.pause();
      return;
    }
    // Autoplay policies may still refuse; the poster stays up when they do.
    video.play().catch(() => undefined);
  }, [isPlaybackAllowed]);

  return (
    <div ref={ref} className="size-full">
      <VideoPlayer
        ariaLabel={label}
        src={exampleOutput.url}
        thumbnail={exampleOutput.posterUrl}
        videoRef={videoRef}
        className="h-full w-full"
        mediaClassName="object-cover"
        config={{
          autoPlay: false,
          controls: false,
          loop: true,
          muted: true,
          playsInline: true,
          // With a poster nothing downloads until the video is allowed to play.
          preload: exampleOutput.posterUrl ? 'none' : 'metadata',
        }}
        mediaProps={{ onError }}
      />
    </div>
  );
}

/**
 * Template card preview: the template's example output when it has one,
 * otherwise its workflow graph. Media that fails to load falls back to the
 * graph as well.
 */
export default function WorkflowTemplateCardPreview({
  edges,
  exampleOutput,
  name,
  nodes,
}: WorkflowTemplateCardPreviewProps) {
  const translate = useTranslations('pages.workflows.templates');
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!exampleOutput || exampleOutput.url === failedUrl) {
    return <WorkflowCardPreview name={name} nodes={nodes} edges={edges} />;
  }

  const markFailed = () => setFailedUrl(exampleOutput.url);

  return (
    <div
      className="relative aspect-video overflow-hidden rounded-md border border-border bg-background"
      data-testid="workflow-template-example-output"
    >
      {exampleOutput.mediaType === MediaType.VIDEO ? (
        <WorkflowTemplateExampleVideo
          // A new video remounts, so playback restarts on the new source.
          key={exampleOutput.url}
          exampleOutput={exampleOutput}
          label={translate('exampleOutput.videoLabel', { name })}
          onError={markFailed}
        />
      ) : (
        <Image
          unoptimized={!canOptimizeImageSource(exampleOutput.url)}
          src={exampleOutput.url}
          alt={translate('exampleOutput.imageAlt', { name })}
          className="object-cover object-center outline-media"
          fill
          loading="lazy"
          sizes={EXAMPLE_IMAGE_SIZES}
          onError={markFailed}
        />
      )}
    </div>
  );
}
