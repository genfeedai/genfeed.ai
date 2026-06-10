import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class UploadIntegrationMediaDto {
  /**
   * Source URL the files service fetches server-side. May carry transport
   * credentials (e.g. a Telegram bot-token file URL) — it is never persisted.
   */
  @IsUrl()
  @IsNotEmpty()
  fileUrl!: string;

  @IsString()
  @IsNotEmpty()
  organizationId!: string;
}
