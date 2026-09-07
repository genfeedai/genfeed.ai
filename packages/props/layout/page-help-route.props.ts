/** One entry of the route → help-copy map used by the protected layout. */
export interface PageHelpRoute {
  /** Catalog key under `pages.help`. */
  key: string;
  /** App-relative route prefix (without org/brand scope). */
  prefix: string;
}
