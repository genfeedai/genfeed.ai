import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
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
}
