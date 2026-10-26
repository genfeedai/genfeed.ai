// SVG icons shared by the injected Genfeed controls

export const icons = {
  bookmark: `
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z"></path>
    </svg>
  `,
  check: `
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
      <path d="m5 12 5 5L20 6"></path>
    </svg>
  `,
  chevron: `
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
      <path d="m6 9 6 6 6-6"></path>
    </svg>
  `,
  edit: `
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
  `,
  gif: `
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
      <text x="12" y="15" font-size="8" font-weight="bold" fill="currentColor" text-anchor="middle">GIF</text>
    </svg>
  `,
  image: `
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
      <circle cx="9" cy="9" r="2"></circle>
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
    </svg>
  `,
  sparkles: `
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path>
      <path d="M20 3v4"></path>
      <path d="M22 5h-4"></path>
      <path d="M4 17v2"></path>
      <path d="M5 18H3"></path>
    </svg>
  `,
  spinner: `
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg" class="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
    </svg>
  `,
  video: `
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
      <polygon points="10 8 16 12 10 16 10 8"></polygon>
    </svg>
  `,
  x: `
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 6 6 18"></path>
      <path d="m6 6 12 12"></path>
    </svg>
  `,
};

/** Outline of the Genfeed G, in a 500 x 500 box flipped by its group transform. */
export const GENFEED_MARK_PATH =
  'M2360 4944 c-490 -32 -952 -211 -1352 -524 -105 -82 -293 -269 -382 -380 -347 -433 -535 -944 -553 -1501 -9 -281 29 -535 122 -817 119 -361 309 -665 595 -953 490 -495 1195 -762 1873 -710 257 19 407 50 650 133 323 109 655 312 892 544 146 143 343 402 438 574 181 329 283 720 285 1089 1 144 -1 168 -19 202 -39 78 -2 73 -669 79 l-595 5 -60 32 c-59 30 -305 174 -793 462 -261 154 -299 169 -359 138 -17 -9 -39 -33 -49 -54 -18 -36 -19 -70 -16 -808 3 -618 6 -776 17 -802 27 -64 120 -92 199 -59 18 8 230 138 469 290 240 151 455 285 477 296 57 29 93 26 123 -10 54 -63 43 -148 -40 -314 -103 -207 -233 -352 -431 -481 -194 -125 -439 -195 -679 -195 -565 1 -1055 352 -1231 881 -59 179 -67 233 -66 469 0 198 2 223 26 320 50 197 134 371 247 512 194 242 444 412 691 471 133 32 174 37 308 37 371 -1 677 -118 951 -364 83 -75 128 -93 182 -74 35 11 101 52 474 287 258 163 273 175 292 219 32 76 -8 145 -181 317 -277 274 -646 487 -1049 604 -120 35 -172 46 -307 66 -98 14 -382 26 -480 19z';

/**
 * The filled Genfeed brand mark from `apps/app/public/logo.svg`, drawn in
 * `currentColor` so it takes the colour of the button it sits in.
 */
export const genfeedMark = `
  <svg viewBox="0 0 500 500" width="20" height="20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g transform="translate(0,500) scale(0.1,-0.1)">
      <path d="${GENFEED_MARK_PATH}"></path>
    </g>
  </svg>
`;
