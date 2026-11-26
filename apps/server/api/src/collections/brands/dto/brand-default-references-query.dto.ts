import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** The model a generation is about to run on. */
export class BrandDefaultReferencesQueryDto {
  static readonly [FORBID_NON_WHITELISTED] = true;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @ApiProperty({ description: 'Model key the generation runs on.' })
  model!: string;
}
