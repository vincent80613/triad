import type { SkinVariant } from '@shared/types'

export type SkinCategory =
  | 'Classic'
  | 'Fantasy'
  | 'Armor'
  | 'Nature'
  | 'Neon'
  | 'Adventure'
  | 'Royal'
  | 'Cozy'

type SkinStyle = 'hero' | 'hoodie' | 'armor' | 'ranger' | 'neon' | 'royal' | 'mage' | 'ninja' | 'solid'

interface Palette {
  skin: string
  hair: string
  eye: string
  shirt: string
  pants: string
  shoes: string
  accent: string
  accent2?: string
}

export interface SkinPreset {
  id: string
  name: string
  category: SkinCategory
  variant: SkinVariant
  style: SkinStyle
  palette: Palette
}

const CURATED_PRESETS: SkinPreset[] = [
  {
    id: 'wayfarer',
    name: 'Wayfarer',
    category: 'Classic',
    variant: 'classic',
    style: 'hero',
    palette: { skin: '#f0c8a0', hair: '#5b3a1e', eye: '#3c7a8f', shirt: '#3f6fb5', pants: '#26344d', shoes: '#141c2b', accent: '#e8c469' }
  },
  {
    id: 'ember-knight',
    name: 'Ember Knight',
    category: 'Armor',
    variant: 'classic',
    style: 'armor',
    palette: { skin: '#d9a066', hair: '#2a1b12', eye: '#c76b34', shirt: '#5b1f24', pants: '#2a1e1e', shoes: '#171111', accent: '#e2a33e', accent2: '#f4d08a' }
  },
  {
    id: 'frost-ranger',
    name: 'Frost Ranger',
    category: 'Nature',
    variant: 'classic',
    style: 'ranger',
    palette: { skin: '#efc9a8', hair: '#d8e6f2', eye: '#8ec9d9', shirt: '#2c5d6b', pants: '#203a44', shoes: '#14232b', accent: '#9fe8ff' }
  },
  {
    id: 'neon-runner',
    name: 'Neon Runner',
    category: 'Neon',
    variant: 'classic',
    style: 'neon',
    palette: { skin: '#b98264', hair: '#1a1630', eye: '#46f5ff', shirt: '#1b1930', pants: '#101020', shoes: '#0b0b12', accent: '#ff4fd8', accent2: '#46f5ff' }
  },
  {
    id: 'moss-druid',
    name: 'Moss Druid',
    category: 'Nature',
    variant: 'classic',
    style: 'mage',
    palette: { skin: '#c9a27a', hair: '#384d2b', eye: '#adc976', shirt: '#3c5b32', pants: '#283c22', shoes: '#1c2a18', accent: '#b8d26f' }
  },
  {
    id: 'void-walker',
    name: 'Void Walker',
    category: 'Fantasy',
    variant: 'classic',
    style: 'mage',
    palette: { skin: '#b7a6c9', hair: '#241b3b', eye: '#9d7bff', shirt: '#2a2146', pants: '#1d1833', shoes: '#120f22', accent: '#9d7bff', accent2: '#d9c8ff' }
  },
  {
    id: 'golden-hero',
    name: 'Golden Hero',
    category: 'Royal',
    variant: 'classic',
    style: 'hero',
    palette: { skin: '#e8b88f', hair: '#3b2a16', eye: '#8b6a2e', shirt: '#b8862e', pants: '#4b3a20', shoes: '#2b2216', accent: '#fff1a8' }
  },
  {
    id: 'rose-assassin',
    name: 'Rose Assassin',
    category: 'Fantasy',
    variant: 'classic',
    style: 'ninja',
    palette: { skin: '#e2b394', hair: '#7a243c', eye: '#ff7a9b', shirt: '#3a1822', pants: '#24141a', shoes: '#120b0e', accent: '#ff7a9b' }
  },
  {
    id: 'sky-captain',
    name: 'Sky Captain',
    category: 'Adventure',
    variant: 'classic',
    style: 'hero',
    palette: { skin: '#e6b98d', hair: '#4a3020', eye: '#5c99c7', shirt: '#315b8a', pants: '#243d5a', shoes: '#172738', accent: '#ffd76a' }
  },
  {
    id: 'crimson-monk',
    name: 'Crimson Monk',
    category: 'Fantasy',
    variant: 'classic',
    style: 'mage',
    palette: { skin: '#d9a87c', hair: '#261515', eye: '#d49a4d', shirt: '#6f2024', pants: '#4a1a1d', shoes: '#2a1012', accent: '#f0b45c' }
  },
  {
    id: 'emerald-archer',
    name: 'Emerald Archer',
    category: 'Nature',
    variant: 'classic',
    style: 'ranger',
    palette: { skin: '#e3b88f', hair: '#5a3a22', eye: '#6fae6f', shirt: '#2f5b3a', pants: '#243f2c', shoes: '#17291d', accent: '#c7e36a' }
  },
  {
    id: 'arcane-scholar',
    name: 'Arcane Scholar',
    category: 'Fantasy',
    variant: 'classic',
    style: 'mage',
    palette: { skin: '#e7c3a4', hair: '#493759', eye: '#8b6fc7', shirt: '#4b3b73', pants: '#332852', shoes: '#211a36', accent: '#f0cf8a', accent2: '#bda7ff' }
  },
  {
    id: 'desert-nomad',
    name: 'Desert Nomad',
    category: 'Adventure',
    variant: 'classic',
    style: 'ranger',
    palette: { skin: '#c99a6b', hair: '#3a2818', eye: '#b58442', shirt: '#b07a43', pants: '#6f4a2a', shoes: '#3d2a1b', accent: '#f4d28c' }
  },
  {
    id: 'deepsea-diver',
    name: 'Deepsea Diver',
    category: 'Adventure',
    variant: 'classic',
    style: 'armor',
    palette: { skin: '#c99c78', hair: '#1e3c4a', eye: '#77e0e8', shirt: '#1e5368', pants: '#173b4d', shoes: '#0f2633', accent: '#77e0e8', accent2: '#b8f4f4' }
  },
  {
    id: 'candy-pop',
    name: 'Candy Pop',
    category: 'Cozy',
    variant: 'classic',
    style: 'hoodie',
    palette: { skin: '#f2c6b0', hair: '#ffb3d1', eye: '#8b5a9a', shirt: '#ff8ec4', pants: '#6a4a8a', shoes: '#3e2b55', accent: '#fff0a6', accent2: '#ffffff' }
  },
  {
    id: 'pixel-punk',
    name: 'Pixel Punk',
    category: 'Neon',
    variant: 'classic',
    style: 'neon',
    palette: { skin: '#d9a17f', hair: '#2b1d2c', eye: '#8bff6a', shirt: '#25202f', pants: '#191624', shoes: '#100e16', accent: '#8bff6a', accent2: '#ffe45c' }
  },
  {
    id: 'lava-smith',
    name: 'Lava Smith',
    category: 'Armor',
    variant: 'classic',
    style: 'armor',
    palette: { skin: '#c98b61', hair: '#231b16', eye: '#ff8a3d', shirt: '#4a2a22', pants: '#2b1f1a', shoes: '#17110e', accent: '#ff8a3d', accent2: '#ffd16a' }
  },
  {
    id: 'cloud-jumper',
    name: 'Cloud Jumper',
    category: 'Adventure',
    variant: 'classic',
    style: 'hoodie',
    palette: { skin: '#ecc7a7', hair: '#d8d0c3', eye: '#75a7c9', shirt: '#7b8fae', pants: '#47566e', shoes: '#2d3747', accent: '#ffffff', accent2: '#c8e8ff' }
  },
  {
    id: 'shadow-ninja',
    name: 'Shadow Ninja',
    category: 'Fantasy',
    variant: 'classic',
    style: 'ninja',
    palette: { skin: '#b9997e', hair: '#16151a', eye: '#d14b4b', shirt: '#202027', pants: '#15151b', shoes: '#0b0b0e', accent: '#d14b4b' }
  },
  {
    id: 'copper-explorer',
    name: 'Copper Explorer',
    category: 'Adventure',
    variant: 'classic',
    style: 'ranger',
    palette: { skin: '#e0b28a', hair: '#6b3d24', eye: '#5c9b7c', shirt: '#8a5a36', pants: '#4b3424', shoes: '#2b1f16', accent: '#7fd3b3' }
  },
  {
    id: 'winter-mage',
    name: 'Winter Mage',
    category: 'Royal',
    variant: 'classic',
    style: 'mage',
    palette: { skin: '#eac8b2', hair: '#e7f2ff', eye: '#8fd8ff', shirt: '#516581', pants: '#33415a', shoes: '#202a3b', accent: '#b8e9ff', accent2: '#ffffff' }
  },
  {
    id: 'circuit-breaker',
    name: 'Circuit Breaker',
    category: 'Neon',
    variant: 'classic',
    style: 'neon',
    palette: { skin: '#b58a70', hair: '#202a3a', eye: '#41f0c8', shirt: '#182234', pants: '#101827', shoes: '#090e17', accent: '#41f0c8', accent2: '#4da8ff' }
  },
  {
    id: 'royal-guard',
    name: 'Royal Guard',
    category: 'Royal',
    variant: 'classic',
    style: 'armor',
    palette: { skin: '#dfb68f', hair: '#3a2a1d', eye: '#6b7ea6', shirt: '#3f476d', pants: '#252b45', shoes: '#151829', accent: '#d8b35d', accent2: '#f7e3a1' }
  },
  {
    id: 'honey-keeper',
    name: 'Honey Keeper',
    category: 'Cozy',
    variant: 'classic',
    style: 'hoodie',
    palette: { skin: '#e7bc91', hair: '#5a3d21', eye: '#9b7635', shirt: '#d19a3c', pants: '#6b4c2a', shoes: '#3b2a18', accent: '#fff0b8' }
  },
  {
    id: 'seafoam-sage',
    name: 'Seafoam Sage',
    category: 'Nature',
    variant: 'classic',
    style: 'mage',
    palette: { skin: '#d9b28c', hair: '#2c6b5d', eye: '#7dd6c3', shirt: '#2f7466', pants: '#234f47', shoes: '#15332f', accent: '#b8ffe3' }
  },
  {
    id: 'sunset-samurai',
    name: 'Sunset Samurai',
    category: 'Armor',
    variant: 'classic',
    style: 'armor',
    palette: { skin: '#e0b086', hair: '#2b1b1a', eye: '#d85e4a', shirt: '#6f2f35', pants: '#392026', shoes: '#1d1115', accent: '#ffb35c', accent2: '#ffd9a0' }
  },
  {
    id: 'full-black',
    name: 'Full Black',
    category: 'Classic',
    variant: 'classic',
    style: 'solid',
    palette: { skin: '#000000', hair: '#000000', eye: '#000000', shirt: '#000000', pants: '#000000', shoes: '#000000', accent: '#000000', accent2: '#000000' }
  },
  {
    id: 'full-white',
    name: 'Full White',
    category: 'Classic',
    variant: 'classic',
    style: 'solid',
    palette: { skin: '#ffffff', hair: '#ffffff', eye: '#ffffff', shirt: '#ffffff', pants: '#ffffff', shoes: '#ffffff', accent: '#ffffff', accent2: '#ffffff' }
  }
]

