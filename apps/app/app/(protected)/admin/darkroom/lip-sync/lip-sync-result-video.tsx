'use client';

import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';

type Props = {
  videoUrl: string;
};

export default function LipSyncResultVideo({ videoUrl }: Props) {
  return (
    <WorkspaceSurface
      title="Result"
      tone="muted"
      className="mt-6"
      data-testid="darkroom-lip-sync-result-surface"
    >
      <video
        aria-label="Lip sync result video"
        className="w-full max-w-lg rounded"
        controls
        src={videoUrl}
      >
        <track kind="captions" />
      </video>
      <div className="mt-3">
        <a
          className="text-sm text-primary hover:underline"
          download
          href={videoUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          Download Video
        </a>
      </div>
    </WorkspaceSurface>
  );
}
