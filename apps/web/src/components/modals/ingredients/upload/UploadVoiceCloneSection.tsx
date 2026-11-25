'use client';

import { ButtonVariant, CardPadding } from '@genfeedai/contracts';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Mic, Square } from 'lucide-react';

type Props = {
  voiceCloneName: string;
  onVoiceCloneNameChange: (name: string) => void;
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

      <div className="flex flex-wrap items-center gap-3">
        <Button
          icon={isRecording ? <Square /> : <Mic />}
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
        <Card padding={CardPadding.SM}>
          <div className="text-sm text-muted-foreground">
            Recorded sample ready: {recordedFile.name}
          </div>
        </Card>
      ) : null}
      {recordingError ? (
        <div className="text-xs text-destructive">{recordingError}</div>
      ) : null}
    </div>
  );
}
