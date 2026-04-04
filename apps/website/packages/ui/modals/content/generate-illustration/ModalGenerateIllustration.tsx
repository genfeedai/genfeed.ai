'use client';

import type { IImage, IModel } from '@genfeedai/interfaces';
import { VIDEO_FORMAT_DIMENSIONS } from '@genfeedai/constants';
import {
  ButtonVariant,
  ComponentSize,
  ContentTemplateKey,
  IngredientCategory,
  IngredientFormat,
  ModalEnum,
  ModelCategory,
  Platform,
} from '@genfeedai/enums';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useModalAutoOpen } from '@hooks/ui/use-modal-auto-open/use-modal-auto-open';
import { useGenerationListener } from '@hooks/utils/use-generation-listener/use-generation-listener';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import type { ModalGenerateIllustrationProps } from '@props/modals/modal.props';
import { ModelsService } from '@services/ai/models.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { ImagesService } from '@services/ingredients/images.service';
import Button from '@ui/buttons/base/Button';
import Spinner from '@ui/feedback/spinner/Spinner';
import FormControl from '@ui/forms/base/form-control/FormControl';
import FormTextarea from '@ui/forms/inputs/textarea/form-textarea/FormTextarea';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { resolvePendingIds } from '@utils/network/generation.util';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiArrowTopRightOnSquare, HiArrowUp } from 'react-icons/hi2';

/**
 * Platform to format mapping for optimal image dimensions
 */
const PLATFORM_FORMAT_MAP: Partial<Record<Platform, IngredientFormat>> = {
  [Platform.TWITTER]: IngredientFormat.LANDSCAPE,
  [Platform.INSTAGRAM]: IngredientFormat.SQUARE,
  [Platform.FACEBOOK]: IngredientFormat.LANDSCAPE,
  [Platform.LINKEDIN]: IngredientFormat.LANDSCAPE,
  [Platform.PINTEREST]: IngredientFormat.PORTRAIT,
  [Platform.REDDIT]: IngredientFormat.LANDSCAPE,
  [Platform.MEDIUM]: IngredientFormat.LANDSCAPE,
};

/**
 * Strip HTML tags and decode common entities from a string
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Decode common entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n') // Normalize multiple newlines
    .trim();
}

/**
 * Get the optimal format for a given platform
 */
function getFormatForPlatform(platform?: Platform): IngredientFormat {
  if (!platform) {
    return IngredientFormat.LANDSCAPE;
  }
  return PLATFORM_FORMAT_MAP[platform] ?? IngredientFormat.LANDSCAPE;
}

