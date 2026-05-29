import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import type { ReactElement } from 'react';

type ExistingVoice = {
  id: string;
  label: string;
  provider?: string | null;
};

type CardStatus = 'idle' | 'uploading' | 'cloning' | 'done' | 'error';

type VoiceCloneExistingVoiceSelectorProps = {
  existingVoices: ExistingVoice[];
  selectedVoiceId: string;
  status: CardStatus;
  onValueChange: (value: string) => void;
  onUseExisting: () => void;
};

export function VoiceCloneExistingVoiceSelector({
  existingVoices,
  selectedVoiceId,
  status,
  onValueChange,
  onUseExisting,
}: VoiceCloneExistingVoiceSelectorProps): ReactElement {
  return (
    <div className="mb-3 space-y-2">
      <p className="text-xs font-medium text-foreground">Use existing voice</p>
      <Select
        value={selectedVoiceId}
        onValueChange={onValueChange}
        disabled={status === 'uploading' || status === 'cloning'}
      >
        <SelectTrigger className="w-full text-xs">
          <SelectValue placeholder="Select a cloned voice" />
        </SelectTrigger>
        <SelectContent>
          {existingVoices.map((voice) => (
            <SelectItem key={voice.id} value={voice.id}>
              {voice.label} ({voice.provider ?? 'unknown'})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant={ButtonVariant.OUTLINE}
        onClick={onUseExisting}
        isDisabled={!selectedVoiceId || status === 'uploading'}
        className="w-full"
      >
        Use Selected Voice
      </Button>
    </div>
  );
}
