/**
 * Hosts Replicate serves prediction output from.
 *
 * Replicate's webhook signing key is scoped to the account, not the endpoint,
 * and has no self-serve rotation — so a single leak of it is permanent, and a
 * valid signature stops being proof that Replicate sent the body. Output URLs
 * are fetched server-side from inside the VPC, which makes an unconstrained
 * `output` a forged-callback SSRF primitive as well as a way to write arbitrary
 * media into a real user's library.
 *
 * Predictions are delivered from `*.replicate.delivery`; `replicate.com` covers
 * the API and CDN hosts the same payloads occasionally reference.
 */
const REPLICATE_OUTPUT_HOST_SUFFIXES: readonly string[] = [
  'replicate.com',
  'replicate.delivery',
];

/**
 * Whether `candidate` is an HTTPS URL on a Replicate-owned host.
 *
 * Plain `http:` is rejected outright: Replicate never serves output over it, and
 * permitting it would reopen the link-local metadata endpoints this check
 * exists to block.
 */
export function isAllowedReplicateOutputUrl(
  candidate: unknown,
): candidate is string {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();

  return REPLICATE_OUTPUT_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}

/**
 * The host of an output URL that failed the allowlist, for the log line that
 * reports the rejection. Hostname only: the path of a signed delivery URL is a
 * credential, and an unparseable value is named as such.
 */
export function describeRejectedReplicateOutputHost(candidate: string): string {
  try {
    const { hostname, protocol } = new URL(candidate);
    return `${protocol}//${hostname}`;
  } catch {
    return 'unparseable';
  }
}
