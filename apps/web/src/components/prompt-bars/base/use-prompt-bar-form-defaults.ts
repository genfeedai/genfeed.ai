import { getModelDefaultDuration } from '@genfeedai/contracts/constants';
import {
  getDefaultVideoResolution,
  hasResolutionOptions,
} from '@genfeedai/helpers/media/video-resolution/video-resolution.helper';
import { useEffect } from 'react';
import type { usePromptBarFilters } from '@/hooks/prompt-bar/use-prompt-bar-filters/use-prompt-bar-filters';
import type { usePromptBarForm } from '@/hooks/prompt-bar/use-prompt-bar-form/use-prompt-bar-form';

type PromptBarFilters = ReturnType<typeof usePromptBarFilters>;

interface UsePromptBarFormDefaultsOptions {
  brandId: string | undefined;
  filteredBlacklists: PromptBarFilters['filteredBlacklists'];
  filteredSounds: PromptBarFilters['filteredSounds'];
  form: ReturnType<typeof usePromptBarForm>['form'];
  hasSelectedModels: boolean;
  isAdvancedMode: boolean;
  isCrunVideo: boolean;
  triggerConfigChange: () => void;
  watchedDuration: number | undefined;
  watchedModel: string;
}

/**
 * Fills the prompt bar form with the defaults the chosen model, brand and
 * catalogs imply, once their values are known.
 */
export function usePromptBarFormDefaults({
  brandId,
  filteredBlacklists,
  filteredSounds,
  form,
  hasSelectedModels,
  isAdvancedMode,
  isCrunVideo,
  triggerConfigChange,
  watchedDuration,
  watchedModel,
}: UsePromptBarFormDefaultsOptions): void {
  // use-effect-audit: ignore writes the model's default duration into the form store
  useEffect(() => {
    if (!isCrunVideo && hasSelectedModels && !watchedDuration) {
      const defaultDuration = getModelDefaultDuration(watchedModel);
      if (defaultDuration) {
        form.setValue('duration', defaultDuration, { shouldValidate: true });
        triggerConfigChange();
      }
    }
  }, [
    isCrunVideo,
    hasSelectedModels,
    watchedModel,
    watchedDuration,
    form,
    triggerConfigChange,
  ]);

  // use-effect-audit: ignore writes the model's default resolution into the form store
  useEffect(() => {
    if (!isCrunVideo && watchedModel && hasResolutionOptions(watchedModel)) {
      const currentResolution = form.getValues('resolution');
      if (!currentResolution) {
        const defaultResolution = getDefaultVideoResolution(watchedModel);
        if (defaultResolution) {
          form.setValue('resolution', defaultResolution, {
            shouldValidate: true,
          });
          triggerConfigChange();
        }
      }
    }
  }, [isCrunVideo, watchedModel, form, triggerConfigChange]);

  // use-effect-audit: ignore writes the current brand into the form store
  useEffect(() => {
    if (brandId) {
      form.setValue('brand', brandId, { shouldValidate: true });
    }
  }, [brandId, form]);

  // Simple mode has no model selector: the backend auto-selects the model
  // from prompt + quality, so the form must opt into auto-select or generate
  // would stay blocked on the (hidden) model requirement.
  // use-effect-audit: ignore writes the auto-select flag into the form store
  useEffect(() => {
    if (isAdvancedMode || hasSelectedModels) {
      return;
    }
    if (form.getValues('autoSelectModel') !== true) {
      form.setValue('autoSelectModel', true, { shouldValidate: true });
      triggerConfigChange();
    }
  }, [isAdvancedMode, hasSelectedModels, form, triggerConfigChange]);

  // use-effect-audit: ignore writes the default blacklist into the form store
  useEffect(() => {
    if (filteredBlacklists?.length > 0) {
      const currentBlacklists = form.getValues('blacklist') || [];
      const defaultKeys = filteredBlacklists.reduce<string[]>((acc, b) => {
        if (b.isDefault) acc.push(b.key);
        return acc;
      }, []);
      if (defaultKeys.length > 0 && currentBlacklists.length === 0) {
        form.setValue('blacklist', defaultKeys, { shouldValidate: true });
        triggerConfigChange();
      }
    }
  }, [filteredBlacklists, form, triggerConfigChange]);

  // use-effect-audit: ignore writes the default sounds into the form store
  useEffect(() => {
    if (filteredSounds?.length > 0) {
      const currentSounds = form.getValues('sounds') || [];
      const defaultKeys = filteredSounds.reduce<string[]>((acc, s) => {
        if (s.isDefault && s.key !== undefined) acc.push(s.key);
        return acc;
      }, []);

      if (defaultKeys.length > 0 && currentSounds.length === 0) {
        form.setValue('sounds', defaultKeys, { shouldValidate: true });
        triggerConfigChange();
      }
    }
  }, [filteredSounds, form, triggerConfigChange]);
}
