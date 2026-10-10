import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  ApproveStoryboardPlanDto,
  CreateStoryboardRunDto,
  ListStoryboardRunsDto,
  ReplaceStoryboardCharacterDto,
  ResetStoryboardPlanDto,
  UpdateStoryboardPlanDto,
  UpdateStoryboardSourceDto,
} from '@api/collections/content-runs/dto/storyboard-run.dto';
import { StoryboardCharacterReplaceService } from '@api/collections/content-runs/services/storyboard-character-replace.service';
import { StoryboardRunCapabilitiesService } from '@api/collections/content-runs/services/storyboard-run-capabilities.service';
import { StoryboardRunsService } from '@api/collections/content-runs/services/storyboard-runs.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import {
  StoryboardRunSerializer,
  StoryboardRunSummarySerializer,
} from '@genfeedai/serializers';
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

@Controller('brands/:brandId/storyboard-runs')
@OrganizationModule('storyboard')
export class StoryboardRunsController {
  constructor(
    private readonly runs: StoryboardRunsService,
    private readonly capabilities: StoryboardRunCapabilitiesService,
    private readonly characters: StoryboardCharacterReplaceService,
  ) {}

  @Post()
  async create(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Body() body: CreateStoryboardRunDto,
  ) {
    return serializeSingle(
      request,
      StoryboardRunSerializer,
      await this.runs.create(user.organizationId, brandId, user.userId, body),
    );
  }

  @TenantReadPolicy('selected')
  @Get()
  async list(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Query() query: ListStoryboardRunsDto,
  ) {
    return serializeCollection(request, StoryboardRunSummarySerializer, {
      docs: await this.runs.list(
        resolveTenantReadScope(user).organizationId,
        brandId,
        query,
      ),
    });
  }

  @TenantReadPolicy('selected')
  @Get(':runId')
  async get(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
  ) {
    return serializeSingle(
      request,
      StoryboardRunSerializer,
      await this.runs.get(
        resolveTenantReadScope(user).organizationId,
        brandId,
        runId,
      ),
    );
  }

  @Post(':runId/shots/:shotId/character-replacement')
  async replaceCharacter(
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @Param('shotId') shotId: string,
    @CurrentUser() user: User,
    @Body() body: ReplaceStoryboardCharacterDto,
  ) {
    return this.characters.replace(
      user.organizationId,
      brandId,
      runId,
      shotId,
      body,
    );
  }

  @TenantReadPolicy('selected')
  @Get(':runId/shots/:shotId/character-replacements')
  characterReplacements(
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @Param('shotId') shotId: string,
    @CurrentUser() user: User,
  ) {
    return this.characters.list(
      resolveTenantReadScope(user).organizationId,
      brandId,
      runId,
      shotId,
    );
  }

  @TenantReadPolicy('mutating')
  @Get(':runId/shots/:shotId/character-replacements/:operationId')
  characterReplacementStatus(
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @Param('shotId') shotId: string,
    @Param('operationId') operationId: string,
    @CurrentUser() user: User,
  ) {
    return this.characters.getStatus(
      user.organizationId,
      brandId,
      runId,
      shotId,
      operationId,
    );
  }

  @TenantReadPolicy('selected')
  @Get(':runId/capabilities')
  async getCapabilities(
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
  ) {
    return this.capabilities.get(
      resolveTenantReadScope(user).organizationId,
      brandId,
      runId,
    );
  }

  @Patch(':runId/plan')
  async updatePlan(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
    @Body() body: UpdateStoryboardPlanDto,
  ) {
    return serializeSingle(
      request,
      StoryboardRunSerializer,
      await this.runs.updatePlan(user.organizationId, brandId, runId, body),
    );
  }

  @Post(':runId/plan/reset')
  async resetPlan(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
    @Body() body: ResetStoryboardPlanDto,
  ) {
    return serializeSingle(
      request,
      StoryboardRunSerializer,
      await this.runs.resetPlan(user.organizationId, brandId, runId, body),
    );
  }

  @Post(':runId/plan/approve')
  async approvePlan(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
    @Body() body: ApproveStoryboardPlanDto,
  ) {
    return serializeSingle(
      request,
      StoryboardRunSerializer,
      await this.runs.approvePlan(user.organizationId, brandId, runId, body),
    );
  }

  @Patch(':runId/source')
  async updateSource(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
    @Body() body: UpdateStoryboardSourceDto,
  ) {
    return serializeSingle(
      request,
      StoryboardRunSerializer,
      await this.runs.updateSource(user.organizationId, brandId, runId, body),
    );
  }
}
