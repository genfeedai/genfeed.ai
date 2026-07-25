import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { InvitationsQueryDto } from '@api/collections/members/dto/invitations-query.dto';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { InvitationService } from '@api/collections/members/services/invitation.service';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { MembersService } from '@api/collections/members/services/members.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
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
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import type { JsonApiCollectionResponse } from '@genfeedai/interfaces';
import { MemberSerializer } from '@genfeedai/serializers';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
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
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization;

    // Tenant scoping has to live here: RolesGuard only proves the CALLER is an
    // active member of their OWN organization — it never inspects the requested
    // member. Without this filter any authenticated user could read another
    // org's roster, role assignments and brand assignments by id.
    // A missing/invalid org context is fail-closed (404), never an unscoped read.
    if (!isEntityId(memberId) || !isEntityId(organizationId)) {
      return returnNotFound(this.constructorName, memberId);
    }

    const data = await this.membersService.findOne({
      _id: memberId,
      isDeleted: false,
      organizationId,
    });
    // 404 (not 403) on a cross-org miss, matching base-crud.controller.ts — the
    // response must not confirm that the id exists in another organization.
    return data
      ? serializeSingle(request, MemberSerializer, data)
      : returnNotFound(this.constructorName, memberId);
  }
}
