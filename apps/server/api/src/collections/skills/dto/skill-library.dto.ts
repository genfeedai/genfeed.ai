import {
  SKILL_GRANT_ACCESS,
  SKILL_GRANT_RECIPIENT_KINDS,
  type SkillGrantAccess,
  type SkillGrantRecipientKind,
} from '@api/collections/skills/policy/skill-capabilities';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const OWNER_KINDS = ['user', 'organization', 'brand'] as const;
const AUDIENCES = ['private', 'organization'] as const;
const PUBLISH_AUDIENCES = ['organization', 'public'] as const;

/** Create accepts only private or organization. Keep the value as a string so a public attempt is still rejected. */
export function readOptionalAudience(
  value: string | undefined,
): string | undefined {
  return value;
}

export class CreateScopedSkillDto {
  @IsOptional()
  @IsIn(AUDIENCES)
  @ApiPropertyOptional({ enum: AUDIENCES })
  audience?: (typeof AUDIENCES)[number];

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ type: String })
  brandId?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ type: String })
  category?: string;

  @IsOptional()
  @IsString({ each: true })
  @ApiPropertyOptional({ type: [String] })
  channels?: string[];

  @IsString()
  @MaxLength(2000)
  @ApiProperty({ type: String })
  description!: string;

  @IsString()
  @MaxLength(16000)
  @ApiProperty({ type: String })
  instructions!: string;

  @IsOptional()
  @IsString({ each: true })
  @ApiPropertyOptional({ type: [String] })
  modalities?: string[];

  @IsString()
  @MaxLength(140)
  @ApiProperty({ type: String })
  name!: string;

  @IsOptional()
  @IsIn(OWNER_KINDS)
  @ApiPropertyOptional({ enum: OWNER_KINDS })
  ownerKind?: (typeof OWNER_KINDS)[number];

  @IsString()
  @MaxLength(160)
  @ApiProperty({ type: String })
  slug!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ type: String })
  workflowStage?: string;
}

export class GrantSkillDto {
  @IsOptional()
  @IsIn(SKILL_GRANT_ACCESS)
  @ApiPropertyOptional({ enum: SKILL_GRANT_ACCESS })
  access?: SkillGrantAccess;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ type: String })
  recipientBrandId?: string;

  @IsIn(SKILL_GRANT_RECIPIENT_KINDS)
  @ApiProperty({ enum: SKILL_GRANT_RECIPIENT_KINDS })
  recipientKind!: SkillGrantRecipientKind;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ type: String })
  recipientOrganizationId?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ type: String })
  recipientUserId?: string;
}

export class PublishSkillDto {
  @IsIn(PUBLISH_AUDIENCES)
  @ApiProperty({ enum: PUBLISH_AUDIENCES })
  audience!: (typeof PUBLISH_AUDIENCES)[number];
}

export class RollbackSkillDto {
  @IsString()
  @ApiProperty({ type: String })
  versionId!: string;
}

export class ArchiveSkillDto {}
