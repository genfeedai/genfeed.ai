import type { ReactElement } from 'react';
import { AutoFillToggle } from '~components/settings/AutoFillToggle';
import { BrandSelector } from '~components/settings/BrandSelector';
import { ConnectedAccounts } from '~components/settings/ConnectedAccounts';
import { OrganizationSelector } from '~components/settings/OrganizationSelector';
import { PublicationRecordingSettings } from '~components/settings/PublicationRecordingSettings';
import { ThemeSelector } from '~components/settings/ThemeSelector';
import { useSettingsStore } from '~store/use-settings-store';
import { useWorkspaceStore } from '~store/use-workspace-store';

export function SettingsPanel(): ReactElement {
  const workspace = useWorkspaceStore();
  const isPreferencesLoaded = useSettingsStore((state) => state.isLoaded);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Settings</h2>
      </div>

      <div className="space-y-4 p-4">
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Account and workspace
          </h3>
          {workspace.status === 'ready' && (
            <p className="text-xs text-muted-foreground">
              {workspace.snapshot.organizationLabel}
            </p>
          )}
          <OrganizationSelector />
        </section>
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
          {isPreferencesLoaded ? (
            <div className="space-y-3">
              <ThemeSelector />
              <AutoFillToggle />
              <PublicationRecordingSettings />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground" role="status">
              Loading preferences…
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
