import { IsArray, IsString } from 'class-validator';

export class BulkApproveContentDraftsDto {
  @IsArray()
  @IsString({ each: true })
  readonly ids!: string[];
}
