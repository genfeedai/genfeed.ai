import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Filters for the superadmin prompt ledger. `organizationId` and `brandId` come from {@link BaseQueryDto}. */
export class AdminPromptsQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Search the original and enhanced prompt and the user email',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
