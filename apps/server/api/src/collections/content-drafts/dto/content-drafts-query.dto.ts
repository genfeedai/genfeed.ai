import { ContentDraftStatus } from '@api/collections/content-drafts/schemas/content-draft.schema';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEnum, IsOptional } from 'class-validator';

export class ContentDraftsQueryDto extends BaseQueryDto {
  @IsOptional()
  @IsEnum(ContentDraftStatus)
  readonly status?: ContentDraftStatus;
}
