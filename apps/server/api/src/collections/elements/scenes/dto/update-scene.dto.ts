import { CreateElementSceneDto } from '@api/collections/elements/scenes/dto/create-scene.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateElementSceneDto extends PartialType(CreateElementSceneDto) {
  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    default: false,
    description: 'Whether this scene is marked as favorite',
    required: false,
  })
  isFavorite?: boolean;
}
