import type { Server } from 'node:http';

/**
 * The load balancer keeps an idle connection to a target open for 60 s. Node
 * closes an idle one after 5 s by default, so the balancer sometimes reuses a
 * connection at the moment Node drops it and answers the client with a 502
 * that the service never sees. The service has to outlast the balancer.
 */
export const LOAD_BALANCER_IDLE_TIMEOUT_MS = 60_000;

/** Above the balancer's idle timeout, so the balancer is always the one to close. */
export const KEEP_ALIVE_TIMEOUT_MS = LOAD_BALANCER_IDLE_TIMEOUT_MS + 5_000;

/** Node requires `headersTimeout` to exceed `keepAliveTimeout`. */
export const HEADERS_TIMEOUT_MS = KEEP_ALIVE_TIMEOUT_MS + 1_000;

/** Applies the timeouts to a server that sits behind the load balancer. */
export function configureLoadBalancerKeepAlive(
  httpServer: Pick<Server, 'headersTimeout' | 'keepAliveTimeout'>,
): void {
  httpServer.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  httpServer.headersTimeout = HEADERS_TIMEOUT_MS;
}
