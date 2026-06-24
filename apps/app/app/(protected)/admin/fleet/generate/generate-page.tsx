'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import type { IFleetCharacter } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  AdminFleetService,
  type IFleetGenerationJob,
} from '@services/admin/fleet.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import Container from '@ui/layout/container/Container';
import { useCallback, useEffect, useReducer, useRef } from 'react';
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
  status?: IFleetGenerationJob['status'];
  error?: string;
}

type FleetCharacterRecord = IFleetCharacter & {
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

interface FormState {
  selectedCharacter: string;
  prompt: string;
  negativePrompt: string;
  model: string;
  aspectRatio: string;
  steps: number;
  isUseLora: boolean;
  isGenerating: boolean;
  generatedImages: GeneratedImage[];
  activeJobId: string | null;
}

type FormAction =
  | { type: 'SET_SELECTED_CHARACTER'; payload: string }
  | { type: 'SET_PROMPT'; payload: string }
  | { type: 'SET_NEGATIVE_PROMPT'; payload: string }
  | { type: 'SET_MODEL'; payload: string }
  | { type: 'SET_ASPECT_RATIO'; payload: string }
  | { type: 'SET_STEPS'; payload: number }
  | { type: 'SET_IS_USE_LORA'; payload: boolean }
  | { type: 'SET_IS_GENERATING'; payload: boolean }
  | { type: 'ADD_GENERATED_IMAGE'; payload: GeneratedImage }
  | {
      type: 'UPDATE_GENERATED_IMAGE';
      payload: Partial<GeneratedImage> & { jobId: string };
    }
  | { type: 'CLEAR_GENERATED_IMAGES' }
  | { type: 'SET_ACTIVE_JOB_ID'; payload: string | null };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_SELECTED_CHARACTER':
      return { ...state, selectedCharacter: action.payload };
    case 'SET_PROMPT':
      return { ...state, prompt: action.payload };
    case 'SET_NEGATIVE_PROMPT':
      return { ...state, negativePrompt: action.payload };
    case 'SET_MODEL':
      return { ...state, model: action.payload };
    case 'SET_ASPECT_RATIO':
      return { ...state, aspectRatio: action.payload };
    case 'SET_STEPS':
      return { ...state, steps: action.payload };
    case 'SET_IS_USE_LORA':
      return { ...state, isUseLora: action.payload };
    case 'SET_IS_GENERATING':
      return { ...state, isGenerating: action.payload };
    case 'ADD_GENERATED_IMAGE':
      return {
        ...state,
        generatedImages: [action.payload, ...state.generatedImages],
      };
    case 'UPDATE_GENERATED_IMAGE':
      return {
        ...state,
        generatedImages: state.generatedImages.map((image) =>
          image.jobId === action.payload.jobId
            ? { ...image, ...action.payload }
            : image,
        ),
      };
    case 'CLEAR_GENERATED_IMAGES':
      return { ...state, generatedImages: [] };
    case 'SET_ACTIVE_JOB_ID':
      return { ...state, activeJobId: action.payload };
    default:
      return state;
  }
}

const INITIAL_FORM_STATE: FormState = {
  selectedCharacter: '',
  prompt: '',
  negativePrompt: '',
  model: MODEL_OPTIONS[0].value,
  aspectRatio: '1:1',
  steps: 30,
  isUseLora: false,
  isGenerating: false,
  generatedImages: [],
  activeJobId: null,
};

