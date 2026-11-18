import type { ReactElement } from 'react';
import { GENFEED_MARK_PATH } from '~platforms/ui/icons';

interface IconProps {
  className?: string;
}

/** The Genfeed G, in the colour of the text around it. */
export function GenfeedLogoIcon({
  className = 'size-5',
}: IconProps): ReactElement {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 500 500"
    >
      <g transform="translate(0,500) scale(0.1,-0.1)">
        <path d={GENFEED_MARK_PATH} />
      </g>
    </svg>
  );
}
