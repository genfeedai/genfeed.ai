'use client';

import { ModelCategory } from '@genfeedai/contracts';
import { normalizeMusicSettings } from '@genfeedai/contracts/constants';
import {
  AgentGenerationQuoteUnavailableReason,
  type IModel,
} from '@genfeedai/contracts/interfaces';
import type {
  StudioGenerationCostEstimate,
  StudioPlaygroundCapabilities,
  StudioPlaygroundSettings,
  StudioPlaygroundType,
} from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import {
  buildStudioAutoGenerationQuoteRequest,
  buildStudioGenerationQuoteRequest,
  isAutoStudioModelKey,
} from '@genfeedai/pricing';
import type {
  PromptBarAttachedAsset,
  UseCrunGenerationQuoteReturn,
} from '@genfeedai/props/studio/prompt-bar.props';
import { useCallback, useEffect, useState } from 'react';
import { useStudioAvatarEstimate } from '@/features/studio/playground/hooks/useStudioAvatarEstimate';
import { useStudioGenerationEstimate } from '@/features/studio/playground/hooks/useStudioGenerationEstimate';
import { useStudioRetryCreditBack } from '@/features/studio/playground/hooks/useStudioRetryCreditBack';
import {
  buildStudioAvatarRequest,
  resolveStudioAvatarScript,
} from '@/features/studio/playground/utils/studio-avatar-request';
import { pinStudioSettingsToModel } from '@/features/studio/playground/utils/studio-pinned-model';
import {
  buildStudioPromptData,
  resolveModelKey,
} from '@/features/studio/playground/utils/studio-playground-settings';
import { buildVideoDraftSettings } from '@/features/studio/playground/utils/studio-video-draft';
import type { StudioSpendSource } from '@/features/studio/props/studio-playground.props';

const HTTP_PROTOCOL_PREFIX_PATTERN = /^https?:\/\//;

interface UseStudioComposerPricingParams {
  attachedAssets: readonly PromptBarAttachedAsset[];
  capabilities: StudioPlaygroundCapabilities;
  crunQuote: UseCrunGenerationQuoteReturn | undefined;
  hasEditMask: boolean;
  isIdentityMissing: boolean;
  isLoadingModels: boolean;
  models: readonly IModel[];
  prompt: string;
  selectedModel: IModel | undefined;
  settings: StudioPlaygroundSettings;
  type: StudioPlaygroundType;
}

type QuoteRequestBuilder = (
  pinnedModelKey?: string,
  draftOverride?: StudioPlaygroundSettings,
) => ReturnType<typeof buildStudioGenerationQuoteRequest>;

interface StudioComposerPricing {
  buildQuoteRequest: QuoteRequestBuilder;
  /** Video only: the cheap preview of the chosen model, when one exists. */
  draftEstimate: StudioGenerationCostEstimate;
  draftSettings: StudioPlaygroundSettings | null;
  estimate: StudioGenerationCostEstimate;
  isDraftActive: boolean;
  /** Admission refuses the estimate outright, so Generate waits. */
  isEstimateBlocking: boolean;
  refreshRetryCreditBack: () => void;
  retryCreditBackCredits: ReturnType<typeof useStudioRetryCreditBack>;
  setIsDraftMode: (isEnabled: boolean) => void;
  spendSource: StudioSpendSource;
}

/**
 * How the composer prices Generate: the server quote for the chosen model,
 * the cheap Video draft, the avatar quote, and the quote a Crun render already
 * holds. The server quote admission charges is never recalculated here.
 */
