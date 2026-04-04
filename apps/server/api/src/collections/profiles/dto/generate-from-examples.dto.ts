import { IsArray, IsObject, IsString } from 'class-validator';

export class GenerateFromExamplesDto {
  @IsString()
  label!: string;

  @IsString()
  description!: string;

  @IsArray()
  @IsObject({ each: true })
  examples!: Array<{
    contentType: 'image' | 'video' | 'voice' | 'article';
    url?: string;
    content?: string;
  }>;
}
