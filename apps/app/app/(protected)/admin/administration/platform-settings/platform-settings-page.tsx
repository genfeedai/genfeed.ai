'use client';

import {
  MARGIN_INPUT_MODE_LABELS,
  MARGIN_INPUT_MODES,
  MarginInputMode,
  parseMarginInputMode,
} from '@genfeedai/contracts';
import {
  DEFAULT_PLATFORM_FEATURE_SETTINGS,
  parsePlatformFeatureSettings,
  parseTypedDecisionProvider,
  TYPED_DECISION_PROVIDER_LABELS,
  TYPED_DECISION_PROVIDER_NAMES,
} from '@genfeedai/contracts/constants';
import type {
  IPlatformFeatureSettings,
  TypedDecisionProviderName,
} from '@genfeedai/contracts/interfaces';
import {
  DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER,
  DEFAULT_GENERATION_MARGIN_MULTIPLIER,
  multiplierToPercent,
  percentToMultiplier,
  sellPriceForOneDollar,
} from '@genfeedai/pricing';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  PlatformSettingsFormTab,
  PlatformSettingsTab,
} from '@props/admin/platform-settings.props';

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
import { Text } from '@ui/typography/text';
import { Banknote, CircleCheck, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import PlatformFeatureSettingsFields from './platform-feature-settings-fields';
import PlatformSettingsGroup from './platform-settings-group';
import SystemNotificationsPanel from './system-notifications-panel';

/** Tabs whose fields belong to the one settings form, in display order. */
const FORM_TABS: readonly PlatformSettingsFormTab[] = [
  'billing',
  'decisions',
  'agent',
  'media',
  'providers',
  'accounts',
  'discord',
];

/** Notifications edit destinations with their own actions, outside the form. */
const TABS: readonly PlatformSettingsTab[] = [...FORM_TABS, 'notifications'];

function isFormTab(value: string): value is PlatformSettingsFormTab {
  return FORM_TABS.some((tab) => tab === value);
}

function isSettingsTab(value: string): value is PlatformSettingsTab {
  return TABS.some((tab) => tab === value);
}

/** The form tab holding the field with this element id, if it is rendered. */
function formTabOfField(fieldId: string): PlatformSettingsFormTab | null {
  const tab = document
    .getElementById(fieldId)
    ?.closest<HTMLElement>('[data-settings-tab]')?.dataset.settingsTab;
  return tab && isFormTab(tab) ? tab : null;
}

/** Percent an operator would type for a multiplier, in the given input mode. */
function percentInputFor(multiplier: number, mode: MarginInputMode): string {
  return String(multiplierToPercent(multiplier, mode));
}

/**
 * True when the field's text is not simply the current committed multiplier
 * redisplayed in the current mode — i.e. the operator actually typed
 * something. Untouched fields are never re-parsed, so toggling the mode
 * selector (or saving without editing a field) can never round-trip a
 * multiplier through integer percent and drift it (e.g. 3.33 → "70%" →
 * 3.3333…). See issue #5172's "round-trips without silently changing the
 * stored multiplier" requirement.
 */
function isFieldDirty(
  text: string,
  committedMultiplier: number,
  mode: MarginInputMode,
): boolean {
  return text !== percentInputFor(committedMultiplier, mode);
}

/** Validate an operator-entered percent for the given mode, returning the resolved multiplier or an error. */
function resolvePercentInput(
  rawValue: string,
  mode: MarginInputMode,
): { error: string } | { multiplier: number } {
  const parsed = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsed)) {
    return { error: 'Enter a number' };
  }
  if (mode === 'MARGIN' && parsed >= 100) {
    return { error: 'Margin percent must be less than 100' };
  }
  if (mode === 'MARKUP' && parsed <= -100) {
    return { error: 'Markup percent must be greater than -100' };
  }
  return { multiplier: percentToMultiplier(parsed, mode) };
}

/**
 * Resolve a field to the multiplier it should submit as. An untouched field
 * (see `isFieldDirty`) always resolves to its committed multiplier verbatim,
 * never a re-parsed value — that is what makes an uninvolved field immune to
 * percent-rounding drift.
 */
