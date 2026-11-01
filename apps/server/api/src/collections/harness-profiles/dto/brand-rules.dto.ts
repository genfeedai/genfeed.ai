import { MAX_BRAND_RULE_LENGTH } from '@api/collections/harness-profiles/utils/brand-rule-proposals.util';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const MAX_TEXT_LENGTH = 10_000;
const MAX_REASON_LENGTH = 2_000;

export class ProposeBrandRulesDto {
  @IsString()
  @IsNotEmpty()
  brandId!: string;

  /** The generated text the user started from (plain text or the editor's HTML). */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  original?: string;

  /** The text after the user's edit. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  edited?: string;

  /** Why the user rejected the draft; only a short reason becomes a rule. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_REASON_LENGTH)
  reason?: string;
}

export class SaveBrandRulesDto {
  @IsString()
  @IsNotEmpty()
  brandId!: string;

  /** Rules the user accepted; each is saved as one line of the brand's content rules. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(MAX_BRAND_RULE_LENGTH, { each: true })
  rules!: string[];
}
