import { KnowledgeSelectionDto } from '@api/collections/contexts/dto/knowledge-selection.dto';
import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { IsRequestedSkillSlugs } from '@api/helpers/validation/requested-skill-slugs.validator';
import { RouterPriority } from '@genfeedai/contracts';
import {
  GENERATION_PROMPT_AUTHORS,
  type GenerationPromptAuthor,
} from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * Request fields every prompt-driven image and video generation shares:
 * skill selection, prompt enhancement, brand and Knowledge grounding, model
 * routing, prompt templates and completion mode.
 */
export class CreateMediaGenerationDto extends CreateIngredientDto {
  @IsRequestedSkillSlugs()
  @ApiProperty({ required: false, type: [String] })
  readonly requestedSkillSlugs?: string[];

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  @ApiProperty({
    description: 'Override prompt enhancement for this generation',
    required: false,
  })
  readonly harness?: boolean;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['raw'])
  @ApiProperty({
    description:
      'Generate with the prompt exactly as typed and apply no brand identity. The only client-chosen brand mode; approved and provisional modes are resolved on the server.',
    enum: ['raw'],
    required: false,
  })
  readonly brandMode?: 'raw';

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(GENERATION_PROMPT_AUTHORS)
  @ApiProperty({
    description:
      'Set when the prompt came from an agent proposal: `agent` unchanged, `agent_edited` changed by the member. Recorded in the generation receipt; omit for a prompt the member wrote.',
    enum: GENERATION_PROMPT_AUTHORS,
    required: false,
  })
  readonly promptAuthor?: GenerationPromptAuthor;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @ValidateNested()
  @Type(() => KnowledgeSelectionDto)
  @ApiProperty({
    description:
      'Explicit Knowledge sources or spaces to ground this generation on; omit for automatic brand Knowledge',
    required: false,
    type: KnowledgeSelectionDto,
  })
  readonly knowledge?: KnowledgeSelectionDto;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Random generation seed', required: false })
  readonly seed?: number;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description:
      'Automatically select the best model based on the prompt. If true, the model parameter will be ignored.',
    required: false,
  })
  readonly autoSelectModel?: boolean;

  @IsEnum(RouterPriority)
  @IsOptional()
  @ApiProperty({
    default: RouterPriority.BALANCED,
    description:
      'Priority for auto model routing: quality, speed, cost, or balanced.',
    enum: RouterPriority,
    enumName: 'RouterPriority',
    required: false,
  })
  readonly prioritize?: RouterPriority;

  @IsOptional()
  @IsIn(['off', 'brand'])
  @ApiProperty({
    default: 'off',
    description: 'Brand context mode for prompt assembly',
    enum: ['off', 'brand'],
    required: false,
  })
  readonly brandingMode?: 'off' | 'brand';

  @IsOptional()
  @IsIn(['off', 'guided', 'strict'])
  @ApiProperty({
    description:
      'Generation-brief fidelity. When set, overrides brandingMode for brief compilation.',
    enum: ['off', 'guided', 'strict'],
    required: false,
  })
  readonly fidelityMode?: 'off' | 'guided' | 'strict';

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether to use prompt templates',
    required: false,
  })
  readonly useTemplate?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description:
      'If true, wait for generation to complete before returning the result. Defaults to false (returns immediately with placeholder).',
    required: false,
  })
  readonly waitForCompletion?: boolean;
}