function resolveFieldMultiplier(
  text: string,
  mode: MarginInputMode,
  committedMultiplier: number,
): { error: string } | { multiplier: number } {
  if (!isFieldDirty(text, committedMultiplier, mode)) {
    return { multiplier: committedMultiplier };
  }
  return resolvePercentInput(text, mode);
}

/** Live multiplier for the readout below a field: the edited value while typing, else the committed one. */
function liveMultiplierFor(
  text: string,
  mode: MarginInputMode,
  committedMultiplier: number,
): number {
  const resolved = resolveFieldMultiplier(text, mode, committedMultiplier);
  return 'multiplier' in resolved ? resolved.multiplier : committedMultiplier;
}

/**
 * Live readout under a margin field, e.g.
 * "$1.00 provider → $3.33 sell · 70% margin · 233% markup". Shows both
 * framings regardless of the selected input mode, so switching modes never
 * hides where the other number came from.
 */
function marginReadout(multiplier: number): string {
  const sellPrice = sellPriceForOneDollar(multiplier);
  const markupPercent = multiplierToPercent(multiplier, 'MARKUP');
  const marginPercent = multiplierToPercent(multiplier, 'MARGIN');
  return `$1.00 provider → $${sellPrice.toFixed(2)} sell · ${marginPercent}% margin · ${markupPercent}% markup`;
}

