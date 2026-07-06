import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { InvitationsQueryDto } from '@api/collections/members/dto/invitations-query.dto';
import { InviteMemberDto } from '@api/collections/members/dto/invite-member.dto';
import { InvitationService } from '@api/collections/members/services/invitation.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { JsonApiCollectionResponse } from '@genfeedai/interfaces';
import { MemberSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('members')
@UseGuards(RolesGuard)
export class MembersController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly membersService: MembersService,
    private readonly invitationService: InvitationService,
    readonly _loggerService: LoggerService,
  ) {}

  @Get()
  @Cache({
    keyGenerator: (req) => {
      const userId = (req.user as { id?: string })?.id ?? 'unknown';
      return `members:list:${userId}`;
    },
    tags: ['members'],
    ttl: 120,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Query() query: BaseQueryDto,
    @Req() request: Request,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const data = await this.membersService.findAll(
      {
        orderBy: handleQuerySort(query.sort),
        where: {
          isDeleted,
          user: publicMetadata.user,
        },
      },
      options,
    );
    return serializeCollection(request, MemberSerializer, data);
  }

  @Get(':memberId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(@Req() request: Request, @Param('memberId') memberId: string) {
    const data = await this.membersService.findOne({ _id: memberId });
    return data
      ? serializeSingle(request, MemberSerializer, data)
      : returnNotFound(this.constructorName, memberId);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Invitation endpoints
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * POST /members/invite
   * Send an invitation to join the current organization.
   * Creates a self-hosted invitation and sends an accept email.
   */
  @Post('invite')
  @RateLimit({ limit: 10, scope: 'organization', windowMs: 60000 })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async invite(
    @Body() dto: InviteMemberDto,
    @CurrentUser() user: User,
  ): Promise<unknown> {
    const publicMetadata = getPublicMetadata(user);
    const orgId = publicMetadata.organization;

    if (!orgId) {
      throw new HttpException(
        { detail: 'Organization not found in metadata', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!publicMetadata.user) {
      throw new HttpException(
        { detail: 'Inviting user not found in metadata', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const invitation = await this.invitationService.createInvitation({
      defaultRoleKey: 'member',
      email: dto.email,
      firstName: dto.firstName,
      invitedByUserId: String(publicMetadata.user),
      lastName: dto.lastName,
      organizationId: orgId,
      roleId: dto.role,
    });

    return {
      data: {
        email: dto.email,
        id: invitation.id,
        organization: orgId,
        role: invitation.roleId,
        status: invitation.status,
      },
    };
  }

  /**
   * GET /members/invitations
   * List invitations for the current organization, optionally filtered by status.
   */
  @Get('invitations')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async listInvitations(
    @Query() query: InvitationsQueryDto,
    @CurrentUser() user: User,
  ): Promise<unknown> {
    const publicMetadata = getPublicMetadata(user);
    const orgId = publicMetadata.organization;

    if (!orgId) {
      throw new HttpException(
        { detail: 'Organization not found in metadata', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const invitations = await this.invitationService.listInvitations(
      orgId,
      query.status,
    );

    return {
      data: invitations.map((inv) => ({
        createdAt: inv.createdAt,
        email: inv.email,
        id: inv.id,
        status: inv.status,
      })),
    };
  }

  /**
   * DELETE /members/invitations/:invitationId
   * Revoke a pending invitation.
   */
  @Delete('invitations/:invitationId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async revokeInvitation(
    @Param('invitationId') invitationId: string,
    @CurrentUser() user: User,
  ): Promise<unknown> {
    const publicMetadata = getPublicMetadata(user);
    const orgId = publicMetadata.organization;

    if (!orgId) {
      throw new HttpException(
        { detail: 'Organization not found in metadata', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.invitationService.revokeInvitation(invitationId, orgId);

    return { data: { id: invitationId, status: 'revoked' } };
  }

  /**
   * POST /members/invitations/:invitationId/resend
   * Resend a pending invitation email.
   */
  @Post('invitations/:invitationId/resend')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async resendInvitation(
    @Param('invitationId') invitationId: string,
    @CurrentUser() user: User,
  ): Promise<unknown> {
    const publicMetadata = getPublicMetadata(user);
    const orgId = publicMetadata.organization;

    if (!orgId) {
      throw new HttpException(
        { detail: 'Organization not found in metadata', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!publicMetadata.user) {
      throw new HttpException(
        { detail: 'Inviting user not found in metadata', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const newInvitation = await this.invitationService.resendInvitation({
      invitationId,
      invitedByUserId: String(publicMetadata.user),
      organizationId: orgId,
    });

    return {
      data: {
        email: newInvitation.email,
        id: newInvitation.id,
        status: newInvitation.status,
      },
    };
  }
}
