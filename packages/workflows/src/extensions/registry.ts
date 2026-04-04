import type { ExtensionPack, NodeDefinition } from './types';

/**
 * Minimal registry interface for composing core and private workflow node packs.
 */
export interface NodeRegistry {
  register(node: NodeDefinition): void;
  registerMany(nodes: NodeDefinition[]): void;
  registerPack(pack: ExtensionPack): void;
  get(type: string, version?: number): NodeDefinition | undefined;
  list(): NodeDefinition[];
}

export class InMemoryNodeRegistry implements NodeRegistry {
  private readonly nodes = new Map<string, NodeDefinition>();

  register(node: NodeDefinition): void {
    this.nodes.set(this.key(node.type, node.version), node);
  }

  registerMany(nodes: NodeDefinition[]): void {
    for (const node of nodes) this.register(node);
  }

  registerPack(pack: ExtensionPack): void {
    this.registerMany(pack.nodes);
  }

  get(type: string, version?: number): NodeDefinition | undefined {
    if (version !== undefined) {
      return this.nodes.get(this.key(type, version));
    }

    const candidates = [...this.nodes.values()]
      .filter((node) => node.type === type)
      .sort((a, b) => b.version - a.version);
    return candidates[0];
  }

  list(): NodeDefinition[] {
    return [...this.nodes.values()];
  }

  private key(type: string, version: number): string {
    return `${type}@${version}`;
  }
}
