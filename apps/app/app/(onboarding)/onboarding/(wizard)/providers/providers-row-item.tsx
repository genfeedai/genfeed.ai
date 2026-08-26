'use client';

import { CircleCheck, Key } from 'lucide-react';

type Props = {
  description: string;
  enabledLabel: string;
  disabledLabel: string;
  enabled: boolean;
  label: string;
};

export default function ProvidersRowItem({
  description,
  enabledLabel,
  disabledLabel,
  enabled,
  label,
}: Props) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-foreground">{label}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div
        className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs ${
          enabled
            ? 'bg-hover text-foreground'
            : 'bg-background-tertiary text-muted-foreground'
        }`}
      >
        {enabled ? (
          <CircleCheck className="size-4" />
        ) : (
          <Key className="size-4" />
        )}
        {enabled ? enabledLabel : disabledLabel}
      </div>
    </div>
  );
}
