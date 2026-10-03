import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';

export class MoveCharacterOwnershipDto {
  @IsEntityId()
  @ApiProperty({
    description:
      'Brand that becomes the owning brand; it must be one of the brands the character is available to',
  })
  readonly brandId!: string;
}
