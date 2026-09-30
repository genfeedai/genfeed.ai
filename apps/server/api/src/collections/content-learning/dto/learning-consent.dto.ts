import { LearningMutationDto } from '@api/collections/content-learning/dto/learning-control.dto';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
export class LearningConsentDto extends LearningMutationDto {
  @IsBoolean() enabled!: boolean;
  @IsString() @MaxLength(256) noticeVersion!: string;
}
export class LearningReceivingDto extends LearningMutationDto {
  @IsIn(['automatic', 'disabled', 'pinned']) preference!: string;
  @IsOptional() @IsString() @MaxLength(256) releaseId?: string;
}
