'use client';

import { isEEEnabled } from '@genfeedai/config/license';
import { APP_ROUTES } from '@genfeedai/constants';
import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import {
  ButtonVariant,
  IngredientCategory,
  ModelProvider,
} from '@genfeedai/enums';
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
import LowCreditsBanner from '@ui/banners/low-credits/LowCreditsBanner';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import PromptBar from '@ui/prompt-bars/base/PromptBar';
import PromptBarSurfaceRenderer from '@ui/prompt-bars/surface/PromptBarSurfaceRenderer';
import { STUDIO_PROMPT_BAR_SURFACE } from '@ui/prompt-bars/surface/prompt-bar-surface.config';
import Link from 'next/link';
import { HiExclamationTriangle } from 'react-icons/hi2';

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

const CATEGORY_SUGGESTIONS: Record<string, string[]> = {
  avatar: [
    'Create an avatar welcome video for new users',
    'Record a friendly product walkthrough avatar clip',
    'Generate an avatar FAQ response for onboarding',
  ],
  image: [
    'Cinematic portrait with dramatic rim light',
    'Product photo on clean studio background',
    'Minimalist poster concept with bold typography',
  ],
  music: [
    'Compose a lo-fi background track for content',
    'Generate an upbeat intro sting for short videos',
    'Create ambient cinematic music with soft pads',
  ],
  video: [
    'Create a short product teaser with smooth camera moves',
    'Make a cinematic b-roll sequence for a brand ad',
    'Generate a vertical reel intro with dynamic motion',
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
  const suggestions = CATEGORY_SUGGESTIONS[categoryType] ?? [];
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
  const hasNoCredits =
    usesManagedInference && creditsBreakdown?.total === 0;
  const generationGate: GenerationGate = hasNoCompatibleModel
    ? 'model'
    : hasNoAvatarResources
      ? 'avatar'
      : hasNoCredits
        ? 'credits'
        : null;
  const isGenerationBlocked = isAvailabilityLoading || generationGate !== null;
  const isBillingEnabled = isEEEnabled();
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

  return (
    <PromptBarSurfaceRenderer
      surface={surface}
      topContent={
        <>
          {!isGenerationBlocked && <LowCreditsBanner />}
          {generationGate === 'model' && (
            <Alert className="mx-4 mt-3" variant="warning">
              <HiExclamationTriangle className="size-4" />
              <AlertTitle>No compatible model configured</AlertTitle>
              <AlertDescription>
                Enable a model for this Studio format before generating.{' '}
                <Link
                  className="font-medium text-foreground underline underline-offset-4"
                  href={modelsHref}
                >
                  Configure models
                </Link>
              </AlertDescription>
            </Alert>
          )}
          {generationGate === 'avatar' && (
            <Alert className="mx-4 mt-3" variant="warning">
              <HiExclamationTriangle className="size-4" />
              <AlertTitle>Avatar setup incomplete</AlertTitle>
              <AlertDescription>
                Add the missing resources before generating:{' '}
                {(avatars?.length ?? 0) === 0 && (
                  <Link
                    className="font-medium text-foreground underline underline-offset-4"
                    href={avatarsHref}
                  >
                    avatars
                  </Link>
                )}
                {(avatars?.length ?? 0) === 0 &&
                  (voices?.length ?? 0) === 0 &&
                  ' and '}
                {(voices?.length ?? 0) === 0 && (
                  <Link
                    className="font-medium text-foreground underline underline-offset-4"
                    href={voicesHref}
                  >
                    voices
                  </Link>
                )}
                .
              </AlertDescription>
            </Alert>
          )}
          {generationGate === 'credits' && (
            <Alert className="mx-4 mt-3" variant="warning">
              <HiExclamationTriangle className="size-4" />
              <AlertTitle>No credits available</AlertTitle>
              <AlertDescription>
                Add provider capacity before starting another generation.{' '}
                <Link
                  className="font-medium text-foreground underline underline-offset-4"
                  href={creditsHref}
                >
                  {isBillingEnabled ? 'Top up credits' : 'Review credits'}
                </Link>
              </AlertDescription>
            </Alert>
          )}
        </>
      }
    >
      <div className={cn('flex flex-col', isEmptyState ? 'gap-4' : 'gap-3')}>
        <div
          className={cn(
            isEmptyState &&
              'rounded-md border border-border bg-card shadow-border',
          )}
        >
          <PromptBar
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

        {isEmptyState && suggestions.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2 px-2">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                type="button"
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                className="rounded-full bg-secondary px-3 py-1.5 text-xs text-foreground/70 shadow-border transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                isDisabled={isGenerating}
                onClick={() => onTextChange(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        )}
      </div>
    </PromptBarSurfaceRenderer>
  );
}
