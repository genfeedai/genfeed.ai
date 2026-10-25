import {
  STUDIO_REFERENCES_CHANGED,
  StudioReferenceMention,
} from '@genfeedai/agent/extensions/studio-reference-mention';
import type { UseStudioReferenceMentionsInput } from '@genfeedai/props/studio/studio-reference-mention.props';
import type { Editor } from '@tiptap/core';
import { useEffect, useMemo, useRef } from 'react';

export function useStudioReferenceMentions({
  references,
  characters,
  characterExtensions,
}: UseStudioReferenceMentionsInput) {
  const referencesRef = useRef(references);
  const charactersRef = useRef(characters);
  referencesRef.current = references;
  charactersRef.current = characters;
  const editorRef = useRef<Editor | null>(null);
  const extensions = useMemo(
    () => [
      ...characterExtensions.map((extension) =>
        extension.configure({ suggestion: { allow: () => false } }),
      ),
      StudioReferenceMention.configure({
        getReferences: () => referencesRef.current,
        getCharacters: () => charactersRef.current,
        onCreate: (editor) => {
          editorRef.current = editor;
        },
      }),
    ],
    [characterExtensions],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: attachment changes must update chip labels even when the editor document is unchanged.
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && !editor.isDestroyed)
      editor.view.dispatch(
        editor.state.tr.setMeta(STUDIO_REFERENCES_CHANGED, true),
      );
  }, [references]);

  return extensions;
}
