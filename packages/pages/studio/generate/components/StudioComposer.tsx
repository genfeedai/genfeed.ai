'use client';

import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import { ButtonVariant, type IngredientCategory } from '@genfeedai/enums';
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
import LowCreditsBanner from '@ui/banners/low-credits/LowCreditsBanner';
import Button from '@ui/buttons/base/Button';
import PromptBar from '@ui/prompt-bars/base/PromptBar';
import PromptBarSurfaceRenderer from '@ui/prompt-bars/surface/PromptBarSurfaceRenderer';
import { STUDIO_PROMPT_BAR_SURFACE } from '@ui/prompt-bars/surface/prompt-bar-surface.config';

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
  isEmptyState,
}: StudioComposerProps) {
  const suggestions = CATEGORY_SUGGESTIONS[categoryType] ?? [];

  return (
    <PromptBarSurfaceRenderer
      surface={STUDIO_PROMPT_BAR_SURFACE}
      topContent={<LowCreditsBanner />}
    >
      <div className="flex flex-col gap-3">
        {isEmptyState && suggestions.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2 px-2">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                type="button"
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                className="rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-white/[0.07] hover:text-foreground disabled:opacity-50"
                isDisabled={isGenerating}
                onClick={() => onTextChange(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        )}

        <PromptBar
          shellMode="studio-unified"
          promptText={promptText}
          onTextChange={onTextChange}
          promptConfig={promptConfig}
          onConfigChange={onConfigChange}
          isGenerating={isGenerating}
          generateLabel={generateLabel}
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
    </PromptBarSurfaceRenderer>
  );
}
