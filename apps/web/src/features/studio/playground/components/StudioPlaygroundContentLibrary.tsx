'use client';

import { ContentLibraryPicker } from '@genfeedai/agent/components/ContentLibraryPicker';
import type { ContentMentionItem } from '@genfeedai/agent/types/mention.types';
import type { KnowledgeSelection } from '@genfeedai/contracts/interfaces';
import type { StudioPlaygroundReferenceRole } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import type { ReactElement } from 'react';
import KnowledgeReferenceSection from '@/features/library/knowledge/components/KnowledgeReferenceSection';
import type { useStudioAudioLibrary } from '@/features/studio/playground/hooks/useStudioAudioLibrary';
import type { StudioWorkspaceScope } from '@/features/studio/props/studio-playground-workspace.props';

export interface StudioPlaygroundContentLibraryProps
  extends Pick<
    StudioWorkspaceScope,
    'brandId' | 'knowledgeSelection' | 'type'
  > {
  audioLibrary: ReturnType<typeof useStudioAudioLibrary>;
  contentLibraryItems: ContentMentionItem[];
  contentLibraryRole: StudioPlaygroundReferenceRole;
  handleKnowledgeSelectionChange: (value: KnowledgeSelection) => void;
  handleSelectContentReference: (item: ContentMentionItem) => void;
  isContentLibraryLoading: boolean;
  isContentLibraryOpen: boolean;
  isLoadingGallery: boolean;
  selectedContentIds: Set<string>;
  setIsContentLibraryOpen: (isOpen: boolean) => void;
}

/** The Library picker used to attach references, with the knowledge pick. */
export default function StudioPlaygroundContentLibrary({
  audioLibrary,
  brandId,
  contentLibraryItems,
  contentLibraryRole,
  handleKnowledgeSelectionChange,
  handleSelectContentReference,
  isContentLibraryLoading,
  isContentLibraryOpen,
  isLoadingGallery,
  knowledgeSelection,
  selectedContentIds,
  setIsContentLibraryOpen,
  type,
}: StudioPlaygroundContentLibraryProps): ReactElement {
  return (
    <ContentLibraryPicker
      description={
        contentLibraryRole === 'audioReference'
          ? audioLibrary.hasError
            ? 'Audio references could not be loaded. Close and reopen the Library to retry.'
            : 'Choose recorded audio, a generated voice, or music to condition the video alongside an image or video reference.'
          : undefined
      }
      isLoading={
        contentLibraryItems.length === 0 &&
        (contentLibraryRole === 'audioReference'
          ? audioLibrary.isLoading
          : isContentLibraryLoading || isLoadingGallery)
      }
      isOpen={isContentLibraryOpen}
      items={contentLibraryItems}
      knowledgeSection={
        type !== 'image-edit' ? (
          <KnowledgeReferenceSection
            brandId={brandId || undefined}
            key={brandId || 'no-brand'}
            onChange={handleKnowledgeSelectionChange}
            value={knowledgeSelection}
          />
        ) : null
      }
      onOpenChange={setIsContentLibraryOpen}
      onSelect={handleSelectContentReference}
      selectedIds={selectedContentIds}
    />
  );
}
