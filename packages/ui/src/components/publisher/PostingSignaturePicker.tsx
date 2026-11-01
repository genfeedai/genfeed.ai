'use client';

import type { PostingSignaturePickerProps } from '@genfeedai/props/publisher/posting-set-picker.props';
import { SegmentedControl } from '@ui/primitives/segmented-control';
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
      <SegmentedControl
        appearance="chip"
        ariaLabel={translate('signatures')}
        onValueChange={onChange}
        options={matchingSignatures.map((signature) => ({
          label: signature.label,
          value: signature.id,
        }))}
        size="sm"
        type="multiple"
        value={matchingSignatures
          .filter((signature) => selectedSet.has(signature.id))
          .map((signature) => signature.id)}
      />
    </div>
  );
}
