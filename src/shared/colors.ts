export type ColorKey = 'red' | 'blue' | 'green' | 'yellow' | 'purple';

export const COLOR_KEYS: ColorKey[] = ['red', 'blue', 'green', 'yellow', 'purple'];

export const COLOR_HEX: Record<ColorKey, number> = {
  red: 0xff5468,
  blue: 0x4a8fff,
  green: 0x4dd17a,
  yellow: 0xffd166,
  purple: 0xb978ff,
};

export const COLOR_HEX_STR: Record<ColorKey, string> = Object.fromEntries(
  Object.entries(COLOR_HEX).map(([k, v]) => [k, '#' + v.toString(16).padStart(6, '0')])
) as Record<ColorKey, string>;

export const COLOR_LIGHT: Record<ColorKey, number> = {
  red: 0xff8a97,
  blue: 0x82b2ff,
  green: 0x84e2a5,
  yellow: 0xffe09a,
  purple: 0xd0a4ff,
};
