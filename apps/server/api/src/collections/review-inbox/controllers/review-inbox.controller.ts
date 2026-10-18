import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ReviewInboxDecisionDto } from '@api/collections/review-inbox/dto/review-inbox-decision.dto';
import { ReviewInboxService } from '@api/collections/review-inbox/services/review-inbox.service';
import { ReviewInboxDecisionService } from '@api/collections/review-inbox/services/review-inbox-decision.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import {
  ReviewInboxDecisionSerializer,
  ReviewInboxItemSerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * One review inbox (#7340): workflow review gates and MCP approvals waiting on
 * a human. Membership is required; resolving a row needs the role its owner
 * requires (MCP approvals stay owner/admin only).
 */
@ApiTags('Review inbox')
@AutoSwagger()
@Controller('review-inbox')
@UseGuards(RolesGuard)
export class ReviewInboxController {
  constructor(
    private readonly reviewInbox: ReviewInboxService,
    private readonly decisions: ReviewInboxDecisionService,
  ) {}

  @TenantReadPolicy('selected')
  @Get()
  @ApiOperation({
    summary: 'List pending workflow review gates and MCP approvals',
  })
  async list(
    @Req() req: Request,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    const scope = resolveTenantReadScope(user);
    const access = await this.reviewInbox.resolveViewerAccess(
      Object.assign(req, { user }),
    );
    const items = await this.reviewInbox.listPending(
      {
        brandId: scope.brandId,
        organizationId: scope.organizationId,
      },
      access,
    );
    return serializeCollection(req, ReviewInboxItemSerializer, {
      docs: items,
      total: items.length,
    });
  }

  @Post('decisions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve or reject one review inbox item through its owner',
  })
  async decide(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Body() dto: ReviewInboxDecisionDto,
  ): Promise<JsonApiSingleResponse> {
    const access = await this.reviewInbox.resolveViewerAccess(
      Object.assign(req, { user }),
    );
    const result = await this.decisions.decide(user, access, dto);
    return serializeSingle(req, ReviewInboxDecisionSerializer, result);
  }
}
