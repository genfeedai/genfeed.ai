import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { BrandOsExportService } from '@api/services/brand-os-export/brand-os-export.service';
import { PublishBrandOsDto } from '@api/services/brand-os-export/publish-brand-os.dto';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type {
  IBrandOsDesignArtifact,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { BrandOsExportSerializer } from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import {
  type ArgumentsHost,
  Body,
  Catch,
  Controller,
  Delete,
  type ExceptionFilter,
  Get,
  Header,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch(UnauthorizedException)
export class BrandOsExportAuthFilter implements ExceptionFilter {
  catch(_error: UnauthorizedException, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(404)
      .setHeader('Cache-Control', 'no-store')
      .json({ title: 'Resource Not Found', detail: 'Not found' });
  }
}

function sendArtifact(
  response: Response,
  artifact: IBrandOsDesignArtifact,
  disposition: 'attachment' | 'inline',
): void {
  response.set({
    'Cache-Control': 'no-store',
    'Content-Disposition': `${disposition}; filename="design.md"`,
    'Content-Type': 'text/markdown; charset=utf-8',
    'Content-Digest': `sha-256=:${Buffer.from(artifact.digest, 'hex').toString('base64')}:`,
    ETag: `"${artifact.digest}"`,
    'X-Brand-OS-Revision': artifact.revisionId,
    'X-Brand-OS-Schema': artifact.schemaVersion,
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  });
  response.status(200).send(artifact.markdown);
}

@Controller('brands/:id/brand-os')
@UseFilters(BrandOsExportAuthFilter)
export class BrandOsExportController {
  constructor(private readonly service: BrandOsExportService) {}
  @Get('export')
  @Header('Cache-Control', 'no-store')
  async state(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<JsonApiSingleResponse> {
    return serializeSingle(
      request,
      BrandOsExportSerializer,
      await this.service.state(id, user),
    );
  }
  @Get('design.md')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    sendArtifact(response, await this.service.download(id, user), 'attachment');
  }
  @Post('publication')
  @Header('Cache-Control', 'no-store')
  async publish(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PublishBrandOsDto,
  ): Promise<JsonApiSingleResponse> {
    return serializeSingle(
      request,
      BrandOsExportSerializer,
      await this.service.publish(id, body.revisionId, user),
    );
  }
  @Delete('publication')
  @Header('Cache-Control', 'no-store')
  async revoke(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<JsonApiSingleResponse> {
    return serializeSingle(
      request,
      BrandOsExportSerializer,
      await this.service.revoke(id, user),
    );
  }
}

@Controller('public/brand-os')
export class PublicBrandOsExportController {
  constructor(private readonly service: BrandOsExportService) {}
  @Get(':publicationId/design.md')
  @Public()
  @RateLimit({ limit: 60, scope: 'ip', windowMs: 60_000 })
  @Header('Cache-Control', 'no-store')
  async current(
    @Param('publicationId') publicationId: string,
    @Res() response: Response,
  ): Promise<void> {
    sendArtifact(
      response,
      await this.service.publicArtifact(publicationId),
      'inline',
    );
  }
  @Get(':publicationId/:revisionId/design.md')
  @Public()
  @RateLimit({ limit: 60, scope: 'ip', windowMs: 60_000 })
  @Header('Cache-Control', 'no-store')
  async revision(
    @Param('publicationId') publicationId: string,
    @Param('revisionId') revisionId: string,
    @Res() response: Response,
  ): Promise<void> {
    sendArtifact(
      response,
      await this.service.publicArtifact(publicationId, revisionId),
      'inline',
    );
  }
}
