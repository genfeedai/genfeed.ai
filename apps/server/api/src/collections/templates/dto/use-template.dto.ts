import { IsObject, IsOptional, IsString } from 'class-validator';

export class UseTemplateDto {
  @IsString()
  templateId!: string;

  @IsObject()
  variables!: Record<string, string>; // { "product_name": "Amazing Widget", "cta": "Buy now!" }

  @IsOptional()
  @IsString()
  additionalInstructions?: string; // Optional AI tweaks
}
