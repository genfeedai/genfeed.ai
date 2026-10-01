import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import {
  LearningConsentDto,
  LearningReceivingDto,
} from '@api/collections/content-learning/dto/learning-consent.dto';
import { LearningControlDto } from '@api/collections/content-learning/dto/learning-control.dto';
import { LearningEligibilityDto } from '@api/collections/content-learning/dto/learning-eligibility.dto';
import { LearningQueryDto } from '@api/collections/content-learning/dto/learning-query.dto';
import { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import { LearningOperationService } from '@api/collections/content-learning/services/learning-operation.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import {
  ContentLearningAccountSerializer,
  ContentLearningEvidenceSerializer,
  ContentLearningOperationSerializer,
  ContentLearningPolicySerializer,
} from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
@Controller('content-learning')
@UseGuards(RolesGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class ContentLearningController {
  constructor(
    private readonly accounts: LearningAccountService,
    private readonly operations: LearningOperationService,
    private readonly prisma: PrismaService,
  ) {}
  private async actor(user: AuthenticatedUser) {
    const actor = {
      organizationId: user.organizationId,
      actorId: user.userId ?? user.id,
    };
    await this.operations.assertMember(actor);
    return actor;
  }
  @Get('accounts') async accountsList(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: LearningQueryDto,
  ) {
    const actor = await this.actor(user);
    if (!query.brandId) throw new BadRequestException('brandId required');
    return serializeCollection(request, ContentLearningAccountSerializer, {
      docs: await this.accounts.list(actor, query.brandId),
    });
  }
  @Get('accounts/:credentialId') async account(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('credentialId') credentialId: string,
  ) {
    const actor = await this.actor(user);
    return serializeSingle(
      request,
      ContentLearningAccountSerializer,
      await this.accounts.read(actor.organizationId, credentialId),
    );
  }
  @Get('accounts/:credentialId/evidence') async evidence(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('credentialId') credentialId: string,
    @Query() query: LearningQueryDto,
  ) {
    const actor = await this.actor(user);
    await this.accounts.credential(actor.organizationId, credentialId);
    return serializeCollection(request, ContentLearningEvidenceSerializer, {
      docs: await this.prisma.contentLearningCheckpoint.findMany({
        where: {
          organizationId: actor.organizationId,
          credentialId,
          isDeleted: false,
        },
        take: query.limit,
        skip: (query.page - 1) * query.limit,
        orderBy: { receivedAt: 'desc' },
      }),
    });
  }
  @Get('decisions/:id') async decision(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const actor = await this.actor(user);
    const row = await this.prisma.contentLearningDecision.findFirst({
      where: { id, organizationId: actor.organizationId, isDeleted: false },
    });
    if (!row) throw new NotFoundException('Decision not found');
    await this.accounts.credential(actor.organizationId, row.credentialId);
    return serializeSingle(request, ContentLearningEvidenceSerializer, row);
  }
  @Get('policies/:id') async policy(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const actor = await this.actor(user);
    const row = await this.prisma.contentLearningPolicyVersion.findFirst({
      where: { id, organizationId: actor.organizationId, isDeleted: false },
    });
    if (!row) throw new NotFoundException('Policy not found');
    await this.accounts.credential(actor.organizationId, row.credentialId);
    return serializeSingle(request, ContentLearningPolicySerializer, row);
  }
  @Post('accounts/:credentialId/control')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  async control(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('credentialId') credentialId: string,
    @Body() body: LearningControlDto,
  ) {
    return serializeSingle(
      request,
      ContentLearningOperationSerializer,
      await this.accounts.control(await this.actor(user), credentialId, body),
    );
  }
  @Patch('accounts/:credentialId/sharing')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  async sharing(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('credentialId') credentialId: string,
    @Body() body: LearningConsentDto,
  ) {
    return serializeSingle(
      request,
      ContentLearningOperationSerializer,
      await this.accounts.sharing(await this.actor(user), credentialId, body),
    );
  }
  @Patch('accounts/:credentialId/shared-release')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  async receiving(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('credentialId') credentialId: string,
    @Body() body: LearningReceivingDto,
  ) {
    return serializeSingle(
      request,
      ContentLearningOperationSerializer,
      await this.accounts.receiving(await this.actor(user), credentialId, body),
    );
  }
  @Post('posts/:postId/eligibility')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  async eligibility(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId') postId: string,
    @Body() body: LearningEligibilityDto,
  ) {
    return serializeSingle(
      request,
      ContentLearningOperationSerializer,
      await this.accounts.attest(await this.actor(user), postId, body),
    );
  }
  @Patch('brands/:brandId/shared-release')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  async brandReceiving(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Body() body: LearningReceivingDto,
  ) {
    return serializeSingle(
      request,
      ContentLearningOperationSerializer,
      await this.accounts.brandReceiving(await this.actor(user), brandId, body),
    );
  }
}
