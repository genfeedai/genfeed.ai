import { MAX_MEDIA_VIEW_BATCH } from '@api/endpoints/public/services/public-views.service';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

/** The images and videos a gallery visitor saw, counted in one request. */
export class PublicMediaViewsDto {
  @ApiProperty({
    description: 'Ids of the public images and videos on screen',
    isArray: true,
    maxItems: MAX_MEDIA_VIEW_BATCH,
    type: String,
  })
  @IsArray()
  @ArrayMaxSize(MAX_MEDIA_VIEW_BATCH)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  ids!: string[];
}
