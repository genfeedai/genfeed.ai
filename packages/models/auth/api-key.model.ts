import type { IApiKey } from '@genfeedai/interfaces';

export type { IApiKey, IApiKeyAttributes } from '@genfeedai/interfaces';

function toIsoDateString(
  value: string | Date | null | undefined,
): string | null | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

export class ApiKey {
  id: string;
  type: string;
  allowedIps: string[];
  category?: string;
  label?: string;
  name?: string;
  description?: string;
  key?: string;
  token?: string;
  scopes: string[];
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  lastUsedIp?: string;
  createdAt: string;
  updatedAt: string;
  rateLimit?: number;
  metadata?: Record<string, unknown>;
  isActive: boolean;
  isRevoked: boolean;
  revokedAt?: string | null;
  usageCount: number;

  constructor(partial: Partial<IApiKey> = {}) {
    this.id = partial.id ?? '';
    this.type = partial.type ?? 'api-keys';

    const attrs = { ...partial, ...(partial.attributes ?? {}) };
    const displayName = attrs.label ?? attrs.name;
    this.allowedIps = attrs.allowedIps ?? [];
    this.category = attrs.category;
    this.label = displayName;
    this.name = displayName;
    this.description = attrs.description;
    this.key = attrs.key;
    this.token = attrs.token;
    this.scopes = attrs.scopes ?? [];
    this.expiresAt = toIsoDateString(attrs.expiresAt);
    this.lastUsedAt = toIsoDateString(attrs.lastUsedAt);
    this.lastUsedIp = attrs.lastUsedIp;
    this.createdAt =
      toIsoDateString(attrs.createdAt) ?? new Date().toISOString();
    this.updatedAt =
      toIsoDateString(attrs.updatedAt) ?? new Date().toISOString();
    this.rateLimit = attrs.rateLimit;
    this.metadata = attrs.metadata;
    this.isRevoked = attrs.isRevoked ?? false;
    this.revokedAt = toIsoDateString(attrs.revokedAt);
    this.usageCount = attrs.usageCount ?? 0;
    this.isActive = this.isRevoked ? false : (attrs.isActive ?? true);
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
