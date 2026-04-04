import localFont from 'next/font/local';

/**
 * Satoshi - Primary sans-serif font for UI and body text
 * Download from: https://fontshare.com/fonts/satoshi
 *
 * Font files required in ./files/:
 * - Satoshi-Regular.woff2
 * - Satoshi-Medium.woff2
 * - Satoshi-Bold.woff2
 * - Satoshi-Black.woff2
 */
export const satoshi = localFont({
  display: 'swap',
  preload: true,
  src: [
    {
      path: './files/Satoshi-Regular.woff2',
      style: 'normal',
      weight: '400',
    },
    {
      path: './files/Satoshi-Medium.woff2',
      style: 'normal',
      weight: '500',
    },
    {
      path: './files/Satoshi-Bold.woff2',
      style: 'normal',
      weight: '700',
    },
    {
      path: './files/Satoshi-Black.woff2',
      style: 'normal',
      weight: '900',
    },
  ],
  variable: '--font-sans',
});

/**
 * Zodiak - Editorial serif font for headlines and accents
 * Download from: https://fontshare.com/fonts/zodiak
 *
 * Font files required in ./files/:
 * - Zodiak-Regular.woff2
 * - Zodiak-Bold.woff2
 */
export const zodiak = localFont({
  display: 'swap',
  preload: false, // Only preload primary font
  src: [
    {
      path: './files/Zodiak-Light.woff2',
      style: 'normal',
      weight: '300',
    },
    {
      path: './files/Zodiak-LightItalic.woff2',
      style: 'italic',
      weight: '300',
    },
    {
      path: './files/Zodiak-Regular.woff2',
      style: 'normal',
      weight: '400',
    },
    {
      path: './files/Zodiak-Italic.woff2',
      style: 'italic',
      weight: '400',
    },
    {
      path: './files/Zodiak-Bold.woff2',
      style: 'normal',
      weight: '700',
    },
    {
      path: './files/Zodiak-BoldItalic.woff2',
      style: 'italic',
      weight: '700',
    },
  ],
  variable: '--font-serif',
});

/**
 * Get combined font class names for use in html element
 * @example
 * <html className={fontVariables}>
 */
export const fontVariables = `${satoshi.variable} ${zodiak.variable}`;

/**
 * Font class names for direct usage
 */
export const fontClassNames = {
  sans: satoshi.className,
  serif: zodiak.className,
};
