import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class ToggleBrandSkillDto {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Updated list of enabled skill slugs for this brand',
    type: [String],
  })
  enabledSkills!: string[];
}
