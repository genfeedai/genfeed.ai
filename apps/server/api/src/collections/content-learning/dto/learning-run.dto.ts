import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
export class LearningRunControlDto {
  static readonly [FORBID_NON_WHITELISTED] = true;
  @IsUUID() requestId!: string;
}
export class LearningRunDto extends LearningRunControlDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  parentArtifactId?: string;
}
