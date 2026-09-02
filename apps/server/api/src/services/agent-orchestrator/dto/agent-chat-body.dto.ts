import type {
  AgentChatAttachment,
  AgentPageContext,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { RouterPriority } from '@genfeedai/contracts';
import type { AgentArtifactReference } from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class AgentGenerationSettingsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @ApiProperty({ example: '1:1', maxLength: 32 })
  aspectRatio!: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(60)
  @ApiProperty({ maximum: 60, minimum: 1, required: false })
  duration?: number;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(256)
  @ApiProperty({ maxLength: 256, required: false })
  model?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(8)
  @ApiProperty({ maximum: 8, minimum: 1, required: false })
  outputs?: number;

  @IsEnum(RouterPriority)
  @IsOptional()
  @ApiProperty({ enum: RouterPriority, required: false })
  prioritize?: RouterPriority;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(32)
  @ApiProperty({ maxLength: 32, required: false })
  resolution?: string;
}

/**
 * Body for the agent-turn endpoints.
 *
 * This is a class (not an interface) on purpose: the server compiles with
 * `emitDecoratorMetadata`, and a `@Body()` DTO must emit a runtime metatype for
 * the global `ValidationPipe` to validate against. An interface emits none, so
 * the pipe would silently skip the body entirely (see
 * `.agents/memory/rules/nestjs_value_imports_for_di.md`). It MUST be imported as
 * a value at every `@Body()` site.
 *
 * The scalar fields are fully validated. The three complex fields
 * (`artifactReferences`, `pageContext`, `attachments`) are validated only at the
 * container level (`@IsArray` / `@IsObject`, WITHOUT `@ValidateNested` + `@Type`).
 * That is deliberate: the pipe runs `validate(object, { whitelist: true })`,
 * which strips any undecorated property AND — when a field is decorated with
 * `@ValidateNested` — recurses and whitelists its inner shape. Their inner
 * content is re-authorized server-side against the caller's real scope in
 * `AgentOrchestratorController.resolveAuthorizedAgentChatBody` (analytics,
 * research, and social-inbox references), which is the single source of truth
 * for those payloads. Modeling them as nested DTOs here would strip the fields
 * that authorization depends on, so we keep the container-level check and let
 * the existing authorization utilities own the nested validation.
 */
export class AgentChatBodyDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(128)
  @ApiProperty({
    description: 'Stable client-generated identity for idempotent turn retries',
    maxLength: 128,
  })
  clientRequestId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32000)
  @ApiProperty({
    description: 'The user message content for this turn',
    maxLength: 32000,
  })
  content!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Brand scope for this turn',
    nullable: true,
    required: false,
    type: String,
  })
  brandId?: string | null;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Existing thread to append the turn to',
    required: false,
  })
  threadId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Model override for this turn', required: false })
  model?: string;

  @IsInt()
  @IsOptional()
  @ApiProperty({
    description: 'Optimistic-concurrency guard for the thread context version',
    required: false,
  })
  expectedContextVersion?: number;

  @IsIn(['auto', 'image', 'video'])
  @IsOptional()
  @ApiProperty({
    description: 'Media routing override for this turn',
    enum: ['auto', 'image', 'video'],
    required: false,
  })
  generationMode?: 'auto' | 'image' | 'video';

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => AgentGenerationSettingsDto)
  @ApiProperty({ required: false, type: AgentGenerationSettingsDto })
  generationSettings?: AgentGenerationSettingsDto;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ description: 'Whether plan mode is enabled', required: false })
  planModeEnabled?: boolean;

  @IsIn(['agent', 'proactive', 'onboarding'])
  @IsOptional()
  @ApiProperty({
    description: 'Origin of the turn',
    enum: ['agent', 'proactive', 'onboarding'],
    required: false,
  })
  source?: 'agent' | 'proactive' | 'onboarding';

  @IsArray()
  @IsOptional()
  @ApiProperty({
    description:
      'Scoped pointers to canonical records; re-authorized server-side',
    required: false,
    type: 'array',
  })
  artifactReferences?: AgentArtifactReference[];

  @IsObject()
  @IsOptional()
  @ApiProperty({
    description: 'Page context; nested references re-authorized server-side',
    required: false,
  })
  pageContext?: AgentPageContext;

  @IsArray()
  @IsOptional()
  @ApiProperty({ description: 'Ingredient attachments', required: false })
  attachments?: AgentChatAttachment[];
}
