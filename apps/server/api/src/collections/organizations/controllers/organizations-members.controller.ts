/**
 * Organizations Members Controller
 * Handles organization membership management:
 * - List organization members
 * - Add new members/invite users
 * - Update member roles and permissions
 * - Remove members
 * - Manage member settings
 */

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { InviteMemberDto } from '@api/collections/members/dto/invite-member.dto';
import { UpdateMemberDto } from '@api/collections/members/dto/update-member.dto';
import { InvitationService } from '@api/collections/members/services/invitation.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { MemberCreditsGuard } from '@api/helpers/guards/member-credits/member-credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { MemberRole } from '@genfeedai/contracts';
import type { JsonApiCollectionResponse } from '@genfeedai/contracts/interfaces';
import {
  MemberInvitationSerializer,
  MemberSerializer,
} from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
@UseGuards(RolesGuard)
export class OrganizationsMembersController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly membersService: MembersService,
    private readonly organizationsService: OrganizationsService,
    private readonly configService: ConfigService,
    private readonly invitationService: InvitationService,
    private readonly brandsService: BrandsService,
  ) {}

  @Get(':organizationId/members')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllMembers(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Query() query: BaseQueryDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    this.assertOrganizationScope(user, organizationId);
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const data = await this.membersService.findAll(
      {
        include: {
          brands: true,
          role: true,
          user: true,
        },
        orderBy: handleQuerySort(query.sort),
        where: {
          isDeleted,
          organizationId,
        },
      },
      options,
    );
    return serializeCollection(request, MemberSerializer, data);
  }

  @Post(':organizationId/members')
  @UseGuards(MemberCreditsGuard)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  async inviteMember(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Body() inviteDto: InviteMemberDto,
    @CurrentUser() user: User,
  ) {
    this.assertOrganizationScope(user, organizationId);
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, {
      emailDomain: inviteDto.email.split('@')[1] ?? 'unknown',
      params: { organizationId },
    });

    const organization = await this.organizationsService.findOne({
      id: organizationId,
    });
    if (!organization) {
      return returnNotFound(this.constructorName, organizationId);
    }

    const invitedByUserId = this.getInvitedByUserId(user, organization);
    const invitation = await this.invitationService.createInvitation({
      defaultRoleKey: 'user',
      email: inviteDto.email,
      firstName: inviteDto.firstName,
      invitedByUserId,
      lastName: inviteDto.lastName,
      organizationId,
      redirectUrl: this.getInvitationRedirectUrl(organizationId),
      roleId: inviteDto.roleId,
    });

    return serializeSingle(request, MemberInvitationSerializer, invitation);
  }

  @Patch(':organizationId/members/:memberId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateMember(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
    @Body() updateMemberDto: UpdateMemberDto,
    @CurrentUser() user: User,
  ) {
    this.assertOrganizationScope(user, organizationId);
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, {
      params: { memberId, organizationId },
      updateMemberDto,
    });

    // Verify organization exists
    const organization = await this.organizationsService.findOne({
      id: organizationId,
    });
    if (!organization) {
      return returnNotFound('Organization', organizationId);
    }

    // Verify member exists and belongs to this organization
    const member = await this.membersService.findOne({
      id: memberId,
      organizationId,
    });

    if (!member) {
      return returnNotFound('Member', memberId);
    }

    let memberUpdate = updateMemberDto;

    if (updateMemberDto.brandIds !== undefined) {
      const brandIds = [...new Set(updateMemberDto.brandIds)];
      const options = {
        customLabels,
        pagination: false,
      };

      const validBrands = await this.brandsService.findAll(
        {
          where: {
            id: { in: brandIds },
            isDeleted: false,
            organizationId,
          },
        },
        options,
      );

      if (validBrands.docs.length !== brandIds.length) {
        throw new HttpException(
          {
            detail: 'One or more brands do not belong to this organization',
            title: 'Invalid brands',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      memberUpdate = { ...updateMemberDto, brandIds };
    }

    // Update the member
    const updatedMember = await this.membersService.patch(
      memberId,
      memberUpdate,
    );

    return serializeSingle(request, MemberSerializer, updatedMember);
  }

  private getInvitedByUserId(
    user: User,
    organization: { userId?: unknown },
  ): string {
    const userId =
      this.toIdString(user.userId ?? user.id) ??
      this.toIdString(organization.userId);

    if (!userId) {
      throw new HttpException(
        {
          detail: 'Unable to resolve inviting user',
          title: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return String(userId);
  }

  private assertOrganizationScope(user: User, organizationId: string): void {
    const callerOrganizationId = this.toIdString(user.organizationId);

    if (!callerOrganizationId || callerOrganizationId !== organizationId) {
      throw new NotFoundException('Organization not found');
    }
  }

  private toIdString(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }

    return undefined;
  }

  private getInvitationRedirectUrl(organizationId: string): string | undefined {
    const appUrl = this.configService.get('GENFEEDAI_APP_URL');

    if (typeof appUrl !== 'string' || appUrl.length === 0) {
      return undefined;
    }

    return `${appUrl.replace(/\/$/, '')}/login?org=${organizationId}`;
  }
}
