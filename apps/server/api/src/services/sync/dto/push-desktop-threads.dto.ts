import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

export class DesktopMessageDto {
  @IsString()
  content!: string;

  @IsString()
  createdAt!: string;

  @IsString()
  @IsOptional()
  draftId?: string;

  @IsString()
  @IsOptional()
  generatedContent?: string;

  @IsString()
  id!: string;

  @IsString()
  role!: string;
}

export class DesktopThreadDto {
  @IsString()
  createdAt!: string;

  @IsString()
  id!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DesktopMessageDto)
  messages!: DesktopMessageDto[];

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  title!: string;

  @IsString()
  updatedAt!: string;

  @IsString()
  @IsOptional()
  workspaceId?: string;
}

export class PushDesktopThreadsDto {
  @IsString()
  localUserId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DesktopThreadDto)
  threads!: DesktopThreadDto[];
}
