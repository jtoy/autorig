/**
 * Eye System Module
 * Handles eye blinking, gaze direction, and eye movement for character rigs
 */

import type {
    EyeData,
    EyeDirection,
    EyeSockets,
    EyelidState,
    EyeMovementConfig,
    EyeState,
    Position
} from '../types.js';

/** Default movement ranges when no eye sockets are provided (pixel offsets) */
const DEFAULT_MOVEMENT_RANGES: Record<EyeDirection, { x: number; y: number }> = {
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

/** Options for creating an EyeSystem with socket-derived movement ranges */
export interface EyeSystemOptions {
    /** Eye configuration data from rig */
    eyeData: EyeData;
    /** Eye socket polygons for left/right eyes - used to compute iris movement bounds */
    eyeSockets?: EyeSockets;
    /** Character/head width (for scaling socket coords when in 0-100 percent space) */
    headWidth?: number;
    /** Character/head height (for scaling socket coords when in 0-100 percent space) */
    headHeight?: number;
}

/**
 * Compute movement ranges from eye socket polygons.
 * Socket points define the boundary; we use bounding box half-extents as max movement.
 * When headWidth/headHeight are provided and socket values look like 0-100 percent,
 * we scale to pixel offsets. Otherwise we use raw socket units.
 * Factors in iris dimensions to prevent iris from escaping socket boundaries.
 */
function computeMovementRangesFromSockets(
    eyeSockets: EyeSockets,
    headWidth: number = 100,
    headHeight: number = 100,
    eyeData?: EyeData
): Record<EyeDirection, { x: number; y: number }> {
    const left = eyeSockets.left;
    const right = eyeSockets.right;
    const hasLeft = left && left.length >= 3;
    const hasRight = right && right.length >= 3;

    const computeBounds = (points: Position[]) => {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        for (const p of points) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const halfWidthX = (maxX - minX) / 2;
        const halfWidthY = (maxY - minY) / 2;
        return { centerX, centerY, halfWidthX, halfWidthY };
    };

    // Use 50% of half-extent as max movement (keeps iris safely inside socket)
    const marginFactor = 0.5;

    let rangeX: number;
    let rangeY: number;

    if (hasLeft && hasRight) {
        const leftBounds = computeBounds(left!);
        const rightBounds = computeBounds(right!);
        rangeX = Math.min(leftBounds.halfWidthX, rightBounds.halfWidthX) * marginFactor;
        rangeY = Math.min(leftBounds.halfWidthY, rightBounds.halfWidthY) * marginFactor;
    } else if (hasLeft) {
        const b = computeBounds(left!);
        rangeX = b.halfWidthX * marginFactor;
        rangeY = b.halfWidthY * marginFactor;
    } else if (hasRight) {
        const b = computeBounds(right!);
        rangeX = b.halfWidthX * marginFactor;
        rangeY = b.halfWidthY * marginFactor;
    } else {
        return { ...DEFAULT_MOVEMENT_RANGES };
    }

    // If socket values look like 0-100 percent (typical for rigs), scale to pixels
    const maxCoord = Math.max(
        ...(left || []).flatMap(p => [p.x, p.y]),
        ...(right || []).flatMap(p => [p.x, p.y])
    );
    if (maxCoord > 0 && maxCoord <= 100) {
        rangeX = (rangeX / 100) * headWidth;
        rangeY = (rangeY / 100) * headHeight;
    }

    // Factor in iris dimensions to prevent escape from socket boundaries
    if (eyeData) {
        // Get iris dimensions (use the larger iris as reference to ensure both fit)
        const leftIrisWidth = eyeData.leftIrisWidth || 10;
        const leftIrisHeight = eyeData.leftIrisHeight || 10;
        const rightIrisWidth = eyeData.rightIrisWidth || 10;
        const rightIrisHeight = eyeData.rightIrisHeight || 10;
        
        const maxIrisWidth = Math.max(leftIrisWidth, rightIrisWidth);
        const maxIrisHeight = Math.max(leftIrisHeight, rightIrisHeight);
        
        // Subtract half the iris size from available movement range
        // This ensures the iris edge doesn't escape the socket
        rangeX = Math.max(0, rangeX - maxIrisWidth / 2);
        rangeY = Math.max(0, rangeY - maxIrisHeight / 2);
        
        console.log('[EyeSystem] Adjusted movement range for iris size:', {
            maxIrisWidth,
            maxIrisHeight,
            adjustedRangeX: rangeX,
            adjustedRangeY: rangeY
        });
    }

    return {
        'left': { x: -rangeX, y: 0 },
        'right': { x: rangeX, y: 0 },
        'up': { x: 0, y: -rangeY },
        'down': { x: 0, y: rangeY },
        'center': { x: 0, y: 0 },
        'up-left': { x: -rangeX * 0.8, y: -rangeY * 0.8 },
        'up-right': { x: rangeX * 0.8, y: -rangeY * 0.8 },
        'down-left': { x: -rangeX * 0.8, y: rangeY * 0.8 },
        'down-right': { x: rangeX * 0.8, y: rangeY * 0.8 },
        '': { x: 0, y: 0 }
    };
}

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
     * Movement ranges per direction (derived from eye sockets or defaults)
     */
    private readonly movementRanges: Record<EyeDirection, { x: number; y: number }>;

    /**
     * Max pixel range for manual positions (-2 to 2 scale) - used in setManualIrisPositions
     */
    private readonly manualScaleFactor: number;

    /**
     * Creates a new EyeSystem instance
     * @param characterId - Unique identifier for the character
     * @param eyeDataOrOptions - Eye configuration data, or options object with eyeData + optional eyeSockets/headWidth/headHeight
     */
    constructor(characterId: string, eyeDataOrOptions: EyeData | EyeSystemOptions) {
        const isOptions = 'eyeData' in eyeDataOrOptions;
        const eyeData: EyeData = (isOptions ? (eyeDataOrOptions as EyeSystemOptions).eyeData : eyeDataOrOptions) as EyeData;
        const options = isOptions ? (eyeDataOrOptions as EyeSystemOptions) : undefined;
        this.characterId = characterId;
        
        // Compute movement ranges from eye sockets if provided
        const eyeSockets = options?.eyeSockets;
        const hasValidSockets = eyeSockets && typeof eyeSockets === 'object' &&
            ((Array.isArray(eyeSockets.left) && eyeSockets.left.length >= 3) ||
             (Array.isArray(eyeSockets.right) && eyeSockets.right.length >= 3));
        console.log('[EyeSystem] createEyeSystem:', {
            characterId,
            hasEyeSockets: !!eyeSockets,
            leftPoints: Array.isArray(eyeSockets?.left) ? eyeSockets.left.length : 0,
            rightPoints: Array.isArray(eyeSockets?.right) ? eyeSockets.right.length : 0,
            hasValidSockets
        });
        if (hasValidSockets && eyeSockets) {
            this.movementRanges = computeMovementRangesFromSockets(
                eyeSockets as EyeSockets,
                options?.headWidth ?? 100,
                options?.headHeight ?? 100,
                eyeData
            );
            // Max range for manual -2 to 2 scale (use 'right' as reference for X, 'down' for Y)
            const maxRangeX = Math.abs(this.movementRanges['right'].x);
            const maxRangeY = Math.abs(this.movementRanges['down'].y);
            this.manualScaleFactor = Math.max(maxRangeX, maxRangeY) / 2; // 2 = max of -2 to 2 range
            console.log('[EyeSystem] Movement ranges from sockets:', {
                characterId: this.characterId,
                movementRanges: this.movementRanges,
                manualScaleFactor: this.manualScaleFactor
            });
        } else {
            this.movementRanges = { ...DEFAULT_MOVEMENT_RANGES };
            this.manualScaleFactor = 2.5; // Legacy default
        }
        
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
        // Ensure eyelid is open when we are not in an active blink cycle (e.g. after pause+reset)
        const blinkCycleDuration = 1.5 * this.state.blinkDuration;
        if (this.state.eyeLidLastUpdatedTime !== null && this.state.currentEyeLidCount > 0) {
            const timeSinceBlink = currentTime - this.state.eyeLidLastUpdatedTime;
            if (timeSinceBlink < 0 || timeSinceBlink >= blinkCycleDuration) {
                this.state.currentEyeLidState = 'open';
                this.state.currentEyeLidCount = 0;
                if (timeSinceBlink < 0) {
                    this.state.eyeLidLastUpdatedTime = null;
                }
            }
        }

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
        
        const movement = this.movementRanges[direction] || { x: 0, y: 0 };
        
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
        // scaleFactor converts -2 to 2 range into pixel offsets (derived from eye socket bounds when available)
        const scaleFactor = this.manualScaleFactor;
        
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
 * @param characterId - Unique identifier for the character
 * @param eyeDataOrRigData - Eye configuration data, or full RigData object (will extract eyes and eyeSockets)
 * @param options - Optional: { eyeSockets, headWidth, headHeight } - when provided, movement ranges are computed from eye socket polygons
 */
export function createEyeSystem(
    characterId: string,
    eyeDataOrRigData: EyeData | { eyes?: EyeData; eyeSockets?: EyeSockets; width?: number; height?: number },
    options?: { eyeSockets?: EyeSockets; headWidth?: number; headHeight?: number }
): EyeSystem {
    // Check if rigData object was passed (has eyeSockets or eyes property)
    const isRigData = eyeDataOrRigData && typeof eyeDataOrRigData === 'object' && 
                      ('eyeSockets' in eyeDataOrRigData || 'eyes' in eyeDataOrRigData);
    
    if (isRigData) {
        const rigData = eyeDataOrRigData as { eyes?: EyeData; eyeSockets?: EyeSockets; width?: number; height?: number };
        const eyeData = rigData.eyes || {} as EyeData;
        
        // Prefer rigData's eyeSockets over options
        const eyeSockets = rigData.eyeSockets || options?.eyeSockets;
        const headWidth = rigData.width || options?.headWidth;
        const headHeight = rigData.height || options?.headHeight;
        
        if (eyeSockets) {
            return new EyeSystem(characterId, {
                eyeData,
                eyeSockets,
                headWidth,
                headHeight
            });
        }
        return new EyeSystem(characterId, eyeData);
    }
    
    // Legacy: eyeData passed directly
    const eyeData = eyeDataOrRigData as EyeData;
    if (options?.eyeSockets) {
        return new EyeSystem(characterId, {
            eyeData,
            eyeSockets: options.eyeSockets,
            headWidth: options.headWidth,
            headHeight: options.headHeight
        });
    }
    return new EyeSystem(characterId, eyeData);
}
