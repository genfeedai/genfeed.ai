'use client';

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
    <div className="provider-card opacity-0 bg-secondary shadow-border p-5 md:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-white">Local agent tools</h2>
        <p className="mt-2 text-sm text-white/45">
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
    </div>
  );
}
