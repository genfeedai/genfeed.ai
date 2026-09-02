import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateVideoDto extends PartialType(CreateVideoDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the video is marked as deleted',
    required: false,
  })
  readonly isDeleted!: boolean;
}
