import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** User-editable metadata; media locations and prompt relations are server-owned. */
export class UpdateIngredientMetadataDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  readonly label?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  readonly description?: string;
}
