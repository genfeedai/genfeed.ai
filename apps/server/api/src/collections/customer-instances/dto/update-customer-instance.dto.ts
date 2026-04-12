import type { CustomerInstanceStatus } from '@api/collections/customer-instances/schemas/customer-instance.schema';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateCustomerInstanceDto {
  @IsEnum(['provisioning', 'running', 'stopped', 'terminated'])
  @IsOptional()
  @ApiProperty({
    enum: ['provisioning', 'running', 'stopped', 'terminated'],
    required: false,
  })
  readonly status?: CustomerInstanceStatus;

  @IsUrl()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly apiUrl?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly subdomain?: string;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  @ApiProperty({ required: false })
  readonly lastStartedAt?: Date;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  @ApiProperty({ required: false })
  readonly lastStoppedAt?: Date;
}
