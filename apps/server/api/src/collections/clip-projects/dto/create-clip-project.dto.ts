import { OrganizationalCreateDto } from '@api/shared/dto/base/base.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ClipProjectSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(300)
  @ApiProperty({
    default: 15,
    description: 'Minimum clip duration in seconds',
    required: false,
  })
  readonly minDuration?: number;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(600)
  @ApiProperty({
    default: 90,
    description: 'Maximum clip duration in seconds',
    required: false,
  })
  readonly maxDuration?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  @ApiProperty({
    default: 10,
    description: 'Maximum number of clips to generate',
    required: false,
  })
  readonly maxClips?: number;

  @IsOptional()
  @IsString()
  @ApiProperty({
    default: '9:16',
    description: 'Output aspect ratio',
    required: false,
  })
  readonly aspectRatio?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    default: 'default',
    description: 'Caption style preset',
    required: false,
  })
  readonly captionStyle?: string;
}

export class CreateClipProjectDto extends OrganizationalCreateDto {
  @IsOptional()
  @IsString()
  @ApiProperty({
    default: '',
    description: 'Project name',
    required: false,
  })
  readonly name?: string;

  @IsUrl()
  @ApiProperty({
    description: 'Source video URL',
    required: true,
  })
  readonly sourceVideoUrl!: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'S3 key for the source video',
    required: false,
  })
  readonly sourceVideoS3Key?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    default: 'en',
    description: 'Language code for transcription',
    required: false,
  })
  readonly language?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ClipProjectSettingsDto)
  @ApiProperty({
    description: 'Clip generation settings',
    required: false,
    type: ClipProjectSettingsDto,
  })
  readonly settings?: ClipProjectSettingsDto;
}
