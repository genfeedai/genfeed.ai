import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateAvatarUploadDto {
  @IsString()
  @ApiProperty({ description: 'Avatar upload MIME type', type: String })
  readonly contentType!: string;
}
