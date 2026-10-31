import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AdminBillingQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Search organizations by name, slug or owner email',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;
}
