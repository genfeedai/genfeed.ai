import { CreateTrackedLinkDto } from '@api/collections/tracked-links/dto/create-tracked-link.dto';
import { TrackClickDto } from '@api/collections/tracked-links/dto/track-click.dto';
import { TrackedLinksService } from '@api/collections/tracked-links/services/tracked-links.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { TrackedLinkSerializer } from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';

@AutoSwagger()
@ApiTags('Tracking')
@Controller('tracking')
export class TrackedLinksController {
  constructor(private readonly trackedLinksService: TrackedLinksService) {}

  /**
   * Generate tracking link
   */
  @Post('links')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateLink(
    @Req() req: ExpressRequest,
    @Body() dto: CreateTrackedLinkDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.trackedLinksService.generateTrackingLink(
      dto,
      organization,
    );
    return serializeSingle(req, TrackedLinkSerializer, data);
  }

  /**
   * Get link by ID
   */
  @Get('links/:id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getLink(
    @Req() req: ExpressRequest,
    @Param('id') linkId: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.trackedLinksService.getById(linkId, organization);
    return serializeSingle(req, TrackedLinkSerializer, data);
  }

  /**
   * Get links (by content or organization)
   */
  @Get('links')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getLinks(
    @Req() req: ExpressRequest,
    @Query('contentId') contentId: string | undefined,
    @Query('platform') platform: string | undefined,
    @Query('campaignName') campaignName: string | undefined,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);

    if (contentId) {
      const docs = await this.trackedLinksService.getContentLinks(
        contentId,
        organization,
      );
      return serializeCollection(req, TrackedLinkSerializer, { docs });
    }

    const docs = await this.trackedLinksService.getOrganizationLinks(
      organization,
      {
        campaignName,
        platform,
      },
    );
    return serializeCollection(req, TrackedLinkSerializer, { docs });
  }

  /**
   * Get link performance
   */
  @Get('links/:id/performance')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getLinkPerformance(
    @Param('id') linkId: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    return await this.trackedLinksService.getLinkPerformance(
      linkId,
      organization,
    );
  }

  /**
   * Get content CTA stats
   */
  @Get('content/:contentId/cta-stats')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getContentCTAStats(
    @Param('contentId') contentId: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    return await this.trackedLinksService.getContentCTAStats(
      contentId,
      organization,
    );
  }

  /**
   * Update link
   */
  @Patch('links/:id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateLink(
    @Req() req: ExpressRequest,
    @Param('id') linkId: string,
    @Body() updates: Record<string, unknown>,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.trackedLinksService.update(
      linkId,
      organization,
      updates,
    );
    return serializeSingle(req, TrackedLinkSerializer, data);
  }

  /**
   * Delete link
   */
  @Delete('links/:id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async deleteLink(@Param('id') linkId: string, @CurrentUser() user: User) {
    const { organization } = getPublicMetadata(user);
    await this.trackedLinksService.delete(linkId, organization);
    return { success: true };
  }

  /**
   * Track click (PUBLIC - no auth required)
   */
  @Public()
  @Post('clicks')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async trackClick(@Body() dto: TrackClickDto, @Req() req: ExpressRequest) {
    await this.trackedLinksService.trackClick(dto, {
      headers: req.headers as unknown as Record<string, string | undefined>,
      ip: req.ip,
    });
    return { success: true };
  }
}

/**
 * Redirect Controller (separate route for short links)
 */
@AutoSwagger()
@ApiTags('Redirect')
@Controller('l')
export class RedirectController {
  constructor(
    private readonly trackedLinksService: TrackedLinksService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Redirect short link (PUBLIC - no auth required)
   */
  @Public()
  @Get(':shortCode')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async redirect(
    @Param('shortCode') shortCode: string,
    @Req() req: ExpressRequest,
    @Res() res: Response,
  ) {
    // Find link
    const link = await this.trackedLinksService.getByShortCode(shortCode);

    if (!link) {
      // @ts-expect-error TS2349
      return res.status(404).send('Link not found');
    }

    // Check expiration
    if (link.expiresAt && link.expiresAt < new Date()) {
      // @ts-expect-error TS2349
      return res.status(410).send('Link expired');
    }

    // Track click asynchronously (don't block redirect)
    this.trackedLinksService
      .trackClick(
        {
          gaClientId: req.headers['x-ga-client-id'] as string,
          linkId: (
            link as unknown as { _id: { toString: () => string } }
          )._id.toString(),
          sessionId: req.headers['x-session-id'] as string,
        },
        {
          headers: req.headers as unknown as Record<string, string | undefined>,
          ip: req.ip,
        },
      )
      .catch((error) => {
        // Log but don't fail the redirect
        this.logger.error('Click tracking failed', error, {
          linkId: (
            link as unknown as { _id: { toString: () => string } }
          )._id.toString(),
          shortCode,
        });
      });

    // Redirect
    // @ts-expect-error TS2551
    return res.redirect(302, link.originalUrl);
  }
}
