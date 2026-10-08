import type { HeyGenConnectionRef } from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Candidate only. The server supplies ownership, connection and readiness. */
export class DefaultAvatarRefDto {
  @IsIn(['heygen-look'])
  @ApiProperty({ enum: ['heygen-look'] })
  readonly source!: 'heygen-look';

  @IsString()
  @MaxLength(255)
  @ApiProperty()
  readonly lookId!: string;

  @IsIn(['private', 'public'])
  @ApiProperty({ enum: ['private', 'public'] })
  readonly ownership!: 'private' | 'public';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ required: false, nullable: true })
  readonly groupId?: string | null;

  @IsOptional()
  @IsObject()
  readonly connection?: HeyGenConnectionRef;
}
