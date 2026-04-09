'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IDarkroomCharacter } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { AdminDarkroomService } from '@services/admin/darkroom.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
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
import { HiOutlineVideoCamera } from 'react-icons/hi2';

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

  const { data: characters } = useResource<IDarkroomCharacter[]>(
    async () => {
      const service = await getDarkroomService();
      return service.getCharacters();
    },
    {
      onError: (error: unknown) => {
        logger.error('GET /admin/darkroom/characters failed', error);
      },
    },
  );

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
      <WorkspaceSurface
        title="Generate Lip Sync Video"
        tone="muted"
        data-testid="darkroom-lip-sync-surface"
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

            {/* Audio Source Toggle */}
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">
                Audio Source
              </label>
              <Select
                onValueChange={(value) =>
                  setAudioSource(value as AudioSourceType)
                }
                value={audioSource}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upload">Audio URL</SelectItem>
                  <SelectItem value="tts">Generate TTS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Source Image URL */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-foreground/70 mb-1">
              Source Image URL
            </label>
            <Input
              className="w-full"
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://cdn.genfeed.ai/darkroom/character/image.png"
              value={imageUrl}
            />
          </div>

          {/* Audio URL (when upload mode) */}
          {audioSource === 'upload' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground/70 mb-1">
                Audio URL
              </label>
              <Input
                className="w-full"
                onChange={(e) => setAudioUrl(e.target.value)}
                placeholder="https://cdn.genfeed.ai/audio/voice.mp3"
                value={audioUrl}
              />
            </div>
          )}

          {/* TTS Text (when TTS mode) */}
          {audioSource === 'tts' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground/70 mb-1">
                Text for TTS
              </label>
              <Textarea
                className="w-full min-h-[80px]"
                onChange={(e) => setTtsText(e.target.value)}
                placeholder="Enter text to convert to speech..."
                rows={3}
                value={ttsText}
              />
            </div>
          )}

          {/* Image Preview */}
          {imageUrl && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground/70 mb-1">
                Source Preview
              </label>
              {/* biome-ignore lint/performance/noImgElement: source preview is a transient uploaded image URL */}
              <img
                alt="Source"
                className="w-48 h-48 rounded object-cover border border-foreground/10"
                src={imageUrl}
              />
            </div>
          )}

          <Button
            withWrapper={false}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            isDisabled={!selectedCharacter || !imageUrl.trim() || isGenerating}
            onClick={handleGenerate}
          >
            {isGenerating ? 'Generating...' : 'Generate Lip Sync'}
          </Button>
        </div>
      </WorkspaceSurface>

      {/* Processing Status */}
      {isGenerating && jobId && (
        <WorkspaceSurface
          title="Processing Lip Sync Video"
          tone="muted"
          className="mt-6"
          data-testid="darkroom-lip-sync-progress-surface"
        >
          <div className="flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
            <div>
              <p className="text-sm text-foreground/50">
                Job ID: {jobId} - This may take a few minutes
              </p>
            </div>
          </div>
        </WorkspaceSurface>
      )}

      {/* Result Video */}
      {videoUrl && (
        <WorkspaceSurface
          title="Result"
          tone="muted"
          className="mt-6"
          data-testid="darkroom-lip-sync-result-surface"
        >
          <video className="w-full max-w-lg rounded" controls src={videoUrl}>
            <track kind="captions" />
          </video>
          <div className="mt-3">
            <a
              className="text-sm text-primary hover:underline"
              download
              href={videoUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Download Video
            </a>
          </div>
        </WorkspaceSurface>
      )}
    </Container>
  );
}
