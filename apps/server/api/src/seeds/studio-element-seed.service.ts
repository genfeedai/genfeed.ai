import {
  STUDIO_ELEMENT_CATALOG,
  type StudioElementDomain,
  type StudioElementModel,
  studioElementId,
} from '@api/seeds/studio-element-catalog';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export type StudioElementSeedResult = {
  failed: string[];
  unchanged: number;
  written: number;
};

type ElementDelegate = {
  create: (args: {
    data: {
      description: string;
      id: string;
      isActive: boolean;
      isDeleted: boolean;
      key: string;
      label: string;
      organizationId: null;
      sortOrder: number;
    };
  }) => Promise<unknown>;
  findFirst: (args: {
    select: { id: true };
    where: {
      OR: Array<{ id: string } | { key: string; organizationId: null }>;
    };
  }) => Promise<{ id: string } | null>;
};

@Injectable()
export class StudioElementSeedService {
  private readonly context = 'StudioElementSeedService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async reconcileCatalog(
    catalog: readonly StudioElementDomain[] = STUDIO_ELEMENT_CATALOG,
  ): Promise<StudioElementSeedResult> {
    const result: StudioElementSeedResult = {
      failed: [],
      unchanged: 0,
      written: 0,
    };

    for (const domain of catalog) {
      const delegate = this.delegate(domain.model);
      for (const entry of domain.entries) {
        const identity = `${domain.table}:${entry.key}`;
        try {
          if (await this.seedEntry(delegate, domain.table, entry)) {
            result.written += 1;
          } else {
            result.unchanged += 1;
          }
        } catch (error) {
          result.failed.push(identity);
          this.logger.error(
            `Studio element seed failed for ${identity}`,
            error instanceof Error ? error : new Error(String(error)),
            this.context,
          );
        }
      }
    }

    if (result.failed.length > 0) {
      throw new Error(
        `Studio element reconcile failed for: ${result.failed.join(', ')}`,
      );
    }

    this.logger.log(
      `Studio elements reconciled (written=${result.written}, unchanged=${result.unchanged})`,
      this.context,
    );

    return result;
  }

  private delegate(model: StudioElementModel): ElementDelegate {
    const delegates: Record<StudioElementModel, ElementDelegate> = {
      elementCamera: this.prisma.elementCamera,
      elementCameraMovement: this.prisma.elementCameraMovement,
      elementLens: this.prisma.elementLens,
      elementLighting: this.prisma.elementLighting,
      elementMood: this.prisma.elementMood,
      elementScene: this.prisma.elementScene,
      elementSound: this.prisma.elementSound,
      elementStyle: this.prisma.elementStyle,
    };
    return delegates[model];
  }

  private async seedEntry(
    delegate: ElementDelegate,
    table: StudioElementDomain['table'],
    entry: StudioElementDomain['entries'][number],
  ): Promise<boolean> {
    const id = studioElementId(table, entry.key);
    // tenant-scope-ignore: platform seed probes deterministic ids and platform keys
    const existing = await delegate.findFirst({
      select: { id: true },
      where: {
        OR: [{ id }, { key: entry.key, organizationId: null }],
      },
    });
    if (existing) return false;

    // tenant-scope-ignore: first insert of a platform catalog row
    await delegate.create({
      data: {
        description: entry.description,
        id,
        isActive: true,
        isDeleted: false,
        key: entry.key,
        label: entry.label,
        organizationId: null,
        sortOrder: entry.sortOrder,
      },
    });
    return true;
  }
}
