import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * Matches the desktop client's own push slice — it never sends more than 500
 * threads per request (`thread-sync.service.ts` `pushCandidates.slice(0, 500)`).
 * Each thread costs a findUnique + upsert + createMany in
 * `desktop-sync.service.ts` `pushThreads`.
 */
const MAX_THREADS = 500;

/**
 * Per-thread bound so the request cost is threads x messages rather than
 * threads x unbounded. The client never truncates message history, but a
 * 500-message desktop thread is already far outside real usage, so no genuine
 * thread is rejected by this cap.
 */
const MAX_MESSAGES_PER_THREAD = 500;

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
  @ArrayMaxSize(MAX_MESSAGES_PER_THREAD)
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
  @ArrayMaxSize(MAX_THREADS)
  @ValidateNested({ each: true })
  @Type(() => DesktopThreadDto)
  threads!: DesktopThreadDto[];
}
