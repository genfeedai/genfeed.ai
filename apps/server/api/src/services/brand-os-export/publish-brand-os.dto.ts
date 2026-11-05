import { IsString, Matches, MaxLength } from 'class-validator';

const SAFE_IDENTIFIER_PATTERN = /^[a-zA-Z0-9_-]+$/;

export class PublishBrandOsDto {
  @IsString()
  @MaxLength(128)
  @Matches(SAFE_IDENTIFIER_PATTERN)
  revisionId!: string;
}
