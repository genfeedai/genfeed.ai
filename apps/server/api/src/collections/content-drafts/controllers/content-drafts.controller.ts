import { BulkApproveContentDraftsDto } from '@api/collections/content-drafts/dto/bulk-approve-content-drafts.dto';
import { ContentDraftRejectDto } from '@api/collections/content-drafts/dto/content-draft-action.dto';
import { ContentDraftsQueryDto } from '@api/collections/content-drafts/dto/content-drafts-query.dto';
import { EditContentDraftDto } from '@api/collections/content-drafts/dto/edit-content-draft.dto';
import { ContentDraftsService } from '@api/collections/content-drafts/services/content-drafts.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { ContentDraftSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('ContentDrafts')
@Controller()
export class ContentDraftsController {
  constructor(private readonly contentDraftsService: ContentDraftsService) {}

  @Get('brands/:brandId/content-drafts')
  async listDrafts(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
    @Query() query: ContentDraftsQueryDto,
  ) {
    const { organization } = getPublicMetadata(user);
    const docs = await this.contentDraftsService.listByBrand(
      organization,
      brandId,
      query.status,
    );
    return serializeCollection(req, ContentDraftSerializer, { docs });
  }

  @Patch('content-drafts/:id/approve')
  async approveDraft(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const { organization, user: userId } = getPublicMetadata(user);
    const data = await this.contentDraftsService.approve(
      id,
      organization,
      userId,
    );
    return serializeSingle(req, ContentDraftSerializer, data);
  }

  @Patch('content-drafts/:id/reject')
  async rejectDraft(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ContentDraftRejectDto,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.contentDraftsService.reject(
      id,
      organization,
      dto.reason,
    );
    return serializeSingle(req, ContentDraftSerializer, data);
  }

  @Patch('content-drafts/:id/edit')
  async editDraft(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: EditContentDraftDto,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.contentDraftsService.editDraft(
      id,
      organization,
      dto.content,
    );
    return serializeSingle(req, ContentDraftSerializer, data);
  }

  @Post('content-drafts/bulk-approve')
  bulkApprove(
    @CurrentUser() user: User,
    @Body() dto: BulkApproveContentDraftsDto,
  ) {
    const { organization, user: userId } = getPublicMetadata(user);
    return this.contentDraftsService.bulkApprove(dto.ids, organization, userId);
  }
}
