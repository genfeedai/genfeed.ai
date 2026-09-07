export interface FacecamOption {
  id: string;
  label: string;
  preview?: string;
  provider?: string;
}

export interface WorkspaceTaskFacecamPanelProps {
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
