import { CaptionFormat, CaptionLanguage } from '@genfeedai/enums';
import { type Caption } from '@genfeedai/prisma';
import { BaseEntity } from '@server/entities/base.entity';

export class CaptionEntity extends BaseEntity implements Caption {
  declare readonly id: string;
  declare readonly organizationId: string;
  declare readonly userId: string;
  declare readonly ingredientId: string | null;
  declare readonly workflowExecutionId: string | null;

  declare readonly content: string;
  declare readonly format: CaptionFormat;
  declare readonly language: CaptionLanguage;
}
