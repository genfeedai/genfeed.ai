import {
  KnowledgeProcessingState,
  KnowledgeRetrievalState,
} from '@genfeedai/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export class KnowledgeProcessingDto {
  @ApiProperty({
    enum: KnowledgeProcessingState,
    enumName: 'KnowledgeProcessingState',
  })
  @IsEnum(KnowledgeProcessingState)
  state!: KnowledgeProcessingState;
}

export class KnowledgeEligibilityDto {
  @ApiProperty({
    enum: KnowledgeRetrievalState,
    enumName: 'KnowledgeRetrievalState',
  })
  @IsEnum(KnowledgeRetrievalState)
  state!: KnowledgeRetrievalState;
}

export class KnowledgeVerificationDto {
  @ApiProperty()
  @IsDateString()
  verifiedAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class KnowledgePurgeScheduleDto {
  @ApiProperty()
  @IsDateString()
  purgeScheduledAt!: string;
}
