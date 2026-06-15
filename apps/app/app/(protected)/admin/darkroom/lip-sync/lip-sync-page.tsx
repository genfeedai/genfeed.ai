'use client';

import type { IDarkroomCharacter } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminDarkroomService } from '@services/admin/darkroom.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import Container from '@ui/layout/container/Container';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { HiOutlineVideoCamera } from 'react-icons/hi2';
import LipSyncConfigForm from './lip-sync-config-form';
import LipSyncProcessingStatus from './lip-sync-processing-status';
import LipSyncResultVideo from './lip-sync-result-video';

type AudioSourceType = 'upload' | 'tts';

type LipSyncState = {
  selectedCharacter: string;
  imageUrl: string;
  audioSource: AudioSourceType;
  audioUrl: string;
  ttsText: string;
  isGenerating: boolean;
  jobId: string | null;
  videoUrl: string | null;
};

type LipSyncAction =
  | { type: 'SET_SELECTED_CHARACTER'; payload: string }
  | { type: 'SET_IMAGE_URL'; payload: string }
  | { type: 'SET_AUDIO_SOURCE'; payload: AudioSourceType }
  | { type: 'SET_AUDIO_URL'; payload: string }
  | { type: 'SET_TTS_TEXT'; payload: string }
  | { type: 'START_GENERATING'; payload: string }
  | { type: 'JOB_COMPLETED'; payload: string }
  | { type: 'JOB_FAILED' };

const initialState: LipSyncState = {
  selectedCharacter: '',
  imageUrl: '',
  audioSource: 'upload',
  audioUrl: '',
  ttsText: '',
  isGenerating: false,
  jobId: null,
  videoUrl: null,
};

function lipSyncReducer(
  state: LipSyncState,
  action: LipSyncAction,
): LipSyncState {
  switch (action.type) {
    case 'SET_SELECTED_CHARACTER':
      return { ...state, selectedCharacter: action.payload };
    case 'SET_IMAGE_URL':
      return { ...state, imageUrl: action.payload };
    case 'SET_AUDIO_SOURCE':
      return { ...state, audioSource: action.payload };
    case 'SET_AUDIO_URL':
      return { ...state, audioUrl: action.payload };
    case 'SET_TTS_TEXT':
      return { ...state, ttsText: action.payload };
    case 'START_GENERATING':
      return {
        ...state,
        isGenerating: true,
        videoUrl: null,
        jobId: action.payload,
      };
    case 'JOB_COMPLETED':
      return {
        ...state,
        isGenerating: false,
        jobId: null,
        videoUrl: action.payload,
      };
    case 'JOB_FAILED':
      return { ...state, isGenerating: false, jobId: null };
    default:
      return state;
  }
}

export default function LipSyncPage() {
  const notificationsService = NotificationsService.getInstance();

  const getDarkroomService = useAuthedService((token: string) =>
    AdminDarkroomService.getInstance(token),
  );

  const [state, dispatch] = useReducer(lipSyncReducer, initialState);
  const {
    selectedCharacter,
    imageUrl,
    audioSource,
    audioUrl,
    ttsText,
    isGenerating,
    jobId,
    videoUrl,
  } = state;
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: characters, error: charactersError } = useQuery<
    IDarkroomCharacter[]
  >({
    queryKey: ['darkroom-characters'],
    queryFn: async () => {
      const service = await getDarkroomService();
      return service.getCharacters();
    },
  });

  useEffect(() => {
    if (charactersError) {
      logger.error('GET /admin/darkroom/characters failed', charactersError);
    }
  }, [charactersError]);

  const handleGenerate = useCallback(async () => {
    if (!selectedCharacter || !imageUrl.trim()) {
      return;
    }

    if (audioSource === 'upload' && !audioUrl.trim()) {
      notificationsService.error('Please provide an audio URL');
      return;
    }

    if (audioSource === 'tts' && !ttsText.trim()) {
      notificationsService.error('Please enter text for TTS');
      return;
    }

    try {
      const service = await getDarkroomService();
      const result = await service.generateLipSync({
        audioUrl: audioSource === 'upload' ? audioUrl : undefined,
        imageUrl,
        personaSlug: selectedCharacter,
        text: audioSource === 'tts' ? ttsText : undefined,
      });

      dispatch({ type: 'START_GENERATING', payload: result.jobId });
      notificationsService.success('Lip sync job started');
    } catch (error) {
      logger.error('POST /admin/darkroom/lip-sync failed', error);
      notificationsService.error('Failed to start lip sync');
    }
  }, [
    selectedCharacter,
    imageUrl,
    audioSource,
    audioUrl,
    ttsText,
    getDarkroomService,
    notificationsService,
  ]);

  // Poll for job completion
  useEffect(() => {
    if (!jobId) {
      return;
    }

    const controller = new AbortController();

    const poll = async () => {
      if (controller.signal.aborted) {
        return;
      }

      try {
        const service = await getDarkroomService();
        const status = await service.getLipSyncStatus(jobId);

        if (status.status === 'completed' && status.videoUrl) {
          dispatch({ type: 'JOB_COMPLETED', payload: status.videoUrl });
          notificationsService.success('Lip sync video ready');

          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        } else if (status.status === 'failed') {
          dispatch({ type: 'JOB_FAILED' });
          notificationsService.error('Lip sync generation failed');

          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Failed to poll lip sync status', error);
      }
    };

    pollingRef.current = setInterval(poll, 5000);

    return () => {
      controller.abort();
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [jobId, getDarkroomService, notificationsService]);

  return (
    <Container
      label="Lip Sync"
      description="Generate lip-synced videos from character images and audio"
      icon={HiOutlineVideoCamera}
    >
      {/* Configuration */}
      <LipSyncConfigForm
        characters={characters}
        selectedCharacter={selectedCharacter}
        onSelectedCharacterChange={(value) =>
          dispatch({ type: 'SET_SELECTED_CHARACTER', payload: value })
        }
        audioSource={audioSource}
        onAudioSourceChange={(value) =>
          dispatch({ type: 'SET_AUDIO_SOURCE', payload: value })
        }
        imageUrl={imageUrl}
        onImageUrlChange={(value) =>
          dispatch({ type: 'SET_IMAGE_URL', payload: value })
        }
        audioUrl={audioUrl}
        onAudioUrlChange={(value) =>
          dispatch({ type: 'SET_AUDIO_URL', payload: value })
        }
        ttsText={ttsText}
        onTtsTextChange={(value) =>
          dispatch({ type: 'SET_TTS_TEXT', payload: value })
        }
        isGenerating={isGenerating}
        onGenerate={handleGenerate}
      />

      {/* Processing Status */}
      {isGenerating && jobId && <LipSyncProcessingStatus jobId={jobId} />}

      {/* Result Video */}
      {videoUrl && <LipSyncResultVideo videoUrl={videoUrl} />}
    </Container>
  );
}
