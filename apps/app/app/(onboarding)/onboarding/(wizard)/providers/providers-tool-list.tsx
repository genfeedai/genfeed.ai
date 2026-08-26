'use client';

import Card from '@ui/card/Card';

import ProvidersRowItem from './providers-row-item';

type ToolRow = {
  description: string;
  enabled: boolean;
  key: string;
};

type Props = {
  localToolRows: ToolRow[];
};

export default function ProvidersToolList({ localToolRows }: Props) {
  return (
    <Card className="provider-card opacity-0" bodyClassName="gap-0 p-5 md:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-foreground">
          Local agent tools
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Optional, but recommended for localhost installs that want to use the
          agent with local CLI tools.
        </p>
      </div>

      <div className="space-y-3">
        {localToolRows.map((tool) => (
          <ProvidersRowItem
            key={tool.key}
            label={tool.key}
            description={tool.description}
            enabled={tool.enabled}
            enabledLabel="Detected"
            disabledLabel="Not detected"
          />
        ))}
      </div>
    </Card>
  );
}
