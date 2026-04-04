import { Ingredient } from '@api/collections/ingredients/schemas/ingredient.schema';
import { Metadata } from '@api/collections/metadata/schemas/metadata.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { MetadataExtension, MetadataStyle, ModelKey } from '@genfeedai/enums';
import { Types } from 'mongoose';

export class MetadataEntity extends BaseEntity implements Metadata {
  declare readonly prompt?: Types.ObjectId;

  declare readonly label: string;
  declare readonly description: string;
  declare readonly externalId: string;
  declare readonly externalProvider?: string;

  declare readonly result: string;
  declare readonly error?: string;
  declare readonly assistant: string;
  declare readonly model: ModelKey;
  declare readonly style: MetadataStyle;
  declare readonly extension: MetadataExtension;
  declare readonly width: number;
  declare readonly height: number;
  declare readonly duration: number;
  declare readonly size: number;
  declare readonly seed?: number;
  declare readonly hasAudio: boolean;
  declare readonly fps?: number;
  declare readonly resolution?: string;
  declare readonly tags: Types.ObjectId[];

  // Template tracking fields
  declare readonly promptTemplate?: string;
  declare readonly templateVersion?: number;

  // Populated
  declare readonly ingredient?: Ingredient;
}
