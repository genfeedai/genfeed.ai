import {
  type ComposerMode,
  DEFAULT_COMPOSER_MODE,
  getComposerModeDefinition,
  isGenerationComposerMode,
} from '@genfeedai/agent/constants/composer-mode.constant';
import type {
  AgentApiService,
  GenerationModel,
} from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useCallback, useEffect, useState } from 'react';

export type UseComposerModeStateResult = {
  composerMode: ComposerMode;
  generationModelKey: string | null;
  generationModels: GenerationModel[];
  handleComposerModeChange: (mode: ComposerMode) => void;
  isGenerationModelsLoading: boolean;
  modePlaceholder: string;
  setGenerationModelKey: (key: string | null) => void;
};

/**
 * Owns composer modality (chat/image/video/voice) and the generation-model
 * catalog that replaces the LLM picker in non-chat modes.
 */
export function useComposerModeState(
  apiService: AgentApiService | undefined,
  placeholderOverride?: string,
): UseComposerModeStateResult {
  const [composerMode, setComposerMode] = useState<ComposerMode>(
    DEFAULT_COMPOSER_MODE,
  );
  const [generationModelKey, setGenerationModelKey] = useState<string | null>(
    null,
  );
  const [generationModels, setGenerationModels] = useState<GenerationModel[]>(
    [],
  );
  const [isGenerationModelsLoading, setIsGenerationModelsLoading] =
    useState(false);

  const modeDefinition = getComposerModeDefinition(composerMode);
  const modePlaceholder =
    placeholderOverride ??
    modeDefinition.placeholder ??
    'Type # brands, @ team, ! accounts, ^ content, / commands';

  const handleComposerModeChange = useCallback((mode: ComposerMode) => {
    setComposerMode(mode);
    // Reset gen model when leaving a generation mode or switching modality.
    setGenerationModelKey(null);
  }, []);

  useEffect(() => {
    if (!apiService || !isGenerationComposerMode(composerMode)) {
      // Only write when state actually needs clearing — avoid thrashing
      // with a fresh `[]` on every chat-mode effect pass.
      setGenerationModels((current) => (current.length === 0 ? current : []));
      setIsGenerationModelsLoading(false);
      return;
    }

    const controller = new AbortController();
    const category = getComposerModeDefinition(composerMode).modelCategory;
    setIsGenerationModelsLoading(true);

    void runAgentApiEffect(apiService.getModelsEffect(controller.signal))
      .then((models) => {
        if (controller.signal.aborted) {
          return;
        }
        const filtered = category
          ? models.filter((model) => model.category === category)
          : models;
        setGenerationModels(filtered);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setGenerationModels((current) =>
            current.length === 0 ? current : [],
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsGenerationModelsLoading(false);
        }
      });

    return () => controller.abort();
  }, [apiService, composerMode]);

  return {
    composerMode,
    generationModelKey,
    generationModels,
    handleComposerModeChange,
    isGenerationModelsLoading,
    modePlaceholder,
    setGenerationModelKey,
  };
}
