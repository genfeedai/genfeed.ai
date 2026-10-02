'use client';
import type { IBrandOnboardingScan } from '@genfeedai/contracts/interfaces';
import type {
  BrandGuideScanState,
  UseBrandGuideScanOptions,
  UseBrandGuideScanResult,
} from '@genfeedai/props/onboarding/brand-guide.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { BrandsService } from '@services/social/brands.service';
import { useEffect, useRef, useState } from 'react';

function initialState(): BrandGuideScanState {
  return {
    scan: null,
    phase: 'resolving',
    slow: false,
    request: null,
    refreshKey: 0,
    error: false,
  };
}
function isActive(scan: IBrandOnboardingScan | null): boolean {
  return scan?.status === 'pending' || scan?.status === 'running';
}
function isValidationError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'status' in error.response &&
    error.response.status === 400
  );
}
class BrandGuideScanSession {
  private state = initialState();
  private alive = true;
  private posting = false;
  private currentId: string | null = null;
  private localStartedAt = 0;
  private validationRejected = false;
  private readPromise: Promise<void> | null = null;
  private poll: ReturnType<typeof setTimeout> | undefined;
  private slowTimer: ReturnType<typeof setTimeout> | undefined;
  private controllers = new Set<AbortController>();
  private refreshed = new Set<string>();
  constructor(
    private readonly brandId: string,
    private readonly getService: () => Promise<BrandsService>,
    private readonly publish: (state: BrandGuideScanState) => void,
  ) {}

  private update(patch: Partial<BrandGuideScanState>) {
    if (!this.alive) return;
    this.state = { ...this.state, ...patch };
    this.publish(this.state);
    this.scheduleSlow();
  }
  private scheduleSlow() {
    clearTimeout(this.slowTimer);
    if (!['starting', 'observing'].includes(this.state.phase)) return;
    const serverTime = Date.parse(this.state.scan?.startedAt ?? '');
    const startedAt = Number.isFinite(serverTime)
      ? serverTime
      : this.localStartedAt;
    if (!startedAt) return;
    const remaining = Math.max(0, startedAt + 6000 - Date.now());
    if (remaining === 0) {
      if (!this.state.slow) {
        this.state = { ...this.state, slow: true };
        this.publish(this.state);
      }
    } else
      this.slowTimer = setTimeout(() => this.update({ slow: true }), remaining);
  }
  private schedulePoll() {
    clearTimeout(this.poll);
    if (!this.alive || this.state.phase === 'reconcile-error') return;
    if (['starting', 'observing'].includes(this.state.phase))
      this.poll = setTimeout(() => {
        void this.reconcile();
      }, 2000);
  }
  private accept(scan: IBrandOnboardingScan | null) {
    if (!scan) {
      if (this.posting) return;
      this.currentId = this.state.request?.requestId ?? null;
      this.update({
        scan: null,
        phase: 'idle',
        slow: false,
        error: Boolean(this.state.request),
        request: this.validationRejected ? null : this.state.request,
      });
      this.validationRejected = false;
      return;
    }
    if (scan.brandId !== this.brandId) {
      this.update({ phase: 'reconcile-error', error: true });
      return;
    }
    if (
      scan.id === this.state.scan?.id &&
      !isActive(this.state.scan) &&
      isActive(scan)
    )
      return;
    const active = isActive(scan);
    if (this.currentId !== scan.id || !active) this.posting = false;
    this.currentId = scan.id;
    let refreshKey = this.state.refreshKey;
    if (
      (scan.status === 'ready' || scan.status === 'partial') &&
      scan.revisionId
    ) {
      const identity = `${scan.id}:${scan.revisionId}`;
      if (!this.refreshed.has(identity)) {
        this.refreshed.add(identity);
        refreshKey += 1;
      }
    }
    this.update({
      scan,
      phase: active ? 'observing' : 'idle',
      request: active ? { requestId: scan.id, url: scan.url } : null,
      error: false,
      slow: false,
      refreshKey,
    });
  }
  reconcile = async (): Promise<void> => {
    if (!this.alive || !this.brandId) return;
    if (this.readPromise) return this.readPromise;
    clearTimeout(this.poll);
    this.readPromise = this.read();
    try {
      await this.readPromise;
    } finally {
      this.readPromise = null;
      this.schedulePoll();
    }
  };
  private async read() {
    const observedId = this.currentId;
    const controller = new AbortController();
    this.controllers.add(controller);
    try {
      const service = await this.getService();
      if (!this.alive) return;
      const marker = await service.getBrandOsScan(
        this.brandId,
        controller.signal,
      );
      if (
        this.alive &&
        !controller.signal.aborted &&
        observedId === this.currentId
      )
        this.accept(marker);
    } catch {
      if (
        this.alive &&
        !controller.signal.aborted &&
        observedId === this.currentId
      )
        this.update({ phase: 'reconcile-error', error: true });
    } finally {
      this.controllers.delete(controller);
    }
  }
  start = async (url: string): Promise<void> => {
    if (
      !this.alive ||
      !this.brandId ||
      this.posting ||
      ['resolving', 'reconcile-error'].includes(this.state.phase) ||
      isActive(this.state.scan)
    )
      return;
    const trimmed = url.trim();
    if (!trimmed && !this.state.request) {
      this.update({ error: true });
      return;
    }
    const request = this.state.request ?? {
      requestId: crypto.randomUUID(),
      url: trimmed,
    };
    this.posting = true;
    this.validationRejected = false;
    this.currentId = request.requestId;
    this.localStartedAt = Date.now();
    this.update({
      phase: 'starting',
      request,
      scan: null,
      error: false,
      slow: false,
    });
    this.schedulePoll();
    const controller = new AbortController();
    this.controllers.add(controller);
    try {
      const service = await this.getService();
      if (!this.alive || this.currentId !== request.requestId) return;
      const scan = await service.startBrandOsScan(
        this.brandId,
        request,
        controller.signal,
      );
      if (
        this.alive &&
        this.currentId === request.requestId &&
        !controller.signal.aborted
      )
        this.accept(scan);
    } catch (error) {
      if (
        !this.alive ||
        this.currentId !== request.requestId ||
        controller.signal.aborted
      )
        return;
      this.validationRejected = isValidationError(error);
      this.posting = false;
      await this.reconcile();
    } finally {
      this.controllers.delete(controller);
      if (this.currentId === request.requestId) this.posting = false;
      if (this.alive) {
        this.scheduleSlow();
        this.schedulePoll();
      }
    }
  };
  dispose() {
    this.alive = false;
    clearTimeout(this.poll);
    clearTimeout(this.slowTimer);
    for (const controller of this.controllers) controller.abort();
  }
}
export function useBrandGuideScan({
  brandId,
}: UseBrandGuideScanOptions): UseBrandGuideScanResult {
  const getService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );
  const [state, setState] = useState<BrandGuideScanState>(initialState);
  const session = useRef<BrandGuideScanSession | null>(null);
  useEffect(() => {
    const current = new BrandGuideScanSession(brandId, getService, setState);
    session.current = current;
    setState(initialState());
    void current.reconcile();
    return () => {
      current.dispose();
      if (session.current === current) session.current = null;
    };
  }, [brandId, getService]);
  return {
    ...state,
    start: async (url) => {
      await session.current?.start(url);
    },
    reconcile: async () => {
      await session.current?.reconcile();
    },
  };
}
