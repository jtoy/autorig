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
