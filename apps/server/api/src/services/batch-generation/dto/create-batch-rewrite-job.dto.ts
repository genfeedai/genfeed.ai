import { MAX_BATCH_ACTION_ITEMS } from '@api/services/batch-generation/dto/batch-action.dto';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class CreateBatchRewriteJobDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_ACTION_ITEMS)
  @IsString({ each: true })
  itemIds!: string[];
}
