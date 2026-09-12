import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { extractRequestContext } from '@api/helpers/utils/auth/auth.util';
import { AgentStudioHandoffService } from '@api/services/agent-orchestrator/agent-studio-handoff.service';
import { CreateAgentStudioHandoffDto } from '@api/services/agent-orchestrator/dto/create-agent-studio-handoff.dto';
import type { AgentStudioHandoffPayload } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@AutoSwagger()
@ApiTags('agent-studio-handoff')
@Controller('agent/studio-handoff')
@ApiBearerAuth()
export class AgentStudioHandoffController {
  constructor(
    private readonly handoffService: AgentStudioHandoffService,
    private readonly logger: LoggerService,
  ) {}

  @Post()
  @ApiOperation({
    description:
      '#4670: stores the Agent-resolved prompt/model/parameters as a short-lived, ' +
      'organization-scoped handoff and returns its opaque id. Nothing but the id ' +
      'belongs in the Studio generate URL.',
    summary: 'Create an Agent → Studio generation handoff',
  })
  @ApiResponse({ description: 'Handoff created', status: 201 })
  async create(
    @Body() body: CreateAgentStudioHandoffDto,
    @CurrentUser() user: User,
  ): Promise<{ id: string }> {
    const { organizationId, userId } = extractRequestContext(user);
    const id = await this.handoffService.create(
      { organizationId, userId },
      {
        aspectRatio: body.aspectRatio,
        avatarPhotoUrl: body.avatarPhotoUrl,
        brandId: body.brandId,
        duration: body.duration,
        modelKey: body.modelKey,
        outputs: body.outputs,
        prompt: body.prompt,
        references: body.references,
        resolution: body.resolution,
        type: body.type,
        voiceId: body.voiceId,
      },
    );

    this.logger.log('AgentStudioHandoffController create completed', {
      organizationId,
      type: body.type,
    });

    return { id };
  }

  @Get(':id')
  @ApiOperation({
    description:
      '#4670: single-use — the handoff is deleted the moment this is called, ' +
      'whether or not it belonged to the caller. A missing, expired, already-' +
      'consumed, or foreign handoff 404s; Studio generate falls back to its ' +
      'defaults with a notice.',
    summary: 'Consume an Agent → Studio generation handoff',
  })
  @ApiResponse({ description: 'Handoff payload', status: 200 })
  @ApiResponse({
    description: 'Handoff not found, expired, already consumed, or foreign',
    status: 404,
  })
  async consume(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<AgentStudioHandoffPayload> {
    const { organizationId, userId } = extractRequestContext(user);
    const payload = await this.handoffService.consume(id, {
      organizationId,
      userId,
    });

    if (!payload) {
      throw new NotFoundException({
        message:
          'This handoff is missing, expired, already used, or belongs to someone else.',
      });
    }

    return payload;
  }
}
