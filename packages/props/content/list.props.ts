import type { IAudio, IMusic, IVoice } from '@genfeedai/interfaces';
import type { Dispatch, MouseEvent, ReactNode, SetStateAction } from 'react';

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

export interface ListProps {
  label: string;
  ingredients: IMusic[] | IVoice[] | IAudio[];
  className?: string;
  selectedId: string;
  setIngredients: Dispatch<SetStateAction<IMusic[] | IVoice[] | IAudio[]>>;
  onConfirm?: (id: string) => void;
}
