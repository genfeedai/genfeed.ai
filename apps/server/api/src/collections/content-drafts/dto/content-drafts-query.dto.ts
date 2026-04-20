import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ContentDraftStatus } from '@genfeedai/enums';
import { IsEnum, IsOptional } from 'class-validator';

export class ContentDraftsQueryDto extends BaseQueryDto {
  @IsOptional()
  @IsEnum(ContentDraftStatus)
  readonly status?: ContentDraftStatus;
}
