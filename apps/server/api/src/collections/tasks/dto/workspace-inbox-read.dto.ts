import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class WorkspaceInboxReadVersionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  taskId!: string;

  @IsISO8601({ strict: true })
  seenUpdatedAt!: string;
}

export class WorkspaceInboxReadDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => WorkspaceInboxReadVersionDto)
  reads!: WorkspaceInboxReadVersionDto[];
}
