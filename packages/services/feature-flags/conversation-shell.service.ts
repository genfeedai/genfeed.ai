import type {
  ConversationShellClientSurface,
  ConversationShellEvaluation,
} from '@genfeedai/config';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export class ConversationShellFeatureFlagService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/feature-flags`, token);
  }

  public static getInstance(
    token: string,
  ): ConversationShellFeatureFlagService {
    return HTTPBaseService.getBaseServiceInstance(
      ConversationShellFeatureFlagService,
      token,
    );
  }

  public async evaluate(
    client: ConversationShellClientSurface,
    signal?: AbortSignal,
  ): Promise<ConversationShellEvaluation> {
    return await this.instance
      .get<ConversationShellEvaluation>('conversation-shell', {
        params: { client },
        signal,
      })
      .then((response) => response.data);
  }
}
