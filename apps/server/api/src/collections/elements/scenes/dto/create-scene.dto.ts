import { PlatformElementDto } from '@api/shared/dto/element/platform-element.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class CreateElementSceneDto extends PlatformElementDto {
  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    default: false,
    description: 'Whether this scene is marked as favorite',
    required: false,
  })
  isFavorite?: boolean;
}
