import { createElement, type SVGProps } from 'react';

export function AnthropicIcon(props: SVGProps<SVGSVGElement>) {
  return createElement(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'currentColor',
      fillRule: 'evenodd',
      'aria-hidden': true,
      ...props,
    },
    createElement('path', {
      d: 'M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767l6.57 16.96H13.24l-1.343-3.463H5.017l-1.344 3.463H0l6.57-16.96zm-.302 10.24h4.37L8.457 8.1l-2.19 5.66z',
    }),
  );
}
