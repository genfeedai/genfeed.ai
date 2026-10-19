import { createElement, type SVGProps } from 'react';

export function GoogleAdsIcon(props: SVGProps<SVGSVGElement>) {
  return createElement(
    'svg',
    {
      viewBox: '0 0 192 192',
      fill: 'currentColor',
      'aria-hidden': true,
      ...props,
    },
    createElement('rect', {
      fill: '#FBBC04',
      height: 128,
      rx: 20,
      transform: 'rotate(30 96 96) translate(-8 0)',
      width: 40,
      x: 56,
      y: 20,
    }),
    createElement('rect', {
      fill: '#4285F4',
      height: 128,
      rx: 20,
      transform: 'rotate(-30 96 96) translate(8 0)',
      width: 40,
      x: 96,
      y: 44,
    }),
    createElement('circle', {
      cx: 52,
      cy: 144,
      fill: '#34A853',
      r: 22,
    }),
  );
}
