import {
  INSTAGRAM_AUDIO_TYPES,
  type InstagramAudioType,
} from '@genfeedai/contracts/api-types/contracts/instagram-publishing.contract';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class InstagramAudioQueryDto {
  @IsIn([...INSTAGRAM_AUDIO_TYPES])
  @ApiProperty({
    description: 'Which Instagram audio catalogue to read',
    enum: INSTAGRAM_AUDIO_TYPES,
  })
  audioType!: InstagramAudioType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ApiProperty({
    description: 'Search text; omit to list trending audio',
    required: false,
  })
  searchQuery?: string;
}
