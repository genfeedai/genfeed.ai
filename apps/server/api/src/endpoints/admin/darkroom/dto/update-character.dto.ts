import { CreateCharacterDto } from '@api/endpoints/admin/darkroom/dto/create-character.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateCharacterDto extends PartialType(CreateCharacterDto) {
  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'LoRA model path', required: false })
  readonly loraModelPath?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Profile image URL', required: false })
  readonly profileImageUrl?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Persona file S3 key', required: false })
  readonly personaFileS3Key?: string;
}
