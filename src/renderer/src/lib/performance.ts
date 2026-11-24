import type { LoaderType } from '@shared/types'

export interface PerformanceMod {
  projectId: string
  title: string
  description: string
  category: string
  loaders: LoaderType[]
  icon?: string
  optional?: boolean
}

export const PERFORMANCE_MODS: PerformanceMod[] = [
  {
    projectId: 'AANobbMI',
    title: 'Sodium',
    description: 'A modern rendering engine that raises frame rates and smooths frame times.',
    category: 'Rendering',
    loaders: ['fabric', 'quilt', 'neoforge'],
    icon: 'https://cdn.modrinth.com/data/AANobbMI/295862f4724dc3f78df3447ad6072b2dcd3ef0c9_96.webp'
  },
  {
    projectId: 'gvQqBUqZ',
    title: 'Lithium',
    description: 'Optimizes game simulation and server-side tick work without changing behaviour.',
    category: 'Simulation',
    loaders: ['fabric', 'quilt', 'neoforge'],
    icon: 'https://cdn.modrinth.com/data/gvQqBUqZ/bcc8686c13af0143adf4285d741256af824f70b7_96.webp'
  },
  {
    projectId: 'uXXizFIs',
    title: 'FerriteCore',
    description: 'Cuts memory usage in common game structures, leaving more RAM for the game.',
    category: 'Memory',
    loaders: ['fabric', 'quilt', 'forge', 'neoforge'],
    icon: 'https://cdn.modrinth.com/data/uXXizFIs/222a126f26f8f9ae1eb339f3b767677f18bff31f_96.webp'
  },
  {
    projectId: 'NNAgCjsB',
    title: 'Entity Culling',
    description: 'Skips rendering entities and blocks hidden behind other geometry.',
    category: 'Culling',
    loaders: ['fabric', 'quilt', 'forge', 'neoforge'],
    icon: 'https://cdn.modrinth.com/data/NNAgCjsB/7873452d6cede4daed12da3d7d8c193ab88b4fd6_96.webp'
  },
  {
    projectId: '5ZwdcRci',
    title: 'ImmediatelyFast',
    description: 'Speeds up immediate-mode rendering used by HUDs, text and overlays.',
    category: 'Rendering',
    loaders: ['fabric', 'quilt', 'forge', 'neoforge'],
    icon: 'https://cdn.modrinth.com/data/5ZwdcRci/e57b6b451425692ac17ad322d5e14bea686a383a_96.webp'
  },
  {
    projectId: 'nmDcB62a',
    title: 'ModernFix',
    description: 'Reduces startup time and memory pressure while fixing common performance bugs.',
    category: 'Memory',
    loaders: ['fabric', 'quilt', 'forge', 'neoforge'],
    icon: 'https://cdn.modrinth.com/data/nmDcB62a/2af94de5e08ae54567ee86b968fc7ce076d9fee5_96.webp'
  },
  {
    projectId: 'fQEb0iXm',
    title: 'Krypton',
    description: 'Optimizes the networking stack for smoother multiplayer sessions.',
    category: 'Networking',
    loaders: ['fabric', 'quilt'],
    icon: 'https://cdn.modrinth.com/data/fQEb0iXm/3ea60899d060a9286e03b87bfa9e71d0cbe2dde7_96.webp'
  },
  {
    projectId: 'LQ3K71Q1',
    title: 'Dynamic FPS',
    description: 'Lowers resource usage when Minecraft is in the background or idling.',
    category: 'Background',
    loaders: ['fabric', 'quilt', 'forge', 'neoforge']
  },
  {
    projectId: 'g96Z4WVZ',
    title: 'BadOptimizations',
    description: 'A collection of small CPU and rendering optimizations that add up.',
    category: 'Rendering',
    loaders: ['fabric', 'quilt', 'forge', 'neoforge']
  },
  {
    projectId: '51shyZVL',
    title: 'More Culling',
    description: 'Culls more hidden faces and block types to reduce draw work.',
    category: 'Culling',
    loaders: ['fabric', 'quilt', 'neoforge'],
    icon: 'https://cdn.modrinth.com/data/51shyZVL/c51b07193b56e952269ef50101d12aecba2b4747_96.webp'
  },
  {
    projectId: 'VSNURh3q',
    title: 'C2ME',
    description: 'Improves chunk generation and loading performance on busy worlds.',
    category: 'Chunk loading',
    loaders: ['fabric', 'quilt']
  },
  {
    projectId: 'sk9rgfiA',
    title: 'Embeddium',
    description: 'A mod-friendly rendering optimization built for Forge and NeoForge packs.',
    category: 'Rendering',
    loaders: ['forge'],
    icon: 'https://cdn.modrinth.com/data/sk9rgfiA/55f9c50284f8abbbe2a485abfd6a16209201e451_96.webp'
  },
  {
    projectId: 'PtjYWJkn',
    title: 'Sodium Extra',
    description: 'Adds useful Sodium video options, from fog and particles to cloud and weather controls.',
    category: 'Rendering',
    loaders: ['fabric', 'quilt', 'neoforge']
  },
  {
    projectId: 'ONZm0H7Y',
    title: 'Better Block Entities',
    description: 'Replaces slow block-entity rendering with a Sodium-friendly hybrid renderer.',
    category: 'Rendering',
    loaders: ['fabric', 'neoforge']
  },
  {
    projectId: 'GNxdLCoP',
    title: 'Cull Leaves',
    description: 'Culls hidden leaf faces so dense forests cost fewer draw calls.',
    category: 'Culling',
    loaders: ['fabric', 'quilt', 'forge', 'neoforge']
  },
  {
    projectId: 'FsoeTIV0',
    title: 'Fast Item Frames',
    description: 'Renders item frames as static block models instead of block entities.',
    category: 'Rendering',
    loaders: ['fabric', 'forge', 'neoforge']
  },
  {
    projectId: 'ihnBJ6on',
    title: 'Entity View Distance',
    description: 'Lets you shorten entity render distance without touching block distance.',
    category: 'Culling',
    loaders: ['fabric', 'quilt']
  },
  {
    projectId: 'RSeLon5O',
    title: 'Particle Core',
    description: 'Optimizes and limits particle rendering to cut CPU and GPU overhead.',
    category: 'Rendering',
    loaders: ['fabric', 'quilt', 'forge', 'neoforge']
  },
  {
    projectId: 'DynYZEae',
    title: 'Exordium',
    description: 'Caps GUI rendering while the world keeps running. Optional if you prefer a smoother inventory.',
    category: 'UI performance',
    loaders: ['fabric', 'forge', 'neoforge'],
    optional: true
  },
  {
    projectId: 'yD9qW65f',
    title: 'Chloride',
    description: 'Adds Sodium performance and quality controls. Optional companion if you already use Sodium Extra.',
    category: 'Rendering',
    loaders: ['fabric', 'neoforge'],
    optional: true
  },
  {
    projectId: 'Ps1zyz6x',
    title: 'ScalableLux',
    description: 'A scalable light engine that reduces lighting cost on large worlds.',
    category: 'Lighting',
    loaders: ['fabric', 'neoforge']
  },
  {
    projectId: 'Wnxd13zP',
    title: 'Clumps',
    description: 'Merges nearby XP orbs into one entity to reduce tick and render load.',
    category: 'Simulation',
    loaders: ['fabric', 'forge', 'neoforge']
  },
  {
    projectId: '9mtu0sUO',
    title: 'Fast IP Ping',
    description: 'Speeds up server address lookups when joining multiplayer.',
    category: 'Networking',
    loaders: ['fabric', 'forge', 'neoforge']
  },
  {
    projectId: 'c7m1mi73',
    title: 'Packet Fixer',
    description: 'Prevents oversized packet kicks and improves network compatibility.',
    category: 'Networking',
    loaders: ['fabric', 'quilt', 'forge', 'neoforge']
  },
  {
    projectId: 'iqK5uv72',
    title: 'Server Pinger Fixer',
    description: 'Fixes server list pings so multiplayer status loads reliably.',
    category: 'Networking',
    loaders: ['fabric']
  },
  {
    projectId: 'x1hIzbuY',
    title: 'FastQuit',
    description: 'Saves and exits to the title screen faster without waiting on the world.',
    category: 'Loading',
    loaders: ['fabric', 'quilt']
  },
  {
    projectId: 'vSEH1ERy',
    title: 'ThreadTweak',
    description: 'Tunes thread priorities to smooth frame pacing and reduce CPU spikes.',
    category: 'CPU',
    loaders: ['fabric', 'quilt']
  },
  {
    projectId: 'Nz0RSWrF',
    title: 'Lazy Language Loader',
    description: 'Defers language loading until needed for faster startup.',
    category: 'Loading',
    loaders: ['fabric']
  },
  {
    projectId: 'ZP7xHXtw',
    title: 'Remove Reloading Screen',
    description: 'Skips the resource-pack reload screen so changes apply sooner.',
    category: 'Loading',
    loaders: ['fabric', 'quilt', 'forge', 'neoforge']
  },
  {
    projectId: 'zvNzKfGF',
    title: 'Async Logger',
    description: 'Moves log writes off the render thread to reduce stutter.',
    category: 'CPU',
    loaders: ['fabric', 'quilt', 'forge', 'neoforge']
  },
  {
    projectId: 'uLbm7CG6',
    title: 'Language Reload',
    description: 'Reloads language files without a full game restart.',
    category: 'Loading',
    loaders: ['fabric', 'quilt']
  },
  {
    projectId: 'WoKBoi0o',
    title: 'Cull Clouds',
    description: 'Skips hidden cloud geometry for a small but free frame-rate gain.',
    category: 'Culling',
    loaders: ['fabric', 'quilt']
  },
  {
    projectId: 'Va8PJBFX',
    title: 'RenderScale',
    description: 'Renders the world below native resolution while keeping the HUD sharp. Optional quality trade-off.',
    category: 'Rendering',
    loaders: ['fabric', 'forge', 'neoforge'],
    optional: true
  },
  {
    projectId: 'Hf3Qz2H3',
    title: 'Super Resolution',
    description: 'Upscales a lower internal resolution to recover detail. Optional; test on your GPU.',
    category: 'Rendering',
    loaders: ['fabric', 'forge', 'neoforge'],
    optional: true
  },
  {
    projectId: 'SfMw2IZN',
    title: 'Nvidium',
    description: 'Nvidia-only Sodium extension for very high frame rates. Optional; needs a modern Nvidia GPU.',
    category: 'Rendering',
    loaders: ['fabric', 'quilt'],
    optional: true
  },
  {
    projectId: 'COlSi5iR',
    title: 'C2ME (NeoForge)',
    description: 'Brings concurrent chunk generation and loading to NeoForge.',
    category: 'Chunk loading',
    loaders: ['neoforge']
  },
  {
    projectId: 'JkxWVYwU',
    title: 'Krypton Reno',
    description: 'A Forge and NeoForge networking optimization for smoother multiplayer.',
    category: 'Networking',
    loaders: ['forge', 'neoforge']
  },
  {
    projectId: 'oY2B1pjg',
    title: 'Embeddium Extra',
    description: 'Adds extra Embeddium video settings for Forge packs.',
    category: 'Rendering',
    loaders: ['forge']
  },
  {
    projectId: 'qa2H4BS9',
    title: 'Canary',
    description: 'Forge-side AI and tick optimizations that reduce simulation load.',
    category: 'Simulation',
    loaders: ['forge']
  },
  {
    projectId: '2eT495vq',
    title: 'Saturn',
    description: 'Reduces memory pressure and GC pauses on Forge and NeoForge.',
    category: 'Memory',
    loaders: ['forge', 'neoforge']
  },
  {
    projectId: '4Rh1Mobu',
    title: 'Flerovium',
    description: 'A Forge and NeoForge rendering optimization for chunk and entity drawing.',
    category: 'Rendering',
    loaders: ['forge', 'neoforge']
  },
  {
    projectId: 'roccmqou',
    title: 'FastSuite',
    description: 'Speeds up recipe and ingredient lookups on Forge and NeoForge.',
    category: 'Simulation',
    loaders: ['forge', 'neoforge']
  },
  {
    projectId: '9X0318ev',
    title: 'FastFurnace',
    description: 'Optimizes furnace and smelting checks in busy modpacks.',
    category: 'Simulation',
    loaders: ['forge', 'neoforge']
  },
  {
    projectId: 'z53V2L4P',
    title: 'Smooth Boot (Reloaded)',
    description: 'Tunes Forge startup threads to shorten launch time. Optional on modern packs.',
    category: 'Loading',
    loaders: ['forge'],
    optional: true
  },
  {
    projectId: 'hvFnDODi',
    title: 'LazyDFU',
    description: 'Defers data-fix loading at startup. Optional; modern versions overlap ModernFix.',
    category: 'Loading',
    loaders: ['fabric'],
    optional: true
  },
  {
    projectId: 'kCpssoSb',
    title: 'Fastload',
    description: 'Cuts older Fabric and Forge startup work. Optional; modern versions overlap ModernFix.',
    category: 'Loading',
    loaders: ['fabric', 'quilt', 'forge'],
    optional: true
  },
  {
    projectId: 'Wa72oW2W',
    title: 'FeyTweaks',
    description: 'Culls hidden signs, banners and other block entities.',
    category: 'Culling',
    loaders: ['fabric', 'forge']
  },
  {
    projectId: 'RfFxanNh',
    title: 'Faster Random',
    description: 'Speeds up random-number work in world simulation.',
    category: 'Simulation',
    loaders: ['fabric', 'quilt', 'neoforge']
  },
  {
    projectId: 'Orvt0mRa',
    title: 'Indium',
    description: 'Adds Sodium compatibility for Fabric rendering APIs; required by some mods.',
    category: 'Rendering',
    loaders: ['fabric', 'quilt']
  },
  {
    projectId: 'GiriLmaY',
    title: 'Entity Collision FPS Fix',
    description: 'Fixes entity collision checks that tank frame rates in crowded areas.',
    category: 'Rendering',
    loaders: ['fabric', 'forge']
  },
  {
    projectId: 'z3TzcquW',
    title: 'Fast Paintings',
    description: 'Renders paintings more efficiently to reduce entity draw overhead.',
    category: 'Rendering',
    loaders: ['fabric', 'forge', 'neoforge']
  },
  {
    projectId: 'vqqx0QiE',
    title: 'Sodium Extras',
    description: 'Extra Sodium features and quality options. Optional companion; overlaps Sodium Extra.',
    category: 'Rendering',
    loaders: ['fabric', 'quilt', 'neoforge'],
    optional: true
  },
  {
    projectId: 'KuNKN7d2',
    title: 'Noisium',
    description: 'Optimises world generation so new chunks load with fewer CPU spikes and less stutter.',
    category: 'Worldgen',
    loaders: ['fabric', 'forge', 'neoforge', 'quilt'],
    icon: 'https://cdn.modrinth.com/data/KuNKN7d2/7490b4d8e08bde8df44b2a71774edf2fe3176c83_96.webp'
  },
  {
    projectId: 'NRjRiSSD',
    title: 'Memory Leak Fix',
    description: 'Patches vanilla memory leaks that slowly eat RAM during long play sessions.',
    category: 'Memory',
    loaders: ['fabric', 'forge', 'quilt'],
    icon: 'https://cdn.modrinth.com/data/NRjRiSSD/a279c19f9c3574339fa90f675aa8a94f8f6cff92_96.webp'
  },
  {
    projectId: 'QwxR6Gcd',
    title: 'Debugify',
    description: 'Fixes dozens of vanilla bugs, including several that cause lag and visual glitches.',
    category: 'Bug fixes',
    loaders: ['fabric', 'forge', 'quilt'],
    icon: 'https://cdn.modrinth.com/data/QwxR6Gcd/d16ec025a7f2d9908248bb4d1477e3e624a2f17f_96.webp'
  },
  {
    projectId: 'H8CaAYZC',
    title: 'Starlight',
    description: 'Rewrites the light engine for faster lighting updates and smoother chunk loading.',
    category: 'Lighting',
    loaders: ['fabric'],
    icon: 'https://cdn.modrinth.com/data/H8CaAYZC/aa11bf788b9893370ff1e26af1c275dfd7590c59_96.webp'
  },
  {
    projectId: 'iRfIGC1s',
    title: 'Starlight (Forge)',
    description: 'The Forge light-engine rewrite, for faster lighting and less chunk-load stutter.',
    category: 'Lighting',
    loaders: ['forge'],
    icon: 'https://cdn.modrinth.com/data/iRfIGC1s/aa11bf788b9893370ff1e26af1c275dfd7590c59_96.webp'
  },
  {
    projectId: 'OVuFYfre',
    title: 'Enhanced Block Entities',
    description: 'Renders chests, signs, beds and other block entities with far fewer draw calls.',
    category: 'Rendering',
    loaders: ['fabric', 'quilt'],
    icon: 'https://cdn.modrinth.com/data/OVuFYfre/7313d540ef9514d8680acd5b3feb6a5a079f20fe_96.webp'
  },
  {
    projectId: 'I2K4u1Q7',
    title: 'Pluto',
    description: 'A Forge networking optimisation that smooths multiplayer and integrated servers.',
    category: 'Networking',
    loaders: ['forge'],
    icon: 'https://cdn.modrinth.com/data/I2K4u1Q7/861d7ba489d59bce7606068ad762c07af8ac6108_96.webp'
  },
  {
    projectId: 'e6vNsbAm',
    title: 'VintageFix',
    description: 'Mixin and memory optimisations for Forge packs, especially older game versions.',
    category: 'Memory',
    loaders: ['forge'],
    icon: 'https://cdn.modrinth.com/data/e6vNsbAm/f4301c04ac94af39af8bfcc61cbcb20a505d459b.png'
  },
  {
    projectId: 'wnEe9KBa',
    title: 'Very Many Players',
    description: 'Server-side tuning that keeps busy worlds and integrated servers smooth.',
    category: 'Simulation',
    loaders: ['fabric'],
    icon: 'https://cdn.modrinth.com/data/wnEe9KBa/0bb4b66e80c6cca9c37f6f1021a94670d6f820dc_96.webp'
  },
  {
    projectId: 'LlSMGYzF',
    title: 'Very Many Players (Forge)',
    description: 'The Forge build of the busy-world simulation and tick optimisation.',
    category: 'Simulation',
    loaders: ['forge'],
    icon: 'https://cdn.modrinth.com/data/LlSMGYzF/0bb4b66e80c6cca9c37f6f1021a94670d6f820dc_96.webp'
  }
]

function supportsLoader(mod: PerformanceMod, loader: LoaderType): boolean {
  if (loader === 'vanilla') return false
  if (loader === 'quilt') {
    return mod.loaders.includes('quilt') || mod.loaders.includes('fabric')
  }
  return mod.loaders.includes(loader)
}

export function performanceModsForLoader(loader: LoaderType): PerformanceMod[] {
  return PERFORMANCE_MODS.filter((mod) => supportsLoader(mod, loader))
}
