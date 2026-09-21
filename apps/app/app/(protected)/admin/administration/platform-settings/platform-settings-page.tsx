'use client';

import {
  parseTypedDecisionProvider,
  TYPED_DECISION_PROVIDER_LABELS,
  TYPED_DECISION_PROVIDER_NAMES,
} from '@genfeedai/contracts/constants';
import type { TypedDecisionProviderName } from '@genfeedai/contracts/interfaces';
import {
  BASE_MARGIN_PERCENT,
  BASE_PROVIDER_COST_FRACTION,
  MAX_MARGIN_MULTIPLIER,
} from '@genfeedai/pricing';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminPlatformSettingsService } from '@services/admin/platform-settings.service';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Banknote, CircleCheck, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';

/** Effective margin percentage the configured multiplier resolves to. */
function effectiveMarginPercent(multiplier: number): number {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    return BASE_MARGIN_PERCENT;
  }
  return Math.round(
    Math.max(0, 1 - BASE_PROVIDER_COST_FRACTION / multiplier) * 100,
  );
}

export default function PlatformSettingsPage() {
  const [marginInput, setMarginInput] = useState('1');
  const [typedDecisionProvider, setTypedDecisionProvider] =
    useState<TypedDecisionProviderName>(parseTypedDecisionProvider(undefined));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const translate = useTranslations('pages.platformSettings');
  const notificationsService = NotificationsService.getInstance();
  const getPlatformSettingsService = useAuthedService((token: string) =>
    AdminPlatformSettingsService.getInstance(token),
  );

  const loadSettings = useCallback(
    async (signal: AbortSignal) => {
      try {
        const service = await getPlatformSettingsService();
        const data = await service.getSettings(signal);

        if (!signal.aborted) {
          setMarginInput(String(data.marginMultiplier));
          setTypedDecisionProvider(
            parseTypedDecisionProvider(data.typedDecisionProvider),
          );
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

    if (parsed > MAX_MARGIN_MULTIPLIER) {
      notificationsService.warning(
        `Margin multiplier cannot exceed ${MAX_MARGIN_MULTIPLIER}`,
      );
      return;
    }

    setIsSaving(true);

    try {
      const service = await getPlatformSettingsService();
      const updated = await service.updateSettings({
        marginMultiplier: parsed,
        typedDecisionProvider,
      });
      setMarginInput(String(updated.marginMultiplier));
      setTypedDecisionProvider(
        parseTypedDecisionProvider(updated.typedDecisionProvider),
      );
      notificationsService.success('Platform settings saved');
    } catch (error) {
      logger.error('Failed to save platform settings', error);
      // The API rejects a provider this deployment has no key for; that reason
      // is the whole point of the message, so surface it rather than "failed".
      notificationsService.error(
        getJsonApiErrorMessage(error, 'Failed to save platform settings'),
      );
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
      icon={Banknote}
    >
      {isLoading ? (
        <SkeletonCard showImage={false} />
      ) : (
        <Form
          spacing="section"
          className="max-w-xl"
          onSubmit={handleSubmit}
          noValidate
        >
          <Field
            label="Model-cost margin multiplier"
            htmlFor="platform-margin-multiplier"
            helpText={helpText}
          >
            <Input
              id="platform-margin-multiplier"
              type="number"
              min="0.01"
              max={MAX_MARGIN_MULTIPLIER}
              step="0.05"
              value={marginInput}
              onChange={(event) => setMarginInput(event.target.value)}
              disabled={isSaving}
            />
          </Field>

          <Field
            label={translate('typedDecisionLabel')}
            htmlFor="platform-typed-decision-provider"
            helpText={translate('typedDecisionHelp')}
          >
            <Select
              value={typedDecisionProvider}
              onValueChange={(value) =>
                setTypedDecisionProvider(parseTypedDecisionProvider(value))
              }
              disabled={isSaving}
            >
              <SelectTrigger id="platform-typed-decision-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPED_DECISION_PROVIDER_NAMES.map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    {TYPED_DECISION_PROVIDER_LABELS[provider]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Button
            type="submit"
            isDisabled={isSaving}
            className="inline-flex items-center gap-2"
          >
            {isSaving ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <CircleCheck className="size-4" />
            )}
            {isSaving ? 'Saving' : 'Save settings'}
          </Button>
        </Form>
      )}
    </Container>
  );
}
