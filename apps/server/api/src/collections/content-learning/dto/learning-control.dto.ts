import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
export class LearningMutationDto {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsUUID() requestId!: string;
}
export class LearningControlDto extends LearningMutationDto {
  @IsIn(['live', 'pause', 'resume', 'reset', 'rollback', 'shadow', 'disable'])
  action!: string;
  @IsString() @MaxLength(256) reason!: string;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(3)
  @IsIn(['baseline-v1', 'question-example-v1', 'proof-steps-v1'], {
    each: true,
  })
  approvedArmIds?: string[];
  @ValidateIf(
    (value: LearningControlDto) =>
      value.action === 'rollback' || value.policyId !== undefined,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  policyId?: string;
}
