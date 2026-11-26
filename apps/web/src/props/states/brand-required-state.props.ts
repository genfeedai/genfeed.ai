export interface BrandRequiredStateProps {
  /**
   * Where to manage brands. Give it where the organization may have none, so
   * there is something to do when the top bar has no brand to pick.
   */
  brandSettingsHref?: string;
  /** The brand is chosen but has not loaded yet, so there is nothing to pick. */
  isLoading?: boolean;
}
