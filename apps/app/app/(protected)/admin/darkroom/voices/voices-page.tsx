'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IDarkroomCharacter } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminDarkroomService } from '@services/admin/darkroom.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Slider } from '@ui/primitives/slider';
import { Textarea } from '@ui/primitives/textarea';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { HiOutlineSpeakerWave } from 'react-icons/hi2';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';

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

interface VoicesState {
  selectedCharacter: string;
  text: string;
  selectedVoiceId: string;
  speed: number;
  isGenerating: boolean;
  generatedAudios: GeneratedAudio[];
}

type VoicesAction =
  | { type: 'SET_CHARACTER'; payload: string }
  | { type: 'SET_TEXT'; payload: string }
  | { type: 'SET_VOICE_ID'; payload: string }
  | { type: 'SET_SPEED'; payload: number }
  | { type: 'SET_GENERATING'; payload: boolean }
  | { type: 'PREPEND_AUDIO'; payload: GeneratedAudio };

const initialVoicesState: VoicesState = {
  selectedCharacter: '',
  text: '',
  selectedVoiceId: '',
  speed: 1.0,
  isGenerating: false,
  generatedAudios: [],
};

function voicesReducer(state: VoicesState, action: VoicesAction): VoicesState {
  switch (action.type) {
    case 'SET_CHARACTER':
      return { ...state, selectedCharacter: action.payload };
    case 'SET_TEXT':
      return { ...state, text: action.payload };
    case 'SET_VOICE_ID':
      return { ...state, selectedVoiceId: action.payload };
    case 'SET_SPEED':
      return { ...state, speed: action.payload };
    case 'SET_GENERATING':
      return { ...state, isGenerating: action.payload };
    case 'PREPEND_AUDIO':
      return {
        ...state,
        generatedAudios: [action.payload, ...state.generatedAudios],
      };
    default:
      return state;
  }
}

const NO_CHARACTER_VALUE = '__no-character__';

export default function VoicesPage() {
  const notificationsService = NotificationsService.getInstance();

  const getDarkroomService = useAuthedService((token: string) =>
    AdminDarkroomService.getInstance(token),
  );

  const [state, dispatch] = useReducer(voicesReducer, initialVoicesState);
  const {
    selectedCharacter,
    text,
    selectedVoiceId,
    speed,
    isGenerating,
    generatedAudios,
  } = state;
  const abortControllerRef = useRef<AbortController | null>(null);

  const { data: characters, error: charactersError } = useQuery<
    IDarkroomCharacter[]
  >({
    queryKey: ['darkroom-characters'],
    queryFn: async () => {
      const service = await getDarkroomService();
      return service.getCharacters();
    },
  });

  const {
    data: voices,
    isLoading: isLoadingVoices,
    error: voicesError,
  } = useQuery<VoiceOption[]>({
    queryKey: ['darkroom-voices'],
    queryFn: async () => {
      const service = await getDarkroomService();
      return service.getVoices();
    },
  });

  useEffect(() => {
    if (charactersError) {
      logger.error('GET /admin/darkroom/characters failed', charactersError);
    }
  }, [charactersError]);

  useEffect(() => {
    if (voicesError) {
      logger.error('GET /admin/darkroom/voices failed', voicesError);
    }
  }, [voicesError]);

  const handleGenerate = useCallback(async () => {
    if (!text.trim() || !selectedVoiceId) {
      return;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    dispatch({ type: 'SET_GENERATING', payload: true });

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

      dispatch({
        type: 'PREPEND_AUDIO',
        payload: {
          audioUrl: result.audioUrl,
          createdAt: new Date().toISOString(),
          id: crypto.randomUUID(),
          text,
          voiceName,
        },
      });

      notificationsService.success('Audio generated successfully');
    } catch (error) {
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }
      logger.error('POST /admin/darkroom/voices/generate failed', error);
      notificationsService.error('Failed to generate audio');
    } finally {
      dispatch({ type: 'SET_GENERATING', payload: false });
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
              <span className="mb-1 block text-sm font-medium text-foreground/70">
                Character (Optional)
              </span>
              <Select
                onValueChange={(value) =>
                  dispatch({
                    type: 'SET_CHARACTER',
                    payload: value === NO_CHARACTER_VALUE ? '' : value,
                  })
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
              <span className="mb-1 block text-sm font-medium text-foreground/70">
                Voice
              </span>
              <Select
                disabled={isLoadingVoices}
                onValueChange={(value) =>
                  dispatch({ type: 'SET_VOICE_ID', payload: value })
                }
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
                onValueChange={([value]) =>
                  dispatch({ type: 'SET_SPEED', payload: value ?? 1 })
                }
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
            <span className="mb-1 block text-sm font-medium text-foreground/70">
              Text
            </span>
            <Textarea
              className="min-h-[120px] w-full"
              onChange={(event) =>
                dispatch({ type: 'SET_TEXT', payload: event.target.value })
              }
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
                        <ClientFormattedDate value={audio.createdAt} />
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
                  <audio
                    aria-label="Generated audio"
                    className="mt-3 w-full"
                    controls
                    src={audio.audioUrl}
                  >
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
