import { CreateBrandDto } from '@api/collections/brands/dto/create-brand.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateBrandDto extends PartialType(CreateBrandDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the brand is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
