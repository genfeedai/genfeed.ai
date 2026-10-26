import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class LearningPromptSlotOutcomeDto {
  @IsString() @IsNotEmpty() @MaxLength(256) organizationId!: string;
  @IsOptional() @IsString() @MaxLength(256) brandId?: string;
  @IsOptional() @IsString() @MaxLength(256) credentialId?: string;
}
