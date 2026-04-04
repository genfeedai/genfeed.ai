'use client';

import type { IDarkroomCharacter } from '@genfeedai/interfaces';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { AdminDarkroomService } from '@services/admin/darkroom.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Slider } from '@ui/primitives/slider';
import { Textarea } from '@ui/primitives/textarea';
import { useCallback, useRef, useState } from 'react';
import { HiOutlineSpeakerWave } from 'react-icons/hi2';

interface VoiceOption {
  voiceId: string;
  name: string;
  preview?: string;
}

interface GeneratedAudio {
  id: string;
  audioUrl: string;
  text: string;
  voiceName: string;
  createdAt: string;
}

const NO_CHARACTER_VALUE = '__no-character__';

export default function VoicesPage() {
  const notificationsService = NotificationsService.getInstance();

  const getDarkroomService = useAuthedService((token: string) =>
    AdminDarkroomService.getInstance(token),
  );

  const [selectedCharacter, setSelectedCharacter] = useState<string>('');
  const [text, setText] = useState('');
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [speed, setSpeed] = useState(1.0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAudios, setGeneratedAudios] = useState<GeneratedAudio[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  const { data: voices, isLoading: isLoadingVoices } = useResource<
    VoiceOption[]
  >(
    async () => {
      const service = await getDarkroomService();
      return service.getVoices();
    },
    {
      onError: (error: unknown) => {
        logger.error('GET /admin/darkroom/voices failed', error);
      },
    },
  );

  const handleGenerate = useCallback(async () => {
    if (!text.trim() || !selectedVoiceId) {
      return;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setIsGenerating(true);

    try {
      const service = await getDarkroomService();
      const result = await service.generateVoice({
        personaSlug: selectedCharacter || undefined,
        speed,
        text,
        voiceId: selectedVoiceId,
      });

      const voiceName =
        voices?.find((v) => v.voiceId === selectedVoiceId)?.name ||
        selectedVoiceId;

      setGeneratedAudios((prev) => [
        {
          audioUrl: result.audioUrl,
          createdAt: new Date().toISOString(),
          id: crypto.randomUUID(),
          text,
          voiceName,
        },
        ...prev,
      ]);

      notificationsService.success('Audio generated successfully');
    } catch (error) {
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }
      logger.error('POST /admin/darkroom/voices/generate failed', error);
      notificationsService.error('Failed to generate audio');
    } finally {
      setIsGenerating(false);
    }
  }, [
    text,
    selectedVoiceId,
    selectedCharacter,
    speed,
    voices,
    getDarkroomService,
    notificationsService,
  ]);

  return (
    <Container
      label="Text-to-Speech"
      description="Generate voice audio using ElevenLabs TTS"
      icon={HiOutlineSpeakerWave}
    >
      <WorkspaceSurface
        title="Generate Voice Audio"
        tone="muted"
        data-testid="darkroom-voices-generate-surface"
      >
        <div className="p-6">
          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/70">
                Character (Optional)
              </label>
              <Select
                onValueChange={(value) =>
                  setSelectedCharacter(
                    value === NO_CHARACTER_VALUE ? '' : value,
                  )
                }
                value={selectedCharacter || NO_CHARACTER_VALUE}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CHARACTER_VALUE}>
                    No character
                  </SelectItem>
                  {(characters || []).map((character) => (
                    <SelectItem key={character.id} value={character.slug}>
                      {character.emoji ? `${character.emoji} ` : ''}
                      {character.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/70">
                Voice
              </label>
              <Select
                disabled={isLoadingVoices}
                onValueChange={setSelectedVoiceId}
                value={selectedVoiceId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      isLoadingVoices
                        ? 'Loading voices...'
                        : 'Select a voice...'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(voices || []).map((voice) => (
                    <SelectItem key={voice.voiceId} value={voice.voiceId}>
                      {voice.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/70">
                Speed: {speed.toFixed(1)}x
              </label>
              <Slider
                className="w-full"
                max={2.0}
                min={0.5}
                onValueChange={([value]) => setSpeed(value ?? 1)}
                step={0.1}
                value={[speed]}
              />
              <div className="flex justify-between text-xs text-foreground/40">
                <span>0.5x</span>
                <span>1.0x</span>
                <span>2.0x</span>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-foreground/70">
              Text
            </label>
            <Textarea
              className="min-h-[120px] w-full"
              onChange={(event) => setText(event.target.value)}
              placeholder="Enter text to convert to speech..."
              rows={5}
              value={text}
            />
            <p className="mt-1 text-xs text-foreground/40">
              {text.length} characters
            </p>
          </div>

          <Button
            isDisabled={!text.trim() || !selectedVoiceId || isGenerating}
            onClick={handleGenerate}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
          >
            {isGenerating ? 'Generating...' : 'Generate Audio'}
          </Button>
        </div>
      </WorkspaceSurface>

      <WorkspaceSurface
        className="mt-6"
        title="Generated Audio"
        tone="muted"
        data-testid="darkroom-voices-results-surface"
      >
        {generatedAudios.length === 0 ? (
          <CardEmpty label="No audio generated yet" />
        ) : (
          <div className="space-y-3">
            {generatedAudios.map((audio) => (
              <Card key={audio.id}>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="mb-2 line-clamp-2 text-sm text-foreground/70">
                        {audio.text}
                      </p>
                      <p className="text-xs text-foreground/40">
                        Voice: {audio.voiceName} -{' '}
                        {new Date(audio.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <a
                      className="whitespace-nowrap text-sm text-primary hover:underline"
                      download
                      href={audio.audioUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Download
                    </a>
                  </div>
                  <audio className="mt-3 w-full" controls src={audio.audioUrl}>
                    <track kind="captions" />
                  </audio>
                </div>
              </Card>
            ))}
          </div>
        )}
      </WorkspaceSurface>
    </Container>
  );
}
