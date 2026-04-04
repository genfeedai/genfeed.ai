import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class RepurposeContentDto {
  @IsString()
  contentId!: string;

  @IsArray()
  @IsString({ each: true })
  targetFormats!: string[]; // ['short-video', 'story', 'carousel', 'gif']

  @IsOptional()
  @IsObject()
  settings?: {
    preserveBranding?: boolean;
    qualityLevel?: 'low' | 'medium' | 'high';
    targetDuration?: number;
  };
}