export const SKIN_CATEGORIES: SkinCategory[] = [
  'Classic',
  'Fantasy',
  'Armor',
  'Nature',
  'Neon',
  'Adventure',
  'Royal',
  'Cozy'
]

const GENERATED_TARGET = 600
const SKIN_TONES = [
  '#f6d5b8',
  '#f0c9a8',
  '#e8bd96',
  '#dfae84',
  '#d5a273',
  '#c99363',
  '#bc8153',
  '#ae7045',
  '#9a603b',
  '#83502f',
  '#6b402b',
  '#553329'
]
const ADJECTIVES = [
  'Amber',
  'Arctic',
  'Ashen',
  'Astral',
  'Aurora',
  'Beryl',
  'Blaze',
  'Cobalt',
  'Coral',
  'Crimson',
  'Crystal',
  'Dawn',
  'Dusk',
  'Ember',
  'Fern',
  'Frost',
  'Gale',
  'Gilded',
  'Gloom',
  'Gold',
  'Honey',
  'Indigo',
  'Ivory',
  'Jade',
  'Lunar',
  'Moss',
  'Neon',
  'Obsidian',
  'Ocean',
  'Onyx',
  'Pearl',
  'Rose',
  'Ruby',
  'Saffron',
  'Shadow',
  'Silver',
  'Solar',
  'Storm',
  'Sunset',
  'Thorn',
  'Violet',
  'Wild'
]
const NOUNS = [
  'Archer',
  'Warden',
  'Knight',
  'Ranger',
  'Mage',
  'Ronin',
  'Scout',
  'Sentinel',
  'Nomad',
  'Alchemist',
  'Diver',
  'Explorer',
  'Guardian',
  'Hunter',
  'Monk',
  'Pilot',
  'Sage',
  'Scholar',
  'Smith',
  'Wanderer',
  'Warrior',
  'Weaver',
  'Tinker',
  'Voyager'
]

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360
  const s = Math.max(0, Math.min(100, saturation)) / 100
  const l = Math.max(0, Math.min(100, lightness)) / 100
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const segment = h / 60
  const x = chroma * (1 - Math.abs((segment % 2) - 1))
  const m = l - chroma / 2
  let r = 0
  let g = 0
  let b = 0
  if (segment < 1) [r, g, b] = [chroma, x, 0]
  else if (segment < 2) [r, g, b] = [x, chroma, 0]
  else if (segment < 3) [r, g, b] = [0, chroma, x]
  else if (segment < 4) [r, g, b] = [0, x, chroma]
  else if (segment < 5) [r, g, b] = [x, 0, chroma]
  else [r, g, b] = [chroma, 0, x]
  const channel = (value: number): string =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

