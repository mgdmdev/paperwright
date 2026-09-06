import { readFile } from 'node:fs/promises';
import type { FontFace } from './engine';

const FILES: { file: string; weight: FontFace['weight']; style: FontFace['style'] }[] = [
  { file: 'Inter-Regular.ttf', weight: 400, style: 'normal' },
  { file: 'Inter-Italic.ttf', weight: 400, style: 'italic' },
  { file: 'Inter-Medium.ttf', weight: 500, style: 'normal' },
  { file: 'Inter-SemiBold.ttf', weight: 600, style: 'normal' },
  { file: 'Inter-Bold.ttf', weight: 700, style: 'normal' },
];

let cached: Promise<FontFace[]> | undefined;

/**
 * Inter 4.1 (SIL Open Font License), shipped with the package so a render works with no setup.
 * The files sit next to `dist` and `src` alike, so the relative path holds in both layouts.
 */
export function bundledFonts(): Promise<FontFace[]> {
  cached ??= Promise.all(
    FILES.map(async (f) => ({
      family: 'Inter',
      weight: f.weight,
      style: f.style,
      data: new Uint8Array(await readFile(new URL(`../fonts/${f.file}`, import.meta.url))),
    })),
  );
  return cached;
}
