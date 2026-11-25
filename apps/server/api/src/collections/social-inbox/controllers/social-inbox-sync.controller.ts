import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { buildSocialInboxScope } from '@api/collections/social-inbox/controllers/social-inbox-scope.util';
import { SocialInboxIngestDto } from '@api/collections/social-inbox/dto/social-inbox-ingest.dto';
import { SocialInboxSyncWorkflowService } from '@api/collections/social-inbox/services/social-inbox-sync-workflow.service';
import type {
  SocialInboxSyncConversationType,
  SocialInboxSyncPlatform,
} from '@api/collections/social-inbox/services/social-inbox-sync-workflow-definition';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  ApiKeyScope,
  MemberRole,
  Platform,
  SocialConversationType,
} from '@genfeedai/contracts';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * The background syncs of the Messages inbox, one route per platform surface.
 * Each hands the work to the sync workflow and answers with the queued job.
 */
@ApiTags('Messages')
@AutoSwagger()
@ApiBearerAuth()
@OrganizationModule('messages')
@Controller('messages')
@UseGuards(RolesGuard)
export class SocialInboxSyncController {
  constructor(
    private readonly syncWorkflowService: SocialInboxSyncWorkflowService,
  ) {}

  @Post('youtube/sync')
  @RequiredScopes(ApiKeyScope.ADMIN)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({
    summary: 'Enqueue a background sync of recent YouTube comments',
  })
  async syncYoutubeComments(
    @CurrentUser() user: User,
    @Body() body: SocialInboxIngestDto,
  ): Promise<{ jobId: string | undefined; status: string }> {
    return this.enqueueSync(
      user,
      body,
      Platform.YOUTUBE,
      SocialConversationType.COMMENT,
    );
  }

  @Post('facebook/sync')
  @RequiredScopes(ApiKeyScope.ADMIN)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({
    summary: 'Enqueue a background sync of recent Facebook Page comments',
  })
  async syncFacebookComments(
    @CurrentUser() user: User,
    @Body() body: SocialInboxIngestDto,
  ): Promise<{ jobId: string | undefined; status: string }> {
    return this.enqueueSync(
      user,
      body,
      Platform.FACEBOOK,
      SocialConversationType.COMMENT,
    );
  }

  @Post('threads/sync')
  @RequiredScopes(ApiKeyScope.ADMIN)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({
    summary: 'Enqueue a background sync of recent Threads replies',
  })
  async syncThreadsReplies(
    @CurrentUser() user: User,
    @Body() body: SocialInboxIngestDto,
  ): Promise<{ jobId: string | undefined; status: string }> {
    return this.enqueueSync(
      user,
      body,
      Platform.THREADS,
      SocialConversationType.COMMENT,
    );
  }

  @Post('instagram/sync')
  @RequiredScopes(ApiKeyScope.ADMIN)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({
    summary: 'Enqueue a background sync of recent Instagram comments',
  })
  async syncInstagramComments(
    @CurrentUser() user: User,
    @Body() body: SocialInboxIngestDto,
  ): Promise<{ jobId: string | undefined; status: string }> {
    return this.enqueueSync(
      user,
      body,
      Platform.INSTAGRAM,
      SocialConversationType.COMMENT,
    );
  }

  @Post('instagram/dms/sync')
  @RequiredScopes(ApiKeyScope.ADMIN)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({
    summary: 'Enqueue a background sync of recent Instagram direct messages',
  })
  async syncInstagramDms(
    @CurrentUser() user: User,
    @Body() body: SocialInboxIngestDto,
  ): Promise<{ jobId: string | undefined; status: string }> {
    return this.enqueueSync(
      user,
      body,
      Platform.INSTAGRAM,
      SocialConversationType.DM,
    );
  }

  @Post('x/sync')
  @RequiredScopes(ApiKeyScope.ADMIN)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({
    summary: 'Enqueue a background sync of recent X mentions and replies',
  })
  async syncXComments(
    @CurrentUser() user: User,
    @Body() body: SocialInboxIngestDto,
  ): Promise<{ jobId: string | undefined; status: string }> {
    return this.enqueueSync(
      user,
      body,
      Platform.TWITTER,
      SocialConversationType.COMMENT,
    );
  }

  @Post('x/dms/sync')
  @RequiredScopes(ApiKeyScope.ADMIN)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({
    summary: 'Enqueue a background sync of recent X direct messages',
  })
  async syncXDms(
    @CurrentUser() user: User,
    @Body() body: SocialInboxIngestDto,
  ): Promise<{ jobId: string | undefined; status: string }> {
    return this.enqueueSync(
      user,
      body,
      Platform.TWITTER,
      SocialConversationType.DM,
    );
  }

  @Post('linkedin/sync')
  @RequiredScopes(ApiKeyScope.ADMIN)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({
    summary: 'Enqueue a background sync of recent LinkedIn comments',
  })
  async syncLinkedInComments(
    @CurrentUser() user: User,
    @Body() body: SocialInboxIngestDto,
  ): Promise<{ jobId: string | undefined; status: string }> {
    return this.enqueueSync(
      user,
      body,
      Platform.LINKEDIN,
      SocialConversationType.COMMENT,
    );
  }

  @Post('linkedin/dms/sync')
  @RequiredScopes(ApiKeyScope.ADMIN)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @ApiOperation({
    summary:
      'Enqueue a background sync of LinkedIn DMs when the connected account permits it',
  })
  async syncLinkedInDms(
    @CurrentUser() user: User,
    @Body() body: SocialInboxIngestDto,
  ): Promise<{ jobId: string | undefined; status: string }> {
    return this.enqueueSync(
      user,
      body,
      Platform.LINKEDIN,
      SocialConversationType.DM,
    );
  }

  /**
   * Ingestion is a triple-nested sweep (credentials x posts x comments) that
   * can blow past the request timeout, so every sync route hands the work to
   * the background worker instead of running it on the request thread. The
   * platform and surface travel on the job rather than the body, so the route
   * stays the only place that names them.
   */
  private async enqueueSync(
    user: User,
    body: SocialInboxIngestDto,
    platform: SocialInboxSyncPlatform,
    conversationType: SocialInboxSyncConversationType,
  ): Promise<{ jobId: string | undefined; status: string }> {
    const scope = buildSocialInboxScope(user);
    const jobId = await this.syncWorkflowService.enqueue({
      brandId: scope.brandId,
      conversationType,
      credentialId: body.credentialId,
      limit: body.limit,
      organizationId: scope.organizationId,
      platform,
      userId: scope.userId,
    });

    return { jobId, status: 'queued' };
  }
}
