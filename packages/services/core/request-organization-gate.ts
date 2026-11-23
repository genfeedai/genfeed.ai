import { ORGANIZATION_CONTEXT_HEADER } from '@genfeedai/contracts/constants';

/**
 * Which organization the API requests of this tab act for.
 *
 * - `unscoped`: no routed organization is confirmed. A request carries no
 *   organization header and the API answers for the user's active one.
 * - `provisional`: the page was drawn from a saved copy and the membership
 *   check has not answered. Any request that reaches the API now could be
 *   answered for another organization than the one on screen, so the gate
 *   holds it.
 * - `confirmed`: the membership check named this organization.
 */
export type RequestOrganizationPhase =
  | { readonly kind: 'unscoped' }
  | {
      readonly kind: 'provisional';
      readonly organizationId: string;
      readonly userId: string;
    }
  | { readonly kind: 'confirmed'; readonly organizationId: string };

interface HeldRequest {
  readonly organizationId: string;
  readonly reject: (error: Error) => void;
  readonly resolve: () => void;
}

/**
 * Thrown into a held request that will never be sent. It is a cancellation
 * (`code` and `isCancelled`), so every caller that already ignores a cancelled
 * request ignores this one, and the axios client reports it the way it
 * reports any cancelled request.
 */
export class RequestOrganizationNotConfirmedError extends Error {
  public readonly code = 'ERR_CANCELED';
  public readonly isCancelled = true;
  public readonly silent = true;

  constructor() {
    super('Request organization is no longer confirmed');
    this.name = 'RequestOrganizationNotConfirmedError';
  }
}

export function createOrganizationNotConfirmedError(): RequestOrganizationNotConfirmedError {
  return new RequestOrganizationNotConfirmedError();
}

/**
 * The state behind every request the browser sends to the API: the axios
 * interceptor, the direct `fetch` clients and the socket all read it. One
 * small class, so a test builds its own instance; the module singleton in
 * `interceptor.service.ts` is the one the app uses.
 */
export class RequestOrganizationGate {
  private phase: RequestOrganizationPhase = { kind: 'unscoped' };
  private revision = 0;
  private held: HeldRequest[] = [];
  private readonly listeners = new Set<() => void>();

  public getPhase(): RequestOrganizationPhase {
    return this.phase;
  }

  /**
   * Changes whenever the confirmed organization changes. A service bound to
   * an organization compares it to know that the organization it was built
   * for is no longer the confirmed one.
   */
  public getRevision(): number {
    return this.revision;
  }

  public isProvisional(): boolean {
    return this.phase.kind === 'provisional';
  }

  /** The confirmed organization, or null while none is (provisional is not). */
  public getConfirmedOrganizationId(): string | null {
    return this.phase.kind === 'confirmed' ? this.phase.organizationId : null;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setUnscoped(): void {
    this.transition({ kind: 'unscoped' });
  }

  public setConfirmed(organizationId: string): void {
    const trimmed = organizationId.trim();
    this.transition(
      trimmed ? { kind: 'confirmed', organizationId: trimmed } : UNSCOPED,
    );
  }

  public setProvisional(organizationId: string, userId: string): void {
    const trimmed = organizationId.trim();
    this.transition(
      trimmed
        ? { kind: 'provisional', organizationId: trimmed, userId }
        : UNSCOPED,
    );
  }

  /**
   * Resolves once a request may leave: at once while the phase is settled,
   * after the check answers while it is provisional. Rejects as cancelled when
   * the check does not confirm the provisional organization (another
   * organization, a refusal, a failure, a navigation), so a held request is
   * sent only for the organization it was made for.
   */
  public whenSettled(): Promise<void> {
    const phase = this.phase;
    if (phase.kind !== 'provisional') {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      this.held.push({
        organizationId: phase.organizationId,
        reject,
        resolve,
      });
    });
  }

  /** The organization header, or none while no organization is confirmed. Throws while provisional. */
  public getHeaders(): Record<string, string> {
    if (this.phase.kind === 'provisional') {
      throw new Error(
        'Request organization is provisional: await the gate before building request headers',
      );
    }
    return this.phase.kind === 'confirmed'
      ? { [ORGANIZATION_CONTEXT_HEADER]: this.phase.organizationId }
      : {};
  }

  /** `whenSettled`, then the headers the request must carry. */
  public async whenSettledHeaders(): Promise<Record<string, string>> {
    await this.whenSettled();
    return this.getHeaders();
  }

  private transition(next: RequestOrganizationPhase): void {
    const previous = this.phase;
    this.phase = next;

    if (
      (previous.kind === 'confirmed' ? previous.organizationId : null) !==
      (next.kind === 'confirmed' ? next.organizationId : null)
    ) {
      this.revision += 1;
    }

    this.release(next);

    if (!samePhase(previous, next)) {
      for (const listener of [...this.listeners]) {
        listener();
      }
    }
  }

  private release(next: RequestOrganizationPhase): void {
    if (this.held.length === 0 || next.kind === 'provisional') {
      // A provisional organization that changed settles the requests held for
      // the previous one below; the same one keeps waiting.
      if (next.kind === 'provisional') {
        this.held = this.held.filter((request) => {
          if (request.organizationId === next.organizationId) return true;
          request.reject(createOrganizationNotConfirmedError());
          return false;
        });
      }
      return;
    }

    const held = this.held;
    this.held = [];
    for (const request of held) {
      if (
        next.kind === 'confirmed' &&
        next.organizationId === request.organizationId
      ) {
        request.resolve();
      } else {
        request.reject(createOrganizationNotConfirmedError());
      }
    }
  }
}

const UNSCOPED: RequestOrganizationPhase = { kind: 'unscoped' };

function samePhase(
  left: RequestOrganizationPhase,
  right: RequestOrganizationPhase,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'unscoped') return true;
  return (
    right.kind !== 'unscoped' &&
    left.organizationId === right.organizationId &&
    (left.kind !== 'provisional' ||
      (right.kind === 'provisional' && left.userId === right.userId))
  );
}
