'use client';

import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';

type Props = {
  jobId: string;
};

export default function LipSyncProcessingStatus({ jobId }: Props) {
  return (
    <WorkspaceSurface
      title="Processing Lip Sync Video"
      tone="muted"
      className="mt-6"
      data-testid="fleet-lip-sync-progress-surface"
    >
      <div className="flex items-center gap-3">
        <div className="animate-spin size-5 border-2 border-primary border-t-transparent rounded-full" />
        <div>
          <p className="text-sm text-foreground/50">
            Job ID: {jobId} - This may take a few minutes
          </p>
        </div>
      </div>
    </WorkspaceSurface>
  );
}
