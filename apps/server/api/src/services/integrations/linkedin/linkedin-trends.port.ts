export interface ServerLinkedInTrend {
  growthRate: number;
  mentions: number;
  metadata: Record<string, unknown>;
  topic: string;
}

/** API-owned public signal resolver consumed by the shared LinkedIn domain. */
export interface ServerLinkedInTrendResolver {
  resolve(
    organizationId?: string,
    brandId?: string,
  ): Promise<ServerLinkedInTrend[]>;
}
