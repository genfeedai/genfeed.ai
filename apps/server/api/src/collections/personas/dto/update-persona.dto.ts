import { CreatePersonaDto } from '@api/collections/personas/dto/create-persona.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePersonaDto extends PartialType(CreatePersonaDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the persona is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
