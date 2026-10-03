'use client';

import {
  DEFAULT_PLATFORM_FLAGS,
  getPlatformFlagChildren,
  PLATFORM_FLAG_KEYS,
  PLATFORM_FLAG_PARENTS,
  PLATFORM_MODULE_FLAG_KEYS,
  type PlatformFlagKey,
  parsePlatformFlags,
  resolvePlatformFlags,
} from '@genfeedai/contracts/constants';
import type { IPlatformFlags } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminPlatformSettingsService } from '@services/admin/platform-settings.service';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Container from '@ui/layout/container/Container';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Switch } from '@ui/primitives/switch';
import { Heading } from '@ui/typography/heading';
import { ToggleRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { notifyPlatformFlagsChanged } from '@/lib/platform-flags/platform-flags-sync';

const MODULE_FLAG_KEY_SET = new Set<PlatformFlagKey>(PLATFORM_MODULE_FLAG_KEYS);

/** Top-level flags; nested flags render under their parent. */
const TOP_LEVEL_FLAG_KEYS = PLATFORM_FLAG_KEYS.filter(
  (key) => PLATFORM_FLAG_PARENTS[key] === undefined,
);

const FLAG_SECTIONS = [
  {
    id: 'modules',
    keys: TOP_LEVEL_FLAG_KEYS.filter((key) => MODULE_FLAG_KEY_SET.has(key)),
  },
  {
    id: 'platform',
    keys: TOP_LEVEL_FLAG_KEYS.filter((key) => !MODULE_FLAG_KEY_SET.has(key)),
  },
] as const;

/**
 * Admin → Flags (#5468): every platform-wide on/off switch on one page —
 * modules with their surfaces and features nested underneath, then
 * shell-wide features. Each switch saves at once, like a PostHog toggle; the
 * API and every app shell pick the change up within the settings cache TTL.
 */
export default function AdminFlagsPage() {
  const translate = useTranslations('pages.adminFlags');
  const notificationsService = NotificationsService.getInstance();
  const getPlatformSettingsService = useAuthedService((token: string) =>
    AdminPlatformSettingsService.getInstance(token),
  );
  const [flags, setFlags] = useState<IPlatformFlags>(DEFAULT_PLATFORM_FLAGS);
  const [savingKey, setSavingKey] = useState<PlatformFlagKey | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);

  const loadFlags = useCallback(
    async (signal: AbortSignal) => {
      try {
        const service = await getPlatformSettingsService();
        const settings = await service.getSettings(signal);
        if (!signal.aborted) {
          setFlags(parsePlatformFlags(settings.flags));
          setLoadErrorMessage(null);
        }
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load platform flags', error);
          // Never show the defaults as if they were stored: the switches stay
          // hidden and the API's reason (e.g. the admin IP allowlist) shows.
          setLoadErrorMessage(
            getJsonApiErrorMessage(error, translate('loadErrorFallback')),
          );
        }
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [getPlatformSettingsService, translate],
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
      // Open shells in this browser re-read the flags now; others within a minute.
      notifyPlatformFlagsChanged();
      notificationsService.success(
        translate('saved', {
          label: translate(`flags.${key}.label`),
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

  const effectiveFlags = resolvePlatformFlags(flags);

  function renderFlag(key: PlatformFlagKey): ReactElement {
    const parent = PLATFORM_FLAG_PARENTS[key];
    const isParentOff = parent !== undefined && !effectiveFlags[parent];
    const children = getPlatformFlagChildren(key);
    const description = translate(`flags.${key}.description`);

    return (
      <div key={key} className="flex flex-col gap-4">
        <Switch
          aria-label={translate(`flags.${key}.label`)}
          label={translate(`flags.${key}.label`)}
          description={
            isParentOff
              ? `${description} ${translate('inactiveUnderParent', {
                  parent: translate(`flags.${parent}.label`),
                })}`
              : description
          }
          isChecked={flags[key]}
          isDisabled={savingKey !== null || isParentOff}
          onCheckedChange={(isOn) => handleToggle(key, isOn)}
        />
        {children.length > 0 ? (
          <div className="flex flex-col gap-4 border-l border-border pl-6">
            {children.map(renderFlag)}
          </div>
        ) : null}
      </div>
    );
  }

  function renderContent(): ReactElement {
    if (isLoading) {
      return <SkeletonCard showImage={false} />;
    }

    if (loadErrorMessage) {
      return (
        <Alert variant="destructive" className="max-w-xl">
          <AlertTitle>{translate('loadErrorTitle')}</AlertTitle>
          <AlertDescription>{loadErrorMessage}</AlertDescription>
        </Alert>
      );
    }

    return (
      <div className="flex max-w-xl flex-col gap-10">
        {FLAG_SECTIONS.map((section) => (
          <section key={section.id} className="flex flex-col gap-6">
            <Heading size="md">
              {translate(`sections.${section.id}.title`)}
            </Heading>
            {section.keys.map(renderFlag)}
          </section>
        ))}
      </div>
    );
  }

  return (
    <Container
      label={translate('title')}
      description={translate('description')}
      icon={ToggleRight}
    >
      {renderContent()}
    </Container>
  );
}
