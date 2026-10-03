import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { PersonaAvailabilityMode } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional } from 'class-validator';

export class CharacterAvailabilityDto {
  @IsEnum(PersonaAvailabilityMode)
  @ApiProperty({
    description:
      'owning brand only (default), all brands of the organization, or selected brands',
    enum: PersonaAvailabilityMode,
    enumName: 'PersonaAvailabilityMode',
  })
  readonly mode!: PersonaAvailabilityMode;

  @IsOptional()
  @IsArray()
  @IsEntityId({ each: true })
  @ApiProperty({
    description:
      'Brands that can use the character when mode is SELECTED_BRANDS; the owning brand is always included',
    required: false,
    type: [String],
  })
  readonly brandIds?: string[];
}
