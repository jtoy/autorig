/**
 * Animation Diff Utility
 * 
 * Converts animation frames from full-state to diff-based format to reduce file size.
 * Instead of storing complete frame data for each frame, only stores changes from the previous frame.
 * 
 * Format (compact array):
 * [
 *   { ...complete first frame data... },           // Index 0: Base frame (full data)
 *   { rotationValues: { head: 0.5 }, ... },        // Index 1: Only changed values
 *   { selfRotationValues: { leftArm: 0.2 } },      // Index 2: Only changed values
 *   ...
 * ]
 * 
 * Also supports legacy verbose format:
 * {
 *   version: "1.0",
 *   baseFrame: { ...complete first frame data... },
 *   diffs: [null, {...}, {...}, ...]
 * }
 */

import type { RigData } from '../types.js';

/**
 * Frame data type - can be complete RigData or partial diff
 */
export type FrameData = Partial<RigData>;

/**
 * Diff-based animation format (compact array)
 */
export type DiffBasedAnimation = FrameData[];

/**
 * Legacy verbose format
 */
export interface VerboseDiffAnimation {
    version: string;
    baseFrame: FrameData;
    diffs: (FrameData | null)[];
}

/**
 * Animation data that can be in either format
 */
export type AnimationData = DiffBasedAnimation | VerboseDiffAnimation;

/**
 * Compression statistics
 */
export interface CompressionStats {
    originalSize: number;
    compressedSize: number;
    savedBytes: number;
    compressionRatio: string;
}

/**
 * Deep comparison to check if two values are equal
 */
const isEqual = (a: any, b: any): boolean => {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    
    if (typeof a === 'object') {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        
        if (keysA.length !== keysB.length) return false;
        
        return keysA.every(key => isEqual(a[key], b[key]));
    }
    
    return false;
};

/**
 * Create a diff object containing only changed properties
 * @param prevFrame - Previous frame data
 * @param currentFrame - Current frame data
 * @returns Diff object or null if no changes
 */
const createFrameDiff = (prevFrame: FrameData, currentFrame: FrameData): FrameData | null => {
    if (!prevFrame || !currentFrame) return currentFrame;
    
    const diff: FrameData = {};
    let hasChanges = false;
    
    // Properties that might change between frames
    const diffableProps: (keyof RigData)[] = [
        'rotationValues',
        'selfRotationValues',
        'dimensionValues',
        'pivotPoints',
        'jointOffset',
        'zIndexValues',
        'eyes',
        'mouth',
        'visibility',
        'imageScale',
        'flipX',
        'flipHead'
    ];
    
    diffableProps.forEach(prop => {
        if (!currentFrame.hasOwnProperty(prop)) return;
        
        const prevValue = prevFrame[prop];
        const currentValue = currentFrame[prop];
        
        // If the property doesn't exist in previous frame, include it entirely
        if (!prevFrame.hasOwnProperty(prop)) {
            (diff as any)[prop] = currentValue;
            hasChanges = true;
            return;
        }
        
        // For objects, diff at the property level
        if (typeof currentValue === 'object' && !Array.isArray(currentValue) && currentValue !== null) {
            const propDiff: Record<string, any> = {};
            let hasPropChanges = false;
            
            Object.keys(currentValue).forEach(key => {
                const prevVal = (prevValue as any)?.[key];
                const currVal = (currentValue as any)[key];
                if (!isEqual(prevVal, currVal)) {
                    propDiff[key] = currVal;
                    hasPropChanges = true;
                }
            });
            
            if (hasPropChanges) {
                (diff as any)[prop] = propDiff;
                hasChanges = true;
            }
        } else {
            // For non-objects, include if different
            if (!isEqual(prevValue, currentValue)) {
                (diff as any)[prop] = currentValue;
                hasChanges = true;
            }
        }
    });
    
    return hasChanges ? diff : null;
};

/**
 * Convert full-state animation frames to diff-based format
 * @param frames - Array of complete frame objects
 * @returns Diff-based animation array [baseFrame, diff1, diff2, ...]
 */
