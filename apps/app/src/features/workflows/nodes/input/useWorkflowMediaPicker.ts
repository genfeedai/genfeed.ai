'use client';

import { useGalleryModal } from '@providers/global-modals/global-modals.provider';
import { useCallback } from 'react';
import {
  getWorkflowMediaPickerCategory,
  toWorkflowMediaSelection,
  type WorkflowMediaKind,
  type WorkflowMediaSelection,
  type WorkflowMediaSource,
} from '@/features/workflows/nodes/input/media-picker';

interface OpenWorkflowMediaPickerOptions {
  source: Exclude<WorkflowMediaSource, 'url'>;
  selectedItemId?: string | null;
  selectedReferenceIds?: string[];
  onPick: (selection: WorkflowMediaSelection | null) => void;
}

export function useWorkflowMediaPicker(
  kind: WorkflowMediaKind,
): (options: OpenWorkflowMediaPickerOptions) => void {
  const { openGallery } = useGalleryModal();

  return useCallback(
    ({
      source,
      selectedItemId,
      selectedReferenceIds = [],
      onPick,
    }: OpenWorkflowMediaPickerOptions) => {
      if (source === 'brand-references' && kind === 'image') {
        openGallery({
          category: getWorkflowMediaPickerCategory('image'),
          maxSelectableItems: 1,
          onSelect: () => onPick(null),
          onSelectAccountReference: (items) => {
            onPick(toWorkflowMediaSelection(items[0] ?? null, kind, source));
          },
          selectedReferences: selectedReferenceIds,
          title: 'Select Brand Reference',
        });
        return;
      }

      openGallery({
        category: getWorkflowMediaPickerCategory(kind),
        maxSelectableItems: 1,
        onSelect: (item) => {
          const selected = Array.isArray(item) ? (item[0] ?? null) : item;
          onPick(toWorkflowMediaSelection(selected, kind, source));
        },
        selectedId: selectedItemId ?? undefined,
        title:
          source === 'brand-references'
            ? kind === 'video'
              ? 'Select Brand Video'
              : 'Select Brand Media'
            : kind === 'image'
              ? 'Select Image'
              : 'Select Video',
      });
    },
    [kind, openGallery],
  );
}
