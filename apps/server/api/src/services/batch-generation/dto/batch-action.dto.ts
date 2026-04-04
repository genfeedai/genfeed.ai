import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

export enum BatchAction {
  APPROVE = 'approve',
  REJECT = 'reject',
  REQUEST_CHANGES = 'request_changes',
}

export class BatchActionDto {
  @IsArray()
  @IsString({ each: true })
  itemIds!: string[];

  @IsOptional()
  @IsString()
  feedback?: string;

  @IsEnum(BatchAction)
  action!: BatchAction;
}
