import * as THREE from "three"

export type ColorMode = "neon" | "inferno" | "arctic" | "ultraviolet" | "emerald" | "sunset"

export interface ColorPalette {
  a: THREE.Color
  b: THREE.Color
  c: THREE.Color
}

export const COLOR_PALETTES: Record<ColorMode, ColorPalette> = {
  // Classic rave: electric cyan → hot magenta → acid green
  neon: {
    a: new THREE.Color(0x00ffff),
    b: new THREE.Color(0xff00ff),
    c: new THREE.Color(0x39ff14),
  },
  // Heat & energy: blood red → molten orange → blazing gold
  inferno: {
    a: new THREE.Color(0xee1100),
    b: new THREE.Color(0xff6600),
    c: new THREE.Color(0xffcc00),
  },
  // Frozen crystal: sapphire blue → electric cyan → frost white
  arctic: {
    a: new THREE.Color(0x0044ff),
    b: new THREE.Color(0x00ccff),
    c: new THREE.Color(0xddeeff),
  },
  // UV club lighting: deep purple → electric violet → UV pink
  ultraviolet: {
    a: new THREE.Color(0x7700ff),
    b: new THREE.Color(0xcc00ff),
    c: new THREE.Color(0xff44aa),
  },
  // Toxic/nature: deep teal → bright neon green → electric lime
  emerald: {
    a: new THREE.Color(0x008866),
    b: new THREE.Color(0x00ff66),
    c: new THREE.Color(0xaaff00),
  },
  // Warm horizon: coral red → amber gold → deep rose
  sunset: {
    a: new THREE.Color(0xff4466),
    b: new THREE.Color(0xffaa22),
    c: new THREE.Color(0xcc22aa),
  },
}

export const COLOR_MODE_LIST: ColorMode[] = ["neon", "inferno", "arctic", "ultraviolet", "emerald", "sunset"]
