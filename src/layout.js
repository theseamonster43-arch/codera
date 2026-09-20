import { useWindowDimensions } from 'react-native';

/**
 * How much room there is, in the terms the screens care about.
 *
 * Codera runs on a phone, on an iPad, in a window on a Vision Pro (where it is
 * the iPad app, resized by the person at will) and on a folding phone whose
 * screen changes shape as it opens. The layout treats all of those as one
 * question — how wide is the window right now — so a screen asks for columns
 * and a comfortable reading width instead of asking what device this is.
 *
 * Everything here comes from useWindowDimensions, which follows the window as
 * it is resized or a phone is unfolded, so screens re-lay-out on their own.
 */

/** Wider than this and a feed is just a long line of text to scan. */
export const CONTENT_MAX = 1180;

export default function useLayout() {
  const { width, height } = useWindowDimensions();
  const columns = width >= 1500 ? 4 : width >= 1080 ? 3 : width >= 700 ? 2 : 1;
  return {
    width,
    height,
    columns,
    wide: columns > 1,
    gutter: width >= 700 ? 22 : 16,
    /** The content's own width, centred when the window is wider. */
    content: Math.min(width, CONTENT_MAX),
    side: Math.max(0, (width - CONTENT_MAX) / 2),
  };
}
