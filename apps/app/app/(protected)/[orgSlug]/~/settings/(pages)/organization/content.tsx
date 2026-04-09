'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import Card from '@ui/card/Card';
import { Switch } from '@ui/primitives/switch';
import { useCallback, useState } from 'react';
import OrganizationGenerationDefaultsCard from './organization-generation-defaults-card';
import OrganizationIdentityDefaultsCard from './organization-identity-defaults-card';

export default function SettingsOrganizationPage() {
  const { organizationId, selectedBrand, isReady } = useBrand();
  const { settings, updateSettings } = useOrganization();
  const [isSaving, setIsSaving] = useState(false);

  const handleDarkroomNsfwToggle = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      setIsSaving(true);
      try {
        await updateSettings('isDarkroomNsfwVisible', e.target.checked);
      } finally {
        setIsSaving(false);
      }
    },
    [updateSettings],
  );

  if (!isReady) {
    return (
      <div className="flex items-center justify-center min-h-form">
        <span className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Organization Information</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">
              Organization ID
            </label>
            <p className="font-medium font-mono text-sm">
              {organizationId || 'Not set'}
            </p>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">
              Current Brand
            </label>
            <p className="font-medium">{selectedBrand?.label || 'Not set'}</p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Workspace Controls</h2>
        <div className="space-y-4">
          {selectedBrand?.isDarkroomEnabled && (
            <Switch
              label="Reveal Darkroom NSFW Assets"
              description="Allow NSFW darkroom assets to be revealed in brand library views. When disabled, sensitive darkroom assets remain blurred."
              isChecked={settings?.isDarkroomNsfwVisible ?? false}
              isDisabled={isSaving}
              onChange={handleDarkroomNsfwToggle}
            />
          )}
        </div>
      </Card>

      <OrganizationIdentityDefaultsCard />
      <OrganizationGenerationDefaultsCard />
    </div>
  );
}
