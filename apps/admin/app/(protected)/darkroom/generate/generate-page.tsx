'use client';

import type { IDarkroomCharacter } from '@genfeedai/interfaces';
import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import {
  AdminDarkroomService,
  type IDarkroomGenerationJob,
} from '@services/admin/darkroom.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HiOutlinePhoto } from 'react-icons/hi2';

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

  const { data: characters } = useResource<DarkroomCharacterRecord[]>(
    async () => {
      const service = await getDarkroomService();
      return service.getCharacters() as Promise<DarkroomCharacterRecord[]>;
    },
    {
      onError: (error: unknown) => {
        logger.error('GET /admin/darkroom/characters failed', error);
      },
    },
  );

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
      {/* Generation Configuration */}
      <WorkspaceSurface
        title="Generate Image"
        tone="muted"
        data-testid="darkroom-generate-surface"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Character Selector */}
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">
                Character
              </label>
              <Select
                onValueChange={setSelectedCharacter}
                value={selectedCharacter}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a character..." />
                </SelectTrigger>
                <SelectContent>
                  {(characters || []).map((c) => (
                    <SelectItem key={c.id} value={c.slug}>
                      {c.emoji ? `${c.emoji} ` : ''}
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Model Selector */}
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">
                Model
              </label>
              <Select onValueChange={setModel} value={model}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Aspect Ratio */}
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">
                Aspect Ratio
              </label>
              <Select onValueChange={setAspectRatio} value={aspectRatio}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASPECT_RATIO_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Steps */}
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">
                Steps
              </label>
              <Input
                className="w-full"
                min={1}
                max={100}
                onChange={(e) => setSteps(Number(e.target.value))}
                type="number"
                value={steps}
              />
            </div>
          </div>

          {/* Prompt */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-foreground/70 mb-1">
              Prompt
            </label>
            <Textarea
              className="w-full min-h-[80px]"
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to generate..."
              rows={3}
              value={prompt}
            />
          </div>

          {/* Negative Prompt */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-foreground/70 mb-1">
              Negative Prompt
            </label>
            <Input
              className="w-full"
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="What to avoid in the image..."
              value={negativePrompt}
            />
          </div>

          {/* LoRA Toggle */}
          <div className="mb-4 flex items-center gap-2">
            <Checkbox
              checked={isUseLora}
              id="use-lora"
              onCheckedChange={(checked) => setIsUseLora(checked === true)}
            />
            <label
              className="text-sm font-medium text-foreground/70"
              htmlFor="use-lora"
            >
              Apply character LoRA (if trained)
            </label>
          </div>

          <Button
            withWrapper={false}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            isDisabled={!selectedCharacter || !prompt.trim() || isGenerating}
            onClick={handleGenerate}
          >
            {isGenerating ? 'Generating...' : 'Generate Image'}
          </Button>
        </div>
      </WorkspaceSurface>

      {/* Generated Images Grid */}
      {generatedImages.length > 0 && (
        <WorkspaceSurface
          className="mt-6"
          title="Generated Images"
          tone="muted"
          data-testid="darkroom-generated-images-surface"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {generatedImages.map((img) => (
              <Card key={img.id}>
                <div className="p-4">
                  {img.cdnUrl ? (
                    <img
                      alt={img.prompt}
                      className="w-full rounded mb-3 aspect-square object-cover"
                      src={img.cdnUrl}
                    />
                  ) : (
                    <div className="w-full rounded mb-3 aspect-square bg-foreground/5 flex items-center justify-center text-foreground/30">
                      Processing...
                    </div>
                  )}
                  <p className="text-sm text-foreground/70 line-clamp-2">
                    {img.prompt}
                  </p>
                  <p className="text-xs text-foreground/40 mt-1">
                    {img.model.replace('genfeed-ai/', '')}
                  </p>
                  {img.status && img.status !== 'completed' && (
                    <div className="mt-3 space-y-1">
                      <div className="flex items-center justify-between text-xs text-foreground/50">
                        <span>{img.stage || img.status}</span>
                        <span>{img.progress ?? 0}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-300"
                          style={{ width: `${img.progress ?? 0}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {img.error && (
                    <p className="text-xs text-error mt-2">{img.error}</p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </WorkspaceSurface>
      )}
    </Container>
  );
}
