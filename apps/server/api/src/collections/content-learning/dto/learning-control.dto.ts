import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
export class LearningMutationDto {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsString() @MaxLength(256) requestId!: string;
}
export class LearningControlDto extends LearningMutationDto {
  @IsIn(['live', 'pause', 'resume', 'reset', 'rollback', 'shadow', 'disable'])
  action!: string;
  @IsString() @MaxLength(256) reason!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(['baseline-v1', 'question-example-v1', 'proof-steps-v1'], {
    each: true,
  })
  approvedArmIds?: string[];
  @IsOptional() @IsString() @MaxLength(256) policyId?: string;
}
