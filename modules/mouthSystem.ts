/**
 * Mouth System Module
 * Handles mouth animation based on audio volume, visemes, or manual control
 * 
 * Note: This module does NOT handle rendering - it only manages state.
 * The renderRig module handles actual rendering of mouth images.
 */

/**
 * Mouth shape types (viseme-based and general shapes)
 */
export type MouthShape = 
  | 'closed' 
  | 'slightly-open' 
  | 'half-open' 
  | 'ds' 
  | 'open' 
  | 'ee' 
  | 'wide-open' 
  | 'ah' 
  | 'woo' 
  | 'neutral';

/**
 * Audio analysis data structure
 */
export interface AudioAnalysisData {
  analyser: AnalyserNode;
  dataArray: Uint8Array<ArrayBuffer>;
  audioElement: HTMLAudioElement;
}

/**
 * Viseme mapping data (phoneme to mouth shape)
 */
export interface VisemeData {
  viseme: string;
  timestamp: number;
}

/**
 * Mouth animation mode
 */
export type MouthAnimationMode = 'manual' | 'audio' | 'viseme';

/**
 * Mouth data configuration
 */
export interface MouthData {
  mouthWidth?: number;
  mouthHeight?: number;
  mouthSize?: number;
  mouthXCoor?: number;
  mouthYCoor?: number;
  [key: string]: number | undefined;
}

/**
 * Mouth state
 */
export interface MouthState {
  currentMouthKey: MouthShape;
  lastMouthChangeTime: number;
  currentVolume: number;
  mode: MouthAnimationMode;
}

/**
 * Mouth configuration
 */
export interface MouthConfig {
  // Audio animation settings
  volumeThreshold?: number;
  mouthChangeInterval?: number;
  talkingMouths?: MouthShape[];
  
  // Viseme settings
  visemeMapping?: Record<string, MouthShape>;
}

/**
 * MouthSystem class - Manages mouth animation state
 */
export class MouthSystem {
  private state: MouthState;
  private config: MouthConfig;
  private characterId: string;
  private availableMouths: Set<MouthShape>;

  /**
   * Default viseme to mouth shape mapping
   */
  private static readonly DEFAULT_VISEME_MAPPING: Record<string, MouthShape> = {
    'X': 'closed',
    'A': 'open',
    'B': 'closed',
    'C': 'half-open',
    'D': 'ds',
    'E': 'ee',
    'F': 'half-open',
    'G': 'half-open',
    'H': 'slightly-open',
    'I': 'ee',
    'J': 'slightly-open',
    'K': 'half-open',
    'L': 'slightly-open',
    'M': 'closed',
    'N': 'slightly-open',
    'O': 'woo',
    'P': 'closed',
    'Q': 'woo',
    'R': 'slightly-open',
    'S': 'slightly-open',
    'T': 'ds',
    'U': 'woo',
    'V': 'half-open',
    'W': 'woo',
    'Y': 'ee',
    'Z': 'slightly-open'
  };

  /**
   * Default talking mouths (used for random audio-based animation)
   */
  private static readonly DEFAULT_TALKING_MOUTHS: MouthShape[] = [
    'slightly-open',
    'half-open',
    'open',
    'wide-open',
    'ah',
    'ee',
    'woo'
  ];

  /**
   * Creates a new MouthSystem instance
   * @param characterId - Unique identifier for the character
   * @param availableMouths - Set of available mouth shapes for this character
   * @param config - Optional mouth configuration
   */
  constructor(
    characterId: string,
    availableMouths: Set<MouthShape> = new Set(['closed', 'neutral']),
    config: MouthConfig = {}
  ) {
    this.characterId = characterId;
    this.availableMouths = availableMouths;
    
    this.config = {
      volumeThreshold: config.volumeThreshold ?? 10,
      mouthChangeInterval: config.mouthChangeInterval ?? 120, // ms
      talkingMouths: config.talkingMouths ?? MouthSystem.DEFAULT_TALKING_MOUTHS,
      visemeMapping: config.visemeMapping ?? MouthSystem.DEFAULT_VISEME_MAPPING
    };
    
    this.state = {
      currentMouthKey: 'neutral',
      lastMouthChangeTime: 0,
      currentVolume: 0,
      mode: 'manual'
    };
  }

