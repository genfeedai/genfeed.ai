import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** {@link BaseQueryDto} plus the list search term. */
export class SearchBaseQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Case-insensitive search term; narrows the list server-side',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
