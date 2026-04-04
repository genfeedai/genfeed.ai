import { CreateElementMoodDto } from '@api/collections/elements/moods/dto/create-mood.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateElementMoodDto extends PartialType(CreateElementMoodDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the style is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
