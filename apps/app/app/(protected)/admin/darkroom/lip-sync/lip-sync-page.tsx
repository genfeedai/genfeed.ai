'use client';

import type { IDarkroomCharacter } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminDarkroomService } from '@services/admin/darkroom.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import Container from '@ui/layout/container/Container';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HiOutlineVideoCamera } from 'react-icons/hi2';
import LipSyncConfigForm from './lip-sync-config-form';
import LipSyncProcessingStatus from './lip-sync-processing-status';
import LipSyncResultVideo from './lip-sync-result-video';

type AudioSourceType = 'upload' | 'tts';

export default function LipSyncPage() {
  const notificationsService = NotificationsService.getInstance();

  const getDarkroomService = useAuthedService((token: string) =>
    AdminDarkroomService.getInstance(token),
  );

  const [selectedCharacter, setSelectedCharacter] = useState<string>('');
  const [imageUrl, setImageUrl] = useState('');
  const [audioSource, setAudioSource] = useState<AudioSourceType>('upload');
  const [audioUrl, setAudioUrl] = useState('');
  const [ttsText, setTtsText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
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

    setIsGenerating(true);
    setVideoUrl(null);

    try {
      const service = await getDarkroomService();
      const result = await service.generateLipSync({
        audioUrl: audioSource === 'upload' ? audioUrl : undefined,
        imageUrl,
        personaSlug: selectedCharacter,
        text: audioSource === 'tts' ? ttsText : undefined,
      });

      setJobId(result.jobId);
      notificationsService.success('Lip sync job started');
    } catch (error) {
      logger.error('POST /admin/darkroom/lip-sync failed', error);
      notificationsService.error('Failed to start lip sync');
      setIsGenerating(false);
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
          setVideoUrl(status.videoUrl);
          setJobId(null);
          setIsGenerating(false);
          notificationsService.success('Lip sync video ready');

          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        } else if (status.status === 'failed') {
          setJobId(null);
          setIsGenerating(false);
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
        onSelectedCharacterChange={setSelectedCharacter}
        audioSource={audioSource}
        onAudioSourceChange={setAudioSource}
        imageUrl={imageUrl}
        onImageUrlChange={setImageUrl}
        audioUrl={audioUrl}
        onAudioUrlChange={setAudioUrl}
        ttsText={ttsText}
        onTtsTextChange={setTtsText}
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
