import { isPlatformSuperAdmin } from '@api/auth/better-auth/better-auth-access.util';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandFromUrlService } from '@api/collections/brands/services/brand-from-url.service';
import {
  RequestContextMiddleware,
  type RequestWithContext,
} from '@api/common/middleware/request-context.middleware';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { resolveOptionalProvider } from '@api/helpers/utils/module-ref/resolve-optional-provider.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

@Injectable()
export class AgentBrandFromUrlToolHandler {
  constructor(
    private readonly roles: RolesGuard,
    private readonly requestContext: RequestContextMiddleware,
    private readonly prisma: PrismaService,
    @Optional() private readonly service?: BrandFromUrlService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  async execute(
    name: 'create_brand_from_url' | 'get_brand_scan_status',
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (name === 'create_brand_from_url') await this.assertRole(ctx);
    const service =
      this.service ??
      resolveOptionalProvider(this.moduleRef, BrandFromUrlService);
    if (!service)
      throw new Error(
        'BrandFromUrlService is not registered in this API process.',
      );
    if (name === 'get_brand_scan_status') {
      const brandId = readOptionalString(params.brandId);
      if (!brandId)
        throw new Error('get_brand_scan_status requires a brandId.');
      return {
        success: true,
        creditsUsed: 0,
        isBillingDelegated: true,
        data: { ...(await service.get(ctx.organizationId, brandId)) },
      };
    }
    const url = readOptionalString(params.url);
    if (!url) throw new Error('create_brand_from_url requires a url.');
    const operation = await service.start(
      {
        url,
        label: readOptionalString(params.label),
        approve: params.approve === true,
      },
      ctx,
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const data = await Promise.race([
        operation.completion,
        new Promise<typeof operation.running>((resolve) => {
          timer = setTimeout(
            () => resolve(operation.running),
            Math.max(0, 20_000 - (Date.now() - operation.createdAt)),
          );
        }),
      ]);
      return {
        success: true,
        creditsUsed: data.scanStatus === 'succeeded' ? 1 : 0,
        isBillingDelegated: true,
        data: { ...data },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async assertRole(ctx: ToolExecutionContext): Promise<void> {
    try {
      const principal = await this.prisma.user.findFirst({
        where: { id: ctx.userId, isDeleted: false },
        select: { id: true, platformRole: true },
      });
      if (!principal)
        throw new ForbiddenException('Call principal is not a known user');
      const user: AuthenticatedUser = {
        ...ctx.apiKeyContext,
        id: principal.id,
        userId: principal.id,
        organizationId: ctx.organizationId,
        brandId: ctx.brandId ?? '',
        isSuperAdmin: isPlatformSuperAdmin(principal.platformRole),
      };
      const request = {
        body: {},
        headers: {},
        method: 'POST',
        originalUrl: '/agent-tools/create_brand_from_url/execute',
        params: {},
        query: {},
        url: '/agent-tools/create_brand_from_url/execute',
        user,
      } as unknown as RequestWithContext;
      await this.requestContext.hydrate(request);
      await this.roles.assertRoles(request, [
        MemberRole.OWNER,
        MemberRole.ADMIN,
      ]);
    } catch {
      throw new ForbiddenException(
        'Only organization owners and admins can create brands from a URL.',
      );
    }
  }
}
