import { IsOptional, IsString } from 'class-validator';

export class ContentDraftRejectDto {
  @IsOptional()
  @IsString()
  readonly reason?: string;
}
