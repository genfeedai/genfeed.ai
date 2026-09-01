const GENFEED_MARK_PATH =
  'M2360 4944 c-490 -32 -952 -211 -1352 -524 -105 -82 -293 -269 -382 -380 -347 -433 -535 -944 -553 -1501 -9 -281 29 -535 122 -817 119 -361 309 -665 595 -953 490 -495 1195 -762 1873 -710 257 19 407 50 650 133 323 109 655 312 892 544 146 143 343 402 438 574 181 329 283 720 285 1089 1 144 -1 168 -19 202 -39 78 -2 73 -669 79 l-595 5 -60 32 c-59 30 -305 174 -793 462 -261 154 -299 169 -359 138 -17 -9 -39 -33 -49 -54 -18 -36 -19 -70 -16 -808 3 -618 6 -776 17 -802 27 -64 120 -92 199 -59 18 8 230 138 469 290 240 151 455 285 477 296 57 29 93 26 123 -10 54 -63 43 -148 -40 -314 -103 -207 -233 -352 -431 -481 -194 -125 -439 -195 -679 -195 -565 1 -1055 352 -1231 881 -59 179 -67 233 -66 469 0 198 2 223 26 320 50 197 134 371 247 512 194 242 444 412 691 471 133 32 174 37 308 37 371 -1 677 -118 951 -364 83 -75 128 -93 182 -74 35 11 101 52 474 287 258 163 273 175 292 219 32 76 -8 145 -181 317 -277 274 -646 487 -1049 604 -120 35 -172 46 -307 66 -98 14 -382 26 -480 19z';

const ANIMATION_STYLES = `
  .genfeed-loader-root {
    opacity: 0;
    animation: genfeed-loader-reveal 180ms ease 220ms forwards;
  }

  .genfeed-loader-trace {
    fill: none;
    stroke: currentColor;
    stroke-width: 62;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: genfeed-loader-draw 2.4s cubic-bezier(0.72, 0, 0.2, 1) 220ms infinite;
  }

  .genfeed-loader-fill {
    fill: currentColor;
    opacity: 0;
    animation: genfeed-loader-fill 2.4s cubic-bezier(0.22, 1, 0.36, 1) 220ms infinite;
  }

  @keyframes genfeed-loader-reveal {
    to { opacity: 1; }
  }

  @keyframes genfeed-loader-draw {
    0% { stroke-dashoffset: 1; opacity: 1; }
    62% { stroke-dashoffset: 0; opacity: 1; }
    74%, 88% { stroke-dashoffset: 0; opacity: 0; }
    89% { stroke-dashoffset: 1; opacity: 0; }
    100% { stroke-dashoffset: 1; opacity: 1; }
  }

  @keyframes genfeed-loader-fill {
    0%, 57% { opacity: 0; }
    70%, 88% { opacity: 1; }
    100% { opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .genfeed-loader-root { animation: none; opacity: 1; }
    .genfeed-loader-trace { display: none; }
    .genfeed-loader-fill { animation: none; opacity: 1; }
  }
`;

export default function BrandLoader() {
  return (
    <output
      aria-label="Loading Genfeed"
      className="genfeed-loader-root inline-flex size-24 items-center justify-center text-foreground"
    >
      <svg
        aria-hidden="true"
        className="size-full overflow-visible"
        viewBox="0 0 500 500"
      >
        <style>{ANIMATION_STYLES}</style>
        <g transform="translate(0,500) scale(0.1,-0.1)">
          <path className="genfeed-loader-fill" d={GENFEED_MARK_PATH} />
          <path
            className="genfeed-loader-trace"
            d={GENFEED_MARK_PATH}
            pathLength="1"
          />
        </g>
      </svg>
    </output>
  );
}
