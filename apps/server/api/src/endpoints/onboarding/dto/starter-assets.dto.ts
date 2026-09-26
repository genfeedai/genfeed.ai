import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class StarterAssetsDto {
  @ApiProperty({ description: 'Brand that receives the starter post and ad' })
  @IsEntityId()
  brandId!: string;

  @ApiPropertyOptional({
    description: 'Public website used as creative context for the draft',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  websiteUrl?: string;
}
