import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export enum TurboRunAction {
  APPROVE = 'approve',
  REJECT = 'reject',
  REQUEST_CHANGES = 'request_changes',
}

/**
 * A bulk action is a select-all over one review batch, and a batch itself holds
 * at most `CreateTurboRunDto.count` (`@Max(100)`) items — so 100 covers every real
 * select-all while keeping the per-item write loop bounded.
 */
export const MAX_TURBO_RUN_ACTION_ITEMS = 100;

export class TurboRunActionDto {
  @IsArray()
  @ArrayMaxSize(MAX_TURBO_RUN_ACTION_ITEMS)
  @IsString({ each: true })
  itemIds!: string[];

  @IsOptional()
  @IsString()
  feedback?: string;

  @IsEnum(TurboRunAction)
  action!: TurboRunAction;
}
