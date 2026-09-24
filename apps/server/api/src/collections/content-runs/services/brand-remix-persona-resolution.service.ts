import { remixCredentialPlatform } from '@api/collections/content-runs/services/brand-remix-run-helpers';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type BrandRemixDraft,
  BrandRemixOrganicPlatform,
  type BrandRemixTarget,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { CredentialPlatform, PersonaStatus } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

interface BrandRemixPersonaResolutionInput {
  organizationId: string;
  brandId: string;
  credentialId?: string;
  target: BrandRemixTarget;
  explicitIdentity?: BrandRemixDraft['identity'];
  defaultIdentity: BrandRemixDraft['identity'];
}

interface BrandRemixPersonaResolution {
  identity: BrandRemixDraft['identity'];
  source: 'explicit' | 'account_persona' | 'brand_default';
  personaId?: string;
}

const organicCredentialPlatforms = {
  [BrandRemixOrganicPlatform.INSTAGRAM]: CredentialPlatform.INSTAGRAM,
  [BrandRemixOrganicPlatform.TIKTOK]: CredentialPlatform.TIKTOK,
  [BrandRemixOrganicPlatform.X]: CredentialPlatform.TWITTER,
  [BrandRemixOrganicPlatform.YOUTUBE]: CredentialPlatform.YOUTUBE,
} satisfies Record<BrandRemixOrganicPlatform, CredentialPlatform>;

@Injectable()
export class BrandRemixPersonaResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    input: BrandRemixPersonaResolutionInput,
  ): Promise<BrandRemixPersonaResolution> {
    const { organizationId, brandId, credentialId, target } = input;
    if (credentialId !== undefined) {
      const credential = await this.prisma.credential.findFirst({
        select: { id: true },
        where: {
          brandId,
          id: credentialId,
          isConnected: true,
          isDeleted: false,
          organizationId,
          platform:
            target.kind === 'paid'
              ? remixCredentialPlatform(target.platform)
              : organicCredentialPlatforms[target.platform],
        },
      });
      if (!credential) {
        throw new BadRequestException(
          'The destination account is disconnected, belongs to another brand, or does not match the target platform.',
        );
      }
    }

    if (input.explicitIdentity !== undefined) {
      return { identity: input.explicitIdentity, source: 'explicit' };
    }
    if (credentialId === undefined) {
      return { identity: input.defaultIdentity, source: 'brand_default' };
    }

    const personas = await this.prisma.persona.findMany({
      select: { avatarIngredientId: true, id: true, voiceIngredientId: true },
      take: 2,
      where: {
        brandId,
        credentials: { some: { id: credentialId } },
        isDeleted: false,
        organizationId,
        status: PersonaStatus.ACTIVE,
      },
    });
    if (personas.length === 0) {
      return { identity: input.defaultIdentity, source: 'brand_default' };
    }
    if (personas.length > 1) {
      throw new BadRequestException(
        'Identity replacement is blocked because multiple active personas are linked to the destination account. Select an explicit identity or keep one active linked persona.',
      );
    }
    const [persona] = personas;
    if (!persona.avatarIngredientId || !persona.voiceIngredientId) {
      throw new BadRequestException(
        'Identity replacement is blocked because the destination account persona needs both an avatar and a voice. Complete the persona or select an explicit identity.',
      );
    }
    return {
      identity: {
        avatarAssetId: persona.avatarIngredientId,
        speechVoiceId: persona.voiceIngredientId,
      },
      personaId: persona.id,
      source: 'account_persona',
    };
  }
}
