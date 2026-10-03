import type { AgentContentMentionItem } from '@genfeedai/contracts/interfaces';
import type { ReactNode } from 'react';

export interface ContentLibraryPickerBaseProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  footer?: ReactNode;
  isLoading?: boolean;
  items?: readonly AgentContentMentionItem[];
  selectedIds?: ReadonlySet<string>;
  knowledgeSection?: ReactNode;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: AgentContentMentionItem) => void;
}
export interface ContentLibraryPickerLocalSearchProps {
  searchMode?: 'local';
}
export interface ContentLibraryPickerRemoteSearchProps {
  searchMode: 'remote';
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}
export type ContentLibraryPickerProps = ContentLibraryPickerBaseProps &
  (
    | ContentLibraryPickerLocalSearchProps
    | ContentLibraryPickerRemoteSearchProps
  );
