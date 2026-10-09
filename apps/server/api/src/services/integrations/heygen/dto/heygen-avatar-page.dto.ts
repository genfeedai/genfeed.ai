import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class HeyGenAvatarPageDto {
  @IsOptional()
  @IsIn(['public', 'private'])
  ownership?: 'public' | 'private';

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  cursor?: string;
}
