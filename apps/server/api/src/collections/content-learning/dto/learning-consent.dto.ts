import { LearningMutationDto } from '@api/collections/content-learning/dto/learning-control.dto';
import {
  IsBoolean,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
export class LearningConsentDto extends LearningMutationDto {
  @IsBoolean() enabled!: boolean;
  @IsString() @MaxLength(256) noticeVersion!: string;
}
export class LearningReceivingDto extends LearningMutationDto {
  @IsIn(['automatic', 'disabled', 'pinned']) preference!: string;
  @ValidateIf(
    (value: LearningReceivingDto) =>
      value.preference === 'pinned' || value.releaseId !== undefined,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  releaseId?: string;
}
