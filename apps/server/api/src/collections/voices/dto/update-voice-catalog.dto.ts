import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, ValidateIf } from 'class-validator';

const toOptionalBoolean = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value === 'true' || value === true) {
    return true;
  }
  if (value === 'false' || value === false) {
    return false;
  }
  if (value === '0' || value === 0) {
    return false;
  }

  return Boolean(value);
};

export class UpdateVoiceCatalogDto {
  @ApiProperty({
    description: 'Whether the catalog voice is active',
    required: false,
  })
  @IsOptional()
  @ValidateIf((o) => o.isActive !== undefined)
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    description: 'Whether the catalog voice can be selected as a default',
    required: false,
  })
  @IsOptional()
  @ValidateIf((o) => o.isDefaultSelectable !== undefined)
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isDefaultSelectable?: boolean;

  @ApiProperty({
    description: 'Whether the catalog voice should be featured in the UI',
    required: false,
  })
  @IsOptional()
  @ValidateIf((o) => o.isFeatured !== undefined)
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isFeatured?: boolean;
}
