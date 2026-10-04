import { CreateTagDto } from '@api/collections/tags/dto/create-tag.dto';
import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateTagDto extends PartialType(
  OmitType(CreateTagDto, ['scope'] as const),
) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the tag is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the tag is active',
    required: false,
  })
  readonly isActive?: boolean;
}
