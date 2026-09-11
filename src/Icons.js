import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

/**
 * Drawn here rather than pulled from an icon font.
 *
 * A font pack brings Material's house style with it, which looks like Android
 * rather than like Codera. These are the same paths the web player uses, so
 * the two stay recognisably one product.
 */
const S = ({ size = 24, children }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">{children}</Svg>
);

const stroke = (c, w = 1.9) => ({
  stroke: c, strokeWidth: w, fill: 'none',
  strokeLinecap: 'round', strokeLinejoin: 'round',
});

export const Home = ({ color, size, filled }) => (
  <S size={size}>
    <Path
      d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"
      {...(filled ? { fill: color } : stroke(color))}
    />
  </S>
);

// Play inside a rounded frame: a short, rather than a generic play button,
// which the tab bar would otherwise share with Home.
export const Shorts = ({ color, size, filled }) => (
  <S size={size}>
    <Rect x="4" y="2.5" width="16" height="19" rx="3.5"
          {...(filled ? { fill: color } : stroke(color))} />
    <Path d="M10.5 9.2v5.6l4.6-2.8z"
          fill={filled ? '#04140a' : color} />
  </S>
);

export const Plus = ({ color, size }) => (
  <S size={size}>
    <Path d="M12 5v14M5 12h14" {...stroke(color, 2.2)} />
  </S>
);

// Two figures: this is people you follow, not a bookmark list.
export const Followed = ({ color, size, filled }) => (
  <S size={size}>
    <Circle cx="9" cy="8" r="3.4" {...(filled ? { fill: color } : stroke(color))} />
    <Path d="M2.8 20.2c0-3.3 2.8-5.4 6.2-5.4s6.2 2.1 6.2 5.4"
          {...(filled ? { fill: color } : stroke(color))} />
    <Path d="M16.5 5.2a3.2 3.2 0 0 1 0 6.1M17.8 14.9c2.2.5 3.7 2.1 3.7 4.4"
          {...stroke(color)} />
  </S>
);

export const Person = ({ color, size, filled }) => (
  <S size={size}>
    <Circle cx="12" cy="8" r="3.6" {...(filled ? { fill: color } : stroke(color))} />
    <Path d="M4.8 20.5c0-3.6 3.2-5.9 7.2-5.9s7.2 2.3 7.2 5.9"
          {...(filled ? { fill: color } : stroke(color))} />
  </S>
);

export const Play = ({ color, size = 24 }) => (
  <S size={size}><Path d="M8 5v14l11-7z" fill={color} /></S>
);

export const Heart = ({ color, size = 24, filled }) => (
  <S size={size}>
    <Path d="M12 20.3 4.7 13a4.6 4.6 0 0 1 6.5-6.5l.8.8.8-.8A4.6 4.6 0 0 1 19.3 13z"
          {...(filled ? { fill: color } : stroke(color))} />
  </S>
);

export const Comment = ({ color, size = 24 }) => (
  <S size={size}>
    <Path d="M21 11.5a8 8 0 0 1-8 8H7l-4 2.5V11.5a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"
          {...stroke(color)} />
  </S>
);

export const Code = ({ color, size = 24 }) => (
  <S size={size}>
    <Path d="M8.5 8 5 12l3.5 4M15.5 8l3.5 4-3.5 4M13.6 5.5l-3.2 13"
          {...stroke(color)} />
  </S>
);

export const Search = ({ color, size = 24 }) => (
  <S size={size}>
    <Circle cx="11" cy="11" r="6.4" {...stroke(color)} />
    <Path d="M16 16l4.5 4.5" {...stroke(color)} />
  </S>
);

// A large four-point star with a small one beside it: Codera Plus.
export const Sparkle = ({ color, size = 24, filled }) => (
  <S size={size}>
    <Path
      d="M10 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5z"
      {...(filled ? { fill: color } : stroke(color, 1.7))}
    />
    <Path d="M18 14.5c.3 1.9 1.1 2.7 3 3-1.9.3-2.7 1.1-3 3-.3-1.9-1.1-2.7-3-3 1.9-.3 2.7-1.1 3-3z"
          fill={color} />
  </S>
);

// A screen with a line through it: no ads.
export const NoAds = ({ color, size = 24 }) => (
  <S size={size}>
    <Rect x="3" y="5" width="18" height="13" rx="3" {...stroke(color, 1.8)} />
    <Path d="M10.2 9.4v4.2l3.6-2.1z" fill={color} />
    <Path d="M4 21 20 3" {...stroke(color, 1.8)} />
  </S>
);

export const Check = ({ color, size = 24 }) => (
  <S size={size}>
    <Path d="M5 12.5 9.8 17 19 7.5" {...stroke(color, 2.4)} />
  </S>
);

export const Close = ({ color, size = 24 }) => (
  <S size={size}>
    <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...stroke(color, 2.1)} />
  </S>
);

export const Chevron = ({ color, size = 24 }) => (
  <S size={size}>
    <Path d="M9.5 5.5 16 12l-6.5 6.5" {...stroke(color, 2)} />
  </S>
);
