'use client';

import type { useAgentApiService } from '@genfeedai/agent';
import { hasAudioReferences } from '@genfeedai/contracts/constants';
import type {
  StudioPlaygroundSettings,
  StudioPlaygroundType,
} from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import type { AttachmentItem } from '@genfeedai/props/ui/attachments.props';
import { useAttachments } from '@hooks/ui/use-attachments/use-attachments';
import { useCallback } from 'react';

const STUDIO_REFERENCE_TYPES = ['image/*', 'video/*'];

export interface UseStudioAttachmentUploadsParams {
  agentApiService: ReturnType<typeof useAgentApiService>;
  restoredAttachments: AttachmentItem[];
  settings: StudioPlaygroundSettings;
  type: StudioPlaygroundType;
}

/** Composer uploads: Studio's accepted media types and the 8-file cap. */
export function useStudioAttachmentUploads({
  agentApiService,
  restoredAttachments,
  settings,
  type,
}: UseStudioAttachmentUploadsParams) {
  const uploadReference = useCallback(
    async (file: File, onProgress?: (percentage: number) => void) => {
      if (!agentApiService) {
        throw new Error('Workspace media service is unavailable');
      }

      return await agentApiService.uploadAttachment(file, onProgress);
    },
    [agentApiService],
  );
  return useAttachments({
    acceptedTypes:
      type === 'video' && hasAudioReferences(settings.modelKey)
        ? [...STUDIO_REFERENCE_TYPES, 'audio/*']
        : STUDIO_REFERENCE_TYPES,
    initialAttachments: restoredAttachments,
    maxFiles: 8,
    onUpload: uploadReference,
  });
}
