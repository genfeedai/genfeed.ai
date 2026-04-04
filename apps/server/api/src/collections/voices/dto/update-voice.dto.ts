import { CreateVoiceDto } from '@api/collections/voices/dto/create-voice.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateVoiceDto extends PartialType(CreateVoiceDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the voice is marked as deleted',
    required: false,
  })
  readonly isDeleted!: boolean;
}
