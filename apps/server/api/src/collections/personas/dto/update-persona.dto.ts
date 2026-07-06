import { CreatePersonaDto } from '@api/collections/personas/dto/create-persona.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional } from 'class-validator';

export class UpdatePersonaDto extends PartialType(CreatePersonaDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the persona is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;

  @IsOptional()
  @IsArray()
  @IsEntityId({ each: true })
  @ApiProperty({
    description: 'Assigned team member user IDs to set on the persona',
    required: false,
    type: [String],
  })
  readonly memberIds?: string[];
}
