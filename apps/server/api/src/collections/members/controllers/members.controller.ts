import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { InvitationsQueryDto } from '@api/collections/members/dto/invitations-query.dto';
import { InvitationService } from '@api/collections/members/services/invitation.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { scopedWhere } from '@api/index';
import { MemberRole } from '@genfeedai/enums';
import type { JsonApiCollectionResponse } from '@genfeedai/interfaces';
import {
  MemberInvitationSerializer,
  MemberSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
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

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const data = await this.membersService.findAll(
      {
        orderBy: handleQuerySort(query.sort),
        where: {
          isDeleted,
          userId: user.userId ?? user.id,
        },
      },
      options,
    );
    return serializeCollection(request, MemberSerializer, data);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Invitation endpoints
  //
  // These MUST stay declared above `@Get(':memberId')`. Nest matches routes in
  // declaration order, so a wildcard param segment declared first swallows every
  // static sibling path (`/members/invitations` would resolve to findOne with
  // memberId='invitations').
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * GET /members/invitations
   * List invitations for the current organization, optionally filtered by status.
   */
  @Get('invitations')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async listInvitations(
    @Req() request: Request,
    @Query() query: InvitationsQueryDto,
    @CurrentUser() user: User,
  ): Promise<unknown> {
    const orgId = user.organizationId;

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

    return serializeCollection(request, MemberInvitationSerializer, {
      docs: invitations,
    });
  }

  /**
   * DELETE /members/invitations/:invitationId
   * Revoke a pending invitation.
   */
  @Delete('invitations/:invitationId')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async revokeInvitation(
    @Req() request: Request,
    @Param('invitationId') invitationId: string,
    @CurrentUser() user: User,
  ): Promise<unknown> {
    const orgId = user.organizationId;

    if (!orgId) {
      throw new HttpException(
        { detail: 'Organization not found in metadata', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const invitation = await this.invitationService.revokeInvitation(
      invitationId,
      orgId,
    );

    return serializeSingle(request, MemberInvitationSerializer, invitation);
  }

  /**
   * POST /members/invitations/:invitationId/resend
   * Resend a pending invitation email.
   */
  @Post('invitations/:invitationId/resend')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async resendInvitation(
    @Req() request: Request,
    @Param('invitationId') invitationId: string,
    @CurrentUser() user: User,
  ): Promise<unknown> {
    const orgId = user.organizationId;

    if (!orgId) {
      throw new HttpException(
        { detail: 'Organization not found in metadata', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!(user.userId ?? user.id)) {
      throw new HttpException(
        { detail: 'Inviting user not found in metadata', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const newInvitation = await this.invitationService.resendInvitation({
      invitationId,
      invitedByUserId: String(user.userId ?? user.id),
      organizationId: orgId,
    });

    return serializeSingle(request, MemberInvitationSerializer, newInvitation);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Wildcard param routes — keep last so static sibling paths win.
  // ────────────────────────────────────────────────────────────────────────────

  @Get(':memberId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('memberId') memberId: string,
  ) {
    const organizationId = user.organizationId;

    // Tenant scoping has to live here: RolesGuard only proves the CALLER is an
    // active member of their OWN organization — it never inspects the requested
    // member. Without this filter any authenticated user could read another
    // org's roster, role assignments and brand assignments by id.
    // A missing/invalid org context is fail-closed (404), never an unscoped read.
    if (!isEntityId(memberId) || !isEntityId(organizationId)) {
      return returnNotFound(this.constructorName, memberId);
    }

    const data = await this.membersService.findOne(
      scopedWhere(organizationId, { id: memberId }),
    );
    // 404 (not 403) on a cross-org miss, matching base-crud.controller.ts — the
    // response must not confirm that the id exists in another organization.
    return data
      ? serializeSingle(request, MemberSerializer, data)
      : returnNotFound(this.constructorName, memberId);
  }
}
