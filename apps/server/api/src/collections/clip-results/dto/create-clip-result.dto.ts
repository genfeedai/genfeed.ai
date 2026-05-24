import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { OrganizationalCreateDto } from '@api/shared/dto/base/base.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateClipResultDto extends OrganizationalCreateDto {
  @IsEntityId()
  @ApiProperty({ description: 'The clip project ID', required: true })
  readonly project!: string;

  @IsNumber()
  @ApiProperty({ description: 'Clip index within the project', required: true })
  readonly index!: number;

  @IsString()
  @ApiProperty({ description: 'Clip title', required: true })
  readonly title!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Clip summary', required: false })
  readonly summary?: string;

  @IsNumber()
  @ApiProperty({ description: 'Start time in seconds', required: true })
  readonly startTime!: number;

  @IsNumber()
  @ApiProperty({ description: 'End time in seconds', required: true })
  readonly endTime!: number;

  @IsNumber()
  @ApiProperty({ description: 'Duration in seconds', required: true })
  readonly duration!: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Virality score (1-100)', required: false })
  readonly viralityScore?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({ description: 'Tags for the clip', required: false })
  readonly tags?: string[];

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Clip type classification',
    enum: [
      'hook',
      'story',
      'tutorial',
      'reaction',
      'quote',
      'controversial',
      'educational',
    ],
    required: false,
  })
  readonly clipType?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'External provider job ID', required: false })
  readonly providerJobId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Avatar video provider name', required: false })
  readonly providerName?: string;
}
