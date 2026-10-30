import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Query DTO for the superadmin user list.
 * Inherits pagination, sorting and the deleted filter from BaseQueryDto.
 */
export class UsersQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Search across email, name, and handle',
    maxLength: 100,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