function generatedStyle(category: SkinCategory, seed: number): SkinStyle {
  switch (category) {
    case 'Armor':
      return 'armor'
    case 'Neon':
      return 'neon'
    case 'Nature':
      return seed % 2 === 0 ? 'ranger' : 'mage'
    case 'Royal':
      return seed % 3 === 0 ? 'mage' : 'royal'
    case 'Fantasy':
      return ['mage', 'ninja', 'hero'][seed % 3] as SkinStyle
    case 'Adventure':
      return seed % 2 === 0 ? 'ranger' : 'hero'
    case 'Cozy':
      return 'hoodie'
    default:
      return seed % 2 === 0 ? 'hero' : 'hoodie'
  }
}

function buildGeneratedPresets(): SkinPreset[] {
  const usedNames = new Set(CURATED_PRESETS.map((preset) => preset.name.toLowerCase()))
  const generated: SkinPreset[] = []
  let cursor = 0
  const combinations = ADJECTIVES.length * NOUNS.length
  while (generated.length < GENERATED_TARGET && cursor < combinations) {
    const adjective = ADJECTIVES[cursor % ADJECTIVES.length]
    const noun = NOUNS[(Math.floor(cursor / ADJECTIVES.length) + cursor) % NOUNS.length]
    cursor += 1
    const name = `${adjective} ${noun}`
    if (usedNames.has(name.toLowerCase())) continue
    usedNames.add(name.toLowerCase())

    const seed = generated.length
    const category = SKIN_CATEGORIES[seed % SKIN_CATEGORIES.length]
    const hue = (seed * 137.508 + 23) % 360
    const accentHue = (hue + 165 + (seed % 4) * 14) % 360
    generated.push({
      id: `generated-${seed + 1}`,
      name,
      category,
      variant: 'classic',
      style: generatedStyle(category, seed),
      palette: {
        skin: SKIN_TONES[(seed + cursor) % SKIN_TONES.length],
        hair: hslToHex(hue + 245, 38 + (seed % 3) * 9, 14 + (seed % 4) * 4),
        eye: hslToHex(accentHue + 20, 58, 58),
        shirt: hslToHex(hue, 42 + (seed % 4) * 8, 31 + (seed % 5) * 4),
        pants: hslToHex(hue + 205, 26 + (seed % 3) * 5, 18 + (seed % 4) * 4),
        shoes: hslToHex(hue + 215, 19, 9 + (seed % 3) * 2),
        accent: hslToHex(accentHue, 68 + (seed % 3) * 6, 59 + (seed % 4) * 4),
        accent2: hslToHex(accentHue + 42, 64, 72)
      }
    })
  }
  return generated
}

