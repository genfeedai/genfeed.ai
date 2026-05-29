'use client';

import { ComponentSize } from '@genfeedai/enums';
import Spinner from '@ui/feedback/spinner/Spinner';
import FormControl from '@ui/primitives/field';
import { Textarea } from '@ui/primitives/textarea';
import type { RefObject } from 'react';

type Props = {
  prompt: string;
  isGenerating: boolean;
  formatLabel: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
};

export default function IllustrationPromptSection({
  prompt,
  isGenerating,
  formatLabel,
  textareaRef,
  onChange,
  onKeyDown,
}: Props) {
  return (
    <>
      <FormControl
        label="Describe your illustration"
        description={formatLabel}
        className="mb-0"
      >
        <Textarea
          name="illustration-prompt"
          value={prompt}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder="A professional illustration showing…"
          isDisabled={isGenerating}
          className="resize-none"
          textareaRef={textareaRef}
        />
      </FormControl>

      {isGenerating && (
        <div className="flex items-center gap-2 bg-background p-3 text-sm">
          <Spinner size={ComponentSize.SM} />
          <span>Generating your illustration…</span>
        </div>
      )}
    </>
  );
}
