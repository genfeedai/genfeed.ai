import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class LearningPromptSlotOutcomeDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  organizationId?: string;
  /** Comma-separated organization ids for a pooled report (internal use). */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5120)
  organizationIds?: string;
  @IsOptional() @IsString() @MaxLength(256) brandId?: string;
  @IsOptional() @IsString() @MaxLength(256) credentialId?: string;
}
