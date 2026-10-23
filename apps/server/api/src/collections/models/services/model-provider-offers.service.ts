import { associateProviderVariant } from '@api/collections/models/utils/associate-provider-variant.util';
import { projectModelBillablePricingProfile } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  AdminModelDetail,
  AdminModelProviderOffer,
  UpdateModelProviderRouting,
} from '@genfeedai/contracts/interfaces';
import { getRuntimeMarginMultiplier } from '@genfeedai/pricing';
import { Prisma } from '@genfeedai/prisma';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class ModelProviderOffersService {
  constructor(private readonly prisma: PrismaService) {}

  async detail(id: string, periodDays = 30): Promise<AdminModelDetail> {
    return crossOrgUnsafe(async () => {
      // tenant-scope-ignore: superadmin/IP-guarded platform catalog and aggregate reporting.
      const model = await this.prisma.model.findFirst({
        where: { id, isDeleted: false, organizationId: null },
        include: {
          providerContracts: true,
          providerOffers: {
            include: {
              executionModel: { include: { providerContracts: true } },
            },
          },
        },
      });
      if (!model) throw new NotFoundException('Model not found');
      const settings = await this.prisma.providerRoutingSetting.findMany();
      const settingsByProvider = new Map(
        settings.map((setting) => [setting.provider, setting.isActive]),
      );
      const sources = model.providerOffers.length
        ? model.providerOffers
        : [
            {
              id: 'native',
              executionModelId: model.id,
              executionModel: model,
              isActive: true,
              priority: 0,
            },
          ];
      const offers: AdminModelProviderOffer[] = sources.map((offer) => {
        const source = offer.executionModel;
        const profile = projectModelBillablePricingProfile(
          source,
          source.providerContracts,
        );
        const pricing = profile.reviewedPricing;
        return {
          id: offer.id,
          executionModelId: source.id,
          executionModelKey: source.key,
          provider: source.provider,
          endpoint: source.endpoint,
          isActive: offer.isActive && source.isActive && !source.isDeleted,
          isProviderActive: settingsByProvider.get(source.provider) !== false,
          priority: offer.priority,
          hasReviewedPricing: Boolean(pricing),
          isRegistrationActive: source.isActive && !source.isDeleted,
          rates: pricing?.rates ?? [],
          sourceUrl: pricing?.sourceUrl ?? null,
          verifiedAt: pricing?.verifiedAt ?? null,
        };
      });
      const candidates = await this.prisma.model.findMany({
        where: {
          category: model.category,
          isDeleted: false,
          organizationId: model.organizationId,
        },
        select: { id: true, key: true, label: true, provider: true },
        orderBy: { label: 'asc' },
        take: 1000,
      });
      const keys = [
        ...new Set([
          model.key,
          ...sources.map((offer) => offer.executionModel.key),
        ]),
      ];
      // Cross-organization aggregates are intentionally restricted to the superadmin endpoint.
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      since.setUTCDate(since.getUTCDate() - periodDays + 1);
      const usage = await this.prisma.$queryRaw<
        AdminModelDetail['usage']
      >(Prisma.sql`
      SELECT to_char("createdAt", 'YYYY-MM-DD') AS date,
        provider, count(*)::int AS generations,
        sum("vendorCostMicros")::float8 / 1000000 AS "vendorCostUsd"
      FROM media_vendor_costs
      WHERE "isDeleted" = false AND "isByok" = false
        AND model IN (${Prisma.join(keys)})
        AND "createdAt" >= ${since}
        AND ("workflowExecutionId" IS NULL OR "costEvidence" IN ('observed', 'calculated', 'byok'))
      GROUP BY date, provider ORDER BY date, provider
    `);
      return {
        description: model.description,
        marginMultiplier: getRuntimeMarginMultiplier(),
        id: model.id,
        key: model.key,
        label: model.label,
        category: model.category,
        isActive: model.isActive,
        pinnedProvider: model.pinnedProvider,
        offers,
        candidates,
        usage,
        periodDays,
      };
    });
  }

  async update(id: string, patch: UpdateModelProviderRouting): Promise<void> {
    await crossOrgUnsafe(() =>
      this.prisma.$transaction(async (tx) => {
        // tenant-scope-ignore: platform-only catalog mutations behind superadmin and IP guards.
        const model = await tx.model.findFirst({
          where: { id, isDeleted: false, organizationId: null },
        });
        if (!model) throw new NotFoundException('Platform model not found');
        if (
          patch.label !== undefined ||
          patch.description !== undefined ||
          patch.isModelActive !== undefined
        )
          await tx.model.update({
            where: { id, organizationId: null, isDeleted: false },
            data: {
              label: patch.label,
              description: patch.description,
              isActive: patch.isModelActive,
            },
          });
        if (patch.executionModelId) {
          const source = await tx.model.findFirst({
            where: {
              id: patch.executionModelId,
              isDeleted: false,
              organizationId: null,
              category: model.category,
            },
            include: { providerContracts: true },
          });
          if (!['image', 'image-edit', 'video'].includes(model.category))
            throw new BadRequestException(
              'Provider offer routing requires an image or video model',
            );
          if (!source)
            throw new BadRequestException(
              'Provider registration must belong to the same model category',
            );
          if (
            patch.isActive !== false &&
            !projectModelBillablePricingProfile(
              source,
              source.providerContracts,
            ).reviewedPricing
          )
            throw new BadRequestException(
              'Review the provider registration pricing before enabling its offer',
            );
          if (
            source.id !== model.id &&
            (await tx.modelProviderOffer.count({
              where: { modelId: source.id },
            })) > 1
          )
            throw new BadRequestException(
              'Connect a provider registration, not another model with multiple offers',
            );
          if (source.id !== model.id) {
            const existingOwner = await tx.modelProviderOffer.findFirst({
              where: {
                executionModelId: source.id,
                modelId: { notIn: [id, source.id] },
              },
            });
            if (existingOwner)
              throw new BadRequestException(
                'This registration already belongs to another logical model',
              );
            await associateProviderVariant(tx, model, source);
          }
          await tx.modelProviderOffer.upsert({
            where: {
              modelId_executionModelId: { modelId: id, executionModelId: id },
            },
            create: { modelId: id, executionModelId: id },
            update: {},
          });
          await tx.modelProviderOffer.upsert({
            where: {
              modelId_executionModelId: {
                modelId: id,
                executionModelId: source.id,
              },
            },
            create: {
              modelId: id,
              executionModelId: source.id,
              isActive: patch.isActive ?? true,
              priority: patch.priority ?? 0,
            },
            update: {
              ...(patch.isActive !== undefined
                ? { isActive: patch.isActive }
                : {}),
              ...(patch.priority !== undefined
                ? { priority: patch.priority }
                : {}),
            },
          });
        }
        if (patch.pinnedProvider !== undefined) {
          if (
            patch.pinnedProvider &&
            !(await tx.modelProviderOffer.findFirst({
              where: {
                modelId: id,
                isActive: true,
                executionModel: {
                  provider: patch.pinnedProvider,
                  isActive: true,
                  isDeleted: false,
                },
              },
            }))
          ) {
            if (model.provider !== patch.pinnedProvider)
              throw new BadRequestException('Pin an active connected provider');
          }
          await tx.model.update({
            where: { id, organizationId: null, isDeleted: false },
            data: { pinnedProvider: patch.pinnedProvider },
          });
        }
      }),
    );
  }

  async setProviderActive(provider: string, isActive: boolean): Promise<void> {
    return crossOrgUnsafe(async () => {
      if (
        !(await this.prisma.model.findFirst({
          where: { provider, isDeleted: false, organizationId: null },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Provider not found');
      await this.prisma.providerRoutingSetting.upsert({
        where: { provider },
        create: { provider, isActive },
        update: { isActive },
      });
    });
  }
}
