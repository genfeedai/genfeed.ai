import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { SelectModelDto } from '@api/services/router/dto/select-model.dto';
import { ModelRecommendation } from '@api/services/router/interfaces/router.interfaces';
import { RouterService } from '@api/services/router/router.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@AutoSwagger()
@ApiTags('router')
@Controller('router')
@ApiBearerAuth()
export class RouterController {
  constructor(
    private readonly routerService: RouterService,
    private readonly logger: LoggerService,
  ) {}

  @Post('select-model')
  @ApiOperation({
    description:
      'Analyzes the user prompt and requirements to recommend the best model for content generation. ' +
      'Uses rule-based routing to match prompts with model capabilities without additional AI calls.',
    summary: 'Select optimal AI model based on prompt and requirements',
  })
  @ApiResponse({
    description: 'Model recommendation returned successfully',
    schema: {
      properties: {
        alternatives: {
          items: {
            properties: {
              model: { type: 'string' },
              reason: { type: 'string' },
              score: { type: 'number' },
            },
            type: 'object',
          },
          type: 'array',
        },
        analysis: {
          properties: {
            complexity: {
              enum: ['simple', 'medium', 'complex'],
              type: 'string',
            },
            detectedFeatures: { items: { type: 'string' }, type: 'array' },
            hasQualityIndicators: { type: 'boolean' },
            hasSpeedIndicators: { type: 'boolean' },
          },
          type: 'object',
        },
        modelDetails: {
          properties: {
            category: { type: 'string' },
            cost: { type: 'number' },
            id: { type: 'string' },
            key: { type: 'string' },
            provider: { type: 'string' },
          },
          type: 'object',
        },
        reason: {
          description: 'Human-readable explanation for the selection',
          example:
            'Optimized for quality, high-quality prompt detected, supports photorealistic',
          type: 'string',
        },
        selectedModel: {
          description: 'The recommended model key',
          example: 'google/imagen-4',
          type: 'string',
        },
      },
      type: 'object',
    },
    status: 200,
  })
  @ApiResponse({
    description: 'Selected model not found in database',
    status: 404,
  })
  @ApiResponse({
    description: 'Unauthorized - Invalid or missing JWT token',
    status: 401,
  })
  async selectModel(
    @Body() selectModelDto: SelectModelDto,
  ): Promise<ModelRecommendation> {
    const url = `${RouterController.name} selectModel`;

    this.logger.debug(`${url} started`, {
      category: selectModelDto.category,
      promptLength: selectModelDto.prompt.length,
    });

    const recommendation = await this.routerService.selectModel({
      category: selectModelDto.category,
      dimensions: selectModelDto.dimensions,
      duration: selectModelDto.duration,
      outputs: selectModelDto.outputs,
      prioritize: selectModelDto.prioritize,
      prompt: selectModelDto.prompt,
      speech: selectModelDto.speech,
    });

    this.logger.log(`${url} completed`, {
      category: selectModelDto.category,
      selectedModel: recommendation.selectedModel,
    });

    return recommendation;
  }
}
