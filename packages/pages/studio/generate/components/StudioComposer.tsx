'use client';

import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import { hasOrganizationBilling } from '@genfeedai/config/license';
import { APP_ROUTES } from '@genfeedai/constants';
import { IngredientCategory, ModelProvider } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useSubscription } from '@genfeedai/hooks/data/subscription/use-subscription/use-subscription';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import type {
  IElementBlacklist,
  IElementCamera,
  IElementMood,
  IElementScene,
  IElementStyle,
  IFolder,
  IFontFamily,
  IModel,
  IPreset,
  ISound,
  ITag,
  ITraining,
} from '@genfeedai/interfaces';
import type { AvatarVoiceOption } from '@genfeedai/interfaces/studio/studio-generate.interface';
import type { PromptBarSurfaceConfig } from '@genfeedai/props/prompt-bars/prompt-bar-surface.props';
import type { PromptBarSuggestionItem } from '@props/prompt-bars/prompt-bar-suggestion-item.props';
import LowCreditsBanner from '@ui/banners/low-credits/LowCreditsBanner';
import PromptBar from '@ui/prompt-bars/base/PromptBar';
import PromptBarNotice from '@ui/prompt-bars/components/notice/PromptBarNotice';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import PromptBarSurfaceRenderer from '@ui/prompt-bars/surface/PromptBarSurfaceRenderer';
import { STUDIO_PROMPT_BAR_SURFACE } from '@ui/prompt-bars/surface/prompt-bar-surface.config';
import {
  Clapperboard,
  Film,
  Image as ImageIcon,
  Mic2,
  Music2,
  Sparkles,
  UserRound,
  Video,
} from 'lucide-react';
import { createElement, useMemo } from 'react';

interface StudioComposerProps {
  promptText: string;
  onTextChange: (text: string) => void;
  promptConfig: Partial<Omit<PromptTextareaSchema, 'text'>> & {
    isValid: boolean;
  };
  onConfigChange: (
    config: Partial<Omit<PromptTextareaSchema, 'text'>> & { isValid: boolean },
  ) => void;
  isGenerating: boolean;
  generateLabel: string;
  models: IModel[];
  trainings: ITraining[];
  presets: IPreset[];
  folders?: IFolder[];
  categoryType: IngredientCategory;
  onIngredientCategoryChange: (category: IngredientCategory) => void;
  onSubmit: () => void;
  avatars?: AvatarVoiceOption[];
  voices?: AvatarVoiceOption[];
  avatarPreviewUrl?: string;
  moods?: IElementMood[];
  styles?: IElementStyle[];
  cameras?: IElementCamera[];
  sounds?: ISound[];
  tags?: ITag[];
  scenes?: IElementScene[];
  fontFamilies?: IFontFamily[];
  blacklists?: IElementBlacklist[];
  isAvailabilityLoading: boolean;
  isEmptyState: boolean;
}

/**
 * Empty-state prompt cards — same visual contract as agent suggestions:
 * colored icon + one-line label. Full text lives in `prompt` (and can later
 * be swapped for generated content without changing the card chrome).
 */
