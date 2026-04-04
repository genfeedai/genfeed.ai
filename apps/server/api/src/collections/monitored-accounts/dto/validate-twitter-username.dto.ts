import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class ValidateTwitterUsernameDto {
  @IsString()
  @MaxLength(15)
  @ApiProperty({
    description: 'Twitter username to validate (without @)',
    example: 'elonmusk',
  })
  username!: string;
}
