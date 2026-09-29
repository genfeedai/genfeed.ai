import { ReorderFeaturedWorkflowsDto } from '@api/collections/workflows/dto/reorder-featured-workflows.dto';
import { FeaturedWorkflowsService } from '@api/collections/workflows/services/featured-workflows.service';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import type { IFeaturedWorkflowPinsResponse } from '@genfeedai/contracts/interfaces';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Superadmin curation of the templates page Featured row (#5511). Pins are
 * platform-wide and every organization sees them, so these endpoints sit
 * behind the same IP allowlist and superadmin guards as the other platform
 * settings. Every write answers with the pins as stored after it.
 */
@ApiTags('Admin / Featured Workflows')
@Controller('admin/featured-workflows')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class FeaturedWorkflowsController {
  constructor(
    private readonly featuredWorkflowsService: FeaturedWorkflowsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List the pinned Featured workflows in order' })
  async list(): Promise<IFeaturedWorkflowPinsResponse> {
    return { data: await this.featuredWorkflowsService.listPinned() };
  }

  @Put('order')
  @ApiOperation({ summary: 'Reorder the pinned Featured workflows' })
  async reorder(
    @Body() dto: ReorderFeaturedWorkflowsDto,
  ): Promise<IFeaturedWorkflowPinsResponse> {
    return {
      data: await this.featuredWorkflowsService.reorder(dto.workflowIds),
    };
  }

  @Put(':workflowId')
  @ApiOperation({ summary: 'Pin a workflow to the end of Featured' })
  async pin(
    @Param('workflowId') workflowId: string,
  ): Promise<IFeaturedWorkflowPinsResponse> {
    return { data: await this.featuredWorkflowsService.pin(workflowId) };
  }

  @Delete(':workflowId')
  @ApiOperation({ summary: 'Unpin a workflow from Featured' })
  async unpin(
    @Param('workflowId') workflowId: string,
  ): Promise<IFeaturedWorkflowPinsResponse> {
    return { data: await this.featuredWorkflowsService.unpin(workflowId) };
  }
}
