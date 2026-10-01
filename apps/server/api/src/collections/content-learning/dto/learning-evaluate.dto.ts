import {
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export class LearningOnlineEvaluateDto {
  @IsIn(['online']) kind!: 'online';
  @IsString() @MinLength(1) @MaxLength(256) experimentId!: string;
  @IsInt() @Min(0) expectedRevision!: number;
  @IsUUID() requestId!: string;
}
export class LearningOfflineEvaluateDto {
  @IsIn(['offline']) kind!: 'offline';
  @IsString() @MinLength(1) @MaxLength(256) datasetId!: string;
  @IsString() @MinLength(1) @MaxLength(256) candidateArtifactId!: string;
  @IsString() @MinLength(1) @MaxLength(256) baselineArtifactId!: string;
  @IsUUID() requestId!: string;
}
