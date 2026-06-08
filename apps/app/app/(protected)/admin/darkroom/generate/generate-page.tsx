'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import type { IDarkroomCharacter } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  AdminDarkroomService,
  type IDarkroomGenerationJob,
} from '@services/admin/darkroom.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import Container from '@ui/layout/container/Container';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HiOutlinePhoto } from 'react-icons/hi2';
import GeneratedImagesGrid from './generated-images-grid';
import GenerationForm from './generation-form';

interface GeneratedImage {
  id: string;
  jobId?: string;
  cdnUrl: string;
  prompt: string;
  model: string;
  createdAt: string;
  progress?: number;
  stage?: string;
  status?: IDarkroomGenerationJob['status'];
  error?: string;
}

type DarkroomCharacterRecord = IDarkroomCharacter & {
  loraModelPath?: string;
  loraStatus?: string;
};

const MODEL_OPTIONS = [
  { label: 'Flux Dev (Recommended)', value: 'genfeed-ai/flux2-dev' },
  { label: 'Z-Image Turbo', value: 'genfeed-ai/z-image-turbo' },
  { label: 'Z-Image Turbo LoRA', value: 'genfeed-ai/z-image-turbo-lora' },
];

const ASPECT_RATIO_OPTIONS = [
  { label: '1:1 (Square)', value: '1:1' },
  { label: '16:9 (Landscape)', value: '16:9' },
  { label: '9:16 (Portrait)', value: '9:16' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
];

export default function GeneratePage() {
  const notificationsService = NotificationsService.getInstance();

  const getDarkroomService = useAuthedService((token: string) =>
    AdminDarkroomService.getInstance(token),
  );

  const [selectedCharacter, setSelectedCharacter] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [model, setModel] = useState(MODEL_OPTIONS[0].value);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [steps, setSteps] = useState(30);
  const [isUseLora, setIsUseLora] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [activeJob, setActiveJob] = useState<IDarkroomGenerationJob | null>(
    null,
  );
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: characters, error: charactersError } = useQuery<
    DarkroomCharacterRecord[]
  >({
    queryKey: ['darkroom-characters'],
    queryFn: async () => {
      const service = await getDarkroomService();
      return service.getCharacters() as Promise<DarkroomCharacterRecord[]>;
    },
  });

  useEffect(() => {
    if (charactersError) {
      logger.error('GET /admin/darkroom/characters failed', charactersError);
    }
  }, [charactersError]);

  const selectedCharacterRecord = (characters || []).find(
    (character) => character.slug === selectedCharacter,
  );

  const handleGenerate = useCallback(async () => {
    if (!selectedCharacter || !prompt.trim()) {
      return;
    }

    if (isUseLora && !selectedCharacterRecord?.loraModelPath) {
      notificationsService.error(
        'This character does not have a trained LoRA yet',
      );
      return;
    }

    setIsGenerating(true);

    try {
      const service = await getDarkroomService();
      const result = await service.createGenerationJob({
        aspectRatio,
        lora: isUseLora ? selectedCharacterRecord?.loraModelPath : undefined,
        model,
        negativePrompt: negativePrompt || undefined,
        personaSlug: selectedCharacter,
        prompt,
        steps,
      });

      setGeneratedImages((prev) => [
        {
          cdnUrl: '',
          createdAt: new Date().toISOString(),
          id: result.jobId,
          jobId: result.jobId,
          model: result.model,
          progress: result.progress,
          prompt: result.prompt,
          stage: result.stage,
          status: result.status,
        },
        ...prev,
      ]);
      setActiveJob(result);

      notificationsService.success('Image generation started');
    } catch (error) {
      logger.error('POST /admin/darkroom/generate failed', error);
      notificationsService.error('Failed to generate image');
    } finally {
      setIsGenerating(false);
    }
  }, [
    selectedCharacter,
    prompt,
    negativePrompt,
    model,
    aspectRatio,
    steps,
    isUseLora,
    selectedCharacterRecord?.loraModelPath,
    getDarkroomService,
    notificationsService,
  ]);

  useEffect(() => {
    if (!activeJob?.jobId) {
      return;
    }

    const poll = async () => {
      try {
        const service = await getDarkroomService();
        const nextJob = await service.getGenerationJob(activeJob.jobId);

        setActiveJob(nextJob);
        setGeneratedImages((prev) =>
          prev.map((image) =>
            image.jobId === nextJob.jobId
              ? {
                  ...image,
                  cdnUrl: nextJob.cdnUrl || image.cdnUrl,
                  error: nextJob.error,
                  progress: nextJob.progress,
                  stage: nextJob.stage,
                  status: nextJob.status,
                }
              : image,
          ),
        );

        if (nextJob.status === 'completed' || nextJob.status === 'failed') {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }

          if (nextJob.status === 'completed') {
            notificationsService.success('Image generated successfully');
          } else {
            notificationsService.error(
              nextJob.error || 'Image generation failed',
            );
          }
        }
      } catch (error) {
        logger.error('GET /admin/darkroom/generate/jobs failed', error);
      }
    };

    pollingRef.current = setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [activeJob?.jobId, getDarkroomService, notificationsService]);

  return (
    <Container
      label="Image Generation"
      description="Generate images for darkroom characters using AI models"
      icon={HiOutlinePhoto}
      right={
        <ButtonRefresh
          onClick={() => setGeneratedImages([])}
          isRefreshing={false}
        />
      }
    >
      <GenerationForm
        characters={characters || []}
        selectedCharacter={selectedCharacter}
        onSelectedCharacterChange={setSelectedCharacter}
        model={model}
        onModelChange={setModel}
        modelOptions={MODEL_OPTIONS}
        aspectRatio={aspectRatio}
        onAspectRatioChange={setAspectRatio}
        aspectRatioOptions={ASPECT_RATIO_OPTIONS}
        steps={steps}
        onStepsChange={setSteps}
        prompt={prompt}
        onPromptChange={setPrompt}
        negativePrompt={negativePrompt}
        onNegativePromptChange={setNegativePrompt}
        isUseLora={isUseLora}
        onIsUseLoraChange={setIsUseLora}
        isGenerating={isGenerating}
        onGenerate={handleGenerate}
      />

      <GeneratedImagesGrid images={generatedImages} />
    </Container>
  );
}
