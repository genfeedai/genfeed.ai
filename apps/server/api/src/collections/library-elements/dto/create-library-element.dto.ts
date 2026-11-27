import { CharacterAvailabilityDto } from '@api/collections/personas/dto/character-availability.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  LibraryElementType,
  PERSONA_HANDLE_PATTERN,
} from '@genfeedai/contracts';
import {
  MAX_CHARACTER_REFERENCES,
  MAX_LIBRARY_ELEMENT_DESCRIPTION_LENGTH,
} from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateLibraryElementDto {
  @IsEnum(LibraryElementType)
  @ApiProperty({
    description: 'Location, style or prop',
    enum: LibraryElementType,
    enumName: 'LibraryElementType',
  })
  readonly type!: LibraryElementType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @ApiProperty({ description: 'Display name', maxLength: 120 })
  readonly label!: string;

  @IsString()
  @Matches(PERSONA_HANDLE_PATTERN, {
    message:
      'Handle must be 2–32 characters of lowercase letters, numbers, hyphens, or underscores',
  })
  @ApiProperty({
    description:
      'Brand-unique @-mention handle, shared with characters (lowercase [a-z0-9-_], 2–32 chars)',
  })
  readonly handle!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_LIBRARY_ELEMENT_DESCRIPTION_LENGTH)
  @ApiProperty({
    description: 'Text added to the generation prompt when the element is used',
    maxLength: MAX_LIBRARY_ELEMENT_DESCRIPTION_LENGTH,
    required: false,
  })
  readonly description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CHARACTER_REFERENCES)
  @ArrayUnique()
  @IsEntityId({ each: true })
  @ApiProperty({
    description:
      'Library images of the owning brand, in order. The first is the cover.',
    maxItems: MAX_CHARACTER_REFERENCES,
    required: false,
    type: [String],
  })
  readonly referenceIngredientIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CharacterAvailabilityDto)
  @ApiProperty({
    description: 'Which brands can use the element (owning brand by default)',
    required: false,
    type: CharacterAvailabilityDto,
  })
  readonly availability?: CharacterAvailabilityDto;
}
