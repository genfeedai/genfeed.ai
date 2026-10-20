export interface NotFoundProps {
  homeHref?: string;
  homeLabel?: string;
  /**
   * `page` owns the whole viewport (a standalone route such as the root 404).
   * `embedded` fills only the layout region it is rendered in.
   */
  variant?: 'page' | 'embedded';
}
