import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

const NON_WHITESPACE_CHAR_PATTERN = /\S/;

export class AdminUpdateUserProfileDto {
  @IsString()
  @MaxLength(100)
  @ApiProperty()
  readonly firstName!: string;

  @IsString()
  @MaxLength(100)
  @ApiProperty()
  readonly lastName!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(NON_WHITESPACE_CHAR_PATTERN, { message: 'handle must not be blank' })
  @MaxLength(100)
  @ApiProperty()
  readonly handle!: string;
}
