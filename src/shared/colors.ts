export type ColorKey =
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'purple'
  | 'orange'
  | 'cyan'
  | 'pink'
  | 'lime'
  | 'brown';

export const COLOR_KEYS: ColorKey[] = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'cyan',
  'pink',
  'lime',
  'brown',
];

export const COLOR_HEX: Record<ColorKey, number> = {
  red: 0xff5468,
  blue: 0x4a8fff,
  green: 0x2fae57,
  yellow: 0xffd166,
  purple: 0xb978ff,
  orange: 0xff9040,
  cyan: 0x2ec5e6,
  pink: 0xff7ac8,
  lime: 0xbfe34a,
  brown: 0xa4713f,
};

export const COLOR_HEX_STR: Record<ColorKey, string> = Object.fromEntries(
  Object.entries(COLOR_HEX).map(([k, v]) => [k, '#' + v.toString(16).padStart(6, '0')])
) as Record<ColorKey, string>;

export const COLOR_LIGHT: Record<ColorKey, number> = {
  red: 0xff8a97,
  blue: 0x82b2ff,
  green: 0x6fd694,
  yellow: 0xffe09a,
  purple: 0xd0a4ff,
  orange: 0xffb680,
  cyan: 0x84e2f0,
  pink: 0xffabdd,
  lime: 0xd8ef92,
  brown: 0xc79c6a,
};
