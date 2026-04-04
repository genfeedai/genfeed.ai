import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

const AVATAR_PROVIDERS = ['heygen', 'did', 'tavus', 'musetalk'] as const;

export class GenerateClipHighlightDto {
  @IsString()
  @ApiProperty({
    description: 'Highlight ID',
    required: true,
  })
  readonly id!: string;

  @IsString()
  @ApiProperty({
    description: 'Highlight title to use for generation',
    required: true,
  })
  readonly title!: string;

  @IsString()
  @ApiProperty({
    description: 'Highlight script/summary to use for generation',
    required: true,
  })
  readonly summary!: string;
}

export class GenerateClipsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @ApiProperty({
    description: 'IDs of selected highlights to generate clips from',
    example: ['uuid-1', 'uuid-2'],
    required: true,
    type: [String],
  })
  readonly selectedHighlightIds!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GenerateClipHighlightDto)
  @ApiProperty({
    description: 'Edited highlight payloads to persist before generation',
    required: true,
    type: [GenerateClipHighlightDto],
  })
  readonly editedHighlights!: GenerateClipHighlightDto[];

  @IsString()
  @ApiProperty({
    description: 'Avatar ID for clip generation',
    required: true,
  })
  readonly avatarId!: string;

  @IsString()
  @ApiProperty({
    description: 'Voice ID for clip generation',
    required: true,
  })
  readonly voiceId!: string;

  @IsOptional()
  @IsIn(AVATAR_PROVIDERS)
  @ApiProperty({
    default: 'heygen',
    description: 'Avatar video provider to use',
    enum: AVATAR_PROVIDERS,
    required: false,
  })
  readonly avatarProvider?: (typeof AVATAR_PROVIDERS)[number];
}
