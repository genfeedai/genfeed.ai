/**
 * Real elapsed time, for the few places where time is what the test simulates or
 * measures: latency injected into a route, a quiet window that must stay quiet,
 * a rate-limit wait, an animation that has to run its course. Everything else
 * waits on an event (`settle`, a locator assertion, a response).
 *
 * @module real-time
 */
export function waitRealTime(ms: number): Promise<void> {
  // biome-ignore lint/style/noRestrictedGlobals: real elapsed time is the thing simulated or measured; see the module comment
  return new Promise((resolve) => setTimeout(resolve, ms));
}
