import { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateMusicDto extends PartialType(CreateMusicDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the music is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