export default function ModalGenerateIllustration({
  isOpen,
  openKey,
  initialPrompt = '',
  platform,
  onConfirm,
  onClose,
}: ModalGenerateIllustrationProps) {
  // Strip HTML from initial prompt
  const cleanInitialPrompt = useMemo(
    () => stripHtml(initialPrompt),
    [initialPrompt],
  );

  const [prompt, setPrompt] = useState(cleanInitialPrompt);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedImageId, setGeneratedImageId] = useState<string | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(
    null,
  );
  const [models, setModels] = useState<IModel[]>([]);

  const [defaultModelKey, setDefaultModelKey] = useState<string>(
    EnvironmentService.MODELS_DEFAULT.image,
  );

  const [isLoadingModels, setIsLoadingModels] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Refs for callbacks to prevent re-renders
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const { isReady: isSocketReady, getSocketManager } = useSocketManager();

  const getImagesService = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
  );

  const getModelsService = useAuthedService((token: string) =>
    ModelsService.getInstance(token),
  );

  /**
   * Centralized state reset function for generation cleanup.
   * Consolidates all teardown logic in one place.
   *
   * @param reason - Optional error message. If provided, sets error state and clears generated image.
   */
  const resetGenerationState = useCallback((reason?: string) => {
    if (reason) {
      setError(reason);
      setGeneratedImageId(null);
      setGeneratedImageUrl(null);
    }
    setIsGenerating(false);
  }, []);

  /**
   * Fetch image data once generation is complete
   */
  const fetchImageData = useCallback(
    async (imageId: string) => {
      try {
        const service = await getImagesService();
        const image = await service.findOne(imageId);
        const imageUrl =
          (image as { ingredientUrl?: string; url?: string })?.ingredientUrl ||
          (image as { ingredientUrl?: string; url?: string })?.url ||
          null;
        if (imageUrl) {
          setGeneratedImageUrl(imageUrl);
        }
      } catch (err: unknown) {
        logger.error('Failed to fetch generated image', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [getImagesService],
  );

  const listenForGeneration = useGenerationListener({
    onError: (error) => {
      logger.error('Generation failed', {
        error: error instanceof Error ? error.message : error.toString(),
      });
      resetGenerationState(
        error instanceof Error ? error.message : 'Generation failed',
      );
    },
    onSuccess: async (resolvedId) => {
      logger.info('Generation completed successfully', { resolvedId });
      // Fetch the image data to get the URL for preview
      await fetchImageData(resolvedId);
    },
    showErrorNotifications: false, // We handle errors via resetGenerationState
    timeoutMs: 60000,
  });

  // Calculate format and dimensions based on platform
  const format = useMemo(() => getFormatForPlatform(platform), [platform]);
  const dimensions = useMemo(() => VIDEO_FORMAT_DIMENSIONS[format], [format]);

  // Load models when modal opens
  useEffect(() => {
    if (isOpen && models.length === 0 && !isLoadingModels) {
      const loadModels = async () => {
        setIsLoadingModels(true);
        try {
          const service = await getModelsService();
          const allModels = await service.findAll({
            category: ModelCategory.IMAGE,
            isActive: true,
            pagination: false,
          });

          setModels(allModels);

          // Set default model (first active model or default from env)
          const defaultModel =
            allModels.find(
              (m: IModel) =>
                m.isDefault ||
                m.key === EnvironmentService.MODELS_DEFAULT.image,
            ) || allModels[0];

          if (defaultModel) {
            setDefaultModelKey(defaultModel.key);
          }
        } catch (err) {
          logger.error('Failed to load models', err);
          // Fallback to default model if loading fails
          setDefaultModelKey(EnvironmentService.MODELS_DEFAULT.image);
        } finally {
          setIsLoadingModels(false);
        }
      };

      loadModels();
    }
  }, [isOpen, models.length, isLoadingModels, getModelsService]);

  // Track previous open state to detect modal open transitions
  const prevIsOpenRef = useRef(isOpen);

  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      queueMicrotask(() => {
        setPrompt(cleanInitialPrompt);
        setError(null);
        setIsGenerating(false);
        setGeneratedImageId(null);
        setGeneratedImageUrl(null);

        // Auto-focus textarea when modal opens
        textareaRef.current?.focus();
      });
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, cleanInitialPrompt]);

  useModalAutoOpen(ModalEnum.GENERATE_ILLUSTRATION, {
    isOpen: isOpen ?? false,
    openKey,
  });

  const handleClose = useCallback(() => {
    resetGenerationState();
    setError(null);
    setGeneratedImageId(null);
    setGeneratedImageUrl(null);
    closeModal(ModalEnum.GENERATE_ILLUSTRATION);
    onCloseRef.current?.();
  }, [resetGenerationState]);

  /**
   * Handle confirming the generated image
   */
  const handleConfirmImage = useCallback(() => {
    if (generatedImageId) {
      onConfirmRef.current(generatedImageId);
      handleClose();
    }
  }, [generatedImageId, handleClose]);

  /**
   * Handle trying again - reset and allow new generation
   */
  const handleTryAgain = useCallback(() => {
    setGeneratedImageId(null);
    setGeneratedImageUrl(null);
    setError(null);
    setIsGenerating(false);
    // User can edit prompt and generate again
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      return setError('Please enter a prompt');
    }

    if (!isSocketReady) {
      return setError('Connection not ready. Please try again.');
    }

    const socketManager = getSocketManager();
    if (!socketManager?.isConnected()) {
      return setError('Socket not connected. Please try again.');
    }

    // Cleanup any existing subscription and timeout
    resetGenerationState();

    setIsGenerating(true);
    setError(null);

    try {
      const service = await getImagesService();

      const payload: Partial<IImage> = {
        category: IngredientCategory.IMAGE,
        format,
        height: dimensions.height,
        model: defaultModelKey,
        promptTemplate: ContentTemplateKey.IMAGE_SOCIAL_ILLUSTRATION,
        text: prompt.trim(),
        width: dimensions.width,
      };

      const response = await service.post(payload);

      // Extract pending IDs using utility
      const pendingIds = resolvePendingIds(response);
      const imageId = pendingIds[0]; // Get first ID

      // Store the image ID and allow confirm immediately (like Studio)
      // User can confirm while image is still processing
      setGeneratedImageId(imageId);
      setIsGenerating(false);

      // Listen for WebSocket to update preview when ready
      listenForGeneration(pendingIds, IngredientCategory.IMAGE);
    } catch (err) {
      resetGenerationState(
        err instanceof Error ? err.message : 'Failed to generate image',
      );
    }
  }, [
    prompt,
    isSocketReady,
    getSocketManager,
    getImagesService,
    dimensions,
    format,
    listenForGeneration,
    resetGenerationState,
    defaultModelKey,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  // Get format label for display
  const formatLabel = useMemo(() => {
    const labels: Record<IngredientFormat, string> = {
      [IngredientFormat.LANDSCAPE]: 'Landscape (16:9)',
      [IngredientFormat.PORTRAIT]: 'Portrait (9:16)',
      [IngredientFormat.SQUARE]: 'Square (1:1)',
    };
    return labels[format];
  }, [format]);

  // Get default model and calculate cost
  const defaultModel = useMemo(() => {
    return models.find((m) => m.key === defaultModelKey);
  }, [models, defaultModelKey]);

  const modelCost = useMemo(() => {
    return defaultModel?.cost || 0;
  }, [defaultModel]);

  return (
    <Modal
      id={ModalEnum.GENERATE_ILLUSTRATION}
      title="Generate Illustration"
      error={error}
      modalBoxClassName="max-w-lg"
    >
      <div className="space-y-4">
        <FormControl
          label="Describe your illustration"
          description={formatLabel}
          className="mb-0"
        >
          <FormTextarea
            name="illustration-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="A professional illustration showing..."
            isDisabled={isGenerating}
            className="resize-none"
            textareaRef={textareaRef}
          />
        </FormControl>

        {isGenerating && (
          <div className="flex items-center gap-2 bg-background p-3 text-sm">
            <Spinner size={ComponentSize.SM} />
            <span>Generating your illustration...</span>
          </div>
        )}

        {generatedImageId && !isGenerating && (
          <div className="space-y-3">
            <div className=" border border-white/[0.08] bg-card p-4">
              <label className="mb-2 block text-sm font-medium">
                {generatedImageUrl
                  ? 'Generated Image Preview'
                  : 'Processing...'}
              </label>

              <div className="relative w-full overflow-hidden">
                {generatedImageUrl ? (
                  <Image
                    src={generatedImageUrl}
                    alt="Generated illustration"
                    className="h-auto w-full object-contain"
                    width={dimensions.width}
                    height={dimensions.height}
                  />
                ) : (
                  <div
                    className="flex items-center justify-center bg-background animate-pulse"
                    style={{
                      aspectRatio: `${dimensions.width}/${dimensions.height}`,
                    }}
                  >
                    <Spinner size={ComponentSize.LG} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <ModalActions>
        <Link
          href={`${EnvironmentService.apps.app}/studio/image`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground h-9 px-3"
        >
          <HiArrowTopRightOnSquare className="w-4 h-4" />
          Studio
        </Link>

        <div className="flex-1" />

        {generatedImageId && !isGenerating ? (
          <>
            <Button
              label="Try Again"
              variant={ButtonVariant.SECONDARY}
              onClick={handleTryAgain}
              isDisabled={!generatedImageUrl}
              isLoading={isGenerating}
            />

            <Button
              label={
                generatedImageUrl ? 'Use This Image' : 'Use Image (Processing)'
              }
              variant={ButtonVariant.DEFAULT}
              onClick={handleConfirmImage}
              isDisabled={!generatedImageUrl}
              isLoading={isGenerating}
            />
          </>
        ) : (
          <>
            <Button
              label="Cancel"
              variant={ButtonVariant.SECONDARY}
              onClick={handleClose}
              isDisabled={isGenerating}
            />

            <Button
              variant={ButtonVariant.GENERATE}
              icon={<HiArrowUp />}
              onClick={handleGenerate}
              isLoading={isGenerating}
              isDisabled={!prompt.trim() || isGenerating}
              label="Generate"
            />
          </>
        )}
      </ModalActions>
    </Modal>
  );
}
