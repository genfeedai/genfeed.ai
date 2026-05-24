const INSTANCE_KEY_SEPARATOR = '\u0001';

function serializeInstanceKeyPart(part: unknown): string {
  if (part === undefined) {
    return 'undefined:';
  }

  if (part === null) {
    return 'null:';
  }

  if (
    typeof part === 'string' ||
    typeof part === 'number' ||
    typeof part === 'boolean' ||
    typeof part === 'bigint'
  ) {
    return `${typeof part}:${String(part)}`;
  }

  if (part instanceof Date) {
    return `date:${part.toISOString()}`;
  }

  if (typeof part === 'object') {
    try {
      return `json:${JSON.stringify(part)}`;
    } catch {
      return `object:${Object.prototype.toString.call(part)}`;
    }
  }

  return `${typeof part}:${String(part)}`;
}

function keyIncludesTokenPart(key: string, token: string): boolean {
  const tokenKey = serializeInstanceKeyPart(token);

  return (
    key === tokenKey ||
    key.startsWith(`${tokenKey}${INSTANCE_KEY_SEPARATOR}`) ||
    key.endsWith(`${INSTANCE_KEY_SEPARATOR}${tokenKey}`) ||
    key.includes(
      `${INSTANCE_KEY_SEPARATOR}${tokenKey}${INSTANCE_KEY_SEPARATOR}`,
    )
  );
}

export function buildInstanceKey(parts: unknown[]): string {
  return parts.map(serializeInstanceKeyPart).join(INSTANCE_KEY_SEPARATOR);
}

export class ServiceInstanceManager<TInstance> {
  private readonly instances = new Map<unknown, Map<string, TInstance>>();

  private getInstanceMap(serviceKey: unknown): Map<string, TInstance> {
    let instanceMap = this.instances.get(serviceKey);
    if (!instanceMap) {
      instanceMap = new Map<string, TInstance>();
      this.instances.set(serviceKey, instanceMap);
    }

    return instanceMap;
  }

  get<T extends TInstance>(serviceKey: unknown, token: string): T | undefined {
    return this.instances.get(serviceKey)?.get(token) as T | undefined;
  }

  set<T extends TInstance>(
    serviceKey: unknown,
    token: string,
    instance: T,
  ): void {
    this.getInstanceMap(serviceKey).set(token, instance);
  }

  clear(serviceKey?: unknown, token?: string): void {
    if (!serviceKey) {
      this.instances.clear();
      return;
    }

    const instancesForService = this.instances.get(serviceKey);
    if (!instancesForService) {
      return;
    }

    if (token) {
      instancesForService.delete(token);
      if (instancesForService.size === 0) {
        this.instances.delete(serviceKey);
      }
      return;
    }

    this.instances.delete(serviceKey);
  }

  clearAll(): void {
    this.instances.clear();
  }

  clearByToken(serviceKey: unknown, token: string): void {
    const instancesForService = this.instances.get(serviceKey);
    if (!instancesForService) {
      return;
    }

    for (const key of [...instancesForService.keys()]) {
      if (keyIncludesTokenPart(key, token)) {
        this.clear(serviceKey, key);
      }
    }
  }
}
