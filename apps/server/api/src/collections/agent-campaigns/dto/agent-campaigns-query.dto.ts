import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export class AgentCampaignsQueryDto extends BaseQueryDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'Filter by the selected brand',
    required: false,
  })
  brandId?: string;

  @IsEnum(['draft', 'active', 'paused', 'completed'])
  @IsOptional()
  @ApiProperty({
    description: 'Filter by campaign status',
    enum: ['draft', 'active', 'paused', 'completed'],
    required: false,
  })
  status?: 'draft' | 'active' | 'paused' | 'completed';
}
