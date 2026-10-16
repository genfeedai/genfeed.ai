import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  MAX_CHARACTER_REFERENCE_USAGE_LOOKUP,
  MAX_CHARACTER_REFERENCES,
} from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
} from 'class-validator';

/** Body of `POST` (append) and `PUT` (reorder) `/personas/:id/references`. */
export class CharacterReferencesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CHARACTER_REFERENCES)
  @ArrayUnique()
  @IsEntityId({ each: true })
  @ApiProperty({
    description:
      'Library images, in order. Appending skips images already referenced; reordering must list every current reference exactly once (the first becomes the primary reference).',
    maxItems: MAX_CHARACTER_REFERENCES,
    minItems: 1,
    type: [String],
  })
  readonly ingredientIds!: string[];
}

/** Body of `POST /personas/reference-usage`. */
export class CharacterReferenceUsageDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CHARACTER_REFERENCE_USAGE_LOOKUP)
  @IsEntityId({ each: true })
  @ApiProperty({
    description:
      'Library assets to check; returns the characters using each one as a reference image',
    maxItems: MAX_CHARACTER_REFERENCE_USAGE_LOOKUP,
    minItems: 1,
    type: [String],
  })
  readonly ingredientIds!: string[];
}
