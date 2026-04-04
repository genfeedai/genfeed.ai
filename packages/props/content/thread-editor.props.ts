import type { RefObject } from 'react';

export interface ThreadEditorProps {
  tweets: string[];
  textareaRefs: RefObject<(HTMLTextAreaElement | null)[]>;
}
