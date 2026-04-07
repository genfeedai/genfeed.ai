import { InviteMemberDto } from '@api/collections/members/dto/invite-member.dto';
import { MemberEntity } from '@api/collections/members/entities/member.entity';
import { MemberDocument } from '@api/collections/members/schemas/member.schema';
import { MembersService } from '@api/collections/members/services/members.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { AggregatePaginateResult } from '@api/types/mongoose-aggregate-paginate-v2';
import type { User } from '@clerk/backend';
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
import { type PipelineStage, Types } from 'mongoose';

@AutoSwagger()
@Controller('members')
@UseGuards(RolesGuard)
export class MembersController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly membersService: MembersService,
    private readonly clerkService: ClerkService,
    private readonly rolesService: RolesService,
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
  ): Promise<MemberEntity[]> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const aggregate: PipelineStage[] = [
      {
        $match: {
          isDeleted,
          user: new Types.ObjectId(publicMetadata.user),
        },
      },
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

    const data: AggregatePaginateResult<MemberDocument> =
      await this.membersService.findAll(aggregate, options);
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
   * Creates a Clerk invitation and a pending member record.
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

    // Check for existing active member with this email
    const existingClerkUser = await this.clerkService.getUserByEmail(dto.email);
    if (existingClerkUser) {
      const clerkMeta = existingClerkUser.publicMetadata as Record<
        string,
        unknown
      >;
      const existingMember = await this.membersService.findOne({
        isActive: true,
        isDeleted: false,
        organization: new Types.ObjectId(orgId),
        user: new Types.ObjectId(clerkMeta.user as string),
      });
      if (existingMember) {
        throw new HttpException(
          {
            detail: 'User is already a member of this organization',
            title: 'Conflict',
          },
          HttpStatus.CONFLICT,
        );
      }
    }

    // Resolve role (default to 'member' if not specified)
    let roleId = dto.role;
    if (!roleId) {
      const memberRole = await this.rolesService.findOne({ key: 'member' });
      if (memberRole) {
        roleId = memberRole._id;
      }
    }

    // Create Clerk invitation
    const invitation = await this.clerkService.createInvitation(
      dto.email,
      `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.genfeed.ai'}/overview?org=${orgId}`,
      {
        invitedByUser: publicMetadata.user,
        organization: orgId,
        role: roleId?.toString(),
        ...(dto.firstName && { firstName: dto.firstName }),
        ...(dto.lastName && { lastName: dto.lastName }),
      },
    );

    return {
      data: {
        email: dto.email,
        id: invitation.id,
        organization: orgId,
        role: roleId?.toString() ?? null,
        status: invitation.status,
      },
    };
  }

  /**
   * GET /members/invitations
   * List pending invitations for the current organization.
   */
  @Get('invitations/pending')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async listInvitations(@CurrentUser() user: User): Promise<unknown> {
    const publicMetadata = getPublicMetadata(user);
    const orgId = publicMetadata.organization;

    if (!orgId) {
      throw new HttpException(
        { detail: 'Organization not found in metadata', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Fetch all pending invitations from Clerk and filter by org
    const invitations = await this.clerkService.listInvitations('pending');

    const orgInvitations = invitations.filter((inv) => {
      const meta = inv.publicMetadata as Record<string, unknown>;
      return meta?.organization === orgId;
    });

    return {
      data: orgInvitations.map((inv) => ({
        createdAt: inv.createdAt,
        email: inv.emailAddress,
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

    const invitation = await this.clerkService.getInvitation(invitationId);

    if (!invitation) {
      throw new HttpException(
        { detail: 'Invitation not found', title: 'Not Found' },
        HttpStatus.NOT_FOUND,
      );
    }

    // Verify invitation belongs to this org
    const meta = invitation.publicMetadata as Record<string, unknown>;
    if (meta?.organization !== orgId) {
      throw new HttpException(
        {
          detail: 'Invitation does not belong to this organization',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    await this.clerkService.revokeInvitation(invitationId);

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

    // Verify invitation exists and belongs to this org
    const invitation = await this.clerkService.getInvitation(invitationId);

    if (!invitation) {
      throw new HttpException(
        { detail: 'Invitation not found', title: 'Not Found' },
        HttpStatus.NOT_FOUND,
      );
    }

    const meta = invitation.publicMetadata as Record<string, unknown>;
    if (meta?.organization !== orgId) {
      throw new HttpException(
        {
          detail: 'Invitation does not belong to this organization',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // Revoke old and create new invitation with same params
    await this.clerkService.revokeInvitation(invitationId);
    const newInvitation = await this.clerkService.createInvitation(
      invitation.emailAddress,
      `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.genfeed.ai'}/overview?org=${orgId}`,
      invitation.publicMetadata as Record<string, unknown>,
    );

    return {
      data: {
        email: newInvitation.emailAddress,
        id: newInvitation.id,
        status: newInvitation.status,
      },
    };
  }
}
