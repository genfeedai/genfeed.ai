import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { outlierConfigurationSchema } from '@genfeedai/contracts/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class OutlierConfigurationService {
  constructor(private readonly prisma: PrismaService) {}
  async resolve(organizationId: string) {
    const row = await this.prisma.outlierConfiguration.findFirst({
      where: { organizationId, isDeleted: false },
    });
    const values = outlierConfigurationSchema.parse(
      row
        ? {
            windowSize: row.windowSize,
            minimumSampleSize: row.minimumSampleSize,
            outlierThreshold: row.outlierThreshold,
            breakoutThreshold: row.breakoutThreshold,
            maturityHoursByPlatform: row.maturityHoursByPlatform,
          }
        : {},
    );
    return { id: row?.id ?? organizationId, organizationId, ...values };
  }
  async update(organizationId: string, input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new BadRequestException('Invalid outlier configuration');
    const current = await this.resolve(organizationId);
    const { id: _id, organizationId: _org, ...values } = current;
    const result = outlierConfigurationSchema.safeParse({
      ...values,
      ...input,
    });
    if (!result.success) throw new BadRequestException(result.error.flatten());
    const row = await this.prisma.outlierConfiguration.findFirst({
      where: { organizationId, isDeleted: false },
      select: { id: true },
    });
    if (row) {
      await this.prisma.outlierConfiguration.updateMany({
        where: { id: row.id, organizationId, isDeleted: false },
        data: result.data,
      });
    } else {
      await this.prisma.outlierConfiguration.create({
        data: { organizationId, ...result.data },
      });
    }
    return this.resolve(organizationId);
  }
}
