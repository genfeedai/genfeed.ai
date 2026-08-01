'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Switch } from '@ui/primitives/switch';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import OrganizationGenerationDefaultsCard from './organization-generation-defaults-card';
import OrganizationIdentityDefaultsCard from './organization-identity-defaults-card';

export default function SettingsOrganizationPage() {
  const { organizationId, selectedBrand, isReady } = useBrand();
  const { settings, updateSettings } = useOrganization();
  const { orgHref } = useOrgUrl();
  const [isSaving, setIsSaving] = useState(false);

  const isFleetConnected = Boolean(selectedBrand?.isFleetEnabled);
  const agentHref = orgHref(APP_ROUTES.AGENT.NEW);

  const handleFleetNsfwToggle = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      setIsSaving(true);
      try {
        await updateSettings('isFleetNsfwVisible', e.target.checked);
      } finally {
        setIsSaving(false);
      }
    },
    [updateSettings],
  );

  if (!isReady) {
    return (
      <div className="flex items-center justify-center min-h-form">
        <span className="animate-spin size-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card label="Organization Information" bodyClassName="gap-3 p-4">
        <div className="space-y-3">
          <div>
            <span className="text-sm text-muted-foreground">
              Organization ID
            </span>
            <p className="font-mono text-sm font-medium">
              {organizationId || 'Not set'}
            </p>
          </div>
          <div>
            <span className="text-sm text-muted-foreground">Current Brand</span>
            <p className="font-medium">{selectedBrand?.label || 'Not set'}</p>
          </div>
        </div>
      </Card>

      <Card
        label="Workspace"
        description="Actions for this org. Fleet controls only appear when a brand has Fleet connected."
        bodyClassName="gap-3 p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-foreground">Agent</p>
            <p className="text-xs leading-5 text-muted-foreground">
              Start a new agent thread for this workspace.
            </p>
          </div>
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            className="shrink-0"
          >
            <Link href={agentHref}>
              <Sparkles className="size-3.5" />
              Start agent
            </Link>
          </Button>
        </div>

        {isFleetConnected ? (
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Fleet
            </p>
            <Switch
              label="Reveal fleet NSFW assets"
              description="When enabled, sensitive fleet-generated assets can be revealed in brand library views. When off, they stay blurred."
              isChecked={settings?.isFleetNsfwVisible ?? false}
              isDisabled={isSaving}
              onChange={handleFleetNsfwToggle}
            />
          </div>
        ) : (
          <p className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
            {selectedBrand
              ? 'Fleet is not connected on this brand. NSFW reveal controls stay hidden until Fleet is enabled.'
              : 'Select a brand to see brand-scoped Fleet controls when connected.'}
          </p>
        )}
      </Card>

      <OrganizationIdentityDefaultsCard />
      <OrganizationGenerationDefaultsCard />
    </div>
  );
}
