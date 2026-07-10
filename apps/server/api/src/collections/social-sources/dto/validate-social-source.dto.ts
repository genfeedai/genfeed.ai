import { SocialSourcePlatform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ValidateSocialSourceDto {
  @IsEnum(SocialSourcePlatform)
  @ApiProperty({ enum: SocialSourcePlatform, enumName: 'SocialSourcePlatform' })
  platform!: SocialSourcePlatform;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  @ApiProperty({
    description: 'Platform handle or profile URL',
    maxLength: 512,
  })
  handle!: string;
}
