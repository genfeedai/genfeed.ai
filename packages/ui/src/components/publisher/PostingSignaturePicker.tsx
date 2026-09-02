'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { PostingSignaturePickerProps } from '@genfeedai/props/publisher/posting-set-picker.props';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import { type ReactElement, useMemo } from 'react';

export default function PostingSignaturePicker({
  onChange,
  platform,
  selectedIds,
  signatures,
}: PostingSignaturePickerProps): ReactElement | null {
  const translate = useTranslations('agent.postingSets');
  const matchingSignatures = useMemo(
    () =>
      signatures.filter(
        (signature) =>
          signature.isEnabled !== false &&
          signature.platforms.some(
            (candidate) =>
              String(candidate).toLowerCase() === platform.toLowerCase(),
          ),
      ),
    [platform, signatures],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  if (matchingSignatures.length === 0) {
    return null;
  }

  return (
    <div className="mb-2">
      <span className="mb-1 block text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        {translate('signatures')}
      </span>
      <div className="flex flex-wrap gap-2">
        {matchingSignatures.map((signature) => {
          const isSelected = selectedSet.has(signature.id);
          return (
            <Button
              key={signature.id}
              className={`rounded border px-2.5 py-1 text-xs transition-colors ${
                isSelected
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/50'
              }`}
              onClick={() => {
                const next = new Set(selectedSet);
                if (next.has(signature.id)) {
                  next.delete(signature.id);
                } else {
                  next.add(signature.id);
                }
                onChange([...next]);
              }}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
            >
              {signature.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
