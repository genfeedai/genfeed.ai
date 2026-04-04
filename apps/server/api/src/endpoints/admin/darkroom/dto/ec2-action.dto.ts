import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class Ec2ActionDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'EC2 instance ID' })
  readonly instanceId!: string;

  @IsEnum(['start', 'stop'])
  @ApiProperty({
    description: 'Action to perform',
    enum: ['start', 'stop'],
    enumName: 'Ec2Action',
  })
  readonly action!: 'start' | 'stop';
}

export class BulkEc2ActionDto {
  @IsEnum(['start', 'stop'])
  @ApiProperty({
    description: 'Action to perform on all darkroom fleet instances',
    enum: ['start', 'stop'],
    enumName: 'BulkEc2Action',
  })
  readonly action!: 'start' | 'stop';

  @IsOptional()
  @IsString()
  @ApiProperty({
    description:
      'Optional instance role filter (images, training, videos, voices, llm)',
    required: false,
  })
  readonly role?: string;
}
