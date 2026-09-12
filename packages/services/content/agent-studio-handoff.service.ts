import type { AgentStudioHandoffPayload } from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

/**
 * #4670 Open in Studio, Studio side: consumes an Agent -> Studio handoff.
 *
 * Deliberately independent of `@genfeedai/agent`'s `AgentApiService` /
 * `useAgentApiService()` context — that provider is only mounted on the
 * dedicated `/agent` route, never on Studio, so a Studio hook that depended
 * on it would see `null` forever. This uses the same `HTTPBaseService` +
 * `useAuthedService` pattern every other Studio-side service already does
 * (see `ContentRunsService`).
 */
export class AgentStudioHandoffService extends HTTPBaseService {
  constructor(token: string) {
    super(EnvironmentService.apiEndpoint, token);
  }

  static getInstance(token: string): AgentStudioHandoffService {
    return HTTPBaseService.getBaseServiceInstance(
      AgentStudioHandoffService,
      token,
    ) as AgentStudioHandoffService;
  }

  /**
   * Single-use — the server deletes the handoff on this call whether it
   * resolves or not, so a retry always sees it as gone. Returns `null`
   * (never throws) for a missing, expired, already-consumed, or foreign
   * handoff so the caller can fall back to its defaults with a notice
   * instead of failing the whole page mount.
   */
  async consume(
    id: string,
    signal?: AbortSignal,
  ): Promise<AgentStudioHandoffPayload | null> {
    const response = await this.instance.get<AgentStudioHandoffPayload | null>(
      `/agent/studio-handoff/${id}`,
      {
        signal,
        validateStatus: (status) =>
          status === 404 || (status >= 200 && status < 300),
      },
    );

    return response.status === 404 ? null : response.data;
  }
}
