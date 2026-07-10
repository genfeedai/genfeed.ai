/**
 * Optional per-service hook for the shared HealthController.
 *
 * A service that wants to surface its own diagnostics on `GET /health/detailed`
 * (e.g. active bot count, job-queue stats) binds a provider under the
 * {@link HEALTH_CONTRIBUTOR} token that returns a HealthContributor. The shared
 * controller injects it optionally and merges `getHealthDetails()` into the
 * detailed response. Liveness probes (`/health`, `/health/ready`, `/health/live`)
 * never call the contributor and stay dependency-free.
 */
export interface HealthContributor {
  getHealthDetails():
    | Promise<Record<string, unknown>>
    | Record<string, unknown>;
}

/** DI token a service binds to provide a {@link HealthContributor}. */
export const HEALTH_CONTRIBUTOR = Symbol('HEALTH_CONTRIBUTOR');
