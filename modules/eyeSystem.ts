/**
 * Eye System Module
 * Handles eye blinking, gaze direction, and eye movement for character rigs
 */

import type {
    EyeData,
    EyeDirection,
    EyelidState,
    EyeMovementConfig,
    EyeState,
    Position
} from '../types.js';

/**
 * EyeSystem class - Manages eye animation, blinking, and gaze for characters
 */
export class EyeSystem {
    private state: EyeState;
    private characterId: string;
    
    /**
     * Base iris coordinates - immutable snapshot from initial eyeData
     * Used as reference point for applying manual offsets
     */
    private readonly baseIrisCoords: {
        leftX: number;
        leftY: number;
        rightX: number;
        rightY: number;
    };

    /**
     * Default eye movement ranges for different directions
     */
    private static readonly EYE_MOVEMENT_RANGES: Record<EyeDirection, { x: number; y: number }> = {
        'left': { x: -5, y: 0 },
        'right': { x: 5, y: 0 },
        'up': { x: 0, y: -3 },
        'down': { x: 0, y: 3 },
        'center': { x: 0, y: 0 },
        'up-left': { x: -4, y: -2 },
        'up-right': { x: 4, y: -2 },
        'down-left': { x: -4, y: 2 },
        'down-right': { x: 4, y: 2 },
        '': { x: 0, y: 0 }
    };

    /**
     * Creates a new EyeSystem instance
     * @param characterId - Unique identifier for the character
     * @param eyeData - Eye configuration data from rig
     */
    constructor(characterId: string, eyeData: EyeData) {
        this.characterId = characterId;
        
        // Store immutable copy of base iris coordinates
        // This prevents accumulation when rigData is updated
        this.baseIrisCoords = {
            leftX: eyeData.leftIrisXCoor ?? 0,
            leftY: eyeData.leftIrisYCoor ?? 0,
            rightX: eyeData.rightIrisXCoor ?? 0,
            rightY: eyeData.rightIrisYCoor ?? 0
        };
        
        // Initialize state
        this.state = {
            eyeLastUpdatedTime: -1,
            eyeUpdateInterval: 0.75,
            currentDirection: 'center',
            
            eyeLidLastUpdatedTime: null,
            eyeLidUpdateInterval: 3.0 + Math.random() * 2.0, // 3-5 seconds between blinks
            currentEyeLidCount: 0,
            currentEyeLidState: 'open',
            blinkDuration: 0.15,
            nextBlinkOffset: Math.random() * 0.5, // Random offset for natural timing
            
            leftIrisX: eyeData.leftIrisXCoor ?? 0,
            leftIrisY: eyeData.leftIrisYCoor ?? 0,
            rightIrisX: eyeData.rightIrisXCoor ?? 0,
            rightIrisY: eyeData.rightIrisYCoor ?? 0
        };
    }

    /**
     * Get current eye state
     */
    getState(): EyeState {
        return { ...this.state };
    }

    /**
     * Reset timing (call when timeline resets or on first frame)
     */
    resetTiming(currentTime: number): void {
        this.state.eyeLastUpdatedTime = currentTime - this.state.eyeUpdateInterval;
        this.state.eyeLidLastUpdatedTime = null;
        this.state.currentEyeLidCount = 0;
        this.state.currentEyeLidState = 'open';
        this.state.nextBlinkOffset = Math.random() * 0.5;
    }

    /**
     * Detect if timeline has reset (time went backwards)
     */
    private detectReset(currentTime: number): boolean {
        const prevTime = this.state.eyeLastUpdatedTime;
        return Number.isFinite(prevTime) && prevTime > 0 && (currentTime + 0.001 < prevTime);
    }

