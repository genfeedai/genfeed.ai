/** True when `host` is `domain` itself or one of its subdomains. */
export function isHostOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}
