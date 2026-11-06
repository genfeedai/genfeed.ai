export interface BrandMarkProps {
  /**
   * For marks drawn at icon size (the rail logo, about 20px). The full-size
   * stroke disappears below a pixel there and the first trace takes over a
   * second to show, so the compact mark draws a thicker stroke over a faint
   * G that is readable from the first frame, on a shorter loop.
   */
  isCompact?: boolean;
}
