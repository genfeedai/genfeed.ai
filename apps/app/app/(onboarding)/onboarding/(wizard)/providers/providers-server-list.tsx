'use client';

import ProvidersRowItem from './providers-row-item';

type ProviderRow = {
  description: string;
  enabled: boolean;
  key: string;
};

type Props = {
  providerRows: ProviderRow[];
};

export default function ProvidersServerList({ providerRows }: Props) {
  return (
    <div className="provider-card opacity-0 border border-white/[0.08] bg-white/[0.02] p-5 md:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-white">
          Server-configured providers
        </h2>
        <p className="mt-2 text-sm text-white/45">
          These providers are already wired into this install. If one is missing
          here, you can still add your own key later.
        </p>
      </div>

      <div className="space-y-3">
        {providerRows.map((provider) => (
          <ProvidersRowItem
            key={provider.key}
            label={provider.key}
            description={provider.description}
            enabled={provider.enabled}
            enabledLabel="Server ready"
            disabledLabel="Missing server key"
          />
        ))}
      </div>
    </div>
  );
}
