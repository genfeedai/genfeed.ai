import {
  MODELS3D_DEFAULT_QUALITY,
  MODELS3D_QUALITIES,
  type Models3dQuality,
} from '@api/endpoints/v1/models3d/models3d.constants';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateModel3dDto {
  @ApiPropertyOptional({
    description:
      'HTTPS URL of the source photo. Send this or upload a `file`, not both.',
  })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  imageUrl?: string;

  @ApiPropertyOptional({
    description:
      'Optional description of the subject, added to the sheet prompt.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  prompt?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Also build the GLB once the angle sheet is ready. Holds the sheet and build credits together.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @IsBoolean()
  build?: boolean;

  @ApiPropertyOptional({
    default: MODELS3D_DEFAULT_QUALITY,
    description:
      'Build tier for the GLB: standard (TRELLIS) or high (Rodin Gen-2, higher price). The angle sheet is the same for both.',
    enum: MODELS3D_QUALITIES,
  })
  @IsOptional()
  @IsIn(MODELS3D_QUALITIES)
  quality?: Models3dQuality;
}
