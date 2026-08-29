'use client';

import type { PromptEditorProps } from '@genfeedai/props/prompt-bars/prompt-editor.props';
import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';

/**
 * Lazy boundary for the prompt editor.
 *
 * `PromptEditorView` pulls in Tiptap and its ProseMirror extension set. Every
 * prompt bar mounts on a route that renders long before anyone types, so the
 * editor belongs behind its own chunk instead of in each route's first load.
 * Tiptap instantiates against a live DOM node, so there is no server render to
 * preserve.
 *
 * The placeholder matches the collapsed editor's height so the surrounding
 * prompt bar does not reflow when the chunk lands.
 */
const PromptEditorView = dynamic(
  () => import('@ui/prompt-editor/PromptEditorView'),
  {
    loading: () => <div aria-hidden className="min-h-6 min-w-0 flex-1" />,
    ssr: false,
  },
);

export default function PromptEditor(props: PromptEditorProps): ReactElement {
  return <PromptEditorView {...props} />;
}
