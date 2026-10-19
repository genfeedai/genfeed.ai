'use client';

import { MarginInputMode, parseMarginInputMode } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  DEFAULT_PLATFORM_FEATURE_SETTINGS,
  parsePlatformFeatureSettings,
  parseTypedDecisionProvider,
} from '@genfeedai/contracts/constants';
import type {
  IBrandVisionModelOptions,
  IPlatformFeatureSettings,
  IPlatformSetting,
  TypedDecisionProviderName,
} from '@genfeedai/contracts/interfaces';
import {
  DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER,
  DEFAULT_GENERATION_MARGIN_MULTIPLIER,
} from '@genfeedai/pricing';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { PlatformSettingsContextValue } from '@props/admin/platform-settings.props';
import { AdminPlatformSettingsService } from '@services/admin/platform-settings.service';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  liveMultiplierFor,
  marginReadout,
  percentInputFor,
  resolveFieldMultiplier,
} from './platform-settings-margin.helper';

const NO_BRAND_VISION_MODELS: IBrandVisionModelOptions = {
  detect: [],
  id: 'brand-vision-models',
  ocr: [],
};

const PlatformSettingsContext =
  createContext<PlatformSettingsContextValue | null>(null);

export function usePlatformSettings(): PlatformSettingsContextValue {
  const context = useContext(PlatformSettingsContext);
  if (!context) {
    throw new Error(
      'usePlatformSettings must be used inside PlatformSettingsProvider',
    );
  }
  return context;
}

/**
 * Owns the one copy of the platform settings that every /admin/settings page
 * edits. The layout persists across those pages, so an edit survives
 * navigating between them and a single Save writes all of it.
 */
export default function PlatformSettingsProvider({
  children,
}: {
  children: ReactNode;
}) {
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
  const [brandVisionModels, setBrandVisionModels] =
    useState<IBrandVisionModelOptions>(NO_BRAND_VISION_MODELS);
  const [invalidFeatureFieldIds, setInvalidFeatureFieldIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  // Unknown counts as available: only an explicit `false` from the API marks
  // the mailer as missing (enforcement keeps its own safe default).
  const [isEmailDeliveryConfigured, setIsEmailDeliveryConfigured] =
    useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const router = useRouter();
  const translate = useTranslations('pages.platformSettings');
  const notificationsService = NotificationsService.getInstance();
  const getPlatformSettingsService = useAuthedService((token: string) =>
    AdminPlatformSettingsService.getInstance(token),
  );

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

  const applyMargins = useCallback(
    (
      data: Pick<
        IPlatformSetting,
        | 'marginInputMode'
        | 'marginMultiplierAgentChat'
        | 'marginMultiplierGeneration'
      >,
    ) => {
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
    },
    [],
  );

  const loadSettings = useCallback(
    async (signal: AbortSignal) => {
      try {
        const service = await getPlatformSettingsService();
        const [data, models] = await Promise.all([
          service.getSettings(signal),
          // The model choices are a convenience: without them the selects
          // keep showing the stored choice and the rest of the page works.
          service.getBrandVisionModels(signal).catch((error: unknown) => {
            if (!signal.aborted) {
              logger.error('Failed to load brand vision models', error);
            }
            return NO_BRAND_VISION_MODELS;
          }),
        ]);

        if (!signal.aborted) {
          applyMargins(data);
          setTypedDecisionProvider(
            parseTypedDecisionProvider(data.typedDecisionProvider),
          );
          setFeatureSettings(parsePlatformFeatureSettings(data));
          setBrandVisionModels(models);
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
          setIsRefreshing(false);
        }
      }
    },
    [applyMargins, getPlatformSettingsService, notificationsService],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadSettings(controller.signal);

    return () => controller.abort();
  }, [loadSettings]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadSettings(new AbortController().signal);
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

  async function save(): Promise<void> {
    const generationResolved = resolveFieldMultiplier(
      generationPercentInput,
      marginInputMode,
      generationMultiplier,
    );
    if ('error' in generationResolved) {
      router.push(APP_ROUTES.ADMIN.SETTINGS.BILLING);
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
      router.push(APP_ROUTES.ADMIN.SETTINGS.BILLING);
      notificationsService.warning(
        `Agent chat margin: ${agentChatResolved.error}`,
      );
      return;
    }

    // A numeric field clears its own invalidity when its page unmounts, so a
    // field still flagged here is on the page the operator is looking at.
    if (invalidFeatureFieldIds.size > 0) {
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
      applyMargins(updated);
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

  const value: PlatformSettingsContextValue = {
    brandVisionModels,
    featureSettings,
    isEmailDeliveryConfigured,
    isLoading,
    isRefreshing,
    isSaving,
    margins: {
      agentChatPercentInput,
      agentChatReadout: marginReadout(
        liveMultiplierFor(
          agentChatPercentInput,
          marginInputMode,
          agentChatMultiplier,
        ),
      ),
      generationPercentInput,
      generationReadout: marginReadout(
        liveMultiplierFor(
          generationPercentInput,
          marginInputMode,
          generationMultiplier,
        ),
      ),
      marginInputMode,
      modeUnit: marginInputMode === 'MARKUP' ? 'markup' : 'margin',
      onAgentChatPercentInputChange: setAgentChatPercentInput,
      onGenerationPercentInputChange: setGenerationPercentInput,
      onModeChange: handleModeChange,
    },
    onFeatureFieldValidityChange: handleFeatureFieldValidity,
    onFeatureSettingsChange: setFeatureSettings,
    onTypedDecisionProviderChange: setTypedDecisionProvider,
    refresh,
    save,
    typedDecisionProvider,
  };

  return (
    <PlatformSettingsContext.Provider value={value}>
      {children}
    </PlatformSettingsContext.Provider>
  );
}
