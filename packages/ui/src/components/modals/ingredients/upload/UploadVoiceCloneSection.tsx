'use client';

import { ButtonVariant, VoiceProvider } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import { HiMicrophone, HiStop } from 'react-icons/hi2';

type Props = {
  voiceCloneName: string;
  onVoiceCloneNameChange: (name: string) => void;
  voiceCloneProvider: VoiceProvider;
  onVoiceCloneProviderChange: (provider: VoiceProvider) => void;
  isSelfHostedVoiceAvailable: boolean;
  isRecording: boolean;
  isRecordingSupported: boolean;
  recordedFile: File | null;
  recordingError: string | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
};

export default function UploadVoiceCloneSection({
  voiceCloneName,
  onVoiceCloneNameChange,
  voiceCloneProvider,
  onVoiceCloneProviderChange,
  isSelfHostedVoiceAvailable,
  isRecording,
  isRecordingSupported,
  recordedFile,
  recordingError,
  onStartRecording,
  onStopRecording,
}: Props) {
  return (
    <div className="mb-4 space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Voice name</p>
        <Input
          onChange={(event) => onVoiceCloneNameChange(event.target.value)}
          placeholder="My Voice"
          value={voiceCloneName}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Provider</p>
        <RadioGroup
          className="flex flex-wrap gap-4"
          onValueChange={(value) =>
            onVoiceCloneProviderChange(value as VoiceProvider)
          }
          value={voiceCloneProvider}
        >
          <label
            className="flex cursor-pointer items-center gap-2 text-sm"
            htmlFor="voice-provider-elevenlabs"
          >
            <RadioGroupItem
              id="voice-provider-elevenlabs"
              value={VoiceProvider.ELEVENLABS}
            />
            <span>ElevenLabs</span>
          </label>
          {isSelfHostedVoiceAvailable && (
            <label
              className="flex cursor-pointer items-center gap-2 text-sm"
              htmlFor="voice-provider-genfeed-ai"
            >
              <RadioGroupItem
                id="voice-provider-genfeed-ai"
                value={VoiceProvider.GENFEED_AI}
              />
              <span>Genfeed AI</span>
            </label>
          )}
        </RadioGroup>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          icon={isRecording ? <HiStop /> : <HiMicrophone />}
          onClick={() => {
            if (isRecording) {
              onStopRecording();
              return;
            }

            onStartRecording();
          }}
          type="button"
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          {isRecording ? 'Stop recording' : 'Record sample'}
        </Button>
        {isRecordingSupported ? (
          <span className="text-xs text-muted-foreground">
            Record a short clean voice sample directly from your microphone.
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            Microphone recording is not supported in this browser.
          </span>
        )}
      </div>

      {recordedFile ? (
        <div className="rounded-lg shadow-border bg-white/[0.03] p-3 text-sm text-muted-foreground">
          Recorded sample ready: {recordedFile.name}
        </div>
      ) : null}
      {recordingError ? (
        <div className="text-xs text-destructive">{recordingError}</div>
      ) : null}
    </div>
  );
}
