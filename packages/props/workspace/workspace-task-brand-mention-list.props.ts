import type { Ref } from 'react';

export interface WorkspaceBrandMentionItem {
  id: string;
  label: string;
}

export interface WorkspaceBrandMentionListProps {
  command: (item: WorkspaceBrandMentionItem) => void;
  items: WorkspaceBrandMentionItem[];
  ref?: Ref<{ onKeyDown: (props: { event: KeyboardEvent }) => boolean }>;
}
