'use client';

import Card from '@ui/card/Card';

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
    <Card className="provider-card opacity-0" bodyClassName="gap-0 p-5 md:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-foreground">
          Server-configured providers
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
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
    </Card>
  );
}
