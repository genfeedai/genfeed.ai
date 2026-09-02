import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

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
