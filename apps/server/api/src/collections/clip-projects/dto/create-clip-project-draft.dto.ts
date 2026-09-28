import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class CreateClipProjectDraftDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'Selected brand the draft project belongs to',
    required: false,
  })
  readonly brandId?: string;
}