const CATEGORY_SUGGESTIONS: Record<string, PromptBarSuggestionItem[]> = {
  avatar: [
    {
      id: 'studio-avatar-welcome',
      icon: createElement(UserRound, { className: 'size-5 text-sky-400' }),
      label: 'Welcome avatar video',
      prompt: 'Create an avatar welcome video for new users',
    },
    {
      id: 'studio-avatar-walkthrough',
      icon: createElement(Mic2, { className: 'size-5 text-violet-400' }),
      label: 'Product walkthrough clip',
      prompt: 'Record a friendly product walkthrough avatar clip',
    },
    {
      id: 'studio-avatar-faq',
      icon: createElement(Sparkles, { className: 'size-5 text-emerald-400' }),
      label: 'Onboarding FAQ reply',
      prompt: 'Generate an avatar FAQ response for onboarding',
    },
  ],
  image: [
    {
      id: 'studio-image-portrait',
      icon: createElement(ImageIcon, { className: 'size-5 text-sky-400' }),
      label: 'Cinematic portrait',
      prompt: 'Cinematic portrait with dramatic rim light',
    },
    {
      id: 'studio-image-product',
      icon: createElement(Sparkles, { className: 'size-5 text-violet-400' }),
      label: 'Clean product photo',
      prompt: 'Product photo on clean studio background',
    },
    {
      id: 'studio-image-poster',
      icon: createElement(ImageIcon, { className: 'size-5 text-emerald-400' }),
      label: 'Bold poster concept',
      prompt: 'Minimalist poster concept with bold typography',
    },
  ],
  music: [
    {
      id: 'studio-music-lofi',
      icon: createElement(Music2, { className: 'size-5 text-sky-400' }),
      label: 'Lo-fi background track',
      prompt: 'Compose a lo-fi background track for content',
    },
    {
      id: 'studio-music-sting',
      icon: createElement(Sparkles, { className: 'size-5 text-violet-400' }),
      label: 'Upbeat intro sting',
      prompt: 'Generate an upbeat intro sting for short videos',
    },
    {
      id: 'studio-music-ambient',
      icon: createElement(Music2, { className: 'size-5 text-emerald-400' }),
      label: 'Ambient cinematic pads',
      prompt: 'Create ambient cinematic music with soft pads',
    },
  ],
  video: [
    {
      id: 'studio-video-teaser',
      icon: createElement(Video, { className: 'size-5 text-sky-400' }),
      label: 'Short product teaser',
      prompt: 'Create a short product teaser with smooth camera moves',
    },
    {
      id: 'studio-video-broll',
      icon: createElement(Clapperboard, {
        className: 'size-5 text-violet-400',
      }),
      label: 'Cinematic brand b-roll',
      prompt: 'Make a cinematic b-roll sequence for a brand ad',
    },
    {
      id: 'studio-video-reel',
      icon: createElement(Film, { className: 'size-5 text-emerald-400' }),
      label: 'Vertical reel intro',
      prompt: 'Generate a vertical reel intro with dynamic motion',
    },
  ],
};

const EMPTY_STUDIO_PROMPT_BAR_SURFACE: PromptBarSurfaceConfig = {
  container: {
    className: 'mt-4 w-full',
    layoutMode: 'inflow',
    maxWidth: '4xl',
    zIndex: 60,
  },
};

const MODEL_SELECTION_CATEGORIES = new Set<IngredientCategory>([
  IngredientCategory.IMAGE,
  IngredientCategory.MUSIC,
  IngredientCategory.VIDEO,
]);

type GenerationGate = 'avatar' | 'credits' | 'model' | null;