export const createDiffBasedAnimation = (frames: FrameData[]): DiffBasedAnimation => {
    if (!frames || frames.length === 0) {
        return [];
    }
    
    // First element is the complete base frame
    const result: DiffBasedAnimation = [{ ...frames[0] }];
    
    // Subsequent elements are diffs from the previous frame
    for (let i = 1; i < frames.length; i++) {
        const prevFrame = frames[i - 1];
        const currentFrame = frames[i];
        const diff = createFrameDiff(prevFrame, currentFrame);
        result.push(diff || {}); // Use empty object if no changes
    }
    
    return result;
};

/**
 * Apply a diff to a frame to get the next frame state
 * @param baseFrame - Base frame to apply diff to
 * @param diff - Diff object
 * @returns Resulting frame
 */
const applyDiff = (baseFrame: FrameData, diff: FrameData | null): FrameData => {
    if (!diff) return { ...baseFrame };
    
    const result: FrameData = { ...baseFrame };
    
    Object.keys(diff).forEach(prop => {
        const diffValue = (diff as any)[prop];
        
        // If the diff value is an object, merge it with the base
        if (typeof diffValue === 'object' && !Array.isArray(diffValue) && diffValue !== null) {
            (result as any)[prop] = {
                ...(result as any)[prop],
                ...diffValue
            };
        } else {
            // Otherwise, replace entirely
            (result as any)[prop] = diffValue;
        }
    });
    
    return result;
};

/**
 * Convert diff-based animation back to full-state frames
 * Supports both formats:
 * - New format: [baseFrame, diff1, diff2, ...]
 * - Old format: { baseFrame, diffs: [...] }
 * @param diffBasedAnimation - Diff-based animation
 * @returns Array of complete frame objects
 */
export const expandDiffBasedAnimation = (diffBasedAnimation: AnimationData): FrameData[] => {
    if (!diffBasedAnimation) {
        return [];
    }
    
    // Handle new compact array format: [baseFrame, diff1, diff2, ...]
    if (Array.isArray(diffBasedAnimation)) {
        if (diffBasedAnimation.length === 0) return [];
        
        const frames: FrameData[] = [];
        let currentFrame: FrameData = { ...diffBasedAnimation[0] }; // First element is base frame
        frames.push(currentFrame);
        
        // Apply each subsequent diff
        for (let i = 1; i < diffBasedAnimation.length; i++) {
            currentFrame = applyDiff(currentFrame, diffBasedAnimation[i]);
            frames.push({ ...currentFrame });
        }
        
        return frames;
    }
    
    // Handle old verbose format: { baseFrame, diffs: [...] }
    const verboseFormat = diffBasedAnimation as VerboseDiffAnimation;
    if (verboseFormat.baseFrame && verboseFormat.diffs) {
        const { baseFrame, diffs } = verboseFormat;
        const frames: FrameData[] = [];
        
        let currentFrame: FrameData = { ...baseFrame };
        frames.push(currentFrame);
        
        // Apply each diff to reconstruct frames
        for (let i = 1; i < diffs.length; i++) {
            currentFrame = applyDiff(currentFrame, diffs[i]);
            frames.push({ ...currentFrame });
        }
        
        return frames;
    }
    
    return [];
};

/**
 * Calculate compression ratio
 * @param originalFrames - Original full-state frames
 * @param diffBasedAnimation - Diff-based animation
 * @returns Statistics about compression
 */
export const calculateCompressionStats = (
    originalFrames: FrameData[], 
    diffBasedAnimation: DiffBasedAnimation
): CompressionStats => {
    const originalSize = JSON.stringify(originalFrames).length;
    const compressedSize = JSON.stringify(diffBasedAnimation).length;
    const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(2);
    
    return {
        originalSize,
        compressedSize,
        savedBytes: originalSize - compressedSize,
        compressionRatio: ratio + '%'
    };
};

/**
 * Validate that a diff-based animation can be properly expanded
 * Supports both new array format and old object format
 * @param diffBasedAnimation - Diff-based animation to validate
 * @returns True if valid
 */
