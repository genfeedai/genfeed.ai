import { MAX_CREDENTIAL_POSTING_TIMES } from '@genfeedai/contracts/api-types/contracts/credential-posting-times.contract';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CredentialPostingTimeDto {
  @IsInt()
  @Min(0)
  @Max(23)
  @ApiProperty({ example: 9 })
  readonly hour!: number;

  @IsInt()
  @Min(0)
  @Max(59)
  @ApiProperty({ example: 0 })
  readonly minute!: number;
}

export class ReplaceCredentialPostingTimesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CredentialPostingTimeDto)
  @ArrayMaxSize(MAX_CREDENTIAL_POSTING_TIMES)
  @ApiProperty({ type: [CredentialPostingTimeDto] })
  readonly times!: CredentialPostingTimeDto[];
}

export class NextPostingSlotQueryDto {
  @IsOptional()
  @IsDateString()
  @ApiProperty({ required: false })
  readonly after?: string;
}
