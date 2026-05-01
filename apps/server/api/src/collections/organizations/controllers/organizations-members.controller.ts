/**
 * Organizations Members Controller
 * Handles organization membership management:
 * - List organization members
 * - Add new members/invite users
 * - Update member roles and permissions
 * - Remove members
 * - Manage member settings
 */
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { InviteMemberDto } from '@api/collections/members/dto/invite-member.dto';
import { UpdateMemberDto } from '@api/collections/members/dto/update-member.dto';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { ConfigService } from '@api/config/config.service';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { MemberCreditsGuard } from '@api/helpers/guards/member-credits/member-credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { generateLabel } from '@api/shared/utils/label/label.util';
import type { User } from '@clerk/backend';
import type { JsonApiCollectionResponse } from '@genfeedai/interfaces';
import { MemberSerializer } from '@genfeedai/serializers';
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
  UseInterceptors,
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
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly rolesService: RolesService,
    private readonly settingsService: SettingsService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly clerkService: ClerkService,
    private readonly brandsService: BrandsService,
  ) {}

  @Get(':organizationId/members')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllMembers(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
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
          organization: organizationId,
        },
      },
      options,
    );
    return serializeCollection(request, MemberSerializer, data);
  }

  @Post(':organizationId/members')
  @UseGuards(MemberCreditsGuard)
  @UseInterceptors(CreditsInterceptor)
  @Credits({ amount: 1000, description: 'Invite member' })
  async inviteMember(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Body() inviteDto: InviteMemberDto,
    @CurrentUser() _user: User,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { inviteDto, params: { organizationId } });

    const organization = await this.organizationsService.findOne({
      _id: organizationId,
    });
    if (!organization) {
      return returnNotFound(this.constructorName, organizationId);
    }

    // Check if a Clerk user already exists with this email
    const existingClerkUser = await this.clerkService.getUserByEmail(
      inviteDto.email,
    );

    let existingUser;

    if (existingClerkUser) {
      // User already has a Clerk brand
      existingUser = await this.usersService.findOne({
        clerkId: existingClerkUser.id,
      });

      if (!existingUser) {
        // Create user record for existing Clerk user
        const emailPrefix = inviteDto.email.split('@')[0];
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const handle = `${emailPrefix}-${randomSuffix}`;

        existingUser = await this.usersService.create({
          avatar: existingClerkUser.imageUrl || undefined,
          clerkId: existingClerkUser.id,
          email: inviteDto.email,
          firstName:
            inviteDto.firstName || existingClerkUser.firstName || undefined,
          handle,
          lastName:
            inviteDto.lastName || existingClerkUser.lastName || undefined,
        });
      }

      // Check if member already exists for this organization
      const member = await this.membersService.findOne({
        organization: organizationId,
        user: existingUser._id,
      });

      if (member) {
        // Member already exists, just return it
        return serializeSingle(request, MemberSerializer, member);
      }

      // Continue to create member for existing Clerk user below
    } else {
      // For new users (not yet in Clerk), check if email is already invited to another org
      // We need to check if there's a pending invitation for this email in another org
      // This would be stored in Clerk's invitation system, but we can also check our DB
      // No Clerk user exists yet - we'll create the member after they sign up
      // For now, just send the Clerk invitation
    }

    // Determine role to assign
    let roleToAssign = inviteDto.role;
    if (!roleToAssign) {
      const defaultRole = await this.rolesService.findOne({ key: 'user' });
      if (!defaultRole) {
        throw new HttpException(
          {
            detail: 'Unable to find default user role',
            title: 'Default role not found',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      roleToAssign = defaultRole._id;
    }

    if (existingClerkUser && existingUser) {
      // Only create member for existing Clerk users
      const limit = (
        request as unknown as { seatsLimit?: { id: string; current: number } }
      ).seatsLimit;
      let limitUpdated = false;

      try {
        // Atomically update the seats limit
        if (limit) {
          await this.organizationSettingsService.updateSeatsLimit(
            limit.id,
            limit.current + 1,
          );
          limitUpdated = true;
        }

        // Create the member record for existing user
        const member = await this.membersService.create({
          isActive: true, // Always active for existing Clerk users
          organizationId,
          roleId: String(roleToAssign),
          userId: String(existingUser._id),
        } as unknown as Parameters<typeof this.membersService.create>[0]);

        // Update their metadata to include this organization
        await this.clerkService.updateUserPublicMetadata(existingClerkUser.id, {
          organization: organizationId,
        });

        return serializeSingle(request, MemberSerializer, member);
      } catch (error: unknown) {
        // Rollback the limit if something fails
        if (limitUpdated && limit) {
          await this.organizationSettingsService.updateSeatsLimit(
            limit.id,
            limit.current,
          );
        }
        throw error;
      }
    } else {
      // New user - first check if a pending invited user with this email already exists
      let newUser = await this.usersService.findOne({
        email: inviteDto.email,
        isInvited: true,
      });

      if (newUser) {
        // Check if this pending user is already in a member relationship
        const existingMembership = await this.membersService.findOne({
          isDeleted: false,
          user: newUser._id,
        });

        if (existingMembership) {
          throw new HttpException(
            {
              detail: `This email address has already been invited to an organization.`,
              title: 'User already invited',
            },
            HttpStatus.CONFLICT,
          );
        }

        // User exists but not a member anywhere, we can reuse them
      } else {
        // Create new user
        const handle = generateLabel('user');

        // Generate a temporary Clerk ID (will be updated when user signs up)
        const tempClerkId = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        // Create the user with isInvited flag
        newUser = await this.usersService.create({
          clerkId: tempClerkId, // Temporary ID until they sign up
          email: inviteDto.email,
          firstName: inviteDto.firstName || undefined,
          handle,
          isInvited: true, // Mark as invited
          lastName: inviteDto.lastName || undefined,
        } as Parameters<typeof this.usersService.create>[0]);
      }

      // Create settings for the invited user (if they don't exist)
      const existingSettings = await this.settingsService.findOne({
        user: newUser._id,
      });

      if (!existingSettings) {
        await this.settingsService.create({
          isFirstLogin: true,
          isMenuCollapsed: false,
          isVerified: false,
          theme: 'dark',
          userId: String(newUser._id),
        } as unknown as Parameters<typeof this.settingsService.create>[0]);
      }

      // Create the member record (inactive until they sign up)
      const limit = (
        request as unknown as { seatsLimit?: { id: string; current: number } }
      ).seatsLimit;
      let limitUpdated = false;

      try {
        // Atomically update the seats limit
        if (limit) {
          await this.organizationSettingsService.updateSeatsLimit(
            limit.id,
            limit.current + 1,
          );
          limitUpdated = true;
        }

        const member = await this.membersService.create({
          isActive: false, // Inactive until they sign up
          organizationId,
          roleId: String(roleToAssign),
          userId: String(newUser._id),
        } as unknown as Parameters<typeof this.membersService.create>[0]);

        // Send Clerk invitation with metadata including the user ID
        await this.clerkService.createInvitation(
          inviteDto.email,
          `${this.configService.get('GENFEEDAI_APP_URL')}/login?org=${organizationId}`,
          {
            invitedFirstName: inviteDto.firstName,
            invitedLastName: inviteDto.lastName,
            organizationId: organizationId,
            roleId: roleToAssign.toString(),
            userId: newUser._id, // Include the pre-created user ID
          },
        );

        return serializeSingle(request, MemberSerializer, member);
      } catch (error: unknown) {
        // Rollback the limit if something fails
        if (limitUpdated && limit) {
          await this.organizationSettingsService.updateSeatsLimit(
            limit.id,
            limit.current,
          );
        }
        throw error;
      }
    }
  }

  @Patch(':organizationId/members/:memberId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateMember(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
    @Body() updateMemberDto: UpdateMemberDto,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, {
      params: { memberId, organizationId },
      updateMemberDto,
    });

    // Verify organization exists
    const organization = await this.organizationsService.findOne({
      _id: organizationId,
    });
    if (!organization) {
      return returnNotFound('Organization', organizationId);
    }

    // Verify member exists and belongs to this organization
    const member = await this.membersService.findOne({
      _id: memberId,
      organization: organizationId,
    });

    if (!member) {
      return returnNotFound('Member', memberId);
    }

    const brandIds = updateMemberDto.brands ?? [];

    const options = {
      customLabels,
      pagination: false,
    };

    const validBrands = await this.brandsService.findAll(
      {
        where: {
          _id: { in: brandIds },
          isDeleted: false,
          organization: organizationId,
        },
      },
      options,
    );

    if (validBrands.docs.length !== (updateMemberDto.brands?.length || 0)) {
      throw new HttpException(
        {
          detail: 'One or more brands do not belong to this organization',
          title: 'Invalid brands',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Update the member
    const updatedMember = await this.membersService.patch(
      memberId,
      updateMemberDto,
    );

    return serializeSingle(request, MemberSerializer, updatedMember);
  }
}