// The catalogue stays metadata-only until a card is visible; textures are painted lazily.
const PRESETS: SkinPreset[] = [...CURATED_PRESETS, ...buildGeneratedPresets()]

function shade(hex: string, amount: number): string {
  const clean = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(clean)) return hex
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(clean.slice(offset, offset + 2), 16)
    return Math.max(0, Math.min(255, value + amount))
      .toString(16)
      .padStart(2, '0')
  })
  return `#${channels.join('')}`
}

function fill(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string
): void {
  context.fillStyle = color
  context.fillRect(x, y, width, height)
}

function drawHead(
  context: CanvasRenderingContext2D,
  palette: Palette,
  style: SkinStyle
): void {
  const hairShade = shade(palette.hair, -22)
  const skinShade = shade(palette.skin, -20)
  fill(context, 8, 0, 8, 8, palette.hair)
  fill(context, 16, 0, 8, 8, skinShade)
  fill(context, 0, 8, 8, 8, palette.skin)
  fill(context, 8, 8, 8, 8, palette.skin)
  fill(context, 16, 8, 8, 8, palette.skin)
  fill(context, 24, 8, 8, 8, palette.hair)

  fill(context, 0, 8, 8, 2, palette.hair)
  fill(context, 16, 8, 8, 2, palette.hair)
  fill(context, 8, 8, 8, 2, palette.hair)
  fill(context, 9, 8, 1, 3, hairShade)
  fill(context, 14, 8, 1, 3, hairShade)

  if (style === 'mage' || style === 'ninja' || style === 'ranger') {
    fill(context, 0, 10, 1, 4, palette.hair)
    fill(context, 7, 10, 1, 3, palette.hair)
    fill(context, 24, 12, 8, 4, palette.hair)
  }
  if (style === 'ninja') {
    fill(context, 8, 11, 8, 5, palette.shirt)
    fill(context, 9, 11, 6, 1, shade(palette.shirt, 18))
    fill(context, 10, 11, 1, 1, palette.eye)
    fill(context, 13, 11, 1, 1, palette.eye)
    fill(context, 11, 14, 2, 1, shade(palette.shirt, -20))
    return
  }
  if (style === 'royal') {
    fill(context, 8, 8, 8, 1, palette.accent)
    fill(context, 10, 7, 1, 1, palette.accent)
    fill(context, 13, 7, 1, 1, palette.accent)
  }

  fill(context, 10, 10, 1, 1, shade(palette.hair, 10))
  fill(context, 13, 10, 1, 1, shade(palette.hair, 10))
  fill(context, 10, 11, 1, 1, '#f7f4ed')
  fill(context, 13, 11, 1, 1, '#f7f4ed')
  fill(context, 11, 11, 1, 1, palette.eye)
  fill(context, 14, 11, 1, 1, palette.eye)
  fill(context, 12, 12, 1, 1, skinShade)
  fill(context, 11, 14, 2, 1, shade(palette.skin, -42))
  if (style === 'hoodie' || style === 'mage') {
    fill(context, 9, 13, 1, 1, shade(palette.accent, -10))
    fill(context, 14, 13, 1, 1, shade(palette.accent, -10))
  }
}