    /**
     * Update blinking animation
     * @param currentTime - Current time in seconds
     */
    updateBlinking(currentTime: number): void {
        // Initialize blink timing if needed: treat "last blink" as nextBlinkOffset ago
        // so the first blink happens after (eyeLidUpdateInterval - nextBlinkOffset) ≈ 2.5–5 s, with stagger 0–0.5 s
        if (this.state.eyeLidLastUpdatedTime === null) {
            this.state.eyeLidLastUpdatedTime = currentTime - this.state.nextBlinkOffset;
        }

        const timeSinceBlink = currentTime - this.state.eyeLidLastUpdatedTime;

        // Check if it's time to start a new blink
        if (timeSinceBlink >= this.state.eyeLidUpdateInterval) {
            this.state.currentEyeLidCount = 1; // Start blinking
            this.state.eyeLidLastUpdatedTime = currentTime;
            this.state.currentEyeLidState = 'half-closed';
        }
        // If currently blinking, update blink state
        else if (this.state.currentEyeLidCount > 0) {
            const blinkProgress = timeSinceBlink / this.state.blinkDuration;
            
            if (blinkProgress < 0.5) {
                // Closing phase (0-50%)
                this.state.currentEyeLidState = 'half-closed';
            } else if (blinkProgress < 1.0) {
                // Fully closed at midpoint (50-100%)
                this.state.currentEyeLidState = 'closed';
            } else if (blinkProgress < 1.5) {
                // Opening phase (100-150%)
                this.state.currentEyeLidState = 'half-closed';
            } else {
                // Blink complete (>150%)
                this.state.currentEyeLidState = 'open';
                this.state.currentEyeLidCount = 0;
                // Randomize next blink interval
                this.state.eyeLidUpdateInterval = 3.0 + Math.random() * 2.0;
            }
        } else {
            this.state.currentEyeLidState = 'open';
        }
    }

    /**
     * Update eye gaze direction
     * @param currentTime - Current time in seconds
     * @param config - Movement configuration (direction or target position)
     */
    updateGazeDirection(currentTime: number, config: EyeMovementConfig): void {
        // Update last updated time
        this.state.eyeLastUpdatedTime = currentTime;

        // Direct iris position control (manual positioning)
        if (config.leftIrisXCoor !== undefined || config.leftIrisYCoor !== undefined ||
            config.rightIrisXCoor !== undefined || config.rightIrisYCoor !== undefined) {
            
            if (config.leftIrisXCoor !== undefined) {
                this.state.leftIrisX = config.leftIrisXCoor;
            }
            if (config.leftIrisYCoor !== undefined) {
                this.state.leftIrisY = config.leftIrisYCoor;
            }
            if (config.rightIrisXCoor !== undefined) {
                this.state.rightIrisX = config.rightIrisXCoor;
            }
            if (config.rightIrisYCoor !== undefined) {
                this.state.rightIrisY = config.rightIrisYCoor;
            }
            
            this.state.currentDirection = ''; // Custom position
            return;
        }

        // Direction-based movement
        if (config.direction !== undefined) {
            this.setEyeDirection(config.direction);
            return;
        }

        // Target position-based movement
        if (config.targetPosition) {
            const direction = this.calculateDirectionToPosition(config.targetPosition);
            this.setEyeDirection(direction);
        }
    }

    /**
     * Set eye direction using predefined movement ranges
     */
    setEyeDirection(direction: EyeDirection): void {
        this.state.currentDirection = direction;
        
        const movement = EyeSystem.EYE_MOVEMENT_RANGES[direction] || { x: 0, y: 0 };
        
        // Apply movement to base positions (immutable reference)
        this.state.leftIrisX = this.baseIrisCoords.leftX + movement.x;
        this.state.leftIrisY = this.baseIrisCoords.leftY + movement.y;
        this.state.rightIrisX = this.baseIrisCoords.rightX + movement.x;
        this.state.rightIrisY = this.baseIrisCoords.rightY + movement.y;
    }

