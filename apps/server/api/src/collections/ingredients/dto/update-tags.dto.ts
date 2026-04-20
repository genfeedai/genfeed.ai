import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsMongoId } from 'class-validator';

export class UpdateTagsDto {
  @ApiProperty({
    description: 'Array of tag IDs to assign to this ingredient',
    example: ['507f1f77bcf86cd799439011', '507f191e810c19729de860ea'],
    type: [String],
  })
  @IsArray()
  @IsMongoId({ each: true })
  readonly tags!: string[];
}
