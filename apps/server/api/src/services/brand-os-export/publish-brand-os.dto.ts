import { IsString, Matches, MaxLength } from 'class-validator';
export class PublishBrandOsDto {
  @IsString()
  @MaxLength(128)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  revisionId!: string;
}
