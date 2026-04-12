import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

export class PrepareBrandDto {
  @IsUrl()
  @ApiProperty({ description: 'Brand website URL' })
  readonly brandUrl!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Brand name override', required: false })
  readonly brandName?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Industry vertical', required: false })
  readonly industry?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Target audience description', required: false })
  readonly targetAudience?: string;
}

export class CrmGenerateContentDto {
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  @ApiProperty({
    default: 10,
    description: 'Number of posts to generate (1-50)',
    required: false,
  })
  readonly count?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Target platforms',
    required: false,
    type: [String],
  })
  readonly platforms?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Content topics to focus on',
    required: false,
    type: [String],
  })
  readonly topics?: string[];

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Content mix preference (e.g., educational, promotional)',
    required: false,
  })
  readonly contentMix?: string;
}

export class SendInvitationDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Custom message to include in the invitation email',
    required: false,
  })
  readonly customMessage?: string;
}
