import type { ReactElement } from 'react';

import { AutoFillToggle } from '~components/settings/AutoFillToggle';
import { AutoPostToggle } from '~components/settings/AutoPostToggle';
import { BrandSelector } from '~components/settings/BrandSelector';
import { ConnectedAccounts } from '~components/settings/ConnectedAccounts';

export function SettingsPanel(): ReactElement {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Settings</h2>
      </div>

      <div className="space-y-6 p-4">
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Active Brand
          </h3>
          <BrandSelector />
        </section>

        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Connected Accounts
          </h3>
          <ConnectedAccounts />
        </section>

        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Preferences
          </h3>
          <div className="space-y-3">
            <AutoFillToggle />
            <AutoPostToggle />
          </div>
        </section>
      </div>
    </div>
  );
}
