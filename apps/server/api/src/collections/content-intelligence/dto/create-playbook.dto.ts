import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ContentIntelligencePlatform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreatePlaybookDto {
  @IsString()
  @MaxLength(100)
  @ApiProperty({
    description: 'Name of the playbook',
    example: 'LinkedIn Growth Playbook',
  })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiProperty({
    description: 'Description of the playbook purpose',
    required: false,
  })
  description?: string;

  @IsEnum([...Object.values(ContentIntelligencePlatform), 'all'])
  @ApiProperty({
    description: 'Platform this playbook is for',
    enum: [...Object.values(ContentIntelligencePlatform), 'all'],
  })
  platform!: ContentIntelligencePlatform | 'all';

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @ApiProperty({
    description: 'Niche/industry for this playbook',
    required: false,
  })
  niche?: string;

  @IsOptional()
  @IsArray()
  @IsEntityId({ each: true })
  @ApiProperty({
    description: 'Creator IDs to include in the playbook analysis',
    required: false,
    type: [String],
  })
  sourceCreators?: string[];
}

export class UpdatePlaybookDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiProperty({
    description: 'Name of the playbook',
    required: false,
  })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiProperty({
    description: 'Description of the playbook purpose',
    required: false,
  })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @ApiProperty({
    description: 'Niche/industry for this playbook',
    required: false,
  })
  niche?: string;

  @IsOptional()
  @IsArray()
  @IsEntityId({ each: true })
  @ApiProperty({
    description: 'Creator IDs to include in the playbook analysis',
    required: false,
    type: [String],
  })
  sourceCreators?: string[];
}