export function useStudioComposerPricing({
  attachedAssets,
  capabilities,
  crunQuote,
  hasEditMask,
  isIdentityMissing,
  isLoadingModels,
  models,
  prompt,
  selectedModel,
  settings,
  type,
}: UseStudioComposerPricingParams): StudioComposerPricing {
  const [isDraftMode, setIsDraftMode] = useState(false);
  const costPromptData = buildStudioPromptData({
    brandId: '',
    promptText: '',
    settings,
    type,
  });
  // Image and video Auto stay unpriced until routing picks a model. Music
  // Auto quotes the catalog default already loaded for this type. With no
  // default flagged, the request omits the key and the server resolves the
  // registry music default.
  const isMusicAuto =
    type === 'music' && isAutoStudioModelKey(settings.modelKey);
  const quoteModelKey = isMusicAuto
    ? models.find(
        (model) => model.isDefault && model.category === ModelCategory.MUSIC,
      )?.key
    : settings.modelKey;
  const quotedModel = models.find((model) => model.key === quoteModelKey);
  const isServerPricedModel =
    !isLoadingModels &&
    quotedModel?.provider !== 'crun' &&
    (isMusicAuto ||
      (quotedModel !== undefined &&
        quotedModel.key === settings.modelKey &&
        !isAutoStudioModelKey(settings.modelKey)));
  const quoteDuration =
    type === 'music'
      ? normalizeMusicSettings(quoteModelKey, {
          duration: settings.duration,
          instrumental: settings.instrumental,
          lyrics: settings.lyrics,
        }).duration
      : costPromptData.duration;
  // The request for the model Studio submits, or for the one Auto was priced
  // at (`pinnedModelKey`), which is submitted with that model's controls.
  // A draft (`draftOverride`) is quoted for the cheap settings it submits.
  const buildQuoteRequest: QuoteRequestBuilder = (
    pinnedModelKey,
    draftOverride,
  ) => {
    const quoteSettings =
      draftOverride ??
      (pinnedModelKey
        ? pinStudioSettingsToModel(settings, pinnedModelKey)
        : settings);
    const isOverridden = Boolean(pinnedModelKey || draftOverride);
    const quoteData = isOverridden
      ? buildStudioPromptData({
          brandId: '',
          promptText: '',
          settings: quoteSettings,
          type,
        })
      : costPromptData;
    return buildStudioGenerationQuoteRequest({
      aspectRatio: quoteSettings.aspectRatio,
      duration: isOverridden ? quoteData.duration : quoteDuration,
      editSize: hasEditMask ? 'source' : quoteSettings.editSize,
      referenceUrls: attachedAssets
        .filter(
          (asset) =>
            asset.role === (type === 'image-edit' ? 'editSource' : 'reference'),
        )
        .flatMap((asset) =>
          asset.previewUrl &&
          HTTP_PROTOCOL_PREFIX_PATTERN.test(asset.previewUrl)
            ? [asset.previewUrl]
            : [],
        ),
      height: quoteData.height,
      isAudioEnabled: quoteSettings.isAudioEnabled,
      modelKey: draftOverride?.modelKey ?? pinnedModelKey ?? quoteModelKey,
      outputs: quoteData.outputs,
      resolution: quoteData.resolution,
      type,
      width: quoteData.width,
    });
  };
  // The server quote admission charges; Studio never recalculates it.
  const serverEstimate = useStudioGenerationEstimate(
    isServerPricedModel ? buildQuoteRequest() : null,
  );
  // Video only: the cheap preview of the chosen model, priced by the same
  // server quote, so a first look costs a fraction of the full render.
  const draftSettings =
    type === 'video' && isServerPricedModel
      ? buildVideoDraftSettings(settings, models)
      : null;
  const draftEstimate = useStudioGenerationEstimate(
    draftSettings ? buildQuoteRequest(undefined, draftSettings) : null,
  );
  // Draft is a mode of Video: while it is on, Generate submits the preview.
  const hasDraftSettings = draftSettings !== null;
  const isDraftActive = isDraftMode && hasDraftSettings;
  useEffect(() => {
    if (!hasDraftSettings) setIsDraftMode(false);
  }, [hasDraftSettings]);
  // An avatar is quoted for the body Generate submits (script, identity and
  // the resolved engine); until all three exist there is nothing to price.
  const avatarScript = resolveStudioAvatarScript(settings.speech, prompt);
  const avatarEstimate = useStudioAvatarEstimate(
    type === 'avatar' && !isIdentityMissing && avatarScript && !isLoadingModels
      ? buildStudioAvatarRequest(
          settings,
          avatarScript,
          resolveModelKey(settings, models, capabilities.hasModelSelection),
        )
      : null,
  );
  const estimate: StudioGenerationCostEstimate =
    type === 'avatar'
      ? isLoadingModels
        ? { credits: null, status: 'loading' }
        : avatarEstimate
      : type !== 'image' &&
          type !== 'image-edit' &&
          type !== 'video' &&
          type !== 'music'
        ? { credits: null, status: 'unavailable' }
        : isLoadingModels
          ? { credits: null, status: 'loading' }
          : isAutoStudioModelKey(settings.modelKey) && type !== 'music'
            ? { credits: null, status: 'auto' }
            : !isMusicAuto &&
                (!selectedModel || selectedModel.key !== settings.modelKey)
              ? {
                  credits: null,
                  status: 'unavailable',
                  unavailableReason:
                    AgentGenerationQuoteUnavailableReason.MODEL_UNAVAILABLE,
                }
              : serverEstimate;
  // A draft render never counts as an attempt, and a BYOK render holds no credits.
  const [retryCreditBackRefresh, setRetryCreditBackRefresh] = useState(0);
  const refreshRetryCreditBack = useCallback(
    () => setRetryCreditBackRefresh((count) => count + 1),
    [],
  );
  const retryCreditBackCredits = useStudioRetryCreditBack({
    credits:
      !isDraftActive &&
      estimate.status === 'estimated' &&
      estimate.billingMode !== 'byok'
        ? estimate.credits
        : null,
    modelKey: quoteModelKey,
    prompt,
    refreshToken: retryCreditBackRefresh,
  });
  // Admission refuses these outright, so Generate waits instead of failing after submit.
  // ERROR, loading, Auto and Crun never block.
  const isEstimateBlocking =
    estimate.status === 'unavailable' &&
    selectedModel?.provider !== 'crun' &&
    (estimate.unavailableReason ===
      AgentGenerationQuoteUnavailableReason.PRICING_UNRESOLVED ||
      estimate.unavailableReason ===
        AgentGenerationQuoteUnavailableReason.MODEL_UNAVAILABLE ||
      estimate.unavailableReason ===
        AgentGenerationQuoteUnavailableReason.MISSING_SETTING);
  // How Generate is priced before it submits: the server quote for a model
  // Studio can price, the quote a Crun or avatar render already holds, and
  // nothing for a type with no tariff (voice).
  const crunSpendQuote =
    selectedModel?.provider === 'crun' ? crunQuote?.getCurrentQuote() : null;
  const spendSource: StudioSpendSource =
    selectedModel?.provider === 'crun'
      ? crunSpendQuote
        ? {
            credits:
              crunSpendQuote.billingMode === 'byok'
                ? 0
                : crunSpendQuote.credits,
            isByok: crunSpendQuote.billingMode === 'byok',
            kind: 'known',
          }
        : { kind: 'unpriced' }
      : type === 'avatar'
        ? estimate.status === 'estimated' && estimate.credits !== null
          ? {
              credits: estimate.credits,
              isByok: estimate.billingMode === 'byok',
              kind: 'known',
            }
          : { kind: 'unpriced' }
        : type === 'image' ||
            type === 'image-edit' ||
            type === 'video' ||
            type === 'music'
          ? {
              autoRequest:
                isAutoStudioModelKey(settings.modelKey) && type !== 'music'
                  ? buildStudioAutoGenerationQuoteRequest({
                      aspectRatio: settings.aspectRatio,
                      duration: costPromptData.duration,
                      outputs: costPromptData.outputs,
                      prioritize: settings.prioritize,
                      prompt,
                      type,
                    })
                  : null,
              buildRequest: buildQuoteRequest,
              kind: 'server',
            }
          : { kind: 'unpriced' };
  return {
    buildQuoteRequest,
    draftEstimate,
    draftSettings,
    estimate,
    isDraftActive,
    isEstimateBlocking,
    refreshRetryCreditBack,
    retryCreditBackCredits,
    setIsDraftMode,
    spendSource,
  };
}
