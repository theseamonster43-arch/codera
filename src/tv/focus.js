import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable } from 'react-native';

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

/**
 * Something the remote can land on, which grows a little when it does.
 *
 * The movement is the point rather than decoration: the focused thing is the
 * only thing that can be acted on, and across a room a change of colour alone
 * is easy to miss. It lifts, so the eye catches it from the corner of vision.
 *
 * `first` asks for focus as the screen opens. Without something holding focus
 * there is nothing for the first press of the remote to move from, so the
 * first press appears to do nothing at all.
 */
export function Focusable({
  children, onPress, style, grow = 1.05, first = false, ...rest
}) {
  const [on, setOn] = useState(false);
  const lift = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(lift, {
      toValue: on ? grow : 1,
      useNativeDriver: true,
      speed: 24,
      bounciness: 7,
    }).start();
  }, [on, grow, lift]);

  return (
    <Pressable
      focusable
      hasTVPreferredFocus={first}
      onFocus={() => setOn(true)}
      onBlur={() => setOn(false)}
      onPress={onPress}
      {...rest}
    >
      <Animated.View style={[style, { transform: [{ scale: lift }] }]}>
        {typeof children === 'function' ? children(on) : children}
      </Animated.View>
    </Pressable>
  );
}

/**
 * A page arriving.
 *
 * Changing tab on a television is a whole screen changing at once, which reads
 * as a flicker unless something carries the eye across it. This is that: a
 * short rise and fade, run again whenever `key` changes.
 */
export function useArrival(key) {
  const show = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    show.setValue(0);
    Animated.timing(show, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [key, show]);

  return {
    opacity: show,
    transform: [{
      translateY: show.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }),
    }],
  };
}
