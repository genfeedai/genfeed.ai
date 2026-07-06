'use client';

import { HiSparkles } from 'react-icons/hi2';

type Props = {
  accessStatusLabel: string;
};

export default function ProvidersStatusCard({ accessStatusLabel }: Props) {
  return (
    <div className="provider-card opacity-0 border border-white/[0.08] bg-white/[0.02] p-5 md:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-white">Default access</h2>
        <p className="mt-2 text-sm text-white/45">
          Server defaults come first. If you save your own provider key later,
          Genfeed will use your organization&apos;s key instead.
        </p>
      </div>

      <div className="rounded-2xl bg-hover p-4 text-sm text-white/55">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-secondary shadow-border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">
          <HiSparkles className="size-3.5" />
          Server Defaults First
        </div>
        <p>
          Start with the server configuration, then bring your own keys later
          from Organization → API Keys if you want provider control or BYOK
          billing.
        </p>
        <p className="mt-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {accessStatusLabel}
        </p>
      </div>
    </div>
  );
}
