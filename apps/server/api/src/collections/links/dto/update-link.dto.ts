import { CreateLinkDto } from '@api/collections/links/dto/create-link.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateLinkDto extends PartialType(CreateLinkDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the link is marked as deleted',
    required: false,
  })
  readonly isDeleted!: boolean;
}
