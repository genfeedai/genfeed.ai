import { toOptionalBoolean } from '@api/helpers/dto/optional-boolean.transform';
import { PaginationQueryDto } from '@api/helpers/dto/pagination-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class OrganizationsReportQueryDto extends PaginationQueryDto {
  @ApiProperty({
    default: false,
    description: 'Also list soft-deleted organizations',
    required: false,
  })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  includeDeleted?: boolean;
}
