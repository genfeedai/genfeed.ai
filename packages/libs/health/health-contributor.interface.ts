/**
 * Optional per-service hook for the shared HealthController.
 *
 * A service that wants to surface its own diagnostics on `GET /health/detailed`
 * (e.g. active bot count, job-queue stats) binds a provider under the
 * {@link HEALTH_CONTRIBUTOR} token that returns a HealthContributor. The shared
 * controller injects it optionally and merges `getHealthDetails()` into the
 * detailed response. Liveness probes (`/health`, `/health/live`) never call the
 * contributor and stay dependency-free.
 *
 * `GET /health/ready` additionally consults the optional {@link
 * HealthContributor.getReadiness} hook so a service can report a peer
 * dependency it could not reach. That hook is **synchronous and I/O-free** on
 * purpose: readiness is polled continuously, so it may only read state the
 * service already holds.
 */

/** A peer dependency the service knows it currently cannot reach. */
export interface DegradedDependency {
  name: string;
  url: string;
  /** ISO timestamp of the first failure in the current degraded streak. */
  since: string;
  error?: string;
}

/**
 * Readiness as the service sees it.
 *
 * `degraded` still answers 200 — an unreachable peer must not make the
 * orchestrator recycle an otherwise serving task (#3565). It is a reporting
 * signal for dashboards and operators, not a kill switch.
 */
export interface ReadinessSnapshot {
  status: 'ready' | 'degraded';
  degradedDependencies?: DegradedDependency[];
}

export interface HealthContributor {
  getHealthDetails():
    | Promise<Record<string, unknown>>
    | Record<string, unknown>;
  /** Cached, I/O-free readiness view. Omit to always report ready. */
  getReadiness?(): ReadinessSnapshot;
}

/** DI token a service binds to provide a {@link HealthContributor}. */
export const HEALTH_CONTRIBUTOR = Symbol('HEALTH_CONTRIBUTOR');
