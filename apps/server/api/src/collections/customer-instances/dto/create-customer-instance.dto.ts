import type {
  CustomerInstanceRole,
  CustomerInstanceTier,
} from '@api/collections/customer-instances/schemas/customer-instance.schema';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export class CreateCustomerInstanceDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Clerk organization ID of the owning customer' })
  readonly organizationId!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'AWS EC2 instance ID (e.g. i-0abc123def456)' })
  readonly instanceId!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'EC2 instance type (e.g. g6e.xlarge)' })
  readonly instanceType!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    default: 'us-east-1',
    description: 'AWS region',
    required: false,
  })
  readonly region?: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'AMI ID used to launch the instance' })
  readonly amiId!: string;

  @IsEnum(['images', 'voices', 'videos', 'full'])
  @IsOptional()
  @ApiProperty({
    default: 'full',
    description: 'Generation workload this instance handles',
    enum: ['images', 'voices', 'videos', 'full'],
    required: false,
  })
  readonly role?: CustomerInstanceRole;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Customer subdomain (e.g. acme.gpu.genfeed.ai)' })
  readonly subdomain!: string;

  @IsUrl()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Full API base URL (e.g. https://acme.gpu.genfeed.ai)',
  })
  readonly apiUrl!: string;

  @IsEnum(['shared', 'dedicated'])
  @IsOptional()
  @ApiProperty({
    default: 'dedicated',
    enum: ['shared', 'dedicated'],
    required: false,
  })
  readonly tier?: CustomerInstanceTier;
}
