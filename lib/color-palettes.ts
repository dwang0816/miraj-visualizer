import * as THREE from "three"

export type ColorMode = "euphoria" | "desire" | "reverie" | "rapture" | "delirium" | "solstice"

export interface ColorPalette {
  a: THREE.Color
  b: THREE.Color
  c: THREE.Color
  d: THREE.Color
  e: THREE.Color
  f: THREE.Color
  g: THREE.Color
}

export const COLOR_PALETTES: Record<ColorMode, ColorPalette> = {
  // Euphoria — the electric, overwhelming joy of a rave at its peak
  // aqua-cyan → royal blue → deep violet → hot magenta → acid green → electric orange → flash white
  euphoria: {
    a: new THREE.Color(0x00ffdd),
    b: new THREE.Color(0x0066ff),
    c: new THREE.Color(0xaa00ff),
    d: new THREE.Color(0xff0088),
    e: new THREE.Color(0x00ff44),
    f: new THREE.Color(0xff6600),
    g: new THREE.Color(0xffffaa),
  },
  // Desire — the ache of longing, raw and tender all at once
  // deep plum-red → crimson → hot red → vivid magenta → rich violet → warm pink → blush white
  desire: {
    a: new THREE.Color(0x3d0020),
    b: new THREE.Color(0x990033),
    c: new THREE.Color(0xff0055),
    d: new THREE.Color(0xdd0088),
    e: new THREE.Color(0x7700bb),
    f: new THREE.Color(0xff66bb),
    g: new THREE.Color(0xffddee),
  },
  // Reverie — the crystalline clarity of a waking dream, cold and vast
  // midnight indigo → sapphire → electric sky → ice cyan → frost white → aurora green → aurora pink
  reverie: {
    a: new THREE.Color(0x110066),
    b: new THREE.Color(0x0044ff),
    c: new THREE.Color(0x00aaff),
    d: new THREE.Color(0x55eeff),
    e: new THREE.Color(0xe0f4ff),
    f: new THREE.Color(0x88ff88),
    g: new THREE.Color(0xff66bb),
  },
  // Rapture — a transcendent ecstasy that dissolves the self entirely
  // deep indigo → electric violet → UV purple → UV pink → fluorescent yellow → transcendent cyan → blazing orange
  rapture: {
    a: new THREE.Color(0x220066),
    b: new THREE.Color(0x7700ff),
    c: new THREE.Color(0xcc00ff),
    d: new THREE.Color(0xff00bb),
    e: new THREE.Color(0xffff00),
    f: new THREE.Color(0x00ffee),
    g: new THREE.Color(0xff4400),
  },
  // Delirium — a feverish, hallucinatory state where reality dissolves
  // deep teal → vivid emerald → neon green → electric lime → toxic yellow → fever crimson → delirium blue
  delirium: {
    a: new THREE.Color(0x006644),
    b: new THREE.Color(0x00bb66),
    c: new THREE.Color(0x00ff88),
    d: new THREE.Color(0xaaff00),
    e: new THREE.Color(0xffff33),
    f: new THREE.Color(0xff0055),
    g: new THREE.Color(0x00ccff),
  },
  // Solstice — the peak of the sun, abundant light before the long turn back to dark
  // deep amber-orange → vivid orange → golden amber → bright gold → electric yellow → pale yellow → ivory white
  solstice: {
    a: new THREE.Color(0xcc4400),
    b: new THREE.Color(0xff8800),
    c: new THREE.Color(0xffbb00),
    d: new THREE.Color(0xffee00),
    e: new THREE.Color(0xffff22),
    f: new THREE.Color(0xffff99),
    g: new THREE.Color(0xfffff0),
  },
}

/**
 * Zero-allocation palette sampler. Interpolates smoothly across all 7 palette
 * colors with `t` in [0, 1] (wraps). Result is written directly into `target`.
 */
export function samplePalette(palette: ColorPalette, t: number, target: THREE.Color): void {
  const s = (((t % 1) + 1) % 1) * 6  // 6 segments across 7 colors
  if (s < 1)      target.lerpColors(palette.a, palette.b, s)
  else if (s < 2) target.lerpColors(palette.b, palette.c, s - 1)
  else if (s < 3) target.lerpColors(palette.c, palette.d, s - 2)
  else if (s < 4) target.lerpColors(palette.d, palette.e, s - 3)
  else if (s < 5) target.lerpColors(palette.e, palette.f, s - 4)
  else            target.lerpColors(palette.f, palette.g, s - 5)
}

export const COLOR_MODE_LIST: ColorMode[] = ["euphoria", "desire", "reverie", "rapture", "delirium", "solstice"]
