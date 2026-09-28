'use client';

import {
  DEFAULT_PLATFORM_FLAGS,
  PLATFORM_FEATURE_FLAG_KEYS,
  PLATFORM_MODULE_FLAG_KEYS,
  type PlatformFlagKey,
  parsePlatformFlags,
} from '@genfeedai/contracts/constants';
import type { IPlatformFlags } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { AdminFlagsPageProps } from '@props/admin/platform-settings.props';
import { AdminPlatformSettingsService } from '@services/admin/platform-settings.service';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Container from '@ui/layout/container/Container';
import { Switch } from '@ui/primitives/switch';
import { Blocks, ToggleRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

const FLAG_KEYS: Record<
  AdminFlagsPageProps['kind'],
  readonly PlatformFlagKey[]
> = {
  features: PLATFORM_FEATURE_FLAG_KEYS,
  modules: PLATFORM_MODULE_FLAG_KEYS,
};

/**
 * Admin → Flags (#5468): platform-wide on/off switches for product modules
 * and features. Each switch saves at once, like a PostHog toggle; the API and
 * every app shell pick the change up within the settings cache TTL.
 */
export default function AdminFlagsPage({ kind }: AdminFlagsPageProps) {
  const translate = useTranslations('pages.adminFlags');
  const notificationsService = NotificationsService.getInstance();
  const getPlatformSettingsService = useAuthedService((token: string) =>
    AdminPlatformSettingsService.getInstance(token),
  );
  const [flags, setFlags] = useState<IPlatformFlags>(DEFAULT_PLATFORM_FLAGS);
  const [savingKey, setSavingKey] = useState<PlatformFlagKey | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadFlags = useCallback(
    async (signal: AbortSignal) => {
      try {
        const service = await getPlatformSettingsService();
        const settings = await service.getSettings(signal);
        if (!signal.aborted) {
          setFlags(parsePlatformFlags(settings.flags));
        }
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load platform flags', error);
          notificationsService.error(translate('loadError'));
        }
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [getPlatformSettingsService, notificationsService, translate],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadFlags(controller.signal);

    return () => controller.abort();
  }, [loadFlags]);

  async function handleToggle(
    key: PlatformFlagKey,
    isOn: boolean,
  ): Promise<void> {
    const previous = flags;
    setFlags({ ...flags, [key]: isOn });
    setSavingKey(key);

    try {
      const service = await getPlatformSettingsService();
      const updated = await service.updateSettings({ flags: { [key]: isOn } });
      setFlags(parsePlatformFlags(updated.flags));
      notificationsService.success(
        translate('saved', {
          label: translate(`${kind}.flags.${key}.label`),
          state: translate(isOn ? 'status.on' : 'status.off'),
        }),
      );
    } catch (error) {
      logger.error('Failed to save platform flag', error);
      setFlags(previous);
      notificationsService.error(
        getJsonApiErrorMessage(error, translate('saveError')),
      );
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <Container
      label={translate(`${kind}.title`)}
      description={translate(`${kind}.description`)}
      icon={kind === 'modules' ? Blocks : ToggleRight}
    >
      {isLoading ? (
        <SkeletonCard showImage={false} />
      ) : (
        <div className="flex max-w-xl flex-col gap-6">
          {FLAG_KEYS[kind].map((key) => (
            <Switch
              key={key}
              aria-label={translate(`${kind}.flags.${key}.label`)}
              label={translate(`${kind}.flags.${key}.label`)}
              description={translate(`${kind}.flags.${key}.description`)}
              isChecked={flags[key]}
              isDisabled={savingKey !== null}
              onCheckedChange={(isOn) => handleToggle(key, isOn)}
            />
          ))}
        </div>
      )}
    </Container>
  );
}
