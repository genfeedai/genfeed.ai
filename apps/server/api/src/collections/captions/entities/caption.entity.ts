import { Caption } from '@api/collections/captions/schemas/caption.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { CaptionFormat, CaptionLanguage } from '@genfeedai/enums';

export class CaptionEntity extends BaseEntity implements Caption {
  declare readonly user: string;
  declare readonly ingredient: string;

  declare readonly content: string;
  declare readonly format: CaptionFormat;
  declare readonly language: CaptionLanguage;
}
