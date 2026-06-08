'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import {
  HiClipboardDocument,
  HiDocumentText,
  HiSparkles,
} from 'react-icons/hi2';

type GenerationFormat = 'post' | 'thread' | 'x-article';

const SOCIAL_FORMAT_LABELS: Record<GenerationFormat, string> = {
  post: 'Post',
  thread: 'Thread',
  'x-article': 'X Article',
};

interface PostsWriteActionBarProps {
  canGenerate: boolean;
  canSaveDraft: boolean;
  generatePostLabel: string;
  isSubmitting: boolean;
  onCopy: () => void;
  onGenerate: () => void;
  onSaveDraft: () => void;
  selectedFormat: GenerationFormat;
}

export default function PostsWriteActionBar({
  canGenerate,
  canSaveDraft,
  generatePostLabel,
  isSubmitting,
  onCopy,
  onGenerate,
  onSaveDraft,
  selectedFormat,
}: PostsWriteActionBarProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        type="button"
        variant={ButtonVariant.UNSTYLED}
        onClick={onCopy}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-white/[0.05]"
      >
        <HiClipboardDocument className="size-4" />
        Copy content
      </Button>
      <Button
        type="button"
        variant={ButtonVariant.UNSTYLED}
        onClick={onSaveDraft}
        disabled={!canSaveDraft || isSubmitting}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <HiDocumentText className="size-4" />
        {isSubmitting ? 'Working...' : 'Save draft in Genfeed'}
      </Button>
      <Button
        type="button"
        variant={ButtonVariant.UNSTYLED}
        onClick={onGenerate}
        disabled={!canGenerate}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <HiSparkles className="size-4" />
        {isSubmitting
          ? 'Working...'
          : `${generatePostLabel} (${SOCIAL_FORMAT_LABELS[selectedFormat]})`}
      </Button>
    </div>
  );
}
