import {
  MAX_CONFIGURED_SKILL_SLUGS,
  MAX_SKILL_SLUG_LENGTH,
} from '@api/collections/skills/constants/skill-validation.constant';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class ToggleBrandSkillDto {
  @IsArray()
  @ArrayMaxSize(MAX_CONFIGURED_SKILL_SLUGS)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(MAX_SKILL_SLUG_LENGTH, { each: true })
  @Matches(/\S/u, {
    each: true,
    message: 'each skill slug must contain a non-whitespace character',
  })
  @ApiProperty({
    description: 'Updated list of enabled skill slugs for this brand',
    maxItems: MAX_CONFIGURED_SKILL_SLUGS,
    type: [String],
  })
  enabledSkills!: string[];
}