    /**
     * Calculate eye direction to look at a target position
     * @param targetPos - Target position in world space
     * @param characterPos - Character position (optional, defaults to {x: 0, y: 0})
     */
    calculateDirectionToPosition(targetPos: Position, characterPos: Position = { x: 0, y: 0 }): EyeDirection {
        const dx = targetPos.x - characterPos.x;
        const dy = targetPos.y - characterPos.y;
        
        const angle = Math.atan2(dy, dx);
        const degrees = angle * 180 / Math.PI;
        
        // Map angle to direction
        if (degrees >= -22.5 && degrees < 22.5) return 'right';
        if (degrees >= 22.5 && degrees < 67.5) return 'down-right';
        if (degrees >= 67.5 && degrees < 112.5) return 'down';
        if (degrees >= 112.5 && degrees < 157.5) return 'down-left';
        if (degrees >= 157.5 || degrees < -157.5) return 'left';
        if (degrees >= -157.5 && degrees < -112.5) return 'up-left';
        if (degrees >= -112.5 && degrees < -67.5) return 'up';
        if (degrees >= -67.5 && degrees < -22.5) return 'up-right';
        
        return 'center';
    }

    /**
     * Random eye movement (simulates natural eye wandering)
     */
    randomEyeMovement(): void {
        const directions: EyeDirection[] = ['left', 'right', 'up', 'down', 'center', 'up-left', 'up-right', 'down-left', 'down-right'];
        const randomDirection = directions[Math.floor(Math.random() * directions.length)];
        this.setEyeDirection(randomDirection);
    }

    /**
     * Update eye system (handles both blinking and movement timing)
     * @param currentTime - Current time in seconds
     * @param isPlaying - Whether animation is playing (controls automatic movements)
     * @param speakingCharacterPos - Position of speaking character (if any)
     * @param characterPos - This character's position
     */
    update(
        currentTime: number,
        isPlaying: boolean = false,
        speakingCharacterPos?: Position,
        characterPos: Position = { x: 0, y: 0 }
    ): void {
        // Handle timeline reset
        if (currentTime < 0.1 || this.detectReset(currentTime)) {
            this.resetTiming(currentTime);
        }

        // Always update blinking (works even when paused)
        this.updateBlinking(currentTime);

        // Eye movement only when playing
        if (!isPlaying) {
            return;
        }

        const timeSinceUpdate = currentTime - this.state.eyeLastUpdatedTime;
        const shouldUpdate = timeSinceUpdate >= this.state.eyeUpdateInterval;

        if (!shouldUpdate) {
            return;
        }

        // Priority 1: Look at speaking character
        if (speakingCharacterPos) {
            const shouldLookAtSpeaker = Math.random() < 0.7; // 70% chance to look at speaker
            
            if (shouldLookAtSpeaker) {
                const direction = this.calculateDirectionToPosition(speakingCharacterPos, characterPos);
                this.updateGazeDirection(currentTime, { direction });
            } else {
                this.randomEyeMovement();
                this.state.eyeLastUpdatedTime = currentTime;
            }
            return;
        }

        // Priority 2: Random eye movement (50% chance)
        if (Math.random() < 0.5) {
            this.randomEyeMovement();
            this.state.eyeLastUpdatedTime = currentTime;
        }
    }

    /**
     * Get current eyelid image key based on state
     */
    getEyelidImageKey(side: 'left' | 'right'): string {
        const prefix = side === 'left' ? 'leftEyeLid' : 'rightEyeLid';
        
        switch (this.state.currentEyeLidState) {
            case 'open':
                return `eyes.${prefix}Open`;
            case 'half-closed':
                return `eyes.${prefix}HalfClosed`;
            case 'closed':
                return `eyes.${prefix}Closed`;
            default:
                return `eyes.${prefix}Open`;
        }
    }

    /**
     * Get current iris positions
     */
    getIrisPositions(): { left: Position; right: Position } {
        return {
            left: { x: this.state.leftIrisX, y: this.state.leftIrisY },
            right: { x: this.state.rightIrisX, y: this.state.rightIrisY }
        };
    }

