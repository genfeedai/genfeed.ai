import { resolveClipIdentity } from '@api/collections/clip-projects/services/clip-identity-resolution.util';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { AgentClipRunIdentity } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

export interface ResolveClipIdentityParams {
  avatarId?: string;
  avatarProvider?: string;
  brandId?: string | null;
  organizationId: string;
  voiceId?: string;
  voiceProvider?: string;
}

@Injectable()
export class ClipIdentityResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    params: ResolveClipIdentityParams,
  ): Promise<AgentClipRunIdentity> {
    const [brand, organizationSettings] = await Promise.all([
      params.brandId
        ? this.prisma.brand.findFirst({
            select: {
              agentConfig: true,
              id: true,
            },
            where: {
              id: params.brandId,
              isDeleted: false,
              organizationId: params.organizationId,
            },
          })
        : Promise.resolve(null),
      this.prisma.organizationSetting.findUnique({
        select: {
          defaultVoiceId: true,
          defaultVoiceProvider: true,
          defaultVoiceRef: true,
        },
        where: {
          organizationId: params.organizationId,
        },
      }),
    ]);

    if (params.brandId && !brand) {
      throw new NotFoundException('Brand', params.brandId);
    }

    return resolveClipIdentity({
      avatarId: params.avatarId,
      avatarProvider: params.avatarProvider,
      brand,
      organizationSettings,
      voiceId: params.voiceId,
      voiceProvider: params.voiceProvider,
    });
  }
}
