import { MAX_TURBO_RUN_ACTION_ITEMS } from '@api/services/turbo-run/dto/turbo-run-action.dto';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class CreateTurboRewriteJobDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_TURBO_RUN_ACTION_ITEMS)
  @IsString({ each: true })
  itemIds!: string[];
}
