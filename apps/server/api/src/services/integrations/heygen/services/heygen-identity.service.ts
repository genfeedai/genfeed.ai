import {
  heyGenAvatarCandidateSchema,
  savedVoiceRefSchema,
} from '@api/services/integrations/heygen/heygen-identity.schema';
import type { HeyGenAvatarCandidate } from '@api/services/integrations/heygen/heygen-identity.types';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import type { DefaultVoiceRef } from '@api/shared/default-voice-ref/default-voice-ref.schema';
import { VoiceProvider } from '@genfeedai/contracts';
import { BadRequestException, Injectable } from '@nestjs/common';

/** Save and execution use the same server-observed identity admission. */
@Injectable()
export class HeyGenIdentityService {
  constructor(private readonly heygenService: HeyGenService) {}

  async avatarDefault(
    candidate: HeyGenAvatarCandidate,
    organizationId: string,
  ) {
    const parsed = heyGenAvatarCandidateSchema.safeParse(candidate);
    if (!parsed.success)
      throw new BadRequestException('Select a valid avatar reference.');
    return (
      await this.heygenService.resolveAvatarSelection(
        parsed.data,
        organizationId,
      )
    ).avatarRef;
  }

  async voiceDefault(
    candidate: DefaultVoiceRef,
    organizationId: string,
  ): Promise<DefaultVoiceRef> {
    const parsed = savedVoiceRefSchema.safeParse(candidate);
    if (!parsed.success)
      throw new BadRequestException('Select a valid voice reference.');
    candidate = parsed.data;
    if (
      candidate.provider !== VoiceProvider.HEYGEN ||
      candidate.source !== 'catalog'
    )
      return candidate;
    if (!candidate.externalVoiceId)
      throw new BadRequestException('Select a HeyGen voice.');
    if (
      candidate.connection &&
      candidate.connection.organizationId !== organizationId
    )
      throw new BadRequestException(
        'This voice belongs to another organization.',
      );
    const connection = await this.heygenService.resolveOrganizationConnection(
      organizationId,
      candidate.connection?.kind,
    );
    const voice = await this.heygenService.validateVoiceSelection(
      candidate.externalVoiceId,
      connection,
    );
    return {
      ...candidate,
      label: voice.name,
      preview: voice.preview || null,
      ownership: voice.ownership,
      connection: voice.connection,
    };
  }
}
