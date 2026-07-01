import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class SocialInboxYoutubeIngestDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsEntityId()
  credentialId?: string;

  @ApiProperty({ default: 25, maximum: 100, minimum: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}
