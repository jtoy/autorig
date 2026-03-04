// Shared TypeScript type definitions for the character rig system

/**
 * Position/offset with x and y coordinates
 */
export interface Position {
    x: number;
    y: number;
}

/**
 * Dimension with width and height
 */
export interface Dimension {
    width: number;
    height: number;
}

/**
 * 2D Transform with position, rotation, and scale
 */
export interface Transform2D {
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
}

/**
 * Eye configuration data
 */
export interface EyeData {
    leftIris?: string;
    rightIris?: string;
    leftEyeImage?: string;
    leftEyeXCoor?: number;
    leftEyeYCoor?: number;
    leftIrisWidth?: number;
    leftIrisXCoor?: number;
    leftIrisYCoor?: number;
    rightEyeImage?: string;
    rightEyeXCoor?: number;
    rightEyeYCoor?: number;
    leftEyeLidOpen?: string;
    leftIrisHeight?: number;
    rightIrisWidth?: number;
    rightIrisXCoor?: number;
    rightIrisYCoor?: number;
    leftEyeLidXCoor?: number;
    leftEyeLidYCoor?: number;
    rightEyeLidOpen?: string;
    rightIrisHeight?: number;
    leftEyeLidClosed?: string;
    rightEyeLidXCoor?: number;
    rightEyeLidYCoor?: number;
    leftEyeImageWidth?: number;
    leftEyeWidthRatio?: number;
    rightEyeLidClosed?: string;
    leftEyeHeightRatio?: number;
    leftEyeImageHeight?: number;
    leftIrisWidthRatio?: number;
    rightEyeImageWidth?: number;
    rightEyeWidthRatio?: number;
    leftEyeLidHalfClosed?: string;
    leftEyeLidOpenWidth?: number;
    leftIrisHeightRatio?: number;
    rightEyeHeightRatio?: number;
    rightEyeImageHeight?: number;
    rightIrisWidthRatio?: number;
    leftEyeLidOpenHeight?: number;
    leftEyeLidWidthRatio?: number;
    rightEyeLidHalfClosed?: string;
    rightEyeLidOpenWidth?: number;
    rightIrisHeightRatio?: number;
    leftEyeLidClosedWidth?: number;
    leftEyeLidHeightRatio?: number;
    rightEyeLidOpenHeight?: number;
    rightEyeLidWidthRatio?: number;
    leftEyeLidClosedHeight?: number;
    rightEyeLidClosedWidth?: number;
    rightEyeLidHeightRatio?: number;
    rightEyeLidClosedHeight?: number;
    leftEyeLidHalfClosedWidth?: number;
    leftEyeLidHalfClosedHeight?: number;
    rightEyeLidHalfClosedWidth?: number;
    rightEyeLidHalfClosedHeight?: number;
    [key: string]: string | number | undefined;
}

/**
 * Mouth data configuration
 * Contains MD5 hashes for mouth shape images and positioning/sizing information
 */
export interface MouthData {
    // Common positioning/sizing properties
    width?: number;
    height?: number;
    size?: number;
    xCoor?: number;
    yCoor?: number;
    
    // Legacy naming
    mouthWidth?: number;
    mouthHeight?: number;
    mouthSize?: number;
    mouthXCoor?: number;
    mouthYCoor?: number;
    
    // Mouth shape images (MD5 hashes) - allow any mouth shape key
    [key: string]: string | number | undefined;
}

/**
 * Eye socket polygon - array of points defining the boundary
 */
export type EyeSocketPolygon = Position[];

/**
 * Eye sockets for left and right eyes (used to compute iris movement bounds)
 */
export interface EyeSockets {
    left?: EyeSocketPolygon;
    right?: EyeSocketPolygon;
}

/**
 * Character rig data structure
 */
export interface RigData {
    id?: string;
    key?: string;
    kind?: string;
    name?: string;
    rotationValues?: Record<string, number>;
    selfRotationValues?: Record<string, number>;
    dimensionValues?: Record<string, Dimension>;
    pivotPoints?: Record<string, Position>;
    jointOffset?: Record<string, Position>;
    zIndexValues?: Record<string, number>;
    eyes?: EyeData;
    eyeSockets?: EyeSockets;
    mouth?: MouthData;
    imagePaths?: Record<string, string>;
    imageScale?: number;
    visibility?: Record<string, boolean>;
    flipX?: boolean;
    flipHead?: boolean;
}

/**
 * Rendering options for character rig
 */
export interface RenderOptions {
    canvasWidth?: number;
    canvasHeight?: number;
    cameraOffset?: Position;
    loadedImages?: Record<string, HTMLImageElement | HTMLCanvasElement>;
    /** When true, auto-size canvas so the entire character fits with padding (default: true) */
    autoFit?: boolean;
}

/**
 * Computed render object with transform and image data
 */
export interface RenderObject {
    name: string;
    type: 'limb' | 'eye' | 'iris' | 'eyelid';
    zIndex: number;
    width: number;
    height: number;
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    anchorX: number;
    anchorY: number;
    imageKey: string;
    imageData?: HTMLImageElement | HTMLCanvasElement;
    selfRotation?: number;
    parentTransform?: Transform2D;
}

/**
 * Computed pivot point in world space
 */
export interface PivotPoint {
    name: string;
    x: number;
    y: number;
}

/**
 * Complete render data structure
 */
export interface RigRenderData {
    objects: RenderObject[];
    pivotPoints: PivotPoint[];
}

/**
 * Image loading callback types
 */
export type ImageLoadCallback = (key: string, img: HTMLImageElement) => void;
export type ImageErrorCallback = (key: string, error: Event | string) => void;

/**
 * Eye direction type
 */
export type EyeDirection = 'left' | 'right' | 'up' | 'down' | 'center' | 'up-left' | 'up-right' | 'down-left' | 'down-right' | '';

/**
 * Eyelid state
 */
export type EyelidState = 'open' | 'half-closed' | 'closed';

/**
 * Eye movement configuration
 */
export interface EyeMovementConfig {
    direction?: EyeDirection;
    targetPosition?: Position;
    leftIrisXCoor?: number;
    leftIrisYCoor?: number;
    rightIrisXCoor?: number;
    rightIrisYCoor?: number;
}

/**
 * Eye state for tracking animation
 */
export interface EyeState {
    // Movement tracking
    eyeLastUpdatedTime: number;
    eyeUpdateInterval: number;
    currentDirection: EyeDirection;
    
    // Blink tracking
    eyeLidLastUpdatedTime: number | null;
    eyeLidUpdateInterval: number;
    currentEyeLidCount: number;
    currentEyeLidState: EyelidState;
    blinkDuration: number;
    nextBlinkOffset: number;
    
    // Current iris positions
    leftIrisX: number;
    leftIrisY: number;
    rightIrisX: number;
    rightIrisY: number;
}

/**
 * Eye rendering data
 */
export interface EyeRenderData {
    leftEye?: RenderObject;
    rightEye?: RenderObject;
    leftIris?: RenderObject;
    rightIris?: RenderObject;
    leftEyelid?: RenderObject;
    rightEyelid?: RenderObject;
}
