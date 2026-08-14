import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { ApiKeyScope } from '@genfeedai/enums';
import { PublishApprovalSerializer } from '@genfeedai/serializers';
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('PublishApprovals')
@Controller('publish-approvals')
@UseGuards(RolesGuard)
export class PublishApprovalsController {
  constructor(private readonly approvalsService: PublishApprovalsService) {}

  @Post()
  @RequiredScopes(ApiKeyScope.POSTS_APPROVE)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: unknown,
  ) {
    const organization = user.organizationId;
    const actorUserId = user.userId ?? user.id;
    const approval = await this.approvalsService.createForPost({
      actorUserId,
      body,
      organizationId: organization,
      provenance: { surface: 'publish-approvals-api' },
    });
    return serializeSingle(request, PublishApprovalSerializer, approval);
  }
}
