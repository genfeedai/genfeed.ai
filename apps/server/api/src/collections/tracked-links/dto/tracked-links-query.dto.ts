import { PageQueryDto } from '@api/helpers/dto/page-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class TrackedLinksQueryDto extends PageQueryDto {
  @ApiProperty({
    description: 'List the links of one content item',
    required: false,
  })
  @IsOptional()
  @IsString()
  contentId?: string;

  @ApiProperty({
    description: 'List the short links created for one scheduled post',
    required: false,
  })
  @IsOptional()
  @IsString()
  postId?: string;

  @ApiProperty({ description: 'Filter by platform', required: false })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiProperty({ description: 'Filter by campaign name', required: false })
  @IsOptional()
  @IsString()
  campaignName?: string;
}
