import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { AgentToolResult } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable, Optional } from '@nestjs/common';

interface AgentBrandsServiceLike {
  findOne: (
    query: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null>;
}

interface ToolRouteSlugs {
  brandSlug?: string;
  orgSlug: string;
}

const ROUTE_HREF_KEYS = new Set(['href', 'ctaHref', 'editorUrl']);
const ORG_LEVEL_ROUTE_PREFIXES = new Set([
  'agent',
  'chat',
  'overview',
  'settings',
]);
const UNSCOPED_ROUTE_PREFIXES = new Set([
  'admin',
  'login',
  'logout',
  'oauth',
  'onboarding',
  'playwright-ready',
  'request-access',
  'sign-up',
]);

@Injectable()
export class AgentRouteRewriteService {
  constructor(
    private readonly loggerService: LoggerService,
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: AgentBrandsServiceLike,
    @Optional()
    private readonly organizationsService?: OrganizationsService,
  ) {}

  async scopeToolResultHrefs(
    result: AgentToolResult,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.hasScopeableHref(result)) {
      return result;
    }

    const routeSlugs = await this.resolveToolRouteSlugs(ctx);
    if (!routeSlugs) {
      return result;
    }

    return this.scopeHrefFields(result, routeSlugs) as AgentToolResult;
  }

  private async resolveToolRouteSlugs(
    ctx: ToolExecutionContext,
  ): Promise<ToolRouteSlugs | null> {
    if (!this.organizationsService) {
      return null;
    }

    try {
      const organization = await this.organizationsService.findOne({
        _id: ctx.organizationId,
        isDeleted: false,
      });
      const orgSlug = this.readRecordString(organization, 'slug');

      if (!orgSlug) {
        return null;
      }

      const brand = await this.resolveToolRouteBrand(ctx);
      const brandSlug = this.readRecordString(brand, 'slug');

      return {
        ...(brandSlug ? { brandSlug } : {}),
        orgSlug,
      };
    } catch (error: unknown) {
      this.loggerService.warn('Failed to resolve tool route slugs', {
        error: error instanceof Error ? error.message : String(error),
        organizationId: ctx.organizationId,
      });
      return null;
    }
  }

  private async resolveToolRouteBrand(
    ctx: ToolExecutionContext,
  ): Promise<Record<string, unknown> | null> {
    if (ctx.brandId) {
      return this.brandsService.findOne({
        _id: ctx.brandId,
        isDeleted: false,
        organization: ctx.organizationId,
      });
    }

    return this.brandsService.findOne({
      isDeleted: false,
      isSelected: true,
      organization: ctx.organizationId,
      user: ctx.userId,
    });
  }

  private hasScopeableHref(value: unknown): boolean {
    if (Array.isArray(value)) {
      return value.some((item) => this.hasScopeableHref(item));
    }

    if (!this.isPlainRecord(value)) {
      return false;
    }

    return Object.entries(value).some(([key, nestedValue]) => {
      if (
        ROUTE_HREF_KEYS.has(key) &&
        typeof nestedValue === 'string' &&
        this.isScopeableInternalHref(nestedValue)
      ) {
        return true;
      }

      return this.hasScopeableHref(nestedValue);
    });
  }

  private scopeHrefFields(value: unknown, slugs: ToolRouteSlugs): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.scopeHrefFields(item, slugs));
    }

    if (!this.isPlainRecord(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => {
        if (ROUTE_HREF_KEYS.has(key) && typeof nestedValue === 'string') {
          return [key, this.scopeInternalHref(nestedValue, slugs)];
        }

        return [key, this.scopeHrefFields(nestedValue, slugs)];
      }),
    );
  }

  private scopeInternalHref(href: string, slugs: ToolRouteSlugs): string {
    if (!this.isScopeableInternalHref(href)) {
      return href;
    }

    const { path, suffix } = this.splitHrefSuffix(href);
    const firstSegment = path.split('/').filter(Boolean)[0];

    if (!firstSegment || UNSCOPED_ROUTE_PREFIXES.has(firstSegment)) {
      return href;
    }

    if (path.startsWith(`/${slugs.orgSlug}/`)) {
      return href;
    }

    if (ORG_LEVEL_ROUTE_PREFIXES.has(firstSegment)) {
      return `/${slugs.orgSlug}/~${path}${suffix}`;
    }

    if (slugs.brandSlug) {
      return `/${slugs.orgSlug}/${slugs.brandSlug}${path}${suffix}`;
    }

    return `/${slugs.orgSlug}/~${path}${suffix}`;
  }

  private isScopeableInternalHref(href: string): boolean {
    return href.startsWith('/') && !href.startsWith('//');
  }

  private splitHrefSuffix(href: string): { path: string; suffix: string } {
    const suffixStart = href.search(/[?#]/);

    if (suffixStart === -1) {
      return { path: href, suffix: '' };
    }

    return {
      path: href.slice(0, suffixStart),
      suffix: href.slice(suffixStart),
    };
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  private readRecordString(
    value: Record<string, unknown> | null | undefined,
    key: string,
  ): string | undefined {
    return value ? this.readOptionalString(value[key]) : undefined;
  }

  private readOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }
}
