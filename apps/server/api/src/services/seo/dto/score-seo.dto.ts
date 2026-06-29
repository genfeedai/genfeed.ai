import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ScoreSeoDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetKeyword?: string;
}
