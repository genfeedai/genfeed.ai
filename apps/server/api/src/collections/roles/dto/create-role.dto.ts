import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ description: 'The display name of the role', required: true })
  @IsNotEmpty()
  @IsString()
  readonly label!: string;

  @ApiProperty({
    description: 'The unique identifier key for the role',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  readonly key!: string;

  @ApiProperty({
    description: 'Optional primary color associated with the role',
    required: false,
  })
  @IsOptional()
  @IsString()
  readonly primaryColor?: string;
}
