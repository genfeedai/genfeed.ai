import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsNotEmpty, IsString } from 'class-validator';

export const BULK_DELETE_INGREDIENTS_MAX_IDS = 100;

export class BulkDeleteIngredientsDto {
  @ApiProperty({
    description: `Array of ingredient IDs to delete (max ${BULK_DELETE_INGREDIENTS_MAX_IDS})`,
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    maxItems: BULK_DELETE_INGREDIENTS_MAX_IDS,
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(BULK_DELETE_INGREDIENTS_MAX_IDS)
  @IsNotEmpty()
  @IsString({ each: true })
  ids!: string[];
}
