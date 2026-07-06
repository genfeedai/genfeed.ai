'use client';

import { HiCheckCircle, HiKey } from 'react-icons/hi2';

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
    <div className="flex flex-col gap-3 border-t border-white/[0.06] pt-3 first:border-t-0 first:pt-0 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-white">{label}</h3>
        <p className="mt-1 text-sm text-white/45">{description}</p>
      </div>
      <div
        className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs ${
          enabled ? 'bg-hover text-foreground' : 'bg-white/[0.06] text-white/45'
        }`}
      >
        {enabled ? (
          <HiCheckCircle className="size-4" />
        ) : (
          <HiKey className="size-4" />
        )}
        {enabled ? enabledLabel : disabledLabel}
      </div>
    </div>
  );
}
