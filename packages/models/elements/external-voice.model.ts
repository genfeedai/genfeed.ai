export class ExternalVoice {
  declare public id: string;
  // Wire attribute name is `externalVoiceId` (server toWireFormat maps the
  // ExternalVoice.externalId Prisma column to this backward-compatible name).
  declare public externalVoiceId: string;
  declare public provider: string;
  declare public name: string;
  declare public sampleAudioUrl?: string | null;
  declare public language?: string | null;
  declare public isActive: boolean;
  declare public isDefaultSelectable: boolean;
  declare public isFeatured: boolean;
  declare public providerData?: Record<string, unknown> | null;
  declare public createdAt: string;
  declare public updatedAt: string;

  constructor(partial: Partial<ExternalVoice>) {
    Object.assign(this, partial);
  }
}
