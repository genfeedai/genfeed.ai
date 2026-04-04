'use client';

import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import { IngredientFormat } from '@genfeedai/enums';
import type {
  UsePromptStateParams,
  UsePromptStateReturn,
} from '@pages/studio/generate/types';
import {
  isImageOrVideoCategory,
  PROMPT_STORAGE_KEY,
} from '@pages/studio/generate/utils/helpers';
import { logger } from '@services/core/logger.service';
import { useEffect, useRef, useState } from 'react';

export function usePromptState({
  categoryType,
  initialFormat,
  parsedSearchParams,
  hasPromptConfigInUrl,
}: UsePromptStateParams): UsePromptStateReturn {
  const [promptText, setPromptText] = useState('');
  const [promptConfig, setPromptConfig] = useState<
    Partial<Omit<PromptTextareaSchema, 'text'>> & { isValid: boolean }
  >({
    category: String(categoryType),
    format: isImageOrVideoCategory(categoryType) ? initialFormat : undefined,
    isValid: false,
  });
  const [hasHydratedPromptState, setHasHydratedPromptState] = useState(false);

  const promptDataRef = useRef<
    Partial<PromptTextareaSchema> & { isValid: boolean }
  >({
    format: isImageOrVideoCategory(categoryType) ? initialFormat : undefined,
    isValid: false,
    text: '',
  });

  // Update category in config when categoryType changes
  useEffect(() => {
    setPromptConfig((prev) => ({
      ...prev,
      category: String(categoryType),
    }));
  }, [categoryType]);

  // Keep promptDataRef in sync with text and config
  useEffect(() => {
    promptDataRef.current = { ...promptConfig, text: promptText };
  }, [promptText, promptConfig]);

  // Ensure format is set for image/video categories
  useEffect(() => {
    if (!isImageOrVideoCategory(categoryType)) {
      return;
    }

    if (!promptConfig.format) {
      setPromptConfig((prev) => ({
        ...prev,
        format: IngredientFormat.PORTRAIT,
      }));
    }

    const currentFormat = promptConfig.format || IngredientFormat.PORTRAIT;
    if (!promptDataRef.current.format) {
      promptDataRef.current = {
        ...promptDataRef.current,
        format: currentFormat,
      };
    }
  }, [categoryType, promptConfig.format]);

  // Hydrate from sessionStorage
  useEffect(() => {
    if (typeof window === 'undefined' || hasPromptConfigInUrl) {
      return;
    }

    try {
      const stored = sessionStorage.getItem(PROMPT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<{
          promptText: string;
          promptConfig: Partial<Omit<PromptTextareaSchema, 'text'>>;
        }>;

        if (parsed.promptText) {
          setPromptText(parsed.promptText);
        }

        if (
          parsed.promptConfig &&
          Object.keys(parsed.promptConfig).length > 0
        ) {
          setPromptConfig((prev) => ({
            ...prev,
            ...parsed.promptConfig,
            category: String(categoryType),
          }));
          promptDataRef.current = {
            ...promptDataRef.current,
            ...parsed.promptConfig,
            category: String(categoryType),
            text: parsed.promptText ?? promptDataRef.current.text,
          };
        }
      }
    } catch (error) {
      logger.error('Failed to restore prompt state from sessionStorage', {
        error,
      });
    } finally {
      setHasHydratedPromptState(true);
    }
  }, [categoryType, hasPromptConfigInUrl]);

  // Persist to sessionStorage
  useEffect(() => {
    if (!hasHydratedPromptState || typeof window === 'undefined') {
      return;
    }

    try {
      const existing = sessionStorage.getItem(PROMPT_STORAGE_KEY);
      const parsedExisting = existing ? JSON.parse(existing) : {};
      sessionStorage.setItem(
        PROMPT_STORAGE_KEY,
        JSON.stringify({
          ...parsedExisting,
          lastCategory: String(categoryType),
          promptConfig: { ...promptConfig, category: String(categoryType) },
          promptText,
        }),
      );
    } catch (error) {
      logger.error('Failed to persist prompt state to sessionStorage', {
        error,
      });
    }
  }, [categoryType, hasHydratedPromptState, promptConfig, promptText]);

  return {
    hasHydratedPromptState,
    promptConfig,
    promptDataRef,
    promptText,
    setPromptConfig,
    setPromptText,
  };
}
