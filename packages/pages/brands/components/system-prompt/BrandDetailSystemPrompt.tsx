'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { BrandDetailSystemPromptProps } from '@props/pages/brand-detail.props';
import { Button } from '@ui/primitives/button';
import { HiDocumentDuplicate } from 'react-icons/hi2';

export default function BrandDetailSystemPrompt({
  text,
  onCopy,
}: BrandDetailSystemPromptProps) {
  return (
    <div className="bg-muted/50 p-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold">System Prompt</h3>
        <Button
          label={<HiDocumentDuplicate />}
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          onClick={() => onCopy(text)}
        />
      </div>

      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
        {text}
      </p>
    </div>
  );
}
