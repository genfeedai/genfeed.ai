'use client';

import type { RichTextEditorProps } from '@props/components/rich-text-editor.props';
import dynamic from 'next/dynamic';

const RichTextEditor = dynamic(() => import('@ui/editors/RichTextEditor'), {
  ssr: false,
});

export default function LazyRichTextEditor(props: RichTextEditorProps) {
  return <RichTextEditor {...props} />;
}
