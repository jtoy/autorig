/**
 * Mouth System Module
 * Handles mouth animation based on audio volume, visemes, or manual control
 * 
 * Note: This module does NOT handle rendering - it only manages state.
 * The renderRig module handles actual rendering of mouth images.
 */

import type { RigData } from '../types.js';

/**
 * Mouth shape types - THE SINGLE SOURCE OF TRUTH
 * Based on actual character rig mouth images
 */
export type MouthShape = 
  | 'f'
  | 'l'
  | 'ds'
  | 'ee'
  | 'eh'
  | 'open'
  | 'closed'
  | 'half-open'
  | 'wide-open'
  | 'slightly-open';

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
   * Maps phonemes to actual available mouth shapes
   */
  private static readonly DEFAULT_VISEME_MAPPING: Record<string, MouthShape> = {
    'X': 'closed',
    'A': 'closed',
    'B': 'ee',
    'C': 'eh',
    'D': 'half-open',
    'E': 'slightly-open',
    'F': 'wide-open',
    'G': 'f',
    'H': 'l'
  };

  /**
   * Default talking mouths (used for random audio-based animation)
   */
  private static readonly DEFAULT_TALKING_MOUTHS: MouthShape[] = [
    'slightly-open',
    'half-open',
    'open',
    'wide-open',
    'ee',
    'eh',
    'f',
    'l'
  ];

  /**
   * Creates a new MouthSystem instance
   * @param characterId - Unique identifier for the character
   * @param availableMouths - Set of available mouth shapes for this character
   * @param config - Optional mouth configuration
   */
  constructor(
    characterId: string,
    availableMouths: Set<MouthShape> = new Set(['closed']),
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
      currentMouthKey: 'closed',
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
        this.state.currentMouthKey = 'closed';
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
            // Fallback: use any available mouth except closed
            const fallbackMouths = Array.from(this.availableMouths).filter(
              m => m !== 'closed'
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
      // No audio or paused: reset to closed
      this.state.currentVolume = 0;
      this.state.currentMouthKey = 'closed';
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
      this.state.currentMouthKey = 'closed';
    }
  }

  /**
   * Reset mouth to closed state
   */
  reset(): void {
    this.state.currentMouthKey = 'closed';
    this.state.currentVolume = 0;
    this.state.lastMouthChangeTime = 0;
    this.state.mode = 'manual';
  }

  /**
   * Get the image key for the current mouth shape
   * Mouth shapes are named absolutely (no variations)
   * 
   * @returns The image key for the current mouth (e.g., 'open', 'closed', 'f')
   */
  getCurrentMouthImageKey(): string {
    return this.state.currentMouthKey;
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
  availableMouths: MouthShape[] = ['closed'],
  config: MouthConfig = {}
): MouthSystem {
  return new MouthSystem(characterId, new Set(availableMouths), config);
}

/**
 * Helper: Extract available mouth shapes from rig data
 * Only looks for the specific mouth shapes defined in MouthShape type
 */
export function extractMouthShapesFromRigData(rigData: RigData): MouthShape[] {
  const mouths: MouthShape[] = [];
  
  // THE SINGLE SOURCE OF TRUTH for all mouth types
  const mouthTypes: MouthShape[] = [
    'f', 'l', 'ds', 'ee', 'eh', 'open', 'closed', 'half-open', 'wide-open', 'slightly-open'
  ];
  
  // Check if mouth data exists
  if (!rigData.mouth) {
    return ['closed'];
  }
  
  const mouthData = rigData.mouth;
  
  // Check each mouth type from our absolute list
  for (const mouthType of mouthTypes) {
    // Check if this exact mouth shape exists in the data
    const value = mouthData[mouthType];
    
    // Check if value exists and is valid (not undefined, not null, not [MEDIA_REMOVED])
    if (value && 
        typeof value === 'string' && 
        value !== '' && 
        !value.includes('[MEDIA_REMOVED]')) {
      mouths.push(mouthType);
    }
  }
  
  // Always include at least closed as fallback
  if (mouths.length === 0) {
    mouths.push('closed');
  }
  
  return mouths;
}

/**
 * Helper: Extract mouth image hashes from rig data
 * Returns only the valid mouth shape MD5 hashes, excluding positioning data
 * @param rigData - Character rig data
 * @returns Object with mouth shape names as keys and MD5 hashes as values
 */
export function extractMouthImagesFromRigData(rigData: RigData): Record<MouthShape, string> {
  const mouthImages: Partial<Record<MouthShape, string>> = {};
  
  // THE SINGLE SOURCE OF TRUTH for all mouth types
  const mouthTypes: MouthShape[] = [
    'f', 'l', 'ds', 'ee', 'eh', 'open', 'closed', 'half-open', 'wide-open', 'slightly-open'
  ];
  
  if (!rigData.mouth) {
    return mouthImages as Record<MouthShape, string>;
  }
  
  const mouthData = rigData.mouth;
  
  // Extract only the mouth shape image hashes
  for (const mouthType of mouthTypes) {
    const value = mouthData[mouthType];
    
    if (value && 
        typeof value === 'string' && 
        value !== '' && 
        !value.includes('[MEDIA_REMOVED]')) {
      mouthImages[mouthType] = value;
    }
  }
  
  return mouthImages as Record<MouthShape, string>;
}
