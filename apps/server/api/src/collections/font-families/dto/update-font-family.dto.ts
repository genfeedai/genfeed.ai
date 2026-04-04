import { CreateFontFamilyDto } from '@api/collections/font-families/dto/create-font-family.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateFontFamilyDto extends PartialType(CreateFontFamilyDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the style is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
