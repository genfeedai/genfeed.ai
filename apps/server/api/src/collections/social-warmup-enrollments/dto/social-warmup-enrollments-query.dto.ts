import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class SocialWarmupEnrollmentsQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Filter to a single credential' })
  @IsOptional()
  @IsEntityId()
  credential?: string;
}
