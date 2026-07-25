import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export enum BatchAction {
  APPROVE = 'approve',
  REJECT = 'reject',
  REQUEST_CHANGES = 'request_changes',
}

/**
 * A bulk action is a select-all over one review batch, and a batch itself holds
 * at most `CreateBatchDto.count` (`@Max(100)`) items — so 100 covers every real
 * select-all while keeping the per-item write loop bounded.
 */
const MAX_BATCH_ACTION_ITEMS = 100;

export class BatchActionDto {
  @IsArray()
  @ArrayMaxSize(MAX_BATCH_ACTION_ITEMS)
  @IsString({ each: true })
  itemIds!: string[];

  @IsOptional()
  @IsString()
  feedback?: string;

  @IsEnum(BatchAction)
  action!: BatchAction;
}
