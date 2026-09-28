import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';

export class FinalizeClipUploadDto {
  @IsEntityId()
  @ApiProperty({
    description:
      'Ingredient returned when this upload was prepared; finalize refuses a source that has since been replaced',
    required: true,
  })
  readonly ingredientId!: string;
}
