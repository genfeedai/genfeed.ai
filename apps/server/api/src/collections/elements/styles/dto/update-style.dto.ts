import { CreateElementStyleDto } from '@api/collections/elements/styles/dto/create-style.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateElementStyleDto extends PartialType(CreateElementStyleDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the setting is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
