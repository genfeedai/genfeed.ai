import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty, IsString } from 'class-validator';

export class CreateLipSyncDto {
  @IsMongoId()
  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    description: 'Image ingredient ID to animate (parent)',
    example: '507f1f77bcf86cd799439011',
  })
  readonly parent!: string;

  @IsMongoId()
  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    description: 'Audio ingredient ID for lip-sync (voice)',
    example: '507f1f77bcf86cd799439012',
  })
  readonly voice!: string;
}
