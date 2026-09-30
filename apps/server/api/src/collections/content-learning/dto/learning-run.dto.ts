import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
export class LearningRunControlDto {
  @IsUUID() requestId!: string;
}
export class LearningRunDto extends LearningRunControlDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  parentArtifactId?: string;
}
