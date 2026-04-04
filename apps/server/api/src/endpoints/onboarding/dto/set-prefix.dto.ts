import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SetPrefixDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(3)
  @Matches(/^[A-Z]{3}$/, {
    message: 'Prefix must be exactly 3 uppercase letters (A-Z)',
  })
  @ApiProperty({
    description:
      'Unique 3-letter uppercase prefix for issue identifiers (e.g., GEN)',
    example: 'GEN',
    maxLength: 3,
    minLength: 3,
    pattern: '^[A-Z]{3}$',
  })
  prefix!: string;
}
