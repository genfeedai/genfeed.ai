import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class StartFacebookLiveVideoDto {
  @ApiProperty({ maxLength: 255, required: true })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  readonly title!: string;

  @ApiProperty({ maxLength: 5000, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  readonly description?: string;
}