    /**
     * Get current eyelid state
     */
    getEyelidState(): EyelidState {
        return this.state.currentEyeLidState;
    }

    /**
     * Set eye update interval (time between automatic eye movements)
     */
    setEyeUpdateInterval(interval: number): void {
        this.state.eyeUpdateInterval = interval;
    }

    /**
     * Set blink interval (time between blinks)
     */
    setBlinkInterval(interval: number): void {
        this.state.eyeLidUpdateInterval = interval;
    }

    /**
     * Force immediate blink
     */
    forceBlink(): void {
        this.state.currentEyeLidCount = 1;
        this.state.currentEyeLidState = 'closed';
        this.state.eyeLidLastUpdatedTime = Date.now() / 1000; // Use current time
    }

    /**
     * Force blink at a specific timeline time (for timeline-driven "eye blink" actions).
     * Use this when playback is driven by timeline currentTime so the blink animation
     * progresses correctly in sync with the timeline.
     */
    forceBlinkAtTime(timelineTime: number): void {
        this.state.currentEyeLidCount = 1;
        this.state.currentEyeLidState = 'half-closed';
        this.state.eyeLidLastUpdatedTime = timelineTime;
    }

    /**
     * Set manual iris positions from timeline eye_movement actions
     * This method handles manual eye positioning by applying user-specified offsets
     * to the base iris coordinates.
     * 
     * @param eyePositions - Eye position offsets in -2 to 2 range
     * @param currentTime - Current time in seconds
     * 
     * The eyePositions parameter should have the structure:
     * {
     *   left: { x: number, y: number },  // -2 to 2 range
     *   right: { x: number, y: number }  // -2 to 2 range
     * }
     * 
     * These values are normalized offsets where:
     * - -2 represents maximum left/down
     * - 0 represents center
     * - +2 represents maximum right/up
     */
    setManualIrisPositions(
        eyePositions: { left: { x: number; y: number }; right: { x: number; y: number } },
        currentTime: number
    ): void {
        // Scale factor to convert -2 to 2 range into pixel offsets
        // This matches the EYE_MOVEMENT_RANGES scale (where max is about 5 pixels)
        const scaleFactor = 2.5; // 2.5 pixels per unit, so -2 to 2 becomes -5 to 5
        
        // Apply manual offsets to base positions (using immutable baseIrisCoords)
        this.state.leftIrisX = this.baseIrisCoords.leftX + (eyePositions.left.x * scaleFactor);
        this.state.leftIrisY = this.baseIrisCoords.leftY + (eyePositions.left.y * scaleFactor);
        this.state.rightIrisX = this.baseIrisCoords.rightX + (eyePositions.right.x * scaleFactor);
        this.state.rightIrisY = this.baseIrisCoords.rightY + (eyePositions.right.y * scaleFactor);
        
        // Update last updated time to prevent automatic movement from overriding manual positioning
        this.state.eyeLastUpdatedTime = currentTime;
        
        // Mark as custom position
        this.state.currentDirection = '';
    }

    /**
     * Get debug info
     */
    getDebugInfo(): string {
        return `Eye System [${this.characterId}]
  Direction: ${this.state.currentDirection}
  Eyelid: ${this.state.currentEyeLidState}
  Iris L: (${this.state.leftIrisX.toFixed(1)}, ${this.state.leftIrisY.toFixed(1)})
  Iris R: (${this.state.rightIrisX.toFixed(1)}, ${this.state.rightIrisY.toFixed(1)})
  Last Update: ${this.state.eyeLastUpdatedTime.toFixed(2)}s`;
    }
}

/**
 * Factory function to create eye system from rig data
 */
export function createEyeSystem(characterId: string, eyeData: EyeData): EyeSystem {
    return new EyeSystem(characterId, eyeData);
}
