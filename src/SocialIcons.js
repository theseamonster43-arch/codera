import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

/**
 * The marks for the places a creator can be found, drawn from the same paths
 * as the website's so a profile looks like one profile across the two.
 */

const S = ({ size = 17, children }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">{children}</Svg>
);

const line = (c, w = 1.8) => ({
  stroke: c, strokeWidth: w, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round',
});

const MARKS = {
  youtube: (c, w) => (
    <>
      <Rect x="2.6" y="5.4" width="18.8" height="13.2" rx="4.2" {...line(c, w)} />
      <Path d="M10.4 9.5 15.6 12l-5.2 2.5z" {...line(c, w)} />
    </>
  ),
  x: (c) => <Path d="M4.4 3.8 19.6 20.2M20 3.8 4 20.2" {...line(c, 2.3)} />,
  instagram: (c, w) => (
    <>
      <Rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.2" {...line(c, w)} />
      <Circle cx="12" cy="12" r="4.1" {...line(c, w)} />
      <Circle cx="17.2" cy="6.9" r="1.15" fill={c} />
    </>
  ),
  tiktok: (c, w) => (
    <>
      <Path d="M13.8 3.6v10.9a3.9 3.9 0 1 1-3.9-3.9c.35 0 .7.05 1 .14" {...line(c, w)} />
      <Path d="M13.8 3.6c.4 2.7 2.4 4.6 5.1 4.8" {...line(c, w)} />
    </>
  ),
  twitch: (c, w) => (
    <>
      <Path d="M4.4 3.5h15.2v10.3l-4 4h-3.1L9.4 20.5H7.2v-2.7H4.4z" {...line(c, w)} />
      <Path d="M11.3 7.5v4.3M15.5 7.5v4.3" {...line(c, w)} />
    </>
  ),
  github: (c) => (
    <Svg width={17} height={17} viewBox="0 0 16 16">
      <Path
        fill={c}
        d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0z"
      />
    </Svg>
  ),
  gitlab: (c, w) => <Path d="M12 20.4 3.6 14.2l1.2-6.1 2.1 5h10.2l2.1-5 1.2 6.1z" {...line(c, w)} />,
  linkedin: (c, w) => (
    <>
      <Rect x="3.2" y="3.2" width="17.6" height="17.6" rx="3.6" {...line(c, w)} />
      <Path d="M7.7 10.3v6.5M11.5 16.8v-6.5M11.5 12.8c0-1.3 1-2.3 2.3-2.3s2.3 1 2.3 2.3v4" {...line(c, w)} />
      <Circle cx="7.7" cy="7.5" r="1.05" fill={c} />
    </>
  ),
  discord: (c, w) => (
    <>
      <Path
        d="M8.9 5.3A14 14 0 0 1 12 5c1.1 0 2.1.1 3.1.3l.9-1.3c1.7.5 3.2 1.3 4 2.2.9 2.9 1.2 6.3.6 9.8-1.5 1.2-3.1 2.1-4.8 2.6l-.9-1.6M8.9 5.3 8 4c-1.7.5-3.2 1.3-4 2.2-.9 2.9-1.2 6.3-.6 9.8 1.5 1.2 3.1 2.1 4.8 2.6l.9-1.6"
        {...line(c, w)}
      />
      <Circle cx="9.2" cy="12.2" r="1.3" {...line(c, w)} />
      <Circle cx="14.8" cy="12.2" r="1.3" {...line(c, w)} />
    </>
  ),
  reddit: (c, w) => (
    <>
      <Circle cx="12" cy="13.2" r="7.2" {...line(c, w)} />
      <Path d="M9.6 16.2c1.5 1.1 3.3 1.1 4.8 0" {...line(c, w)} />
      <Path d="M15.4 5.6 14.3 9.9" {...line(c, w)} />
      <Circle cx="15.8" cy="5.2" r="1.25" {...line(c, w)} />
      <Circle cx="9.5" cy="12.6" r="0.95" fill={c} />
      <Circle cx="14.5" cy="12.6" r="0.95" fill={c} />
    </>
  ),
  bluesky: (c, w) => (
    <Path
      d="M12 10.6C10.5 7.5 7 4.7 4.9 4.7c-1.5 0-1.9 1.4-1.9 3 0 2.8 1.6 5 4.5 5.4-2.2.5-2.7 1.8-1.5 3.3 1.4 1.7 4.1.9 6-3.4 1.9 4.3 4.6 5.1 6 3.4 1.2-1.5.7-2.8-1.5-3.3 2.9-.4 4.5-2.6 4.5-5.4 0-1.6-.4-3-1.9-3-2.1 0-5.6 2.8-7.1 5.9z"
      {...line(c, w)}
    />
  ),
  mastodon: (c, w) => (
    <>
      <Path d="M4.2 14.3c-.6-3.3-.5-6.4.3-8 .9-1.7 5.2-2.4 7.5-2.4s6.6.7 7.5 2.4c.8 1.6.9 4.7.3 8" {...line(c, w)} />
      <Path d="M8.2 13.4V9.8c0-1.1 1.8-1.6 2.5-.5l1.3 2 1.3-2c.7-1.1 2.5-.6 2.5.5v3.6" {...line(c, w)} />
      <Path d="M6.4 16.6c2.4 1.5 8.1 1.7 10.6.2" {...line(c, w)} />
    </>
  ),
  patreon: (c, w) => (
    <>
      <Circle cx="14.4" cy="9.8" r="5.6" {...line(c, w)} />
      <Path d="M4.4 3.9v16.2" {...line(c, 2.6)} />
    </>
  ),
  kofi: (c, w) => (
    <>
      <Path d="M3.8 6.2h12.4v6.2a4.4 4.4 0 0 1-4.4 4.4H8.2a4.4 4.4 0 0 1-4.4-4.4z" {...line(c, w)} />
      <Path d="M16.2 7.8h1.5a2.5 2.5 0 0 1 0 5h-1.5" {...line(c, w)} />
      <Path d="M4.4 20.1h11.4" {...line(c, w)} />
    </>
  ),
  substack: (c, w) => (
    <Path d="M5.2 4.6h13.6M5.2 9.2h13.6M5.2 13.6v5.8l6.8-3.2 6.8 3.2v-5.8z" {...line(c, w)} />
  ),
  web: (c, w) => (
    <>
      <Circle cx="12" cy="12" r="8.6" {...line(c, w)} />
      <Path d="M3.5 12h17M12 3.4c4.5 5 4.5 12.2 0 17.2-4.5-5-4.5-12.2 0-17.2z" {...line(c, w)} />
    </>
  ),
};

/** The mark for a place, by the key `chipsFor` hands back. */
export const SocialMark = ({ place, color, size = 17 }) => {
  const draw = MARKS[place] || MARKS.web;
  if (place === 'github') return draw(color);
  return <S size={size}>{draw(color, 1.8)}</S>;
};

export const Lock = ({ color, size = 17 }) => (
  <S size={size}>
    <Rect x="4.4" y="10.4" width="15.2" height="9.8" rx="2.6" {...line(color)} />
    <Path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6" {...line(color)} />
  </S>
);

export const Flag = ({ color, size = 17 }) => (
  <S size={size}><Path d="M5 21V4M5 4h12l-2.5 4L17 12H5" {...line(color)} /></S>
);
