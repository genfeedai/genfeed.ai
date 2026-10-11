'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant, MemberRole } from '@genfeedai/contracts';
import { useUserRole } from '@hooks/auth/use-user-role/use-user-role';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Spinner from '@ui/primitives/spinner';
import { Switch } from '@ui/primitives/switch';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

const CTA_POINT_KEYS = ['consistent', 'trained', 'managed'] as const;

export default function OrganizationFleetCard() {
  const translate = useTranslations('common.settings.organizationFleet');
  const { brands, isReady } = useBrand();
  const { settings, updateSettings } = useOrganization();
  const role = useUserRole();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fleet is provisioned per brand by Genfeed, but this page is org-level:
  // the org is connected as soon as any of its brands is.
  const isFleetConnected = brands.some((brand) => brand.isFleetEnabled);
  const canManage = role === MemberRole.OWNER || role === MemberRole.ADMIN;

  const handleNsfwToggle = useCallback(
    async (isEnabled: boolean) => {
      setIsSaving(true);
      setError(null);
      try {
        await updateSettings('isFleetNsfwVisible', isEnabled);
      } catch (failure: unknown) {
        logger.error('Failed to update fleet NSFW visibility', failure);
        setError(translate('saveFailed'));
      } finally {
        setIsSaving(false);
      }
    },
    [translate, updateSettings],
  );

  if (!isReady) {
    return (
      <div className="flex items-center justify-center min-h-form">
        <Spinner className="size-8 text-primary" />
      </div>
    );
  }

  if (!isFleetConnected) {
    return (
      <Card
        label={translate('cta.title')}
        description={translate('cta.description')}
        bodyClassName="gap-4 p-4"
      >
        <ul className="space-y-2">
          {CTA_POINT_KEYS.map((key) => (
            <li
              className="flex items-start gap-2 text-sm text-foreground"
              key={key}
            >
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              {translate(`cta.points.${key}`)}
            </li>
          ))}
        </ul>
        <div>
          <Button asChild size={ButtonSize.SM} variant={ButtonVariant.DEFAULT}>
            <Link
              href={EnvironmentService.calendly}
              rel="noopener noreferrer"
              target="_blank"
            >
              {translate('cta.action')}
            </Link>
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      label={translate('title')}
      description={translate('description')}
      bodyClassName="gap-3 p-4"
    >
      <Switch
        label={translate('nsfw.label')}
        description={translate('nsfw.description')}
        isChecked={settings?.isFleetNsfwVisible ?? false}
        isDisabled={!canManage || !settings || isSaving}
        onCheckedChange={(isEnabled) => {
          void handleNsfwToggle(isEnabled);
        }}
      />
      {!canManage ? (
        <p className="text-xs text-muted-foreground">
          {translate('nsfw.adminOnly')}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
