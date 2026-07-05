'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminPlatformSettingsService } from '@services/admin/platform-settings.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  HiArrowPath,
  HiOutlineBanknotes,
  HiOutlineCheckCircle,
} from 'react-icons/hi2';

/** Provider cost is 30% of the base sell price (i.e. a base 70% margin). */
const BASE_COST_FRACTION = 0.3;

/** Effective margin percentage the configured multiplier resolves to. */
function effectiveMarginPercent(multiplier: number): number {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    return 70;
  }
  return Math.round((1 - BASE_COST_FRACTION / multiplier) * 100);
}

export default function PlatformSettingsPage() {
  const [marginInput, setMarginInput] = useState('1');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const notificationsService = NotificationsService.getInstance();
  const getPlatformSettingsService = useAuthedService((token: string) =>
    AdminPlatformSettingsService.getInstance(token),
  );

  const loadSettings = useCallback(
    async (signal: AbortSignal) => {
      try {
        const service = await getPlatformSettingsService();
        const data = await service.getSettings();

        if (!signal.aborted) {
          setMarginInput(String(data.marginMultiplier));
        }
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load platform settings', error);
          notificationsService.error('Failed to load platform settings');
        }
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [getPlatformSettingsService, notificationsService],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadSettings(controller.signal);

    return () => controller.abort();
  }, [loadSettings]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const parsed = Number.parseFloat(marginInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      notificationsService.warning(
        'Margin multiplier must be a positive number',
      );
      return;
    }

    setIsSaving(true);

    try {
      const service = await getPlatformSettingsService();
      const updated = await service.updateSettings({
        marginMultiplier: parsed,
      });
      setMarginInput(String(updated.marginMultiplier));
      notificationsService.success('Platform settings saved');
    } catch (error) {
      logger.error('Failed to save platform settings', error);
      notificationsService.error('Failed to save platform settings');
    } finally {
      setIsSaving(false);
    }
  }

  const parsedMargin = Number.parseFloat(marginInput);
  const hasValidMargin = Number.isFinite(parsedMargin) && parsedMargin > 0;
  const helpText = hasValidMargin
    ? `1.0 = base 70% margin. Current setting ≈ ${effectiveMarginPercent(
        parsedMargin,
      )}% effective margin on provider cost.`
    : '1.0 = base 70% margin. Enter a positive multiplier.';

  return (
    <Container
      label="Platform settings"
      description="Platform-wide business and infrastructure controls for operators"
      icon={HiOutlineBanknotes}
    >
      {isLoading ? (
        <SkeletonCard showImage={false} />
      ) : (
        <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
          <Field
            label="Model-cost margin multiplier"
            htmlFor="platform-margin-multiplier"
            helpText={helpText}
          >
            <Input
              id="platform-margin-multiplier"
              type="number"
              min="0"
              step="0.05"
              value={marginInput}
              onChange={(event) => setMarginInput(event.target.value)}
              disabled={isSaving}
            />
          </Field>

          <Button
            type="submit"
            isDisabled={isSaving}
            className="inline-flex items-center gap-2"
          >
            {isSaving ? (
              <HiArrowPath className="size-4 animate-spin" />
            ) : (
              <HiOutlineCheckCircle className="size-4" />
            )}
            {isSaving ? 'Saving' : 'Save settings'}
          </Button>
        </form>
      )}
    </Container>
  );
}
