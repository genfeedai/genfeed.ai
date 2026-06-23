import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AttachMcpApprovalResultDto } from '@api/collections/mcp-approvals/dto/attach-mcp-approval-result.dto';
import { CreateMcpApprovalDto } from '@api/collections/mcp-approvals/dto/create-mcp-approval.dto';
import { ResolveMcpApprovalDto } from '@api/collections/mcp-approvals/dto/resolve-mcp-approval.dto';
import type { McpApprovalDocument } from '@api/collections/mcp-approvals/schemas/mcp-approval.schema';
import { McpApprovalsService } from '@api/collections/mcp-approvals/services/mcp-approvals.service';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { MemberRole } from '@genfeedai/enums';
import { McpApprovalStatus } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
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
    private readonly logger: LoggerService,
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
    const { organization, user: userId } = getPublicMetadata(user);
    const result = await this.service.createPending(
      organization,
      userId,
      dto.toolName,
      dto.arguments,
    );
    return { data: this.toResponse(result) };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List MCP approval requests for the organization' })
  @ApiResponse({ description: 'Approvals returned', status: HttpStatus.OK })
  async findAll(
    @CurrentUser() user: User,
    @Query('status', new ParseEnumPipe(McpApprovalStatus, { optional: true }))
    status?: McpApprovalStatus,
  ): Promise<{ data: McpApprovalResponse[] }> {
    const { organization } = getPublicMetadata(user);
    const list = await this.service.findByOrganization(organization, status);
    return { data: list.map((a) => this.toResponse(a)) };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a single MCP approval by ID' })
  @ApiResponse({ description: 'Approval returned', status: HttpStatus.OK })
  async findOne(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<{ data: McpApprovalResponse }> {
    const { organization } = getPublicMetadata(user);
    const approval = await this.service.findOne({
      id,
      organizationId: organization,
      isDeleted: false,
    });

    if (!approval) {
      throw new NotFoundException('MCP approval not found');
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
    const { organization } = getPublicMetadata(user);
    const result = await this.service.resolve(
      id,
      organization,
      dto.decision,
      dto.result,
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
    const { organization } = getPublicMetadata(user);
    await this.service.attachResult(id, organization, dto.result);

    const approval = await this.service.findOne({
      id,
      organizationId: organization,
      isDeleted: false,
    });

    if (!approval) {
      throw new NotFoundException('MCP approval not found');
    }

    return { data: this.toResponse(approval) };
  }
}
