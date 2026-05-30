import { ThemeName } from './themes'

export type SpineMaterial =
  | 'leather'
  | 'silk'
  | 'canvas'
  | 'pewter'
  | 'kraft'
  | 'linen'

export type SpineAccent = 'rule' | 'stitches' | 'knots' | 'none'

export interface SpineDesign {
  material: SpineMaterial
  /** Mid-tone of the material strip. */
  baseColor: string
  /** Darker tone for inner shadow / grain. */
  shadowColor: string
  /** Lighter tone for highlight / sheen. */
  highlightColor: string
  accent: SpineAccent
  accentColor: string
  /** Horizontal raised bands across the spine (real leather-binding look). */
  bands?: {
    /** Dark tone used for the band's shadow side. */
    color: string
    /** Top % positions, e.g. [22, 50, 78]. */
    positions: number[]
  }
  /** Vertical ribbon running the length of the spine. Sits above bands. */
  ribbon?: {
    color: string
    /** Width in px (default 3). */
    width?: number
  }
  /** Round foil medallion or wax seal sitting on top of the ribbon. */
  medallion?: {
    color: string
    /** Top % position. */
    position: number
    /** Diameter in px (default 14). */
    size?: number
    /** Optional darker rim color. Defaults to a darkened medallion color. */
    rimColor?: string
  }
}

export const spineDesigns: Record<ThemeName, SpineDesign> = {
  firelight: {
    material: 'leather',
    baseColor: '#7A5230',
    shadowColor: '#4A2E18',
    highlightColor: '#9A6F48',
    accent: 'stitches',
    accentColor: '#E8A050',
  },
  rivendell: {
    material: 'leather',
    baseColor: '#3D6448',
    shadowColor: '#1F3826',
    highlightColor: '#5A8060',
    accent: 'none',
    accentColor: '#D4A84B',
    bands: {
      color: '#1F3525',
      positions: [22, 50, 78],
    },
    ribbon: {
      color: '#D4A84B',
      width: 3,
    },
    medallion: {
      color: '#E8C56C',
      position: 14,
      size: 14,
      rimColor: '#8C6A2A',
    },
  },
  rose: {
    material: 'silk',
    baseColor: '#C2667A',
    shadowColor: '#7E3848',
    highlightColor: '#E59AAA',
    accent: 'rule',
    accentColor: '#7C2E3E',
  },
  sage: {
    material: 'canvas',
    baseColor: '#A89570',
    shadowColor: '#6F5E40',
    highlightColor: '#C2B189',
    accent: 'stitches',
    accentColor: '#3F4A28',
  },
  ocean: {
    material: 'pewter',
    baseColor: '#75858E',
    shadowColor: '#485258',
    highlightColor: '#9AAAB2',
    accent: 'rule',
    accentColor: '#D8DDDF',
  },
  postal: {
    material: 'leather',
    baseColor: '#8E6440',
    shadowColor: '#5A3A20',
    highlightColor: '#AC8258',
    accent: 'none',
    accentColor: '#1F2750',
    bands: {
      color: '#4A2D18',
      positions: [22, 50, 78],
    },
    ribbon: {
      color: '#1F2750',
      width: 3,
    },
    medallion: {
      color: '#B04830',
      position: 14,
      size: 14,
      rimColor: '#5E1F12',
    },
  },
  linen: {
    material: 'linen',
    baseColor: '#D6C9AC',
    shadowColor: '#A89878',
    highlightColor: '#EFE3C6',
    accent: 'stitches',
    accentColor: '#8E4528',
  },
  sunset: {
    material: 'leather',
    baseColor: '#9C4A30',
    shadowColor: '#5C2618',
    highlightColor: '#BC6A50',
    accent: 'rule',
    accentColor: '#FFC890',
  },
  rain: {
    material: 'leather',
    baseColor: '#3A4A5C',
    shadowColor: '#1F2A38',
    highlightColor: '#5A7088',
    accent: 'stitches',
    accentColor: '#D4A878',
    ribbon: {
      color: '#A8C2DC',
      width: 3,
    },
    medallion: {
      color: '#D4A878',
      position: 14,
      size: 14,
      rimColor: '#7A5A30',
    },
  },
}

export function getSpineDesign(themeName: ThemeName): SpineDesign {
  return spineDesigns[themeName]
}
