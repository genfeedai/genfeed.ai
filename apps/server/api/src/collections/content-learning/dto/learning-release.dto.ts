import { LearningMutationDto } from '@api/collections/content-learning/dto/learning-control.dto';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
} from 'class-validator';
export class LearningReleaseDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  artifactIds!: string[];
  @IsString() @MaxLength(256) reportId!: string;
  @IsString() @MaxLength(256) requestId!: string;
}
export class LearningReleaseControlDto extends LearningMutationDto {
  @IsIn(['canary', 'limited', 'stable', 'pause', 'rollback']) action!: string;
  @IsString() @MaxLength(256) reason!: string;
}