export default function PlatformSettingsPage() {
  const [activeTab, setActiveTab] = useState<PlatformSettingsTab>('billing');
  const [marginInputMode, setMarginInputMode] = useState<MarginInputMode>(
    MarginInputMode.MARGIN,
  );
  const [generationMultiplier, setGenerationMultiplier] = useState(
    DEFAULT_GENERATION_MARGIN_MULTIPLIER,
  );
  const [agentChatMultiplier, setAgentChatMultiplier] = useState(
    DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER,
  );
  const [generationPercentInput, setGenerationPercentInput] = useState(() =>
    percentInputFor(
      DEFAULT_GENERATION_MARGIN_MULTIPLIER,
      MarginInputMode.MARGIN,
    ),
  );
  const [agentChatPercentInput, setAgentChatPercentInput] = useState(() =>
    percentInputFor(
      DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER,
      MarginInputMode.MARGIN,
    ),
  );
  const [typedDecisionProvider, setTypedDecisionProvider] =
    useState<TypedDecisionProviderName>(parseTypedDecisionProvider(undefined));
  const [featureSettings, setFeatureSettings] =
    useState<IPlatformFeatureSettings>(DEFAULT_PLATFORM_FEATURE_SETTINGS);
  const [invalidFeatureFieldIds, setInvalidFeatureFieldIds] = useState<
    ReadonlySet<string>
  >(() => new Set());

  const handleFeatureFieldValidity = useCallback(
    (fieldId: string, isValid: boolean) => {
      setInvalidFeatureFieldIds((current) => {
        if (current.has(fieldId) !== isValid) {
          return current;
        }
        const next = new Set(current);
        if (isValid) {
          next.delete(fieldId);
        } else {
          next.add(fieldId);
        }
        return next;
      });
    },
    [],
  );
  // Unknown counts as available: only an explicit `false` from the API marks
  // the mailer as missing (enforcement keeps its own safe default).
  const [isEmailDeliveryConfigured, setIsEmailDeliveryConfigured] =
    useState(true);
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
          const mode = parseMarginInputMode(data.marginInputMode);
          setMarginInputMode(mode);
          setGenerationMultiplier(data.marginMultiplierGeneration);
          setAgentChatMultiplier(data.marginMultiplierAgentChat);
          setGenerationPercentInput(
            percentInputFor(data.marginMultiplierGeneration, mode),
          );
          setAgentChatPercentInput(
            percentInputFor(data.marginMultiplierAgentChat, mode),
          );
          setTypedDecisionProvider(
            parseTypedDecisionProvider(data.typedDecisionProvider),
          );
          setFeatureSettings(parsePlatformFeatureSettings(data));
          setIsEmailDeliveryConfigured(
            data.isEmailDeliveryConfigured !== false,
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

  /**
   * A field the operator never touched keeps its exact committed multiplier
   * across a mode switch — only a field with a genuine edit gets re-parsed
   * (and, in the new mode, redisplayed from that freshly resolved value).
   */
  function handleModeChange(nextMode: string): void {
    const mode = parseMarginInputMode(nextMode);

    const nextGenerationMultiplier = liveMultiplierFor(
      generationPercentInput,
      marginInputMode,
      generationMultiplier,
    );
    const nextAgentChatMultiplier = liveMultiplierFor(
      agentChatPercentInput,
      marginInputMode,
      agentChatMultiplier,
    );

    setGenerationMultiplier(nextGenerationMultiplier);
    setAgentChatMultiplier(nextAgentChatMultiplier);
    setGenerationPercentInput(percentInputFor(nextGenerationMultiplier, mode));
    setAgentChatPercentInput(percentInputFor(nextAgentChatMultiplier, mode));
    setMarginInputMode(mode);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const generationResolved = resolveFieldMultiplier(
      generationPercentInput,
      marginInputMode,
      generationMultiplier,
    );
    if ('error' in generationResolved) {
      setActiveTab('billing');
      notificationsService.warning(
        `Generation margin: ${generationResolved.error}`,
      );
      return;
    }

    const agentChatResolved = resolveFieldMultiplier(
      agentChatPercentInput,
      marginInputMode,
      agentChatMultiplier,
    );
    if ('error' in agentChatResolved) {
      setActiveTab('billing');
      notificationsService.warning(
        `Agent chat margin: ${agentChatResolved.error}`,
      );
      return;
    }

    if (invalidFeatureFieldIds.size > 0) {
      // Show the operator where the error is when it sits on another tab.
      const [firstInvalidFieldId] = invalidFeatureFieldIds;
      const invalidTab = formTabOfField(firstInvalidFieldId);
      if (invalidTab) {
        setActiveTab(invalidTab);
      }
      notificationsService.warning(translate('features.invalidSubmit'));
      return;
    }

    setIsSaving(true);
    // Module and feature flags are edited on Admin → Flags (#5468) and
    // Featured pins on Admin → Automation → Workflows (#5511); resending the
    // copy loaded here would undo a change made there meanwhile.
    const {
      featuredWorkflowIds: _pinsEditedElsewhere,
      flags: _flagsEditedElsewhere,
      ...switches
    } = featureSettings;

    try {
      const service = await getPlatformSettingsService();
      const updated = await service.updateSettings({
        marginInputMode,
        marginMultiplierAgentChat: agentChatResolved.multiplier,
        marginMultiplierGeneration: generationResolved.multiplier,
        typedDecisionProvider,
        ...switches,
      });
      const mode = parseMarginInputMode(updated.marginInputMode);
      setMarginInputMode(mode);
      setGenerationMultiplier(updated.marginMultiplierGeneration);
      setAgentChatMultiplier(updated.marginMultiplierAgentChat);
      setGenerationPercentInput(
        percentInputFor(updated.marginMultiplierGeneration, mode),
      );
      setAgentChatPercentInput(
        percentInputFor(updated.marginMultiplierAgentChat, mode),
      );
      setTypedDecisionProvider(
        parseTypedDecisionProvider(updated.typedDecisionProvider),
      );
      setFeatureSettings(parsePlatformFeatureSettings(updated));
      setIsEmailDeliveryConfigured(updated.isEmailDeliveryConfigured !== false);
      notificationsService.success('Platform settings saved');
    } catch (error) {
      logger.error('Failed to save platform settings', error);
      // The API rejects a provider this deployment has no key for (typed
      // decisions or moderation); that reason is the whole point of the
      // message, so surface it rather than "failed".
      notificationsService.error(
        getJsonApiErrorMessage(error, 'Failed to save platform settings'),
      );
    } finally {
      setIsSaving(false);
    }
  }

  const modeUnit = marginInputMode === 'MARKUP' ? 'markup' : 'margin';
  const generationReadout = marginReadout(
    liveMultiplierFor(
      generationPercentInput,
      marginInputMode,
      generationMultiplier,
    ),
  );
  const agentChatReadout = marginReadout(
    liveMultiplierFor(
      agentChatPercentInput,
      marginInputMode,
      agentChatMultiplier,
    ),
  );

  const featureFieldsProps = {
    isDisabled: isSaving,
    isEmailDeliveryConfigured,
    onChange: setFeatureSettings,
    onValidityChange: handleFeatureFieldValidity,
    settings: featureSettings,
  };

  function renderFormContent() {
    if (isLoading) {
      return <SkeletonCard showImage={false} />;
    }

    return (
      <Form
        spacing="section"
        className="max-w-2xl"
        onSubmit={handleSubmit}
        noValidate
      >
        {FORM_TABS.map((tab) => (
          // Inactive tabs stay mounted (hidden) so an edit, or a field's
          // invalid text, survives switching tabs and saves with the rest.
          <div
            key={tab}
            data-settings-tab={tab}
            hidden={activeTab !== tab}
            className="flex flex-col gap-8"
          >
            {tab === 'billing' ? (
              <PlatformSettingsGroup title={translate('marginsHeading')}>
                <Field
                  label="Margin input mode"
                  htmlFor="platform-margin-input-mode"
                  helpText="Changes how the two margin fields below are typed and read. Billing always stores and applies the multiplier — this never changes a price."
                >
                  <Select
                    value={marginInputMode}
                    onValueChange={handleModeChange}
                    disabled={isSaving}
                  >
                    <SelectTrigger id="platform-margin-input-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MARGIN_INPUT_MODES.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {MARGIN_INPUT_MODE_LABELS[mode]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field
                  label={`Generation ${modeUnit} (%)`}
                  htmlFor="platform-margin-multiplier-generation"
                  helpText={generationReadout}
                >
                  <Input
                    id="platform-margin-multiplier-generation"
                    type="number"
                    step="1"
                    value={generationPercentInput}
                    onChange={(event) =>
                      setGenerationPercentInput(event.target.value)
                    }
                    disabled={isSaving}
                  />
                </Field>

                <Field
                  label={`Agent chat ${modeUnit} (%)`}
                  htmlFor="platform-margin-multiplier-agent-chat"
                  helpText={agentChatReadout}
                >
                  <Input
                    id="platform-margin-multiplier-agent-chat"
                    type="number"
                    step="1"
                    value={agentChatPercentInput}
                    onChange={(event) =>
                      setAgentChatPercentInput(event.target.value)
                    }
                    disabled={isSaving}
                  />
                </Field>
              </PlatformSettingsGroup>
            ) : null}

            {tab === 'decisions' ? (
              <PlatformSettingsGroup>
                <Field
                  label={translate('typedDecisionLabel')}
                  htmlFor="platform-typed-decision-provider"
                  helpText={translate('typedDecisionHelp')}
                >
                  <Select
                    value={typedDecisionProvider}
                    onValueChange={(value) =>
                      setTypedDecisionProvider(
                        parseTypedDecisionProvider(value),
                      )
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
              </PlatformSettingsGroup>
            ) : null}

            <PlatformFeatureSettingsFields
              {...featureFieldsProps}
              section={tab}
            />
          </div>
        ))}

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-4 border-t border-border bg-background py-4">
          <Text as="p" color="muted" size="sm">
            {translate('saveHint')}
          </Text>
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
            {translate(isSaving ? 'savingButton' : 'saveButton')}
          </Button>
        </div>
      </Form>
    );
  }

  return (
    <Container
      label="Platform settings"
      description="Platform-wide business and infrastructure controls for operators"
      icon={Banknote}
      moduleChrome
      headerTabs={{
        activeTab,
        fullWidth: false,
        onTabChange: (tab) => {
          if (isSettingsTab(tab)) {
            setActiveTab(tab);
          }
        },
        tabs: TABS.map((tab) => ({ id: tab, label: translate(`tabs.${tab}`) })),
      }}
    >
      {activeTab === 'notifications' ? <SystemNotificationsPanel /> : null}
      {/* The form stays mounted under Notifications so unsaved edits survive. */}
      <div hidden={activeTab === 'notifications'}>{renderFormContent()}</div>
    </Container>
  );
}
