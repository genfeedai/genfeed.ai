import { scopedWhere } from '@genfeedai/server';
import { Injectable } from '@nestjs/common';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

@Injectable()
export class PostingCadenceValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCredential(
    organizationId: string,
    brandId: string,
    credentialId: string,
  ): Promise<void> {
    const credential = await this.prisma.credential.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, {
        brandId,
        id: credentialId,
      }),
    });
    if (!credential) {
      throw new NotFoundException('Credential', credentialId);
    }
  }
}