function drawBody(
  context: CanvasRenderingContext2D,
  palette: Palette,
  style: SkinStyle
): void {
  const shirtShade = shade(palette.shirt, -22)
  const shirtLight = shade(palette.shirt, 18)
  fill(context, 20, 16, 8, 4, palette.shirt)
  fill(context, 28, 16, 8, 4, shirtShade)
  fill(context, 16, 20, 4, 12, shirtShade)
  fill(context, 20, 20, 8, 12, palette.shirt)
  fill(context, 28, 20, 4, 12, shirtShade)
  fill(context, 32, 20, 8, 12, palette.shirt)
  fill(context, 20, 20, 8, 1, shirtLight)
  fill(context, 20, 28, 8, 1, shade(palette.pants, -8))

  if (style === 'hero' || style === 'royal') {
    fill(context, 20, 20, 1, 9, shirtShade)
    fill(context, 27, 20, 1, 9, shirtShade)
    fill(context, 22, 23, 4, 3, palette.accent)
    fill(context, 23, 24, 2, 1, palette.accent2 ?? '#ffffff')
    fill(context, 22, 28, 4, 1, palette.accent)
    fill(context, 35, 23, 2, 2, palette.accent)
  }
  if (style === 'hoodie') {
    fill(context, 22, 20, 4, 1, shirtShade)
    fill(context, 21, 25, 6, 3, shirtShade)
    fill(context, 23, 21, 1, 3, palette.accent)
    fill(context, 24, 21, 1, 2, palette.accent)
    fill(context, 20, 27, 8, 1, shade(palette.shirt, -12))
    fill(context, 35, 22, 3, 4, shirtShade)
  }
  if (style === 'armor') {
    fill(context, 21, 21, 6, 7, shirtShade)
    fill(context, 23, 21, 2, 6, shade(palette.shirt, -38))
    fill(context, 22, 22, 4, 1, palette.accent2 ?? palette.accent)
    fill(context, 20, 28, 8, 1, palette.accent)
    fill(context, 23, 28, 2, 1, shade(palette.accent, -30))
    fill(context, 34, 21, 4, 7, shirtShade)
    fill(context, 35, 22, 2, 1, palette.accent)
  }
  if (style === 'ranger') {
    fill(context, 20, 20, 8, 1, palette.accent)
    fill(context, 21, 21, 2, 8, shade(palette.accent, -28))
    fill(context, 25, 22, 2, 6, shade(palette.shirt, -28))
    fill(context, 25, 23, 1, 1, palette.accent)
    fill(context, 25, 25, 1, 1, palette.accent)
    fill(context, 35, 22, 2, 5, shade(palette.shirt, -28))
  }
  if (style === 'neon') {
    fill(context, 20, 20, 1, 9, palette.accent)
    fill(context, 27, 20, 1, 9, palette.accent2 ?? palette.accent)
    fill(context, 22, 23, 4, 1, palette.accent2 ?? palette.accent)
    fill(context, 24, 24, 1, 3, palette.accent)
    fill(context, 22, 27, 4, 1, shade(palette.accent, -18))
    fill(context, 35, 22, 2, 6, palette.accent2 ?? palette.accent)
  }
  if (style === 'mage') {
    fill(context, 20, 20, 8, 1, palette.accent)
    fill(context, 20, 24, 8, 1, shade(palette.accent, -18))
    fill(context, 20, 27, 8, 1, palette.accent)
    fill(context, 22, 21, 1, 7, shade(palette.shirt, 24))
    fill(context, 35, 21, 2, 7, shade(palette.accent, -22))
  }
  if (style === 'ninja') {
    fill(context, 20, 23, 8, 1, palette.accent)
    fill(context, 21, 20, 1, 8, shade(palette.shirt, 20))
    fill(context, 26, 20, 1, 8, shade(palette.shirt, 20))
    fill(context, 23, 26, 2, 2, shade(palette.shirt, -28))
    fill(context, 35, 22, 2, 4, shade(palette.shirt, -18))
  }
}

