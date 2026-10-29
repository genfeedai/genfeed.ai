import {
  CLIPPER_REFERENCE_POLICIES,
  CLIPPER_RESULT_MODES,
  type ClipperReferencePolicy,
  type ClipperResultMode,
  DEFAULT_CLIP_REFERENCE_POLICY,
  DEFAULT_CLIP_RESULT_MODE,
  HOOK_CLIPPER_APPROVAL_ACTIONS,
  type HookClipApprovalAction,
  SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES,
  type SupportedAvatarVideoProviderName,
} from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class GenerateClipperHighlightDto {
  @IsString()
  @ApiProperty({
    description: 'Highlight ID',
    required: true,
  })
  readonly id!: string;

  @IsString()
  @ApiProperty({
    description: 'Highlight title to use for generation',
    required: true,
  })
  readonly title!: string;

  @IsString()
  @ApiProperty({
    description: 'Highlight script/summary to use for generation',
    required: true,
  })
  readonly summary!: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description:
      'What the avatar says for this highlight; defaults to the highlight transcript',
    required: false,
  })
  readonly script?: string;
}

export class GenerateClipsDto {
  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    default: true,
    description:
      'Pause multi-clip avatar generation after the completed hook clip for operator approval',
    required: false,
  })
  readonly hookApprovalRequired?: boolean;

  @IsOptional()
  @IsIn([...CLIPPER_REFERENCE_POLICIES])
  @ApiProperty({
    default: DEFAULT_CLIP_REFERENCE_POLICY,
    description:
      'How to handle a selected reference when the generation route cannot apply it',
    enum: CLIPPER_REFERENCE_POLICIES,
    enumName: 'ClipperReferencePolicy',
    required: false,
  })
  readonly referencePolicy?: ClipperReferencePolicy;

  @IsOptional()
  @IsIn([...CLIPPER_RESULT_MODES])
  @ApiProperty({
    default: DEFAULT_CLIP_RESULT_MODE,
    description: 'Clip generation mode',
    enum: CLIPPER_RESULT_MODES,
    enumName: 'ClipperResultMode',
    required: false,
  })
  readonly mode?: ClipperResultMode;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @ApiProperty({
    description: 'IDs of selected highlights to generate clips from',
    example: ['uuid-1', 'uuid-2'],
    required: true,
    type: [String],
  })
  readonly selectedHighlightIds!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GenerateClipperHighlightDto)
  @ApiProperty({
    description: 'Edited highlight payloads to persist before generation',
    required: true,
    type: [GenerateClipperHighlightDto],
  })
  readonly editedHighlights!: GenerateClipperHighlightDto[];

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Avatar ID for avatar-mode clip generation',
    required: false,
  })
  readonly avatarId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Voice ID for avatar-mode clip generation',
    required: false,
  })
  readonly voiceId?: string;

  @IsOptional()
  @IsIn(SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES)
  @ApiProperty({
    default: 'heygen',
    description: 'Avatar video provider to use',
    enum: SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES,
    required: false,
  })
  readonly avatarProvider?: SupportedAvatarVideoProviderName;
}

export const HOOK_CLIPPER_DECISIONS = HOOK_CLIPPER_APPROVAL_ACTIONS;

export type HookClipDecision = HookClipApprovalAction;

export class SubmitHookClipDecisionDto {
  @IsIn(HOOK_CLIPPER_DECISIONS)
  @ApiProperty({
    description: 'Operator decision for the completed hook clip',
    enum: HOOK_CLIPPER_DECISIONS,
    required: true,
  })
  readonly action!: HookClipDecision;

  @ValidateIf((dto: SubmitHookClipDecisionDto) => dto.action !== 'approve')
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Required guidance for rejection or hook regeneration',
    required: false,
  })
  readonly feedback?: string;
}
