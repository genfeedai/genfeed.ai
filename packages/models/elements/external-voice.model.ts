export class ExternalVoice {
  public declare id: string;
  public declare externalId: string;
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
