export class ExternalVoice {
  public declare id: string;
  // Wire attribute name is `externalVoiceId` (server toWireFormat maps the
  // ExternalVoice.externalId Prisma column to this backward-compatible name).
  public declare externalVoiceId: string;
  public declare provider: string;
  public declare name: string;
  public declare sampleAudioUrl?: string | null;
  public declare language?: string | null;
  public declare isActive: boolean;
  public declare isDefaultSelectable: boolean;
  public declare isFeatured: boolean;
  public declare providerData?: Record<string, unknown> | null;
  public declare createdAt: string;
  public declare updatedAt: string;

  constructor(partial: Partial<ExternalVoice>) {
    Object.assign(this, partial);
  }
}