  /**
   * Get current mouth state
   */
  getState(): MouthState {
    return { ...this.state };
  }

  /**
   * Get current mouth shape
   */
  getCurrentMouth(): MouthShape {
    return this.state.currentMouthKey;
  }

  /**
   * Manually set mouth shape
   */
  setMouthShape(shape: MouthShape): void {
    if (this.availableMouths.has(shape)) {
      this.state.currentMouthKey = shape;
      this.state.mode = 'manual';
    } else {
      console.warn(`Mouth shape "${shape}" not available for character ${this.characterId}`);
    }
  }

  /**
   * Set available mouth shapes
   */
  setAvailableMouths(mouths: MouthShape[]): void {
    this.availableMouths = new Set(mouths);
  }

  /**
   * Update mouth animation based on audio volume
   * @param currentTime - Current time in milliseconds
   * @param audioData - Audio analysis data
   */
  updateFromAudio(currentTime: number, audioData: AudioAnalysisData): void {
    this.state.mode = 'audio';
    
    // Get audio volume from analyser
    if (audioData.analyser && audioData.dataArray && audioData.audioElement && !audioData.audioElement.paused) {
      audioData.analyser.getByteFrequencyData(audioData.dataArray);
      
      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < audioData.dataArray.length; i++) {
        sum += audioData.dataArray[i];
      }
      const avgVolume = sum / audioData.dataArray.length;
      this.state.currentVolume = avgVolume;
      
      // Update mouth based on volume
      if (avgVolume < (this.config.volumeThreshold ?? 10)) {
        // Low volume: close mouth
        this.state.currentMouthKey = this.availableMouths.has('neutral') ? 'neutral' : 'closed';
      } else {
        // Speaking: change mouth shape periodically
        const timeSinceLastChange = currentTime - this.state.lastMouthChangeTime;
        
        if (timeSinceLastChange > (this.config.mouthChangeInterval ?? 120)) {
          // Filter available talking mouths
          const availableTalkingMouths = (this.config.talkingMouths ?? []).filter(
            mouth => this.availableMouths.has(mouth)
          );
          
          if (availableTalkingMouths.length > 0) {
            const randomIndex = Math.floor(Math.random() * availableTalkingMouths.length);
            this.state.currentMouthKey = availableTalkingMouths[randomIndex];
          } else {
            // Fallback: use any available mouth except neutral/closed
            const fallbackMouths = Array.from(this.availableMouths).filter(
              m => m !== 'neutral' && m !== 'closed'
            );
            if (fallbackMouths.length > 0) {
              const randomIndex = Math.floor(Math.random() * fallbackMouths.length);
              this.state.currentMouthKey = fallbackMouths[randomIndex];
            }
          }
          
          this.state.lastMouthChangeTime = currentTime;
        }
      }
    } else {
      // No audio or paused: reset to neutral
      this.state.currentVolume = 0;
      this.state.currentMouthKey = this.availableMouths.has('neutral') ? 'neutral' : 'closed';
    }
  }

  /**
   * Update mouth animation based on viseme data
   * @param viseme - Viseme identifier (e.g., 'A', 'E', 'O')
   */
  updateFromViseme(viseme: string): void {
    this.state.mode = 'viseme';
    
    const mapping = this.config.visemeMapping ?? MouthSystem.DEFAULT_VISEME_MAPPING;
    const mappedShape = mapping[viseme];
    
    if (mappedShape && this.availableMouths.has(mappedShape)) {
      this.state.currentMouthKey = mappedShape;
    } else {
      // Fallback to closed if viseme not found
      this.state.currentMouthKey = this.availableMouths.has('closed') ? 'closed' : 'neutral';
    }
  }

  /**
   * Reset mouth to neutral/closed state
   */
  reset(): void {
    this.state.currentMouthKey = this.availableMouths.has('neutral') ? 'neutral' : 'closed';
    this.state.currentVolume = 0;
    this.state.lastMouthChangeTime = 0;
    this.state.mode = 'manual';
  }

  /**
   * Get the image key for the current mouth shape
   * This is used by renderRig to determine which image to render
   * 
   * @returns The image key for the current mouth (e.g., 'imagePaths.mouth_open')
   */
  getCurrentMouthImageKey(): string {
    const currentMouth = this.state.currentMouthKey === 'neutral' ? 'closed' : this.state.currentMouthKey;
    
    // Map mouth shape to possible image key variations
    const keyMappings: Record<MouthShape, string[]> = {
      'closed': ['mouth_closed', 'closed', 'neutral'],
      'slightly-open': ['mouth_slightly_open', 'slightly-open', 'half-open'],
      'half-open': ['mouth_half_open', 'half-open', 'slightly-open'],
      'open': ['mouth_open', 'open'],
      'wide-open': ['mouth_wide_open', 'wide-open'],
      'ah': ['mouth_ah', 'ah'],
      'ee': ['mouth_ee', 'ee'],
      'woo': ['mouth_woo', 'woo'],
      'ds': ['mouth_ds', 'ds'],
      'neutral': ['mouth_closed', 'closed', 'neutral']
    };
    
    const candidates = keyMappings[currentMouth] || [currentMouth];
    
    // Return the first candidate (renderRig will try all variants)
    return candidates[0];
  }

  /**
   * Get all possible image key candidates for current mouth
   * Used by renderRig to try multiple image name variations
   */
  getMouthImageKeyCandidates(): string[] {
    const currentMouth = this.state.currentMouthKey === 'neutral' ? 'closed' : this.state.currentMouthKey;
    
    const keyMappings: Record<MouthShape, string[]> = {
      'closed': ['mouth_closed', 'closed', 'neutral'],
      'slightly-open': ['mouth_slightly_open', 'slightly-open', 'half-open'],
      'half-open': ['mouth_half_open', 'half-open', 'slightly-open'],
      'open': ['mouth_open', 'open'],
      'wide-open': ['mouth_wide_open', 'wide-open'],
      'ah': ['mouth_ah', 'ah'],
      'ee': ['mouth_ee', 'ee'],
      'woo': ['mouth_woo', 'woo'],
      'ds': ['mouth_ds', 'ds'],
      'neutral': ['mouth_closed', 'closed', 'neutral']
    };
    
    return keyMappings[currentMouth] || [currentMouth];
  }

  /**
   * Get configuration
   */
  getConfig(): MouthConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MouthConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get debug information
   */
  getDebugInfo(): string {
    return `Mouth System [${this.characterId}]
  Current: ${this.state.currentMouthKey}
  Mode: ${this.state.mode}
  Volume: ${this.state.currentVolume.toFixed(1)}
  Available: [${Array.from(this.availableMouths).join(', ')}]`;
  }
}

/**
 * Factory function to create mouth system
 */
export function createMouthSystem(
  characterId: string,
  availableMouths: MouthShape[] = ['closed', 'neutral'],
  config: MouthConfig = {}
): MouthSystem {
  return new MouthSystem(characterId, new Set(availableMouths), config);
}

/**
 * Helper: Extract available mouth shapes from rig data
 */
export function extractMouthShapesFromRigData(rigData: any): MouthShape[] {
  const mouths: MouthShape[] = [];
  const mouthTypes: MouthShape[] = [
    'closed', 'slightly-open', 'half-open', 'ds', 'open', 'ee', 'wide-open', 'ah', 'woo', 'neutral'
  ];
  
  if (rigData.imagePaths) {
    for (const mouthType of mouthTypes) {
      if (rigData.imagePaths[mouthType] || rigData.imagePaths[`mouth_${mouthType}`]) {
        mouths.push(mouthType);
      }
    }
  }
  
  // Always include at least closed/neutral as fallback
  if (mouths.length === 0) {
    mouths.push('closed', 'neutral');
  }
  
  return mouths;
}
