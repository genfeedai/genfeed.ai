import { CreateElementCameraDto } from '@api/collections/elements/cameras/dto/create-camera.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateElementCameraDto extends PartialType(
  CreateElementCameraDto,
) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the camera is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
