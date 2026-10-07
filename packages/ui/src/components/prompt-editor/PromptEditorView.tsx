'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptEditorProps } from '@genfeedai/props/prompt-bars/prompt-editor.props';
import { EditorContent, useEditor } from '@tiptap/react';
import {
  createPromptEditorExtensions,
  createPromptEditorPasteHandler,
} from '@ui/prompt-editor/create-prompt-editor-extensions';
import { useCallback, useEffect, useRef } from 'react';

function PromptEditorView({
  ariaLabel = 'Prompt',
  className,
  documentSeed,
  editor: injectedEditor,
  editorClassName,
  extraExtensions,
  initialContent,
  isDisabled = false,
  onDocumentChange,
  onSubmit,
  onValueChange,
  placeholder = '',
  testId = 'prompt-editor',
  value,
}: PromptEditorProps) {
  const onSubmitRef = useRef(onSubmit);
  const onValueChangeRef = useRef(onValueChange);
  const onDocumentChangeRef = useRef(onDocumentChange);
  const placeholderRef = useRef(placeholder);
  const isApplyingExternalRef = useRef(false);

  useEffect(() => {
    onSubmitRef.current = onSubmit;
    onValueChangeRef.current = onValueChange;
    onDocumentChangeRef.current = onDocumentChange;
    placeholderRef.current = placeholder;
  }, [onDocumentChange, onSubmit, onValueChange, placeholder]);

  const handlePaste = useRef(createPromptEditorPasteHandler()).current;
  const appliedSeedIdRef = useRef<string | null>(null);

  const ownedEditor = useEditor({
    content: initialContent ?? value ?? '',
    editable: !isDisabled,
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        'aria-multiline': 'true',
        class: cn(
          'prose prose-sm dark:prose-invert max-w-none flex-1 bg-transparent py-1.5 text-sm text-foreground focus:outline-none',
          '[&_.mention]:rounded-md [&_.mention]:bg-primary/15 [&_.mention]:px-1 [&_.mention]:py-0.5 [&_.mention]:font-medium',
          editorClassName,
        ),
        role: 'textbox',
      },
      handlePaste: (view, event) => handlePaste(view, event),
    },
    extensions: createPromptEditorExtensions({
      extraExtensions,
      onEnter: () => {
        onSubmitRef.current?.();
        return true;
      },
      placeholder,
    }),
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
  });

  const editor = injectedEditor ?? ownedEditor;

  useEffect(() => {
    if (!editor || injectedEditor) {
      return;
    }
    editor.setEditable(!isDisabled);
  }, [editor, injectedEditor, isDisabled]);

  useEffect(() => {
    if (!editor || injectedEditor) {
      return;
    }
    const updateHandler = () => {
      if (isApplyingExternalRef.current) {
        return;
      }
      onValueChangeRef.current?.(editor.getText());
      onDocumentChangeRef.current?.(editor.getJSON());
    };
    editor.on('update', updateHandler);
    return () => {
      editor.off('update', updateHandler);
    };
  }, [editor, injectedEditor]);

  const syncExternalValue = useCallback(
    (nextValue: string) => {
      if (!editor || injectedEditor) {
        return;
      }
      if (editor.view.composing) {
        return;
      }
      if (editor.getText() === nextValue) {
        return;
      }
      isApplyingExternalRef.current = true;
      editor.commands.setContent(nextValue);
      isApplyingExternalRef.current = false;
    },
    [editor, injectedEditor],
  );

  useEffect(() => {
    if (value === undefined) {
      return;
    }
    syncExternalValue(value);
  }, [syncExternalValue, value]);

  useEffect(() => {
    if (!editor || injectedEditor || !documentSeed) {
      return;
    }
    if (appliedSeedIdRef.current === documentSeed.id) {
      return;
    }
    appliedSeedIdRef.current = documentSeed.id;
    isApplyingExternalRef.current = true;
    editor.commands.setContent(documentSeed.content, { emitUpdate: false });
    editor.commands.focus('end');
    isApplyingExternalRef.current = false;
    onValueChangeRef.current?.(editor.getText());
    onDocumentChangeRef.current?.(editor.getJSON());
  }, [documentSeed, editor, injectedEditor]);

  useEffect(() => {
    if (!editor) return;
    let frame = 0;
    const followCaret = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (editor.isDestroyed || !editor.isFocused) return;
        const viewport = editor.view.dom;
        const { selection, doc } = editor.state;
        // Typing at the tail must follow wrapped lines and Shift+Enter even
        // when the editor's own DOM node is the capped scroll container.
        if (selection.empty && selection.to >= doc.content.size - 1) {
          viewport.scrollTop = viewport.scrollHeight;
          return;
        }
        const caret = editor.view.coordsAtPos(selection.head);
        const bounds = viewport.getBoundingClientRect();
        if (caret.bottom > bounds.bottom)
          viewport.scrollTop += caret.bottom - bounds.bottom;
        else if (caret.top < bounds.top)
          viewport.scrollTop -= bounds.top - caret.top;
      });
    };
    editor.on('update', followCaret);
    editor.on('selectionUpdate', followCaret);
    editor.on('focus', followCaret);
    return () => {
      cancelAnimationFrame(frame);
      editor.off('update', followCaret);
      editor.off('selectionUpdate', followCaret);
      editor.off('focus', followCaret);
    };
  }, [editor]);

  return (
    <EditorContent
      className={cn(
        'min-w-0 flex-1 [&_.ProseMirror]:min-h-9 [&_.ProseMirror]:max-h-28 [&_.ProseMirror]:overflow-y-auto',
        '[&_.ProseMirror_p.is-editor-empty:first-child]:before:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child]:before:float-left [&_.ProseMirror_p.is-editor-empty:first-child]:before:h-0 [&_.ProseMirror_p.is-editor-empty:first-child]:before:text-muted-foreground [&_.ProseMirror_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]',
        className,
      )}
      data-testid={testId}
      editor={editor}
    />
  );
}

export default PromptEditorView;