function drawArm(
  context: CanvasRenderingContext2D,
  palette: Palette,
  style: SkinStyle,
  faces: {
    top: [number, number]
    bottom: [number, number]
    right: [number, number]
    front: [number, number]
    left: [number, number]
    back: [number, number]
  }
): void {
  const shirtShade = shade(palette.shirt, -20)
  const sleeve = (x: number, y: number) => {
    fill(context, x, y, 4, 12, palette.skin)
    fill(context, x, y, 4, style === 'armor' ? 8 : 6, palette.shirt)
    fill(context, x, y + 5, 4, 1, palette.accent)
    fill(context, x + (style === 'neon' ? 0 : 1), y + 7, 2, 1, shirtShade)
    if (style === 'neon') fill(context, x, y, 1, 6, palette.accent2 ?? palette.accent)
    if (style === 'armor') {
      fill(context, x, y, 4, 2, shade(palette.shirt, -34))
      fill(context, x, y + 2, 4, 1, palette.accent)
    }
    if (style === 'ranger') fill(context, x, y + 4, 4, 2, shade(palette.accent, -18))
  }
  sleeve(...faces.right)
  sleeve(...faces.front)
  sleeve(...faces.left)
  sleeve(...faces.back)
  fill(context, faces.top[0], faces.top[1], 4, 4, palette.shirt)
  fill(context, faces.bottom[0], faces.bottom[1], 4, 4, palette.skin)
}

