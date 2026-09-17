import type { Editor } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import type { ComponentType } from 'react';
import tippy, { type Instance } from 'tippy.js';

export interface SuggestionPopupProps {
  clientRect?: (() => DOMRect | null) | null;
  editor: Editor;
}

export interface SuggestionPopupRenderer {
  onExit: () => void;
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
  onStart: (props: SuggestionPopupProps) => void;
  onUpdate: (props: SuggestionPopupProps) => void;
}

interface SuggestionKeyDownHandler {
  onKeyDown?: (props: { event: KeyboardEvent }) => boolean;
}

export function getSuggestionClientRect(
  props: SuggestionPopupProps | null,
): () => DOMRect {
  return () => props?.clientRect?.() ?? new DOMRect();
}

/**
 * Shared TipTap suggestion popup (mentions and slash commands).
 *
 * `new ReactRenderer(...)` renders through `flushSync`, and TipTap fires
 * `onStart` from inside the ProseMirror transaction that matched the trigger
 * character — which can itself run while React is rendering (draft restore
 * calls `editor.commands.setContent`). React refuses to flush there and warns.
 * Mounting one microtask later moves the render out of that pass; every other
 * callback tolerates a popup that has not mounted yet.
 */
export function createSuggestionPopupRenderer<TComponentProps extends object>(
  component: ComponentType<TComponentProps>,
): SuggestionPopupRenderer {
  let renderer: ReactRenderer | null = null;
  let popup: Instance[] | null = null;
  let latestProps: SuggestionPopupProps | null = null;
  let isExited = false;

  function mount(): void {
    if (isExited || renderer || !latestProps) {
      return;
    }

    renderer = new ReactRenderer(
      component as ComponentType<Record<string, unknown>>,
      {
        editor: latestProps.editor,
        props: latestProps,
      },
    );
    popup = tippy('body', {
      appendTo: () => document.body,
      content: renderer.element,
      // Read through `latestProps` so a caret moved between onStart and mount
      // still positions the popup at the live cursor.
      getReferenceClientRect: () => getSuggestionClientRect(latestProps)(),
      interactive: true,
      placement: 'bottom-start',
      showOnCreate: true,
      trigger: 'manual',
    });
  }

  return {
    onExit: () => {
      isExited = true;
      popup?.[0]?.destroy();
      popup = null;
      renderer?.destroy();
      renderer = null;
      latestProps = null;
    },
    onKeyDown: (props: { event: KeyboardEvent }) => {
      if (props.event.key === 'Escape') {
        popup?.[0]?.hide();
        return true;
      }
      const handler = renderer?.ref as SuggestionKeyDownHandler | null;
      return handler?.onKeyDown?.(props) ?? false;
    },
    onStart: (props: SuggestionPopupProps) => {
      latestProps = props;
      queueMicrotask(mount);
    },
    onUpdate: (props: SuggestionPopupProps) => {
      latestProps = props;
      if (!renderer) {
        return;
      }
      renderer.updateProps(props);
      popup?.[0]?.setProps({
        getReferenceClientRect: getSuggestionClientRect(props),
      });
    },
  };
}
