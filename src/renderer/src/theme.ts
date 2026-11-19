export interface ThemeMeta {
  id: string
  name: string
  blurb: string
  swatch: [string, string, string]
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'nebula',
    name: 'Nebula',
    blurb: 'Violet dusk with electric glass',
    swatch: ['#0b0818', '#8f7bff', '#31c7d8']
  },
  {
    id: 'midnight',
    name: 'Midnight',
    blurb: 'Deep ocean blues and cyan edges',
    swatch: ['#060b14', '#4ea1ff', '#22d3ee']
  },
  {
    id: 'ember',
    name: 'Ember',
    blurb: 'Molten copper on smoky noir',
    swatch: ['#140a06', '#ff8a5c', '#ff3d68']
  },
  {
    id: 'verdant',
    name: 'Verdant',
    blurb: 'Rainforest green with jade light',
    swatch: ['#05110c', '#45e6a8', '#2dd4bf']
  },
  {
    id: 'sakura',
    name: 'Sakura',
    blurb: 'Blush pink and orchid haze',
    swatch: ['#170a12', '#ff9ec9', '#a855f7']
  },
  {
    id: 'cyber',
    name: 'Cyber',
    blurb: 'Acid lime against midnight',
    swatch: ['#070a06', '#b6ff3d', '#22d3ee']
  },
  {
    id: 'graphite',
    name: 'Graphite',
    blurb: 'Soft monochrome, sharp focus',
    swatch: ['#0c0c0f', '#d4d4d8', '#71717a']
  },
  {
    id: 'frost',
    name: 'Frost',
    blurb: 'Daylight glass with cool blues',
    swatch: ['#eef4fe', '#2f6fed', '#8ab4ff']
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    blurb: 'Black glass with antique gold',
    swatch: ['#090909', '#e6c875', '#8a6d3b']
  },
  {
    id: 'ocean',
    name: 'Ocean',
    blurb: 'Abyssal teal and sea-glass light',
    swatch: ['#031318', '#2dd4bf', '#0e7490']
  },
  {
    id: 'sunset',
    name: 'Sunset',
    blurb: 'Hot coral fading into violet',
    swatch: ['#160b15', '#ff7a59', '#c04bff']
  },
  {
    id: 'rosewood',
    name: 'Rosewood',
    blurb: 'Wine, ember and dusty rose',
    swatch: ['#160a0d', '#e58a9a', '#b45309']
  },
  {
    id: 'cobalt',
    name: 'Cobalt',
    blurb: 'Royal blue with icy highlights',
    swatch: ['#050b1c', '#5b8cff', '#a5d8ff']
  },
  {
    id: 'matcha',
    name: 'Matcha',
    blurb: 'Mossy green and warm cream',
    swatch: ['#0b1008', '#9fd356', '#d9c99b']
  },
  {
    id: 'amethyst',
    name: 'Amethyst',
    blurb: 'Deep purple with orchid glow',
    swatch: ['#100818', '#c084fc', '#f0abfc']
  },
  {
    id: 'copper',
    name: 'Copper',
    blurb: 'Burnt orange and dark bronze',
    swatch: ['#140d08', '#d99058', '#8b5e34']
  }
]

export const ACCENTS: { name: string; value: string | null }[] = [
  { name: 'Theme default', value: null },
  { name: 'Iris', value: '#9a8cff' },
  { name: 'Azure', value: '#4ea1ff' },
  { name: 'Mint', value: '#45e6a8' },
  { name: 'Sunset', value: '#ff8a5c' },
  { name: 'Rose', value: '#ff8fb8' },
  { name: 'Gold', value: '#f5c451' },
  { name: 'Lime', value: '#b6ff3d' },
  { name: 'Cloud', value: '#d6d3f0' }
]
