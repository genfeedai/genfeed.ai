import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class BulkDeleteIngredientsDto {
  @ApiProperty({
    description: 'Array of ingredient IDs to delete',
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    type: [String],
  })
  @IsArray()
  @IsNotEmpty()
  @IsString({ each: true })
  ids!: string[];
}
