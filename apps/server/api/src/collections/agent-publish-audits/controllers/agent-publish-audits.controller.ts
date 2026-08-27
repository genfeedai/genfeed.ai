import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentPublishAuditsQueryDto } from '@api/collections/agent-publish-audits/dto/agent-publish-audits-query.dto';
import type { AgentPublishAuditScope } from '@api/collections/agent-publish-audits/schemas/agent-publish-audit.schema';
import { AgentPublishAuditsService } from '@api/collections/agent-publish-audits/services/agent-publish-audits.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { AgentPublishAuditSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('AgentPublishAudits')
@Controller('agent-publish-audits')
export class AgentPublishAuditsController {
  constructor(
    private readonly agentPublishAuditsService: AgentPublishAuditsService,
  ) {}

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: AgentPublishAuditsQueryDto,
  ) {
    const context = this.requireScope(user, query);
    const result = await this.agentPublishAuditsService.findAllScoped(
      context,
      query,
    );
    return serializeCollection(request, AgentPublishAuditSerializer, result);
  }

  private requireScope(
    user: User,
    query?: AgentPublishAuditsQueryDto,
  ): AgentPublishAuditScope {
    const authorized = CollectionFilterUtil.resolveAuthorizedTenantQuery(
      query ?? {},
      user,
      getIsSuperAdmin(user),
    );
    const organizationId = authorized.organizationId ?? user.organizationId;
    const userId = user.userId ?? user.id;
    if (!organizationId || !userId) {
      throw new BadRequestException(
        'Organization and user context are required',
      );
    }
    const brandId = authorized.brandId ?? user.brandId;
    return {
      ...(brandId ? { brandId } : {}),
      organizationId,
      userId,
    };
  }
}
