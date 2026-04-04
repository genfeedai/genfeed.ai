import { CreateElementSoundDto } from '@api/collections/elements/sounds/dto/create-sound.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateElementSoundDto extends PartialType(CreateElementSoundDto) {
  @ApiProperty({
    description: 'Whether the sound is marked as deleted',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isDeleted?: boolean;
}
