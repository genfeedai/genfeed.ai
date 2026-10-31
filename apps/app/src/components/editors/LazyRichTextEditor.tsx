'use client';

import dynamic from 'next/dynamic';
import type { RichTextEditorProps } from '@/props/components/rich-text-editor.props';

const RichTextEditor = dynamic(
  () => import('@/components/editors/RichTextEditor'),
  {
    ssr: false,
  },
);

export default function LazyRichTextEditor(props: RichTextEditorProps) {
  return <RichTextEditor {...props} />;
}
