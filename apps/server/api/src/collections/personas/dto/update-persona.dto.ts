import { CreatePersonaDto } from '@api/collections/personas/dto/create-persona.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

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
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @ApiProperty({
    description: 'Assigned team member user IDs to set on the persona',
    required: false,
    type: [String],
  })
  readonly memberIds?: string[];
}
