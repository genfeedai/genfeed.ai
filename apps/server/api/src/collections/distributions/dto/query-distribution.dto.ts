import { DistributionPlatform, PublishStatus } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryDistributionDto {
  @IsOptional()
  @IsEnum(DistributionPlatform)
  @ApiProperty({
    enum: DistributionPlatform,
    enumName: 'DistributionPlatform',
    required: false,
  })
  readonly platform?: DistributionPlatform;

  @IsOptional()
  @IsEnum(PublishStatus)
  @ApiProperty({
    enum: PublishStatus,
    enumName: 'PublishStatus',
    required: false,
  })
  readonly status?: PublishStatus;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  readonly page?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  readonly limit?: string;
}
