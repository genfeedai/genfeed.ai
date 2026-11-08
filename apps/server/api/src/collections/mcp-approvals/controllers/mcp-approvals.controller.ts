import { isTrustedMcpOriginProof } from '@api/action-origin/mcp-origin-proof.util';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AttachMcpApprovalResultDto } from '@api/collections/mcp-approvals/dto/attach-mcp-approval-result.dto';
import { CreateMcpApprovalDto } from '@api/collections/mcp-approvals/dto/create-mcp-approval.dto';
import { McpApprovalsQueryDto } from '@api/collections/mcp-approvals/dto/mcp-approvals-query.dto';
import { ResolveMcpApprovalDto } from '@api/collections/mcp-approvals/dto/resolve-mcp-approval.dto';
import type { McpApprovalDocument } from '@api/collections/mcp-approvals/schemas/mcp-approval.schema';
import { McpApprovalPolicyService } from '@api/collections/mcp-approvals/services/mcp-approval-policy.service';
import { McpApprovalsService } from '@api/collections/mcp-approvals/services/mcp-approvals.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { assertMcpAccessModeAllowsTool } from '@api/helpers/utils/auth/mcp-access-mode.util';
import { scopedWhere } from '@api/index';
import {
  type FrontendPagination,
  transformPaginationFormat,
} from '@api/shared/utils/pagination-transform/pagination-transform.util';
import {
  ActionOrigin,
  MCP_ACTION_ORIGIN_PROOF_HEADER,
  MemberRole,
} from '@genfeedai/contracts';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { McpApprovalStatus } from '@genfeedai/prisma';
import {
  McpApprovalPricingSerializer,
  McpApprovalStatusSerializer,
} from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

type McpApprovalResponse = {
  id: string;
  status: McpApprovalStatus;
  toolName: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown> | null;
  resolvedAt: Date | null;
  createdAt: Date;
  /** Slugs that scope the approval's web link; null when unresolved. */
  organizationSlug?: string | null;
  brandSlug?: string | null;
};

type McpApprovalListResponse = {
  data: McpApprovalResponse[];
  links: FrontendPagination['links'];
};

@ApiTags('MCP Approvals')
@AutoSwagger()
@Controller('mcp-approvals')
export class McpApprovalsController {
  constructor(
    private readonly service: McpApprovalsService,
    private readonly policy: McpApprovalPolicyService,
    private readonly rolesGuard: RolesGuard,
    private readonly configService: ConfigService,
    readonly _logger: LoggerService,
  ) {}

  private toResponse(approval: McpApprovalDocument): McpApprovalResponse {
    return {
      id: approval.id,
      status: approval.status as McpApprovalStatus,
      toolName: approval.toolName,
      arguments: (approval.arguments as Record<string, unknown>) ?? {},
      result: (approval.result as Record<string, unknown> | null) ?? null,
      resolvedAt: approval.resolvedAt as Date | null,
      createdAt: approval.createdAt as Date,
    };
  }

  private async toScopedResponse(
    approval: McpApprovalDocument,
  ): Promise<McpApprovalResponse> {
    return {
      ...this.toResponse(approval),
      ...(await this.service.findLinkScope(approval)),
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a pending MCP approval request' })
  @ApiResponse({ description: 'Approval created', status: HttpStatus.CREATED })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateMcpApprovalDto,
  ): Promise<{ data: McpApprovalResponse }> {
    assertMcpAccessModeAllowsTool(user, dto.toolName, 'mcp');
    const organization = user.organizationId;
    const userId = user.userId ?? user.id;
    const result = await this.service.createPending(
      organization,
      userId,
      dto.toolName,
      dto.arguments,
    );
    return { data: await this.toScopedResponse(result) };
  }

  @TenantReadPolicy('selected')
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List MCP approval requests for the organization' })
  @ApiResponse({ description: 'Approvals returned', status: HttpStatus.OK })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: McpApprovalsQueryDto,
  ): Promise<McpApprovalListResponse> {
    const readScope = resolveTenantReadScope(user);
    const organization = readScope.organizationId;
    const list = await this.service.findByOrganization(organization, query);
    const { links } = transformPaginationFormat(list);
    return { data: list.docs.map((a) => this.toResponse(a)), links };
  }

