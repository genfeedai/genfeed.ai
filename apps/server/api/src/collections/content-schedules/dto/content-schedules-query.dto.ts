import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class ContentSchedulesQueryDto extends BaseQueryDto {
  @IsOptional()
  @IsBoolean()
  readonly isEnabled?: boolean;
}
