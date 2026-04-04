import { Caption } from '@api/collections/captions/schemas/caption.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { CaptionFormat, CaptionLanguage } from '@genfeedai/enums';
import { Types } from 'mongoose';

export class CaptionEntity extends BaseEntity implements Caption {
  declare readonly user: Types.ObjectId;
  declare readonly ingredient: Types.ObjectId;

  declare readonly content: string;
  declare readonly format: CaptionFormat;
  declare readonly language: CaptionLanguage;
}
