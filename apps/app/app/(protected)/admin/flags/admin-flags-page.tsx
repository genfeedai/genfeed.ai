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
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { ToggleRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { notifyPlatformFlagsChanged } from '@/lib/platform-flags/platform-flags-sync';
import AdminFlagCard from './admin-flag-card';

const MODULE_FLAG_KEY_SET = new Set<PlatformFlagKey>(PLATFORM_MODULE_FLAG_KEYS);

/** Top-level flags, one card each; nested flags list inside their card. */
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

/** Every flag nested under `key`, depth first, flattened into one list. */
function nestedFlagKeysOf(key: PlatformFlagKey): PlatformFlagKey[] {
  return getPlatformFlagChildren(key).flatMap((child) => [
    child,
    ...nestedFlagKeysOf(child),
  ]);
}

/**
 * Admin → Flags (#5468): every platform-wide on/off switch on one page —
 * one card per module with its surfaces and features listed inside, then
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
      <div className="flex flex-col gap-10">
        {FLAG_SECTIONS.map((section) => (
          <section key={section.id} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Heading size="md">
                {translate(`sections.${section.id}.title`)}
              </Heading>
              <Text as="p" color="muted" size="sm">
                {translate(`sections.${section.id}.description`)}
              </Text>
            </div>
            <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {section.keys.map((key) => (
                <AdminFlagCard
                  key={key}
                  flagKey={key}
                  nestedKeys={nestedFlagKeysOf(key)}
                  flags={flags}
                  effectiveFlags={effectiveFlags}
                  isDisabled={savingKey !== null}
                  onToggle={handleToggle}
                />
              ))}
            </div>
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
