import { Dimensions, Platform, useWindowDimensions } from 'react-native';

/**
 * Room for iPadOS 26's window buttons.
 *
 * A windowed app on iPad gets the three round window controls floating over its
 * top-left corner, on top of whatever is drawn there — Codera's mark, a Cancel
 * button, a Close. Full screen, and on every other platform, they don't exist
 * and this is zero.
 *
 * Windowed is judged by the app's window being smaller than the display it is
 * on, which is also true in Split View and Slide Over — where the controls
 * appear as well.
 */
const CONTROLS_WIDTH = 72;

export default function useWindowControls() {
  const { width, height } = useWindowDimensions();
  if (!Platform.isPad) return 0;

  const screen = Dimensions.get('screen');
  // A point of slack: window and screen rarely match to the pixel.
  const windowed = width < screen.width - 1 || height < screen.height - 1;
  return windowed ? CONTROLS_WIDTH : 0;
}
