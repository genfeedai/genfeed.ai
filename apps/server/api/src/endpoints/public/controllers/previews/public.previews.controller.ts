import { ContentPreviewsService } from '@api/collections/content-previews/services/content-previews.service';
import { isAutomatedVisitor } from '@api/collections/content-previews/services/preview-visitor.util';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { PublicContentPreviewSerializer } from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Logged-out, token-gated reads of prepared content. An unknown, expired or
 * revoked token answers the same 404 on every route, so a visitor cannot tell
 * which tokens ever existed. Counting is a separate POST the page makes once
 * per visit: a link unfurler only issues GETs, and a crawler user agent is
 * dropped before anything is recorded.
 */
@AutoSwagger()
@Public()
@Controller('public/previews')
export class PublicPreviewsController {
  constructor(private readonly previews: ContentPreviewsService) {}

  @Get(':token')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('X-Robots-Tag', 'noindex, nofollow, noarchive')
  @RateLimit({ limit: 60, scope: 'ip', windowMs: 60_000 })
  async read(
    @Req() request: Request,
    @Param('token') token: string,
  ): Promise<JsonApiSingleResponse> {
    return serializeSingle(
      request,
      PublicContentPreviewSerializer,
      await this.previews.readPublic(token),
    );
  }

  @Post(':token/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @RateLimit({ limit: 30, scope: 'ip', windowMs: 60_000 })
  async view(
    @Req() request: Request,
    @Param('token') token: string,
  ): Promise<void> {
    if (isAutomatedVisitor(request.headers['user-agent'])) return;
    await this.previews.recordView(token);
  }

  @Post(':token/cta')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @RateLimit({ limit: 30, scope: 'ip', windowMs: 60_000 })
  async cta(
    @Req() request: Request,
    @Param('token') token: string,
  ): Promise<void> {
    if (isAutomatedVisitor(request.headers['user-agent'])) return;
    await this.previews.recordCtaClick(token);
  }
}
