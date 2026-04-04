import { CreateMetadataDto } from '@api/collections/metadata/dto/create-metadata.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateMetadataDto extends PartialType(CreateMetadataDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the style is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