  @TenantReadPolicy('selected')
  @Get('policy')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Whether the connected member's MCP requests that spend credits wait for approval",
  })
  async approvalPolicy(
    @CurrentUser() user: User,
  ): Promise<{ data: { isApprovalRequired: boolean } }> {
    const isApprovalRequired = await this.policy.isApprovalRequired(
      user.organizationId,
      user.userId ?? user.id,
    );
    return { data: { isApprovalRequired } };
  }

  @TenantReadPolicy('selected')
  @Get(':id/pricing')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read the server-prepared approval quote for the connected actor',
  })
  async pricing(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const pricing = await this.service.findPricingForActor(id, user);
    return McpApprovalPricingSerializer.serialize(
      pricing,
    ) as JsonApiSingleResponse;
  }

  @TenantReadPolicy('selected')
  @Get(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read minimal approval job status for the connected actor',
  })
  async status(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const approval = await this.service.findStatusForActor(id, user);
    return McpApprovalStatusSerializer.serialize(
      approval,
    ) as JsonApiSingleResponse;
  }

  @TenantReadPolicy('selected')
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a single MCP approval by ID' })
  @ApiResponse({ description: 'Approval returned', status: HttpStatus.OK })
  async findOne(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<{ data: McpApprovalResponse }> {
    const readScope = resolveTenantReadScope(user);
    const organization = readScope.organizationId;
    const approval = await this.service.findOne(
      scopedWhere(organization, { id }),
    );

    if (!approval) {
      throw new NotFoundException('MCP approval');
    }

    return { data: await this.toScopedResponse(approval) };
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiOperation({ summary: 'Resolve (approve or decline) an MCP approval' })
  @ApiResponse({ description: 'Approval resolved', status: HttpStatus.OK })
  async resolve(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ResolveMcpApprovalDto,
  ): Promise<{ data: McpApprovalResponse }> {
    // An MCP session may be driven by a model reading untrusted content, so it
    // must not approve its own queued write; approval happens in the review
    // inbox. Declining only cancels, so it stays allowed.
    if (dto.decision === 'approve' && user.actionOrigin === ActionOrigin.MCP) {
      throw new ForbiddenException(
        'Approve MCP actions in the Genfeed review inbox, not through MCP.',
      );
    }
    const metadata = user;
    const result = await this.service.resolve(
      id,
      metadata.organizationId,
      dto.decision,
      dto.result,
      metadata,
    );
    return { data: this.toResponse(result) };
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiOperation({
    summary:
      "Record the requester's own answer to an MCP approval, given in their MCP client",
  })
  @ApiResponse({ description: 'Approval resolved', status: HttpStatus.OK })
  async confirm(
    @CurrentUser() user: User,
    @Req() request: Request,
    @Param('id') id: string,
    @Body() dto: ResolveMcpApprovalDto,
  ): Promise<{ data: McpApprovalResponse }> {
    // Only the Genfeed MCP server holds the key behind this proof, and it calls
    // this route only with the person's answer to the approval prompt their MCP
    // client showed them (#9647). That answer never passes through the model,
    // and the model's own `resolve_approval` approve stays refused above.
    if (
      !isTrustedMcpOriginProof(
        this.configService.get('GENFEEDAI_API_KEY'),
        request.headers[MCP_ACTION_ORIGIN_PROOF_HEADER],
      )
    ) {
      throw new ForbiddenException(
        'Answers given in a conversation are accepted only from the Genfeed MCP server.',
      );
    }
    const approval = await this.service.findOne(
      scopedWhere(user.organizationId, { id }),
    );
    if (!approval) {
      throw new NotFoundException('MCP approval');
    }
    if (approval.userId !== (user.userId ?? user.id)) {
      throw new ForbiddenException(
        'Only the member who asked for this action can answer it in their conversation. Use the Genfeed review inbox.',
      );
    }
    const result = await this.service.resolve(
      id,
      user.organizationId,
      dto.decision,
      undefined,
      user,
    );
    return { data: this.toResponse(result) };
  }

  @Post(':id/claim')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @ApiOperation({
    summary: 'Claim an approved MCP action for its single execution',
  })
  @ApiResponse({ description: 'Claim outcome', status: HttpStatus.OK })
  async claim(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<{ data: { id: string; isClaimed: boolean } }> {
    const isClaimed = await this.service.claimExecutionForActor(
      id,
      user.organizationId,
      user.userId ?? user.id,
      await this.isReviewer(req, user),
    );
    return { data: { id, isClaimed } };
  }

  @Post(':id/result')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @ApiOperation({
    summary: 'Attach the execution result to an approved MCP approval',
  })
  @ApiResponse({ description: 'Result attached', status: HttpStatus.OK })
  async attachResult(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: AttachMcpApprovalResultDto,
  ): Promise<{ data: McpApprovalResponse }> {
    const organization = user.organizationId;
    // Whoever may claim the run may record its outcome (#7340): otherwise a
    // requester's inbox-approved run stays claimed with no result forever.
    await this.service.attachResultForActor(
      id,
      organization,
      user.userId ?? user.id,
      await this.isReviewer(req, user),
      dto.result,
    );

    const approval = await this.service.findOne(
      scopedWhere(organization, { id }),
    );

    if (!approval) {
      throw new NotFoundException('MCP approval');
    }

    return { data: this.toResponse(approval) };
  }

  private isReviewer(req: Request, user: User): Promise<boolean> {
    return this.rolesGuard
      .assertRoles(Object.assign(req, { user }), [
        MemberRole.OWNER,
        MemberRole.ADMIN,
      ])
      .catch(() => false);
  }
}
