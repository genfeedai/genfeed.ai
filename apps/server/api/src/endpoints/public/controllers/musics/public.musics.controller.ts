import { MusicsService } from '@api/collections/musics/services/musics.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { AssetScope, PostStatus } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { MusicSerializer } from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import { PrismaWhereQuery } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';

const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;
function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && OBJECT_ID_REGEX.test(id);
}

@AutoSwagger()
@Public()
@Controller('public/musics')
export class PublicMusicsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly filesClientService: FilesClientService,
    private readonly musicsService: MusicsService,
    private readonly logger: LoggerService,
  ) {}

  @Get()
  @Cache({
    keyGenerator: (req) => `public:musics:${JSON.stringify(req.query)}`,
    tags: ['musics', 'public'],
    ttl: 600, // 10 minutes
  })
  async findPublicMusics(
    @Req() request: ExpressRequest,
    @Query() query: BaseQueryDto,
    @Query('tag') tag?: string,
    @Query('brand') brand?: string,
  ): Promise<JsonApiCollectionResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(url, { query });

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const matchQuery: PrismaWhereQuery = {
      isDeleted: false,
      scope: AssetScope.PUBLIC,
      status: PostStatus.PUBLIC,
    };

    // Filter by brand if provided
    if (brand && isValidObjectId(brand)) {
      matchQuery.brand = brand;
    }

    // Filter by tag if provided (assuming tags are stored in metadata)
    if (tag) {
      matchQuery['metadata.tags'] = { mode: 'insensitive', contains: tag };
    }

    const aggregate = { where: matchQuery, orderBy: { createdAt: -1 } };

    const data = await this.musicsService.findAll(aggregate, options);
    return serializeCollection(request, MusicSerializer, data);
  }

  @Get(':musicId')
  @Cache({
    keyGenerator: (req) => `public:music:${req.params?.musicId ?? 'unknown'}`,
    tags: ['musics'],
    ttl: 1800, // 30 minutes
  })
  async getMusicMetadata(
    @Req() request: ExpressRequest,
    @Param('musicId') musicId: string,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!isValidObjectId(musicId)) {
      return returnNotFound(this.constructorName, musicId);
    }

    this.logger.log(url, { params: { musicId } });
    const music = await this.musicsService.findOne(
      {
        _id: musicId,
        isDeleted: false,
        scope: AssetScope.PUBLIC,
        status: PostStatus.PUBLIC,
      },
      ['metadata', 'brand'],
    );

    if (!music) {
      return returnNotFound(this.constructorName, musicId);
    }

    return serializeSingle(request, MusicSerializer, music);
  }

  @Get(':musicId/audio.mp3')
  async getMusic(
    @Param('musicId') musicId: string,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    const music = await this.musicsService.findOne({
      _id: musicId,
      isDeleted: false,
      scope: AssetScope.PUBLIC,
      status: PostStatus.PUBLIC,
    });

    if (!music) {
      res.status(404).json({ error: 'Music not found' });
      return;
    }

    try {
      const fileStream = await this.filesClientService.getFileFromS3(
        musicId,
        'musics',
      );
      res.set({
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Content-Disposition': `inline; filename="${musicId}.mp3"`,
        'Content-Type': 'audio/mpeg',
      });
      fileStream.pipe(res);
      return;
    } catch {
      res.status(404).json({ error: 'Music file not found' });
      return;
    }
  }
}
