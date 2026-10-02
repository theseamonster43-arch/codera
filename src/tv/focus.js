import { useState } from 'react';
import { Platform } from 'react-native';

/**
 * Whether this is running on a television.
 *
 * Android sets the UI mode to television and React Native passes that through,
 * so nothing has to be guessed from the screen size — a tablet is not a TV and
 * a TV is not a big tablet.
 */
export const isTV = Platform.isTV === true;

/**
 * Focus, which is what a television has instead of a finger.
 *
 * Nothing on a TV is touched: the remote moves focus from one thing to the next
 * and the middle button presses whatever has it. So every control has to say,
 * plainly, which one that is — a card nobody can tell is selected is a card
 * nobody can press on purpose.
 */
export function useFocus() {
  const [on, setOn] = useState(false);
  return {
    on,
    bind: {
      focusable: true,
      onFocus: () => setOn(true),
      onBlur: () => setOn(false),
    },
  };
}