export function StudioComposer({
  promptText,
  onTextChange,
  promptConfig,
  onConfigChange,
  isGenerating,
  generateLabel,
  models,
  trainings,
  presets,
  folders,
  categoryType,
  onIngredientCategoryChange,
  onSubmit,
  avatars,
  voices,
  avatarPreviewUrl,
  moods,
  styles,
  cameras,
  sounds,
  tags,
  scenes,
  fontFamilies,
  blacklists,
  isAvailabilityLoading,
  isEmptyState,
}: StudioComposerProps) {
  const { creditsBreakdown } = useSubscription();
  const { orgHref } = useOrgUrl();
  const suggestionItems = useMemo<PromptBarSuggestionItem[]>(
    () => CATEGORY_SUGGESTIONS[categoryType] ?? [],
    [categoryType],
  );
  const surface = isEmptyState
    ? EMPTY_STUDIO_PROMPT_BAR_SURFACE
    : STUDIO_PROMPT_BAR_SURFACE;
  const requiresModelSelection = MODEL_SELECTION_CATEGORIES.has(categoryType);
  const hasNoCompatibleModel =
    !isAvailabilityLoading && requiresModelSelection && models.length === 0;
  const hasNoAvatarResources =
    !isAvailabilityLoading &&
    categoryType === IngredientCategory.AVATAR &&
    ((avatars?.length ?? 0) === 0 || (voices?.length ?? 0) === 0);
  const selectedModelKeys =
    Array.isArray(promptConfig.models) && promptConfig.models.length > 0
      ? promptConfig.models
      : [models.find((model) => model.isDefault)?.key ?? models[0]?.key];
  const usesManagedInference =
    promptConfig.autoSelectModel === true
      ? models.length > 0 &&
        models.every((model) => model.provider === ModelProvider.GENFEED_AI)
      : selectedModelKeys.some((modelKey) =>
          models.some(
            (model) =>
              model.key === modelKey &&
              model.provider === ModelProvider.GENFEED_AI,
          ),
        );
  const hasNoCredits = usesManagedInference && creditsBreakdown?.total === 0;
  const generationGate: GenerationGate = hasNoCompatibleModel
    ? 'model'
    : hasNoAvatarResources
      ? 'avatar'
      : hasNoCredits
        ? 'credits'
        : null;
  const isGenerationBlocked = isAvailabilityLoading || generationGate !== null;
  const isBillingEnabled = hasOrganizationBilling();
  const resolvedGenerateLabel = isAvailabilityLoading
    ? 'Loading options'
    : generationGate === 'model'
      ? 'Configure a model'
      : generationGate === 'avatar'
        ? 'Set up an avatar'
        : generationGate === 'credits'
          ? 'Add credits'
          : generateLabel;
  const creditsHref = orgHref(
    isBillingEnabled
      ? APP_ROUTES.SETTINGS.BILLING
      : APP_ROUTES.SETTINGS.CREDITS,
  );
  const modelsHref = orgHref(APP_ROUTES.SETTINGS.MODELS);
  const avatarsHref = orgHref(APP_ROUTES.LIBRARY.AVATARS);
  const voicesHref = orgHref(APP_ROUTES.LIBRARY.VOICES);

  const generationGateBanner =
    generationGate === 'model' ? (
      <PromptBarNotice
        ctaHref={modelsHref}
        ctaLabel="Configure models"
        description="Enable a model for this Studio format before generating."
        title="No compatible model configured"
      />
    ) : generationGate === 'avatar' ? (
      <PromptBarNotice
        ctaHref={(avatars?.length ?? 0) === 0 ? avatarsHref : voicesHref}
        ctaLabel={
          (avatars?.length ?? 0) === 0 && (voices?.length ?? 0) === 0
            ? 'Set up avatars'
            : (avatars?.length ?? 0) === 0
              ? 'Add avatars'
              : 'Add voices'
        }
        description={
          (avatars?.length ?? 0) === 0 && (voices?.length ?? 0) === 0
            ? 'Add at least one avatar and one voice before generating.'
            : (avatars?.length ?? 0) === 0
              ? 'Add an avatar before generating.'
              : 'Add a voice before generating.'
        }
        title="Avatar setup incomplete"
      />
    ) : generationGate === 'credits' ? (
      <PromptBarNotice
        ctaHref={creditsHref}
        ctaLabel={isBillingEnabled ? 'Top up credits' : 'Review credits'}
        description="Add provider capacity before starting another generation."
        title="No credits available"
      />
    ) : null;

  return (
    <PromptBarSurfaceRenderer
      surface={surface}
      topContent={!isGenerationBlocked ? <LowCreditsBanner /> : null}
    >
      <div className={cn('flex flex-col', isEmptyState ? 'gap-5' : 'gap-3')}>
        {/* Agent empty-state order: suggestion cards, then the prompt bar. */}
        {isEmptyState && suggestionItems.length > 0 ? (
          <PromptBarSuggestions
            className="w-full"
            isDisabled={isGenerating}
            maxSuggestions={3}
            onSuggestionSelect={(item) => onTextChange(item.prompt)}
            suggestions={suggestionItems}
            variant="cards"
          />
        ) : null}

        <div className="w-full">
          <PromptBar
            banner={generationGateBanner}
            features={{ collapsible: false, dragDrop: false }}
            promptText={promptText}
            onTextChange={onTextChange}
            promptConfig={promptConfig}
            onConfigChange={onConfigChange}
            isGenerating={isGenerating}
            isGenerateDisabled={isGenerationBlocked}
            requiresModelSelection={requiresModelSelection}
            generateLabel={resolvedGenerateLabel}
            models={models}
            trainings={trainings}
            presets={presets}
            folders={folders}
            categoryType={categoryType}
            onIngredientCategoryChange={onIngredientCategoryChange}
            onSubmit={onSubmit}
            avatars={avatars}
            voices={voices}
            avatarPreviewUrl={avatarPreviewUrl}
            moods={moods}
            styles={styles}
            cameras={cameras}
            sounds={sounds}
            tags={tags}
            scenes={scenes}
            fontFamilies={fontFamilies}
            blacklists={blacklists}
          />
        </div>
      </div>
    </PromptBarSurfaceRenderer>
  );
}
