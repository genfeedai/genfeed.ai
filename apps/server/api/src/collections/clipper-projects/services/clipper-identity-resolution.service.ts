import { resolveClipperIdentity } from '@api/collections/clipper-projects/services/clipper-identity-resolution.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { HeyGenIdentityService } from '@api/services/integrations/heygen/services/heygen-identity.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { VoiceProvider } from '@genfeedai/contracts';
import type { AgentClipperRunIdentity } from '@genfeedai/contracts/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

export interface ResolveClipperIdentityParams {
  avatarId?: string;
  avatarProvider?: string;
  brandId?: string | null;
  organizationId: string;
  voiceId?: string;
  voiceProvider?: string;
}

@Injectable()
export class ClipperIdentityResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identities: HeyGenIdentityService,
  ) {}

  async resolve(
    params: ResolveClipperIdentityParams,
  ): Promise<AgentClipperRunIdentity> {
    const [brand, organizationSettings] = await Promise.all([
      params.brandId
        ? this.prisma.brand.findFirst({
            select: {
              agentConfig: true,
              id: true,
            },
            where: scopedWhere(params.organizationId, { id: params.brandId }),
          })
        : Promise.resolve(null),
      this.prisma.organizationSetting.findUnique({
        select: {
          defaultAvatarRef: true,
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

    const identity = resolveClipperIdentity({
      avatarId: params.avatarId,
      avatarProvider: params.avatarProvider,
      brand,
      organizationSettings,
      voiceId: params.voiceId,
      voiceProvider: params.voiceProvider,
    });
    if (identity.avatarRef)
      identity.avatarRef = await this.identities.avatarDefault(
        identity.avatarRef,
        params.organizationId,
      );
    if (identity.voiceRef?.provider === VoiceProvider.HEYGEN) {
      if (!identity.voiceRef.connection)
        throw new BadRequestException('Reselect the saved HeyGen voice.');
      identity.voiceRef = await this.identities.voiceDefault(
        { ...identity.voiceRef, provider: VoiceProvider.HEYGEN },
        params.organizationId,
      );
    }
    return identity;
  }
}
