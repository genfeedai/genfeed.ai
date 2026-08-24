import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  normalizePersonaHandle,
  PERSONA_HANDLE_PATTERN,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MinLength } from 'class-validator';

export class CreatePersonaFromSheetDto {
  @IsEntityId()
  @ApiProperty({
    description: 'Approved character-sheet ingredient id',
  })
  readonly assetId!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? normalizePersonaHandle(value) : value,
  )
  @IsString()
  @Matches(PERSONA_HANDLE_PATTERN, {
    message:
      'Handle must be 2–32 characters of lowercase letters, numbers, hyphens, or underscores',
  })
  @ApiProperty({
    description:
      'Brand-unique character handle (lowercase [a-z0-9-_], 2–32 chars)',
  })
  readonly handle!: string;

  @IsString()
  @MinLength(1)
  @ApiProperty({
    description: 'Display name for the character',
  })
  readonly label!: string;
}
