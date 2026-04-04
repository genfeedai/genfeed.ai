import { IsOptional, IsString } from 'class-validator';

export class TrackClickDto {
  @IsString()
  linkId!: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  gaClientId?: string;

  @IsOptional()
  @IsString()
  referrer?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  ip?: string;
}
