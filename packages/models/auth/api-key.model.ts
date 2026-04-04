export interface IApiKeyAttributes {
  label?: string;
  name?: string;
  description?: string;
  key?: string;
  scopes?: string[];
  expiresAt?: string | Date;
  lastUsedAt?: string | Date;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  rateLimit?: number;
  isActive?: boolean;
}

export interface IApiKey {
  id: string;
  type?: string;
  attributes?: IApiKeyAttributes;
}

export class ApiKey {
  id: string;
  type: string;
  label?: string;
  name?: string;
  description?: string;
  key?: string;
  scopes: string[];
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  rateLimit?: number;
  isActive: boolean;

  constructor(partial: Partial<IApiKey> = {}) {
    this.id = partial.id ?? '';
    this.type = partial.type ?? 'api-keys';

    const attrs = partial.attributes ?? {};
    const displayName = attrs.label ?? attrs.name;
    this.label = displayName;
    this.name = displayName;
    this.description = attrs.description;
    this.key = attrs.key;
    this.scopes = attrs.scopes ?? [];
    this.expiresAt = attrs.expiresAt as string | null | undefined;
    this.lastUsedAt = attrs.lastUsedAt as string | null | undefined;
    this.createdAt = (attrs.createdAt as string) ?? new Date().toISOString();
    this.updatedAt = (attrs.updatedAt as string) ?? new Date().toISOString();
    this.rateLimit = attrs.rateLimit;
    this.isActive = attrs.isActive !== false;
  }

  get isExpired(): boolean {
    return this.expiresAt ? new Date() > new Date(this.expiresAt) : false;
  }

  get isMcpKey(): boolean {
    const labelHasMcp = this.label?.toLowerCase().includes('mcp') ?? false;
    const descriptionHasMcp =
      this.description?.toLowerCase().includes('mcp') ?? false;
    return labelHasMcp || descriptionHasMcp;
  }
}
