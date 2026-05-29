'use client';

import { Checkbox } from '@ui/primitives/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';

interface FacecamOption {
  id: string;
  label: string;
  preview?: string;
  provider?: string;
}

interface WorkspaceTaskFacecamPanelProps {
  avatars: FacecamOption[];
  avatarId: string;
  error: string | null;
  isLoading: boolean;
  isSaveAsDefault: boolean;
  onAvatarChange: (value: string) => void;
  onSaveAsDefaultChange: (checked: boolean) => void;
  onVoiceChange: (voiceId: string, provider: string) => void;
  voiceId: string;
  voices: FacecamOption[];
}

export function WorkspaceTaskFacecamPanel({
  avatars,
  avatarId,
  error,
  isLoading,
  isSaveAsDefault,
  onAvatarChange,
  onSaveAsDefaultChange,
  onVoiceChange,
  voiceId,
  voices,
}: WorkspaceTaskFacecamPanelProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/55">
          Facecam settings
        </p>
        {isLoading ? (
          <span className="text-[11px] text-foreground/40">
            Loading avatars & voices…
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label
            htmlFor="facecam-avatar"
            className="text-[11px] text-foreground/55"
          >
            Avatar
          </label>
          <Select
            value={avatarId}
            onValueChange={onAvatarChange}
            disabled={isLoading || avatars.length === 0}
          >
            <SelectTrigger id="facecam-avatar">
              <SelectValue placeholder="Pick an avatar" />
            </SelectTrigger>
            <SelectContent>
              {avatars.map((avatar) => (
                <SelectItem key={avatar.id} value={avatar.id}>
                  {avatar.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="facecam-voice"
            className="text-[11px] text-foreground/55"
          >
            Voice
          </label>
          <Select
            value={voiceId}
            onValueChange={(value) => {
              const match = voices.find((v) => v.id === value);
              onVoiceChange(value, match?.provider ?? 'heygen');
            }}
            disabled={isLoading || voices.length === 0}
          >
            <SelectTrigger id="facecam-voice">
              <SelectValue placeholder="Pick a voice" />
            </SelectTrigger>
            <SelectContent>
              {voices.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>
                  {voice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Checkbox
        isChecked={isSaveAsDefault}
        label="Save as brand default"
        className="text-xs text-foreground/55"
        onCheckedChange={(checked) => onSaveAsDefaultChange(checked === true)}
      />

      {error ? <p className="text-[11px] text-rose-300">{error}</p> : null}
    </div>
  );
}
