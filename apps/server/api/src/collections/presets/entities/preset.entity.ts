import type { ModelCategory, ModelProvider, Platform } from '@genfeedai/enums';
import type { Types } from 'mongoose';

export class Preset {
  id!: string;

  organization?: Types.ObjectId; // if null, it's a global preset
  brand?: Types.ObjectId;
  ingredient?: Types.ObjectId;

  label!: string;
  description!: string;
  prompt?: string;
  key!: string;
  category!: ModelCategory;
  model?: string;
  provider?: ModelProvider;
  platform?: Platform;

  camera?: string;
  mood?: string;
  scene?: string;
  style?: string;
  blacklists?: string[];

  isActive!: boolean;
  isDeleted!: boolean;
  isFavorite!: boolean;

  constructor(partial: Partial<Preset>) {
    Object.assign(this, partial);
  }
}
