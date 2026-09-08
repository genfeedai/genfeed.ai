import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
export class InspectCharacterImageDto {
  @IsEntityId()
  @ApiProperty({ description: 'Image asset to inspect in the current brand' })
  readonly assetId!: string;
}
