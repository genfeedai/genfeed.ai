import type { IAudio, IMusic, IVoice } from '@genfeedai/contracts/interfaces';
import type { MouseEvent, ReactNode } from 'react';

type SoundIngredient = IMusic | IVoice | IAudio;

export interface ListRowSoundProps {
  actions?: ReactNode;
  badges?: ReactNode;
  className?: string;
  index?: number;
  ingredient?: SoundIngredient;
  isActive?: boolean;
  isSelected?: boolean;
  leading?: ReactNode;
  metaPrimary?: ReactNode;
  metaSecondary?: ReactNode;
  onClick?: (id: string) => void;
  onRowClick?: () => void;
  onPlay?: (e: MouseEvent, ingredient: SoundIngredient) => void;
  playbackControl?: ReactNode;
  providerLabel?: string;
  stats?: ReactNode;
  subtitle?: ReactNode;
  title?: ReactNode;
}
