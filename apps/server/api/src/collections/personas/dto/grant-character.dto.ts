import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { PersonaAvailabilityMode } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional } from 'class-validator';

const GRANT_MODES = [
  PersonaAvailabilityMode.ALL_BRANDS,
  PersonaAvailabilityMode.SELECTED_BRANDS,
] as const;

export class GrantCharacterDto {
  @IsEntityId()
  @ApiProperty({
    description:
      'Organization that receives the character for use only; the actor must be owner or admin of both organizations',
  })
  readonly organizationId!: string;

  @IsIn(GRANT_MODES)
  @ApiProperty({
    description:
      'all brands of the receiving organization, or selected brands of it',
    enum: GRANT_MODES,
  })
  readonly mode!: (typeof GRANT_MODES)[number];

  @IsOptional()
  @IsArray()
  @IsEntityId({ each: true })
  @ApiProperty({
    description:
      'Brands of the receiving organization that can use the character when mode is SELECTED_BRANDS',
    required: false,
    type: [String],
  })
  readonly brandIds?: string[];
}
