import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateUserDto {
  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'The Clerk authentication ID for the user',
    required: false,
  })
  readonly clerkId?: string;

  @IsString()
  @ApiProperty({
    description: 'The unique handle/username for the user',
    required: false,
  })
  readonly handle!: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'The first name of the user', required: false })
  readonly firstName?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'The last name of the user', required: false })
  readonly lastName?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'The email address of the user',
    required: false,
  })
  readonly email?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'The avatar/profile picture URL of the user',
    required: false,
  })
  readonly avatar?: string;
}
