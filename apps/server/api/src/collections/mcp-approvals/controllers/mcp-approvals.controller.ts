import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AttachMcpApprovalResultDto } from '@api/collections/mcp-approvals/dto/attach-mcp-approval-result.dto';
import { CreateMcpApprovalDto } from '@api/collections/mcp-approvals/dto/create-mcp-approval.dto';
import { ResolveMcpApprovalDto } from '@api/collections/mcp-approvals/dto/resolve-mcp-approval.dto';
import type { McpApprovalDocument } from '@api/collections/mcp-approvals/schemas/mcp-approval.schema';
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
import { MemberRole } from '@genfeedai/contracts';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { McpApprovalStatus } from '@genfeedai/prisma';
import {
  McpApprovalPricingSerializer,
  McpApprovalStatusSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

type McpApprovalResponse = {
  id: string;
  status: McpApprovalStatus;
  toolName: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown> | null;
  resolvedAt: Date | null;
  createdAt: Date;
};

@ApiTags('MCP Approvals')
@AutoSwagger()
@Controller('mcp-approvals')
export class McpApprovalsController {
  constructor(
    private readonly service: McpApprovalsService,
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
    return { data: this.toResponse(result) };
  }

  @TenantReadPolicy('selected')
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List MCP approval requests for the organization' })
  @ApiResponse({ description: 'Approvals returned', status: HttpStatus.OK })
  async findAll(
    @CurrentUser() user: User,
    @Query('status', new ParseEnumPipe(McpApprovalStatus, { optional: true }))
    status?: McpApprovalStatus,
  ): Promise<{ data: McpApprovalResponse[] }> {
    const readScope = resolveTenantReadScope(user);
    const organization = readScope.organizationId;
    const list = await this.service.findByOrganization(organization, status);
    return { data: list.map((a) => this.toResponse(a)) };
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

    return { data: this.toResponse(approval) };
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

  @Post(':id/result')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiOperation({
    summary: 'Attach the execution result to an approved MCP approval',
  })
  @ApiResponse({ description: 'Result attached', status: HttpStatus.OK })
  async attachResult(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: AttachMcpApprovalResultDto,
  ): Promise<{ data: McpApprovalResponse }> {
    const organization = user.organizationId;
    await this.service.attachResult(id, organization, dto.result);

    const approval = await this.service.findOne(
      scopedWhere(organization, { id }),
    );

    if (!approval) {
      throw new NotFoundException('MCP approval');
    }

    return { data: this.toResponse(approval) };
  }
}
