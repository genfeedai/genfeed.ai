import { PageQueryDto } from '@api/helpers/dto/page-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class WatchlistsQueryDto extends PageQueryDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  organizationId?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  brandId?: string;
}
