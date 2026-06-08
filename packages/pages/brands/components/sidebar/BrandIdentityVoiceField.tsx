'use client';

import type { Voice } from '@models/ingredients/voice.model';
import AudioPreviewPlayer from '@ui/audio/preview-player/AudioPreviewPlayer';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';

type VoiceOption = {
  label: string;
  value: string;
};

type BrandIdentityVoiceFieldProps = {
  catalogOptions: VoiceOption[];
  selectedVoiceId: string;
  isLoadingCatalog: boolean;
  previewVoice: Voice | null;
  onVoiceChange: (value: string) => void;
};

function getVoiceName(voice: Voice): string {
  return voice.metadataLabel || voice.externalVoiceId || voice.id;
}

export default function BrandIdentityVoiceField({
  catalogOptions,
  selectedVoiceId,
  isLoadingCatalog,
  previewVoice,
  onVoiceChange,
}: BrandIdentityVoiceFieldProps) {
  return (
    <div>
      <label
        htmlFor="brand-default-voice-ref"
        className="mb-1 block text-sm font-medium"
      >
        Default Voice
      </label>
      <Select
        disabled={isLoadingCatalog}
        onValueChange={(value) => onVoiceChange(value === 'none' ? '' : value)}
        value={selectedVoiceId || 'none'}
      >
        <SelectTrigger
          id="brand-default-voice-ref"
          className="w-full"
          data-testid="brand-default-voice-trigger"
        >
          <SelectValue
            placeholder={
              isLoadingCatalog
                ? 'Loading voices...'
                : 'Select a saved voice for this brand'
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Use organization fallback</SelectItem>
          {catalogOptions.map((voice) => (
            <SelectItem key={voice.value} value={voice.value}>
              {voice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {previewVoice ? (
        <div
          className="mt-3 rounded-md border border-border/60 bg-muted/20 p-3"
          data-testid="brand-default-voice-preview"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {selectedVoiceId
                  ? 'Selected voice preview'
                  : 'Organization fallback preview'}
              </p>
              <p
                className="text-xs text-muted-foreground"
                data-testid="brand-default-voice-preview-label"
              >
                {`${getVoiceName(previewVoice)} (${previewVoice.provider ?? 'unknown'})`}
              </p>
            </div>
            <AudioPreviewPlayer
              audioUrl={previewVoice.sampleAudioUrl ?? null}
              label={getVoiceName(previewVoice)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