export default function GeneratePage() {
  const notificationsService = NotificationsService.getInstance();

  const getFleetService = useAuthedService((token: string) =>
    AdminFleetService.getInstance(token),
  );

  const [state, dispatch] = useReducer(formReducer, INITIAL_FORM_STATE);
  const {
    selectedCharacter,
    prompt,
    negativePrompt,
    model,
    aspectRatio,
    steps,
    isUseLora,
    isGenerating,
    generatedImages,
    activeJobId,
  } = state;

  // activeJob is only used for polling — never rendered — so keep it in a ref
  const activeJobRef = useRef<IFleetGenerationJob | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: characters, error: charactersError } = useQuery<
    FleetCharacterRecord[]
  >({
    queryKey: ['fleet-characters'],
    queryFn: async () => {
      const service = await getFleetService();
      return service.getCharacters() as Promise<FleetCharacterRecord[]>;
    },
  });

  useEffect(() => {
    if (charactersError) {
      logger.error('GET /admin/fleet/characters failed', charactersError);
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

    dispatch({ type: 'SET_IS_GENERATING', payload: true });

    try {
      const service = await getFleetService();
      const result = await service.createGenerationJob({
        aspectRatio,
        lora: isUseLora ? selectedCharacterRecord?.loraModelPath : undefined,
        model,
        negativePrompt: negativePrompt || undefined,
        personaSlug: selectedCharacter,
        prompt,
        steps,
      });

      dispatch({
        type: 'ADD_GENERATED_IMAGE',
        payload: {
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
      });
      activeJobRef.current = result;
      dispatch({ type: 'SET_ACTIVE_JOB_ID', payload: result.jobId });

      notificationsService.success('Image generation started');
    } catch (error) {
      logger.error('POST /admin/fleet/generate failed', error);
      notificationsService.error('Failed to generate image');
    } finally {
      dispatch({ type: 'SET_IS_GENERATING', payload: false });
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
    getFleetService,
    notificationsService,
  ]);

  useEffect(() => {
    if (!activeJobId) {
      return;
    }

    const poll = async () => {
      try {
        const service = await getFleetService();
        const nextJob = await service.getGenerationJob(activeJobId);

        const prevCdnUrl = activeJobRef.current?.cdnUrl ?? '';
        activeJobRef.current = nextJob;
        dispatch({
          type: 'UPDATE_GENERATED_IMAGE',
          payload: {
            jobId: nextJob.jobId,
            cdnUrl: nextJob.cdnUrl || prevCdnUrl,
            error: nextJob.error,
            progress: nextJob.progress,
            stage: nextJob.stage,
            status: nextJob.status,
          },
        });

        if (nextJob.status === 'completed' || nextJob.status === 'failed') {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          dispatch({ type: 'SET_ACTIVE_JOB_ID', payload: null });

          if (nextJob.status === 'completed') {
            notificationsService.success('Image generated successfully');
          } else {
            notificationsService.error(
              nextJob.error || 'Image generation failed',
            );
          }
        }
      } catch (error) {
        logger.error('GET /admin/fleet/generate/jobs failed', error);
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
  }, [activeJobId, getFleetService, notificationsService]);

  return (
    <Container
      label="Image Generation"
      description="Generate images for fleet characters using AI models"
      icon={HiOutlinePhoto}
      right={
        <ButtonRefresh
          onClick={() => dispatch({ type: 'CLEAR_GENERATED_IMAGES' })}
          isRefreshing={false}
        />
      }
    >
      <GenerationForm
        characters={characters || []}
        selectedCharacter={selectedCharacter}
        onSelectedCharacterChange={(v) =>
          dispatch({ type: 'SET_SELECTED_CHARACTER', payload: v })
        }
        model={model}
        onModelChange={(v) => dispatch({ type: 'SET_MODEL', payload: v })}
        modelOptions={MODEL_OPTIONS}
        aspectRatio={aspectRatio}
        onAspectRatioChange={(v) =>
          dispatch({ type: 'SET_ASPECT_RATIO', payload: v })
        }
        aspectRatioOptions={ASPECT_RATIO_OPTIONS}
        steps={steps}
        onStepsChange={(v) => dispatch({ type: 'SET_STEPS', payload: v })}
        prompt={prompt}
        onPromptChange={(v) => dispatch({ type: 'SET_PROMPT', payload: v })}
        negativePrompt={negativePrompt}
        onNegativePromptChange={(v) =>
          dispatch({ type: 'SET_NEGATIVE_PROMPT', payload: v })
        }
        isUseLora={isUseLora}
        onIsUseLoraChange={(v) =>
          dispatch({ type: 'SET_IS_USE_LORA', payload: v })
        }
        isGenerating={isGenerating}
        onGenerate={handleGenerate}
      />

      <GeneratedImagesGrid images={generatedImages} />
    </Container>
  );
}
