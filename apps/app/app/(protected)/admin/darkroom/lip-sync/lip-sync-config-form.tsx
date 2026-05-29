'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IDarkroomCharacter } from '@genfeedai/interfaces';
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
import Image from 'next/image';

type AudioSourceType = 'upload' | 'tts';

type Props = {
  characters: IDarkroomCharacter[] | undefined;
  selectedCharacter: string;
  onSelectedCharacterChange: (value: string) => void;
  audioSource: AudioSourceType;
  onAudioSourceChange: (value: AudioSourceType) => void;
  imageUrl: string;
  onImageUrlChange: (value: string) => void;
  audioUrl: string;
  onAudioUrlChange: (value: string) => void;
  ttsText: string;
  onTtsTextChange: (value: string) => void;
  isGenerating: boolean;
  onGenerate: () => void;
};

export default function LipSyncConfigForm({
  characters,
  selectedCharacter,
  onSelectedCharacterChange,
  audioSource,
  onAudioSourceChange,
  imageUrl,
  onImageUrlChange,
  audioUrl,
  onAudioUrlChange,
  ttsText,
  onTtsTextChange,
  isGenerating,
  onGenerate,
}: Props) {
  return (
    <WorkspaceSurface
      title="Generate Lip Sync Video"
      tone="muted"
      data-testid="darkroom-lip-sync-surface"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Character Selector */}
          <div>
            <span className="block text-sm font-medium text-foreground/70 mb-1">
              Character
            </span>
            <Select
              onValueChange={onSelectedCharacterChange}
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
            <span className="block text-sm font-medium text-foreground/70 mb-1">
              Audio Source
            </span>
            <Select
              onValueChange={(value) =>
                onAudioSourceChange(value as AudioSourceType)
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
          <span className="block text-sm font-medium text-foreground/70 mb-1">
            Source Image URL
          </span>
          <Input
            className="w-full"
            onChange={(e) => onImageUrlChange(e.target.value)}
            placeholder="https://cdn.genfeed.ai/darkroom/character/image.png"
            value={imageUrl}
          />
        </div>

        {/* Audio URL (when upload mode) */}
        {audioSource === 'upload' && (
          <div className="mb-4">
            <span className="block text-sm font-medium text-foreground/70 mb-1">
              Audio URL
            </span>
            <Input
              className="w-full"
              onChange={(e) => onAudioUrlChange(e.target.value)}
              placeholder="https://cdn.genfeed.ai/audio/voice.mp3"
              value={audioUrl}
            />
          </div>
        )}

        {/* TTS Text (when TTS mode) */}
        {audioSource === 'tts' && (
          <div className="mb-4">
            <span className="block text-sm font-medium text-foreground/70 mb-1">
              Text for TTS
            </span>
            <Textarea
              className="w-full min-h-[80px]"
              onChange={(e) => onTtsTextChange(e.target.value)}
              placeholder="Enter text to convert to speech..."
              rows={3}
              value={ttsText}
            />
          </div>
        )}

        {/* Image Preview */}
        {imageUrl && (
          <div className="mb-4">
            <span className="block text-sm font-medium text-foreground/70 mb-1">
              Source Preview
            </span>
            <Image
              unoptimized
              alt="Source"
              className="size-48 rounded object-cover border border-foreground/10"
              src={imageUrl}
              width={800}
              height={600}
            />
          </div>
        )}

        <Button
          withWrapper={false}
          size={ButtonSize.SM}
          variant={ButtonVariant.DEFAULT}
          isDisabled={!selectedCharacter || !imageUrl.trim() || isGenerating}
          onClick={onGenerate}
        >
          {isGenerating ? 'Generating...' : 'Generate Lip Sync'}
        </Button>
      </div>
    </WorkspaceSurface>
  );
}
