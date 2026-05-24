import { IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class TrackSubscriptionDto {
  @IsString()
  stripeSubscriptionId!: string;

  @IsString()
  stripeCustomerId!: string;

  @IsString()
  userId!: string;

  @IsString()
  email!: string;

  @IsString()
  plan!: string;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  // Attribution
  @IsOptional()
  @IsString()
  sourceContentId?: string;

  @IsOptional()
  @IsString()
  sourceContentType?: string;

  @IsOptional()
  @IsString()
  sourcePlatform?: string;

  @IsOptional()
  @IsString()
  sourceLinkId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsObject()
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
  };
}
