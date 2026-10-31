class ServiceInstanceManagerImpl {
  private instances = new Map<string, unknown>();

  getKey(serviceName: string, token: string): string {
    return `${serviceName}:${token}`;
  }

  get<T>(serviceName: string, token: string): T | undefined {
    return this.instances.get(this.getKey(serviceName, token)) as T | undefined;
  }

  set<T>(serviceName: string, token: string, instance: T): void {
    this.instances.set(this.getKey(serviceName, token), instance);
  }

  clear(serviceName: string, token: string): void {
    this.instances.delete(this.getKey(serviceName, token));
  }

  clearAll(): void {
    this.instances.clear();
  }
}

export const ServiceInstanceManager = new ServiceInstanceManagerImpl();
