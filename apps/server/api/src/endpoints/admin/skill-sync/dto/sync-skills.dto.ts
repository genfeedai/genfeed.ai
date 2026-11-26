import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

const REF_PATTERN = /^[A-Za-z0-9._/-]{1,200}$/;

/** Dry run is the default; pass `dryRun: false` to write the platform skills. */
export class SyncSkillsDto {
  @ApiProperty({ default: true, required: false })
  @IsBoolean()
  @IsOptional()
  dryRun?: boolean;

  @ApiProperty({
    description:
      'Branch, tag or commit of genfeedai/skills. Default: the default branch.',
    required: false,
  })
  @IsString()
  @Matches(REF_PATTERN)
  @IsOptional()
  ref?: string;
}
