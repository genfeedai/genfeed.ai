import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export class LearningExperimentCreateDto {
  @IsIn(['private_pilot', 'shared_stage']) kind!:
    | 'private_pilot'
    | 'shared_stage';
  @IsString() @MinLength(1) @MaxLength(256) cellKey!: string;
  @IsString() @MinLength(1) @MaxLength(256) candidateId!: string;
  @IsString() @MinLength(1) @MaxLength(256) controlId!: string;
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/)
  startAt!: string;
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/)
  endAt!: string;
  @IsArray()
  @ArrayUnique()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsIn(['baseline-v1', 'question-example-v1', 'proof-steps-v1'], {
    each: true,
  })
  approvedArmIds!: string[];
  @IsUUID() requestId!: string;
}
export class LearningExperimentEnrollDto {
  @IsString() @MinLength(1) @MaxLength(256) experimentId!: string;
  @IsString() @MinLength(1) @MaxLength(256) credentialId!: string;
  @IsString() @MinLength(1) @MaxLength(256) noticeVersion!: string;
  @IsInt() @Min(0) expectedRevision!: number;
  @IsUUID() requestId!: string;
}
export class LearningExperimentCancelDto {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsString() @MinLength(1) @MaxLength(256) reason!: string;
  @IsUUID() requestId!: string;
}