function drawLeg(
  context: CanvasRenderingContext2D,
  palette: Palette,
  style: SkinStyle,
  faces: {
    top: [number, number]
    bottom: [number, number]
    right: [number, number]
    front: [number, number]
    left: [number, number]
    back: [number, number]
  }
): void {
  const pantsShade = shade(palette.pants, -18)
  const paint = (x: number, y: number) => {
    fill(context, x, y, 4, 12, palette.pants)
    fill(context, x, y + 9, 4, 3, palette.shoes)
    fill(context, x, y + 8, 4, 1, shade(palette.pants, 18))
    if (style === 'armor' || style === 'ranger') {
      fill(context, x, y + 2, 4, 1, palette.accent)
      fill(context, x, y + 6, 4, 1, pantsShade)
    }
    if (style === 'neon') {
      fill(context, x, y + 4, 1, 6, palette.accent2 ?? palette.accent)
    }
  }
  paint(...faces.right)
  paint(...faces.front)
  paint(...faces.left)
  paint(...faces.back)
  fill(context, faces.top[0], faces.top[1], 4, 4, palette.pants)
  fill(context, faces.bottom[0], faces.bottom[1], 4, 4, palette.shoes)
}

function renderPreset(preset: SkinPreset): string {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) return ''
  context.imageSmoothingEnabled = false
  const { palette, style } = preset

  // Solid-color skins intentionally have no facial or outfit details.
  if (style === 'solid') {
    fill(context, 0, 0, 64, 64, palette.skin)
    return canvas.toDataURL('image/png')
  }

  drawHead(context, palette, style)
  drawBody(context, palette, style)
  drawArm(context, palette, style, {
    top: [44, 16],
    bottom: [48, 16],
    right: [40, 20],
    front: [44, 20],
    left: [48, 20],
    back: [52, 20]
  })
  drawArm(context, palette, style, {
    top: [36, 48],
    bottom: [40, 48],
    right: [32, 52],
    front: [36, 52],
    left: [40, 52],
    back: [44, 52]
  })
  drawLeg(context, palette, style, {
    top: [4, 16],
    bottom: [8, 16],
    right: [0, 20],
    front: [4, 20],
    left: [8, 20],
    back: [12, 20]
  })
  drawLeg(context, palette, style, {
    top: [20, 48],
    bottom: [24, 48],
    right: [16, 52],
    front: [20, 52],
    left: [24, 52],
    back: [28, 52]
  })

  return canvas.toDataURL('image/png')
}

const dataCache = new Map<string, string>()

export function getPresetSkins(): SkinPreset[] {
  return PRESETS
}

export function getPresetData(preset: SkinPreset): string {
  const cached = dataCache.get(preset.id)
  if (cached !== undefined) return cached
  const dataUrl = renderPreset(preset)
  dataCache.set(preset.id, dataUrl)
  return dataUrl
}
