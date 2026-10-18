import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/** Dry run is the default; pass `dryRun: false` to write the missing templates. */
export class SeedTemplatesDto {
  @ApiProperty({ default: true, required: false })
  @IsBoolean()
  @IsOptional()
  dryRun?: boolean;
}
