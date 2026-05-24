import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateLipSyncDto {
  @IsEntityId()
  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    description: 'Image ingredient ID to animate (parent)',
    example: '507f1f77bcf86cd799439011',
  })
  readonly parent!: string;

  @IsEntityId()
  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    description: 'Audio ingredient ID for lip-sync (voice)',
    example: '507f1f77bcf86cd799439012',
  })
  readonly voice!: string;
}
