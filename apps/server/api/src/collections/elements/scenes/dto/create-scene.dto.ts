import { ElementDto } from '@api/shared/dto/element/element.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class CreateElementSceneDto extends ElementDto {
  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    default: false,
    description: 'Whether this scene is marked as favorite',
    required: false,
  })
  isFavorite?: boolean;
}
