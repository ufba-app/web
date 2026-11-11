import { describe, expect, test } from 'vitest';
import { color, contrastRatio, font, fontSize, radius, space, touchTarget, type ColorToken } from '../src';

describe('tokens', () => {
  test('cores batem com a especificação', () => {
    expect(color).toEqual({
      background: '#ffffff', foreground: '#1b2a7a', accent: '#1b2a7a',
      accentForeground: '#ffffff', highlight: '#ffc93c', highlightForeground: '#1b2a7a',
      muted: '#4d5680', surfaceSoft: '#eef1fb', border: '#dfe3f0',
      success: '#146c43', successSoft: '#e3f6ec', danger: '#b3261e', dangerSoft: '#fde8e6',
    });
  });

  test('contrastRatio segue a WCAG', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  test.each<[ColorToken, ColorToken]>([
    ['foreground', 'background'], ['muted', 'background'], ['accentForeground', 'accent'],
    ['highlightForeground', 'highlight'], ['success', 'successSoft'], ['danger', 'dangerSoft'],
    ['foreground', 'surfaceSoft'],
  ])('%s sobre %s passa de 4,5:1', (fg, bg) => {
    expect(contrastRatio(color[fg], color[bg])).toBeGreaterThanOrEqual(4.5);
  });

  test('pilhas de fonte terminam em fonte sem serifa', () => {
    expect(font.display).toMatch(/^"Sora",.*sans-serif$/);
    expect(font.body).toMatch(/^"Plus Jakarta Sans",.*sans-serif$/);
  });

  test('escala, raio e toque', () => {
    expect(fontSize).toEqual([12, 13, 14, 15, 19, 24, 32, 36, 76]);
    expect(radius.base).toBe(20);
    expect(touchTarget).toBe(44);
    expect(space.every((s) => s % 4 === 0)).toBe(true);
  });
});
