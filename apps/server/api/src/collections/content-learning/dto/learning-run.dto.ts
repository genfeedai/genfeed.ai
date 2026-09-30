import { IsOptional, IsString, MaxLength } from 'class-validator';
export class LearningRunDto {
  @IsString() @MaxLength(256) requestId!: string;
  @IsOptional() @IsString() @MaxLength(256) parentArtifactId?: string;
}
