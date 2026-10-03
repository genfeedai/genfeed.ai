import { CharacterAvailabilityDto } from '@api/collections/personas/dto/character-availability.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  normalizePersonaHandle,
  PERSONA_HANDLE_PATTERN,
} from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';

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

  @IsOptional()
  @ValidateNested()
  @Type(() => CharacterAvailabilityDto)
  @ApiProperty({
    description:
      'Which brands can use the character. Defaults to the owning brand only.',
    required: false,
    type: CharacterAvailabilityDto,
  })
  readonly availability?: CharacterAvailabilityDto;
}
