import { CreatePresetDto } from '@api/collections/presets/dto/create-preset.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePresetDto extends PartialType(CreatePresetDto) {
  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Whether this preset is deleted',
    required: false,
  })
  isDeleted?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    default: false,
    description: 'Whether this preset is marked as favorite',
    required: false,
  })
  isFavorite?: boolean;
}
