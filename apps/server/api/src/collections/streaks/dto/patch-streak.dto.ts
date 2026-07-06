import { IsBoolean, IsOptional } from 'class-validator';

export class PatchStreakDto {
  @IsBoolean()
  @IsOptional()
  freeze?: boolean;
}