export const validateDiffBasedAnimation = (diffBasedAnimation: AnimationData): boolean => {
    if (!diffBasedAnimation) return false;
    
    // New compact array format: [baseFrame, diff1, diff2, ...]
    if (Array.isArray(diffBasedAnimation)) {
        if (diffBasedAnimation.length === 0) return false;
        // First element should be a complete frame (has rotationValues or other base properties)
        if (!diffBasedAnimation[0] || typeof diffBasedAnimation[0] !== 'object') return false;
        return true;
    }
    
    // Old verbose format: { version, baseFrame, diffs }
    const verboseFormat = diffBasedAnimation as VerboseDiffAnimation;
    if (!verboseFormat.version) return false;
    if (!verboseFormat.baseFrame) return false;
    if (!Array.isArray(verboseFormat.diffs)) return false;
    if (verboseFormat.diffs.length === 0) return false;
    
    return true;
};

/**
 * Helper to check if animation data is in diff format
 * Detects both new array format and old object format
 * @param animationData - Animation data to check
 * @returns True if in diff format
 */
export const isDiffBasedFormat = (animationData: any): animationData is AnimationData => {
    if (!animationData) return false;
    
    // New compact array format: [baseFrame, diff1, diff2, ...]
    // Heuristic: If it's an array where first element has full frame data
    // and second element (if exists) has partial data, it's likely diff format
    if (Array.isArray(animationData)) {
        if (animationData.length === 0) return false;
        
        const firstFrame = animationData[0];
        if (!firstFrame || typeof firstFrame !== 'object') return false;
        
        // If first frame has rotationValues or other key properties, check if it's diff format
        const hasKeyProperties = firstFrame.rotationValues || 
                               firstFrame.dimensionValues || 
                               firstFrame.imagePaths ||
                               firstFrame.rotation !== undefined ||
                               firstFrame.width !== undefined;
        
        if (hasKeyProperties) {
            // If there's a second element
            if (animationData.length > 1) {
                const secondFrame = animationData[1];
                // If second frame has fewer top-level keys than first, likely a diff
                const firstKeys = Object.keys(firstFrame).length;
                const secondKeys = Object.keys(secondFrame).length;
                
                // Diff format has fewer keys in subsequent frames (only changed properties)
                if (secondKeys < firstKeys) return true;
                
                // Also check if second frame is missing metadata that first frame has
                if (firstFrame.imagePaths && !secondFrame.imagePaths) return true;
                if (firstFrame.imageScale !== undefined && !secondFrame.hasOwnProperty('imageScale')) return true;
                if (firstFrame.dimensionValues && !secondFrame.dimensionValues) return true;
            }
            
            // Single frame could be either format, default to full-state
            return false;
        }
    }
    
    // Old verbose format: { version, baseFrame, diffs }
    return (
        animationData &&
        typeof animationData === 'object' &&
        'baseFrame' in animationData &&
        'diffs' in animationData
    );
};

/**
 * Smart loader that handles both formats
 * @param animationData - Animation data in either format
 * @returns Full-state frames array
 */
export const loadAnimation = (animationData: any): FrameData[] => {
    if (!animationData) return [];
    
    // Check if it's diff-based format first
    if (isDiffBasedFormat(animationData)) {
        console.log('📊 Detected diff-based animation format, expanding...');
        return expandDiffBasedAnimation(animationData);
    }
    
    // If it's already an array and not diff-based, assume it's full-state format
    if (Array.isArray(animationData)) {
        return animationData;
    }
    
    // Unknown format
    console.warn('Unknown animation format');
    return [];
};

/**
 * Export animation in diff format with optional compression stats
 * @param frames - Full-state frames
 * @param showStats - Whether to log compression stats
 * @returns Diff-based animation
 */
export const exportDiffAnimation = (frames: FrameData[], showStats: boolean = true): DiffBasedAnimation => {
    const diffAnimation = createDiffBasedAnimation(frames);
    
    if (showStats && frames.length > 0) {
        const stats = calculateCompressionStats(frames, diffAnimation);
        console.log('Animation Compression Stats:', stats);
    }
    
    return diffAnimation;
};
