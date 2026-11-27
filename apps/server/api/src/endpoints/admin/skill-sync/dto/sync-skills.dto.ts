import type { RepoSyncDecision } from '@genfeedai/contracts/interfaces/admin/repo-sync.interface';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  ValidateBy,
} from 'class-validator';

const REF_PATTERN = /^[A-Za-z0-9._/-]{1,200}$/;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;

function isDecisionMap(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.entries(value).every(
    ([slug, decision]) =>
      SLUG_PATTERN.test(slug) && (decision === 'mine' || decision === 'repo'),
  );
}

/** Dry run is the default; pass `dryRun: false` to write the platform skills. */
export class SyncSkillsDto {
  @ApiProperty({ default: true, required: false })
  @IsBoolean()
  @IsOptional()
  dryRun?: boolean;

  @ApiProperty({
    description:
      'Branch, tag or commit of genfeedai/skills for a dry run (default: the default branch). A live run needs the full commit SHA the dry run reported.',
    required: false,
  })
  @IsString()
  @Matches(REF_PATTERN)
  @IsOptional()
  ref?: string;

  @ApiProperty({
    description:
      'For skills edited here and changed in the repo: keep the stored version (mine) or take the repo version (repo), by slug. Skills without a decision stay as they are.',
    required: false,
  })
  @ValidateBy({
    name: 'isRepoSyncDecisions',
    validator: {
      defaultMessage: () =>
        'decisions must map a skill slug to "mine" or "repo"',
      validate: isDecisionMap,
    },
  })
  @IsOptional()
  decisions?: Record<string, RepoSyncDecision>;
}
