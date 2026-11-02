import { create } from 'zustand';
import type { StudioPlaygroundJob } from '@/features/studio/playground/types';
import type { StudioPlaygroundPreviewRecovery } from '@/features/studio/props/studio-playground.props';

/**
 * Previews the Inspector re-read after "Retry preview". The gallery and an
 * open generation are separate routes, each with its own workspace, so the
 * recovery has to live outside either one for the gallery card to recover
 * when the person goes back to it.
 */
type StudioPlaygroundPreviewRecoveryState = {
  recordRecovery: (
    job: StudioPlaygroundJob,
    recoveredUrl: string | undefined,
  ) => void;
  recoveries: Readonly<Record<string, StudioPlaygroundPreviewRecovery>>;
};

export const useStudioPlaygroundPreviewRecoveryStore =
  create<StudioPlaygroundPreviewRecoveryState>()((set) => ({
    recordRecovery: (job, recoveredUrl) => {
      set((state) => ({
        recoveries: {
          ...state.recoveries,
          [job.id]: {
            revision: (state.recoveries[job.id]?.revision ?? 0) + 1,
            ...(recoveredUrl && recoveredUrl !== job.url
              ? { staleUrl: job.url, url: recoveredUrl }
              : {}),
          },
        },
      }));
    },
    recoveries: {},
  }));
