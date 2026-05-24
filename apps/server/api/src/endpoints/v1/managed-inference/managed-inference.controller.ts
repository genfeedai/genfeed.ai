import { ManagedInferenceRequestDto } from '@api/endpoints/v1/managed-inference/dto/managed-inference-request.dto';
import type { ManagedInferenceAuthenticatedRequest } from '@api/endpoints/v1/managed-inference/interfaces/managed-inference.interfaces';
import { ManagedInferenceService } from '@api/endpoints/v1/managed-inference/managed-inference.service';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { ApiKeyScope } from '@genfeedai/enums';
import { Public } from '@libs/decorators/public.decorator';
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Managed Inference')
@ApiBearerAuth()
@Controller('managed-inference')
export class ManagedInferenceController {
  constructor(
    private readonly managedInferenceService: ManagedInferenceService,
  ) {}

  @Post()
  @Public()
  @UseGuards(ApiKeyAuthGuard)
  @RequiredScopes(ApiKeyScope.MANAGED_INFERENCE_EXECUTE)
  @ApiOperation({
    summary: 'Run managed inference through Genfeed Cloud credits',
  })
  async execute(
    @Body() dto: ManagedInferenceRequestDto,
    @Req() request: ManagedInferenceAuthenticatedRequest,
  ) {
    return await this.managedInferenceService.execute(dto, request);
  }
}
