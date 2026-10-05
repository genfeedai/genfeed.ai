import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** User-editable metadata; media locations and prompt relations are server-owned. */
export class UpdateIngredientMetadataDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ApiProperty({ maxLength: 200, required: false })
  readonly label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @ApiProperty({ maxLength: 2000, required: false })
  readonly description?: string;
}
