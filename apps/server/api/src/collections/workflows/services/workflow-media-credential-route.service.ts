import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { ByokService } from '@api/services/byok/byok.service';
import type { ResolvedByokCredential } from '@api/services/byok/byok-credential-identity.interface';
import type { ByokProvider } from '@genfeedai/contracts';
import type { WorkflowGenerationDispatch } from '@genfeedai/contracts/interfaces/billing';
import { Injectable } from '@nestjs/common';

@Injectable()
export class WorkflowMediaCredentialRouteService {
  constructor(private readonly byok: ByokService) {}

  /** Confirmed absence selects platform; settings/entitlement/decryption failures stop preparation. */
  async prepareRoute(
    organizationId: string,
    provider: ByokProvider,
  ): Promise<WorkflowGenerationDispatch['credentialRoute']> {
    const credential = await this.byok.lookupApiKeyWithIdentity(
      organizationId,
      provider,
    );
    return credential
      ? { kind: 'byok', credentialId: credential.credentialId }
      : { kind: 'platform' };
  }

  /** Return the same validated key for dispatch, with no second lookup or platform fallback. */
  async resolvePinnedCredential(
    organizationId: string,
    provider: ByokProvider,
    route: WorkflowGenerationDispatch['credentialRoute'],
  ): Promise<ResolvedByokCredential | undefined> {
    if (route.kind === 'platform') return undefined;
    const credential = await this.byok.lookupApiKeyWithIdentity(
      organizationId,
      provider,
    );
    if (!credential || credential.credentialId !== route.credentialId)
      throw new BusinessLogicException(
        'Workflow BYOK credential changed after funding preparation',
      );
    return credential;
  }
}
