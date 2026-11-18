import type {
  IAccountNewsletterSubscribeRequest,
  IAccountNewsletterSubscribeResponse,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

/** A signed-in reader's own newsletter subscriptions; plain JSON, not JSON:API. */
export class NewsletterAccountService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/newsletter`, token);
  }

  static getInstance(token: string): NewsletterAccountService {
    return HTTPBaseService.getBaseServiceInstance(
      NewsletterAccountService,
      token,
    ) as NewsletterAccountService;
  }

  /** Subscribe the signed-in account's own email to a creator's newsletter. */
  public async subscribe(
    request: IAccountNewsletterSubscribeRequest,
  ): Promise<IAccountNewsletterSubscribeResponse> {
    const response =
      await this.instance.post<IAccountNewsletterSubscribeResponse>(
        '/subscribe',
        request,
      );
    return response.data;
  }
}
