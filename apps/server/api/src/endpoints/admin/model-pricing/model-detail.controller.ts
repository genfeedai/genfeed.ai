import { ModelProviderOffersService } from '@api/collections/models/services/model-provider-offers.service';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { ModelDetailSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

const patchSchema = z
  .object({
    label: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(10000).optional(),
    isModelActive: z.boolean().optional(),
    pinnedProvider: z.string().min(1).max(100).nullable().optional(),
    executionModelId: z.string().min(1).max(200).optional(),
    isActive: z.boolean().optional(),
    priority: z.number().int().min(0).max(1000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      Object.keys(value).length > 0 &&
      (value.executionModelId !== undefined ||
        value.pinnedProvider !== undefined ||
        value.label !== undefined ||
        value.description !== undefined ||
        value.isModelActive !== undefined),
  );

@Controller('admin/model-details')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class AdminModelDetailController {
  constructor(private readonly offers: ModelProviderOffersService) {}

  @Get(':id')
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60000 })
  async detail(
    @Req() request: Request,
    @Param('id') id: string,
    @Query('days') days?: string,
  ) {
    const period = z.coerce
      .number()
      .int()
      .min(1)
      .max(90)
      .safeParse(days ?? 30);
    if (!period.success)
      throw new BadRequestException('days must be between 1 and 90');
    return serializeSingle(
      request,
      ModelDetailSerializer,
      await this.offers.detail(id, period.data),
    );
  }

  @Patch('providers/:provider')
  async provider(@Param('provider') provider: string, @Body() body: unknown) {
    const parsed = z.object({ isActive: z.boolean() }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException('isActive is required');
    await this.offers.setProviderActive(provider, parsed.data.isActive);
    return { isActive: parsed.data.isActive };
  }

  @Patch(':id')
  async update(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Invalid provider routing settings');
    await this.offers.update(id, parsed.data);
    return serializeSingle(
      request,
      ModelDetailSerializer,
      await this.offers.detail(id),
    );
  }
}
