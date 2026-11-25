import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsString, MinLength } from 'class-validator';

export class ApproveBrandKitDto {
  static readonly [FORBID_NON_WHITELISTED] = true;

  @ApiProperty({ description: 'The draft revision the owner reviewed' })
  @IsString()
  @MinLength(1)
  revisionId!: string;

  @ApiProperty({ description: 'updatedAt of the draft the owner reviewed' })
  @IsISO8601({ strict: true })
  updatedAt!: string;
}
