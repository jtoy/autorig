/**
 * Rendering-agnostic character rig data generator
 * Computes all transforms and returns a data structure that can be used with any rendering library
 */

// Import ImageLoader class
import { ImageLoader } from './imageLoad.js';

// Import types
import type {
    RigData,
    RenderOptions,
    RigRenderData,
    Transform2D,
    RenderObject,
    Position
} from '../types.js';

/**
 * CharacterRigRenderer class - Handles character rig computation and rendering
 */
export class CharacterRigRenderer {
    protected imageLoader: ImageLoader;

    /**
     * Creates a new CharacterRigRenderer instance
     * @param imageLoader - Optional ImageLoader instance (creates a new one if not provided)
     */
    constructor(imageLoader?: ImageLoader) {
        this.imageLoader = imageLoader || new ImageLoader();
    }

    /**
     * Get the ImageLoader instance
     * @returns The ImageLoader instance
     */
    getImageLoader(): ImageLoader {
        return this.imageLoader;
    }

    /**
     * Helper: apply parent transform to get world space position
     */
    private applyTransform(parent: Transform2D, local: Transform2D): Transform2D {
        const cos = Math.cos(parent.rotation);
        const sin = Math.sin(parent.rotation);
        return {
            x: parent.x + (local.x * cos - local.y * sin) * parent.scaleX,
            y: parent.y + (local.x * sin + local.y * cos) * parent.scaleY,
            rotation: parent.rotation + local.rotation,
            scaleX: parent.scaleX * local.scaleX,
            scaleY: parent.scaleY * local.scaleY
        };
    }

    /**
     * Computes all character rig objects with their final transforms and properties
     */
    computeCharacterRigData(
        rigData: RigData, 
        options: RenderOptions = {}
    ): RigRenderData {
        const {
            canvasWidth = 800,
            canvasHeight = 600,
            cameraOffset = { x: 0, y: 0 },
            loadedImages = {}
        } = options;
        
        // HELPER: Look up image by actual path from rigData (not by semantic key!)
        // This allows multiple variations to coexist in cache without overwriting each other
        const getImage = (path: string | undefined | null): any => {
            if (!path) return undefined;
            return loadedImages[path];
        };
        
        // Get rendering parameters from rigData
        const centerX = canvasWidth / 2 + cameraOffset.x;
        const centerY = canvasHeight / 2 + 100 + cameraOffset.y;
        const rotations = rigData.rotationValues || {};
        const selfRotations = rigData.selfRotationValues || {};
        const dimensions = rigData.dimensionValues || {};
        const pivotPoints = rigData.pivotPoints || {};
        const jointOffset = rigData.jointOffset || {};
        const zIndexValues = rigData.zIndexValues || {};
        const eyes = rigData.eyes || {};
        const visibility = rigData.visibility || {}; // Default: all visible if not specified
        const flipX = rigData.flipX || false; // No flip by default
        const flipHead = rigData.flipHead || false; // No head flip by default
        const imageScale = rigData.imageScale ?? 1.0; // Use imageScale from rigData, default to 1.0
        
        // Create array of all limbs/components with their computed transforms
        const allObjects: RenderObject[] = [];
        
        // Root transform (character position in world space)
        const rootTransform = {
            x: centerX,
            y: centerY,
            rotation: 0,
            scaleX: flipX ? -1 : 1,
            scaleY: 1
        };
        
        // Torso
        if (visibility.torso !== false) {
            const torsoWidth = dimensions.torso?.width || 60;
            const torsoHeight = dimensions.torso?.height || 120;
            const selfRot = selfRotations["torso"] || 0;
            
            // CRITICAL FIX: Look up image by ACTUAL PATH from rigData, not semantic key!
            const torsoImagePath = rigData.imagePaths?.torso;
            const torsoImage = torsoImagePath ? loadedImages[torsoImagePath] : undefined;
            
            allObjects.push({
                name: 'torso',
                type: 'limb',
                zIndex: zIndexValues['torso'] || 1,
                width: torsoWidth * imageScale,
                height: torsoHeight * imageScale,
                x: rootTransform.x,
                y: rootTransform.y,
                rotation: rootTransform.rotation + selfRot,
                scaleX: rootTransform.scaleX,
                scaleY: rootTransform.scaleY,
                // Anchor point (where the image is drawn from - top center for torso)
                anchorX: 0.5,
                anchorY: 1,
                imageKey: 'imagePaths.torso',
                imageData: torsoImage,
                selfRotation: selfRot
            });
        }
        
        // Head
        if (visibility.head !== false) {
            const connectionKey = `torso_head`;
            const pivotPoint = pivotPoints[connectionKey] || { x: 0, y: 0 };
            const headJointOffset = jointOffset[connectionKey] || { x: 0, y: 0 };
            const headWidth = dimensions.head?.width || 80;
            const headHeight = dimensions.head?.height || 80;
            const headRot = rotations["head"] || 0;
            const selfRot = selfRotations["head"] || 0;
            
            // Calculate head transform
            const headParentTransform = this.applyTransform(rootTransform, {
                x: pivotPoint.x || 0,
                y: pivotPoint.y || 0,
                rotation: headRot,
                scaleX: flipHead ? -1 : 1,
                scaleY: 1
            });
            
            const headTransform = this.applyTransform(headParentTransform, {
                x: headJointOffset.x || 0,
                y: (headJointOffset.y || 0) - headHeight / 2,
                rotation: selfRot,
                scaleX: 1,
                scaleY: 1
            });
            
            // CRITICAL FIX: Look up image by ACTUAL PATH from rigData, not semantic key!
            const headImagePath = rigData.imagePaths?.head;
            const headImage = headImagePath ? loadedImages[headImagePath] : undefined;
            
            allObjects.push({
                name: 'head',
                type: 'limb',
                zIndex: zIndexValues['head'] || 1,
                width: headWidth * imageScale,
                height: headHeight * imageScale,
                x: headTransform.x,
                y: headTransform.y,
                rotation: headTransform.rotation,
                scaleX: headTransform.scaleX,
                scaleY: headTransform.scaleY,
                anchorX: 0.5,
                anchorY: 0.5,
                imageKey: 'imagePaths.head',
                imageData: headImage,
                selfRotation: selfRot,
                parentTransform: headParentTransform
            });
        }
        
        // Mouth (child of head)
        if (visibility.mouth !== false) {
            const headPivot = pivotPoints['torso_head'] || { x: 0, y: 0 };
            const selfRot = selfRotations["mouth"] || 0;
            const headRot = rotations["head"] || 0;
            
            // Get mouth dimensions and position from rigData.mouth
            const mouthData = (rigData as any).mouth;
            let baseMouthWidth = dimensions.mouth?.width || 40;
            let baseMouthHeight = dimensions.mouth?.height || 30;
            let mouthSizeScale = 1;
            
            // Determine position offset: use xCoor/yCoor from mouth data if available,
            // otherwise fall back to pivot point system
            const mouthPivotOffset = pivotPoints['head_mouth'] || { x: 0, y: 0 };
            let mouthXOffset = mouthPivotOffset.x || 0;
            let mouthYOffset = mouthPivotOffset.y || 0;
            
            // If mouth data is available, use its width, height, size, and override position with xCoor/yCoor
            if (mouthData && typeof mouthData === 'object') {
                if (typeof mouthData.width === 'number' && mouthData.width > 0) {
                    baseMouthWidth = mouthData.width;
                }
                if (typeof mouthData.height === 'number' && mouthData.height > 0) {
                    baseMouthHeight = mouthData.height;
                }
                if (typeof mouthData.size === 'number' && mouthData.size > 0) {
                    mouthSizeScale = mouthData.size;
                }
                // xCoor and yCoor from mouth data take precedence over pivot points
                if (typeof mouthData.xCoor === 'number') {
                    mouthXOffset = mouthData.xCoor;
                }
                if (typeof mouthData.yCoor === 'number') {
                    mouthYOffset = mouthData.yCoor;
                }
            }
            
            // Calculate final dimensions with size scaling
            const finalMouthWidth = baseMouthWidth * mouthSizeScale;
            const finalMouthHeight = baseMouthHeight * mouthSizeScale;
            
            const headBaseTransform = this.applyTransform(rootTransform, {
                x: headPivot.x || 0,
                y: headPivot.y || 0,
                rotation: headRot,
                scaleX: flipHead ? -1 : 1,
                scaleY: 1
            });
            
            // Position mouth using the determined offsets (xCoor/yCoor take priority)
            // Note: Anchor point (0.5, 0.5) automatically centers the image at this position
            const mouthTransform = this.applyTransform(headBaseTransform, {
                x: mouthXOffset,
                y: mouthYOffset,
                rotation: selfRot,
                scaleX: 1,
                scaleY: 1
            });
            
            // Get current mouth shape and look up the corresponding image
            // If currentMouthShape is specified, use it to look up the specific mouth image
            // Otherwise, fall back to the static imagePaths.mouth
            let mouthImagePath: string | undefined;
            let mouthImage: any;
            
            const currentMouthShape = (rigData as any).currentMouthShape;
            
            if (currentMouthShape && (rigData as any).mouth && (rigData as any).mouth[currentMouthShape]) {
                // Use the specific mouth shape image from rigData.mouth[shape]
                mouthImagePath = (rigData as any).mouth[currentMouthShape];
                mouthImage = mouthImagePath ? loadedImages[mouthImagePath] : undefined;
            } else {
                // Fallback to static imagePaths.mouth
                mouthImagePath = rigData.imagePaths?.mouth;
                mouthImage = mouthImagePath ? loadedImages[mouthImagePath] : undefined;
            }
            
            allObjects.push({
                name: 'mouth',
                type: 'limb',
                zIndex: zIndexValues['mouth'] || 1,
                width: finalMouthWidth * imageScale,
                height: finalMouthHeight * imageScale,
                x: mouthTransform.x,
                y: mouthTransform.y,
                rotation: mouthTransform.rotation,
                scaleX: mouthTransform.scaleX,
                scaleY: mouthTransform.scaleY,
                anchorX: 0.5,
                anchorY: 0.5,
                imageKey: 'imagePaths.mouth',
                imageData: mouthImage,
                selfRotation: selfRot
            });
        }
        
        // Left Eye
        // CRITICAL FIX: Look up image by ACTUAL PATH from rigData.eyes
        const leftEyeImagePath = eyes?.leftEyeImage;
        const leftEyeImage = leftEyeImagePath ? loadedImages[leftEyeImagePath] : undefined;
        
        if (visibility.leftEye !== false && leftEyeImage && eyes) {
            const headPivot = pivotPoints['torso_head'] || { x: 0, y: 0 };
            const headRot = rotations["head"] || 0;
            
            const headBaseTransform = this.applyTransform(rootTransform, {
                x: headPivot.x || 0,
                y: headPivot.y || 0,
                rotation: headRot,
                scaleX: flipHead ? -1 : 1,
                scaleY: 1
            });
            
            const offsetX: number = Number.isFinite(eyes.leftEyeXCoor) ? eyes.leftEyeXCoor! : -10;
            const offsetY: number = Number.isFinite(eyes.leftEyeYCoor) ? eyes.leftEyeYCoor! : -5;
            
            const baseLeftEyeWidth = eyes.leftEyeImageWidth || 20;
            const baseLeftEyeHeight = eyes.leftEyeImageHeight || 15;
            const leftEyeWidth: number = baseLeftEyeWidth * (eyes.leftEyeWidthRatio || 1.0);
            const leftEyeHeight: number = baseLeftEyeHeight * (eyes.leftEyeHeightRatio || 1.0);
            
            const leftEyeTransform = this.applyTransform(headBaseTransform, {
                x: offsetX,
                y: offsetY,
                rotation: 0,
                scaleX: 1,
                scaleY: 1
            });
            
            allObjects.push({
                name: 'leftEye',
                type: 'eye',
                zIndex: zIndexValues['leftEye'] || 6,
                width: leftEyeWidth,
                height: leftEyeHeight,
                x: leftEyeTransform.x,
                y: leftEyeTransform.y,
                rotation: leftEyeTransform.rotation,
                scaleX: leftEyeTransform.scaleX,
                scaleY: leftEyeTransform.scaleY,
                anchorX: 0.5,
                anchorY: 0.5,
                imageKey: 'eyes.leftEyeImage',
                imageData: leftEyeImage
            });
        }
        
        // Right Eye  
        const rightEyeImagePath = eyes?.rightEyeImage;
        const rightEyeImage = getImage(rightEyeImagePath);
        
        if (visibility.rightEye !== false && rightEyeImage && eyes) {
            const headPivot = pivotPoints['torso_head'] || { x: 0, y: 0 };
            const headRot = rotations["head"] || 0;
            
            const headBaseTransform = this.applyTransform(rootTransform, {
                x: headPivot.x || 0,
                y: headPivot.y || 0,
                rotation: headRot,
                scaleX: flipHead ? -1 : 1,
                scaleY: 1
            });
            
            const offsetX: number = Number.isFinite(eyes.rightEyeXCoor) ? eyes.rightEyeXCoor! : 10;
            const offsetY: number = Number.isFinite(eyes.rightEyeYCoor) ? eyes.rightEyeYCoor! : -5;
            
            const baseRightEyeWidth = eyes.rightEyeImageWidth || 20;
            const baseRightEyeHeight = eyes.rightEyeImageHeight || 15;
            const rightEyeWidth: number = baseRightEyeWidth * (eyes.rightEyeWidthRatio || 1.0);
            const rightEyeHeight: number = baseRightEyeHeight * (eyes.rightEyeHeightRatio || 1.0);
            
            const rightEyeTransform = this.applyTransform(headBaseTransform, {
                x: offsetX,
                y: offsetY,
                rotation: 0,
                scaleX: 1,
                scaleY: 1
            });
            
            allObjects.push({
                name: 'rightEye',
                type: 'eye',
                zIndex: zIndexValues['rightEye'] || 3,
                width: rightEyeWidth,
                height: rightEyeHeight,
                x: rightEyeTransform.x,
                y: rightEyeTransform.y,
                rotation: rightEyeTransform.rotation,
                scaleX: rightEyeTransform.scaleX,
                scaleY: rightEyeTransform.scaleY,
                anchorX: 0.5,
                anchorY: 0.5,
                imageKey: 'eyes.rightEyeImage',
                imageData: rightEyeImage
            });
        }
        
        // Left Iris
        const leftIrisImagePath = eyes?.leftIris;
        const leftIrisImage = getImage(leftIrisImagePath);
        
        if (visibility.leftIris !== false && leftIrisImage && eyes) {
            const headPivot = pivotPoints['torso_head'] || { x: 0, y: 0 };
            const headRot = rotations["head"] || 0;
            
            const headBaseTransform = this.applyTransform(rootTransform, {
                x: headPivot.x || 0,
                y: headPivot.y || 0,
                rotation: headRot,
                scaleX: flipHead ? -1 : 1,
                scaleY: 1
            });
            
            // Base iris position from rig data
            let offsetX: number = Number.isFinite(eyes.leftIrisXCoor) ? eyes.leftIrisXCoor! : -10;
            let offsetY: number = Number.isFinite(eyes.leftIrisYCoor) ? eyes.leftIrisYCoor! : -5;
            
            // Apply manual eye positioning if eyePositions exists
            const eyePositions = (eyes as any).eyePositions;
            if (eyePositions?.left) {
                const eyePos = eyePositions.left;
                const hasEyeMovement = eyePos.x !== undefined && eyePos.y !== undefined && 
                                      (eyePos.x !== 0 || eyePos.y !== 0);
                
                if (hasEyeMovement) {
                    // eyePos values are in -2 to 2 range
                    // Scale them to pixel movement (matching the old Body.js behavior)
                    const movementScale = 5; // Pixels of movement per unit
                    const deltaX = eyePos.x * movementScale;
                    const deltaY = eyePos.y * movementScale;
                    offsetX += deltaX;
                    offsetY += deltaY;
                }
            }
            
            const baseLeftIrisWidth = eyes.leftIrisWidth || 10;
            const baseLeftIrisHeight = eyes.leftIrisHeight || 10;
            const leftIrisWidth: number = baseLeftIrisWidth * (eyes.leftIrisWidthRatio || 1.0);
            const leftIrisHeight: number = baseLeftIrisHeight * (eyes.leftIrisHeightRatio || 1.0);
            
            const leftIrisTransform = this.applyTransform(headBaseTransform, {
                x: offsetX,
                y: offsetY,
                rotation: 0,
                scaleX: 1,
                scaleY: 1
            });
            
            allObjects.push({
                name: 'leftIris',
                type: 'iris',
                zIndex: zIndexValues['leftIris'] || 7,
                width: leftIrisWidth,
                height: leftIrisHeight,
                x: leftIrisTransform.x,
                y: leftIrisTransform.y,
                rotation: leftIrisTransform.rotation,
                scaleX: leftIrisTransform.scaleX,
                scaleY: leftIrisTransform.scaleY,
                anchorX: 0.5,
                anchorY: 0.5,
                imageKey: 'eyes.leftIris',
                imageData: leftIrisImage
            });
        }
        
        // Right Iris
        const rightIrisImagePath = eyes?.rightIris;
        const rightIrisImage = getImage(rightIrisImagePath);
        
        if (visibility.rightIris !== false && rightIrisImage && eyes) {
            const headPivot = pivotPoints['torso_head'] || { x: 0, y: 0 };
            const headRot = rotations["head"] || 0;
            
            const headBaseTransform = this.applyTransform(rootTransform, {
                x: headPivot.x || 0,
                y: headPivot.y || 0,
                rotation: headRot,
                scaleX: flipHead ? -1 : 1,
                scaleY: 1
            });
            
            // Base iris position from rig data
            let offsetX: number = Number.isFinite(eyes.rightIrisXCoor) ? eyes.rightIrisXCoor! : 10;
            let offsetY: number = Number.isFinite(eyes.rightIrisYCoor) ? eyes.rightIrisYCoor! : -5;
            
            // Apply manual eye positioning if eyePositions exists
            const eyePositions = (eyes as any).eyePositions;
            if (eyePositions?.right) {
                const eyePos = eyePositions.right;
                const hasEyeMovement = eyePos.x !== undefined && eyePos.y !== undefined && 
                                      (eyePos.x !== 0 || eyePos.y !== 0);
                
                if (hasEyeMovement) {
                    // eyePos values are in -2 to 2 range
                    // Scale them to pixel movement (matching the old Body.js behavior)
                    const movementScale = 5; // Pixels of movement per unit
                    const deltaX = eyePos.x * movementScale;
                    const deltaY = eyePos.y * movementScale;
                    offsetX += deltaX;
                    offsetY += deltaY;
                }
            }
            
            const baseRightIrisWidth = eyes.rightIrisWidth || 10;
            const baseRightIrisHeight = eyes.rightIrisHeight || 10;
            const rightIrisWidth: number = baseRightIrisWidth * (eyes.rightIrisWidthRatio || 1.0);
            const rightIrisHeight: number = baseRightIrisHeight * (eyes.rightIrisHeightRatio || 1.0);
            
            const rightIrisTransform = this.applyTransform(headBaseTransform, {
                x: offsetX,
                y: offsetY,
                rotation: 0,
                scaleX: 1,
                scaleY: 1
            });
            
            allObjects.push({
                name: 'rightIris',
                type: 'iris',
                zIndex: zIndexValues['rightIris'] || 4,
                width: rightIrisWidth,
                height: rightIrisHeight,
                x: rightIrisTransform.x,
                y: rightIrisTransform.y,
                rotation: rightIrisTransform.rotation,
                scaleX: rightIrisTransform.scaleX,
                scaleY: rightIrisTransform.scaleY,
                anchorX: 0.5,
                anchorY: 0.5,
                imageKey: 'eyes.rightIris',
                imageData: rightIrisImage
            });
        }
        
        // Left Eye Lid - select image based on current eyelid state
        const eyelidState = eyes.eyelidState || 'open'; // Default to 'open'
        
        // Select the correct image based on eyelid state (using actual paths!)
        let leftEyeLidImage;
        if (eyelidState === 'closed') {
            leftEyeLidImage = getImage(eyes?.leftEyeLidClosed);
        } else if (eyelidState === 'half-closed') {
            leftEyeLidImage = getImage(eyes?.leftEyeLidHalfClosed);
        } else {
            leftEyeLidImage = getImage(eyes?.leftEyeLidOpen);
        }
        
        // Fallback to any available eyelid image if the specific one isn't loaded
        if (!leftEyeLidImage) {
            leftEyeLidImage = getImage(eyes?.leftEyeLidOpen) || 
                             getImage(eyes?.leftEyeLidHalfClosed) || 
                             getImage(eyes?.leftEyeLidClosed);
        }
        
        if (visibility.leftEyeLid !== false && leftEyeLidImage && eyes) {
            const headPivot = pivotPoints['torso_head'] || { x: 0, y: 0 };
            const headRot = rotations["head"] || 0;
            
            const headBaseTransform = this.applyTransform(rootTransform, {
                x: headPivot.x || 0,
                y: headPivot.y || 0,
                rotation: headRot,
                scaleX: flipHead ? -1 : 1,
                scaleY: 1
            });
            
            const offsetX: number = Number.isFinite(eyes.leftEyeLidXCoor) ? eyes.leftEyeLidXCoor! : -10;
            const offsetY: number = Number.isFinite(eyes.leftEyeLidYCoor) ? eyes.leftEyeLidYCoor! : -5;
            
            const baseLeftEyeLidWidth = eyes.leftEyeLidOpenWidth || eyes.leftEyeLidHalfClosedWidth || eyes.leftEyeLidClosedWidth || 20;
            const baseLeftEyeLidHeight = eyes.leftEyeLidOpenHeight || eyes.leftEyeLidHalfClosedHeight || eyes.leftEyeLidClosedHeight || 15;
            const leftEyeLidWidth: number = baseLeftEyeLidWidth * (eyes.leftEyeLidWidthRatio || 1.0);
            const leftEyeLidHeight: number = baseLeftEyeLidHeight * (eyes.leftEyeLidHeightRatio || 1.0);
            
            const leftEyeLidTransform = this.applyTransform(headBaseTransform, {
                x: offsetX,
                y: offsetY,
                rotation: 0,
                scaleX: 1,
                scaleY: 1
            });
            
            allObjects.push({
                name: 'leftEyeLid',
                type: 'eyelid',
                zIndex: zIndexValues['leftEyeLid'] || 8,
                width: leftEyeLidWidth,
                height: leftEyeLidHeight,
                x: leftEyeLidTransform.x,
                y: leftEyeLidTransform.y,
                rotation: leftEyeLidTransform.rotation,
                scaleX: leftEyeLidTransform.scaleX,
                scaleY: leftEyeLidTransform.scaleY,
                anchorX: 0.5,
                anchorY: 0.5,
                imageKey: 'eyes.leftEyeLid',
                imageData: leftEyeLidImage
            });
        }
        
        // Right Eye Lid - select image based on current eyelid state (same state for both eyes)
        // Select the correct image based on eyelid state (using actual paths!)
        let rightEyeLidImage;
        if (eyelidState === 'closed') {
            rightEyeLidImage = getImage(eyes?.rightEyeLidClosed);
        } else if (eyelidState === 'half-closed') {
            rightEyeLidImage = getImage(eyes?.rightEyeLidHalfClosed);
        } else {
            rightEyeLidImage = getImage(eyes?.rightEyeLidOpen);
        }
        
        // Fallback to any available eyelid image if the specific one isn't loaded
        if (!rightEyeLidImage) {
            rightEyeLidImage = getImage(eyes?.rightEyeLidOpen) || 
                              getImage(eyes?.rightEyeLidHalfClosed) || 
                              getImage(eyes?.rightEyeLidClosed);
        }
        
        if (visibility.rightEyeLid !== false && rightEyeLidImage && eyes) {
            const headPivot = pivotPoints['torso_head'] || { x: 0, y: 0 };
            const headRot = rotations["head"] || 0;
            
            const headBaseTransform = this.applyTransform(rootTransform, {
                x: headPivot.x || 0,
                y: headPivot.y || 0,
                rotation: headRot,
                scaleX: flipHead ? -1 : 1,
                scaleY: 1
            });
            
            const offsetX: number = Number.isFinite(eyes.rightEyeLidXCoor) ? eyes.rightEyeLidXCoor! : 10;
            const offsetY: number = Number.isFinite(eyes.rightEyeLidYCoor) ? eyes.rightEyeLidYCoor! : -5;
            
            const baseRightEyeLidWidth = eyes.rightEyeLidOpenWidth || 20;
            const baseRightEyeLidHeight = eyes.rightEyeLidOpenHeight || 15;
            const rightEyeLidWidth: number = baseRightEyeLidWidth * (eyes.rightEyeLidWidthRatio || 1.0);
            const rightEyeLidHeight: number = baseRightEyeLidHeight * (eyes.rightEyeLidHeightRatio || 1.0);
            
            const rightEyeLidTransform = this.applyTransform(headBaseTransform, {
                x: offsetX,
                y: offsetY,
                rotation: 0,
                scaleX: 1,
                scaleY: 1
            });
            
            allObjects.push({
                name: 'rightEyeLid',
                type: 'eyelid',
                zIndex: zIndexValues['rightEyeLid'] || 5,
                width: rightEyeLidWidth,
                height: rightEyeLidHeight,
                x: rightEyeLidTransform.x,
                y: rightEyeLidTransform.y,
                rotation: rightEyeLidTransform.rotation,
                scaleX: rightEyeLidTransform.scaleX,
                scaleY: rightEyeLidTransform.scaleY,
                anchorX: 0.5,
                anchorY: 0.5,
                imageKey: 'eyes.rightEyeLid',
                imageData: rightEyeLidImage
            });
        }
        
        // Left Arm chain (leftUpperArm, leftForearm, leftHand)
        // Left Upper Arm
        if (visibility.leftUpperArm !== false) {
            const connectionKey = `torso_leftUpperArm`;
            const pivotPoint = pivotPoints[connectionKey] || { x: 0, y: 0 };
            const jointOff = jointOffset[connectionKey] || { x: 0, y: 0 };
            const width = dimensions.leftUpperArm?.width || 30;
            const height = dimensions.leftUpperArm?.height || 50;
            const limbRot = rotations['leftUpperArm'] || 0;
            const selfRot = selfRotations['leftUpperArm'] || 0;
            
            const upperArmParentTransform = this.applyTransform(rootTransform, {
                x: pivotPoint.x || 0,
                y: pivotPoint.y || 0,
                rotation: limbRot,
                scaleX: 1,
                scaleY: 1
            });
            
            const upperArmTransform = this.applyTransform(upperArmParentTransform, {
                x: jointOff.x || 0,
                y: (jointOff.y || 0) - height / 2,
                rotation: selfRot,
                scaleX: 1,
                scaleY: 1
            });
            
            allObjects.push({
                name: 'leftUpperArm',
                type: 'limb',
                zIndex: zIndexValues['leftUpperArm'] || 1,
                width: width * imageScale,
                height: height * imageScale,
                x: upperArmTransform.x,
                y: upperArmTransform.y,
                rotation: upperArmTransform.rotation,
                scaleX: upperArmTransform.scaleX,
                scaleY: upperArmTransform.scaleY,
                anchorX: 0.5,
                anchorY: 0.5,
                imageKey: 'imagePaths.leftUpperArm',
                imageData: getImage(rigData.imagePaths?.leftUpperArm),
                selfRotation: selfRot,
                parentTransform: upperArmParentTransform
            });
        }
        
        // Left Forearm
        if (visibility.leftForearm !== false) {
            const upperConnectionKey = `torso_leftUpperArm`;
            const upperPivot = pivotPoints[upperConnectionKey] || { x: 0, y: 0 };
            const upperHeight = dimensions.leftUpperArm?.height || 50;
            const upperRot = rotations["leftUpperArm"] || 0;
            
            const connectionKey = `leftUpperArm_leftForearm`;
            const pivotPoint = pivotPoints[connectionKey] || { x: 0, y: 0 };
            const jointOff = jointOffset[connectionKey] || { x: 0, y: 0 };
            const width = dimensions.leftForearm?.width || 25;
            const height = dimensions.leftForearm?.height || 45;
            const limbRot = rotations["leftForearm"] || 0;
            const selfRot = selfRotations["leftForearm"] || 0;
            
            const upperArmBase = this.applyTransform(rootTransform, {
                x: upperPivot.x || 0,
                y: upperPivot.y || 0,
                rotation: upperRot,
                scaleX: 1,
                scaleY: 1
            });
            
            const forearmParent = this.applyTransform(upperArmBase, {
                x: pivotPoint.x || 0,
                y: (pivotPoint.y || 0) - upperHeight,
                rotation: limbRot,
                scaleX: 1,
                scaleY: 1
            });
            
            const forearmTransform = this.applyTransform(forearmParent, {
                x: jointOff.x || 0,
                y: (jointOff.y || 0) - height / 2,
                rotation: selfRot,
                scaleX: 1,
                scaleY: 1
            });
            
            allObjects.push({
                name: 'leftForearm',
                type: 'limb',
                zIndex: zIndexValues['leftForearm'] || 1,
                width: width * imageScale,
                height: height * imageScale,
                x: forearmTransform.x,
                y: forearmTransform.y,
                rotation: forearmTransform.rotation,
                scaleX: forearmTransform.scaleX,
                scaleY: forearmTransform.scaleY,
                anchorX: 0.5,
                anchorY: 0.5,
                imageKey: 'imagePaths.leftForearm',
                imageData: getImage(rigData.imagePaths?.leftForearm),
                selfRotation: selfRot,
                parentTransform: forearmParent
            });
        }
        
        // Left Hand
        if (visibility.leftHand !== false) {
            const upperConnectionKey = `torso_leftUpperArm`;
            const upperPivot = pivotPoints[upperConnectionKey] || { x: 0, y: 0 };
            const upperHeight = dimensions.leftUpperArm?.height || 50;
            const upperRot = rotations["leftUpperArm"] || 0;
            
            const foreConnectionKey = `leftUpperArm_leftForearm`;
            const forePivot = pivotPoints[foreConnectionKey] || { x: 0, y: 0 };
            const foreHeight = dimensions.leftForearm?.height || 45;
            const foreRot = rotations["leftForearm"] || 0;
            
            const handConnectionKey = `leftForearm_leftHand`;
            const handPivot = pivotPoints[handConnectionKey] || { x: 0, y: 0 };
            const handJointOff = jointOffset[handConnectionKey] || { x: 0, y: 0 };
            const width = dimensions.leftHand?.width || 20;
            const height = dimensions.leftHand?.height || 30;
            const handRot = rotations["leftHand"] || 0;
            const selfRot = selfRotations["leftHand"] || 0;
            
            const upperArmBase = this.applyTransform(rootTransform, {
                x: upperPivot.x || 0,
                y: upperPivot.y || 0,
                rotation: upperRot,
                scaleX: 1,
                scaleY: 1
            });
            
            const forearmBase = this.applyTransform(upperArmBase, {
                x: forePivot.x || 0,
                y: (forePivot.y || 0) - upperHeight,
                rotation: foreRot,
                scaleX: 1,
                scaleY: 1
            });
            
            const handParent = this.applyTransform(forearmBase, {
                x: handPivot.x || 0,
                y: (handPivot.y || 0) - foreHeight,
                rotation: handRot,
                scaleX: 1,
                scaleY: 1
            });
            
            const handTransform = this.applyTransform(handParent, {
                x: handJointOff.x || 0,
                y: (handJointOff.y || 0) - height / 2,
                rotation: selfRot,
                scaleX: 1,
                scaleY: 1
            });
            
            allObjects.push({
                name: 'leftHand',
                type: 'limb',
                zIndex: zIndexValues['leftHand'] || 1,
                width: width * imageScale,
                height: height * imageScale,
                x: handTransform.x,
                y: handTransform.y,
                rotation: handTransform.rotation,
                scaleX: handTransform.scaleX,
                scaleY: handTransform.scaleY,
                anchorX: 0.5,
                anchorY: 0.5,
                imageKey: 'imagePaths.leftHand',
                imageData: getImage(rigData.imagePaths?.leftHand),
                selfRotation: selfRot
            });
        }
        
        // Right Arm chain (rightUpperArm, rightForearm, rightHand)
        // Right Upper Arm
        if (visibility.rightUpperArm !== false) {
            const connectionKey = `torso_rightUpperArm`;
            const pivotPoint = pivotPoints[connectionKey] || { x: 0, y: 0 };
            const jointOff = jointOffset[connectionKey] || { x: 0, y: 0 };
            const width = dimensions.rightUpperArm?.width || 30;
            const height = dimensions.rightUpperArm?.height || 50;
            const limbRot = rotations['rightUpperArm'] || 0;
            const selfRot = selfRotations['rightUpperArm'] || 0;
            
            const upperArmParentTransform = this.applyTransform(rootTransform, {
                x: pivotPoint.x || 0,
                y: pivotPoint.y || 0,
                rotation: limbRot,
                scaleX: 1,
                scaleY: 1
            });
            
            const upperArmTransform = this.applyTransform(upperArmParentTransform, {
                x: jointOff.x || 0,
                y: (jointOff.y || 0) - height / 2,
                rotation: selfRot,
                scaleX: 1,
                scaleY: 1
            });
            
            allObjects.push({
                name: 'rightUpperArm',
                type: 'limb',
                zIndex: zIndexValues['rightUpperArm'] || 1,
                width: width * imageScale,
                height: height * imageScale,
                x: upperArmTransform.x,
                y: upperArmTransform.y,
                rotation: upperArmTransform.rotation,
                scaleX: upperArmTransform.scaleX,
                scaleY: upperArmTransform.scaleY,
                anchorX: 0.5,
                anchorY: 0.5,
                imageKey: 'imagePaths.rightUpperArm',
                imageData: getImage(rigData.imagePaths?.rightUpperArm),
                selfRotation: selfRot,
                parentTransform: upperArmParentTransform
            });
        }
        
        // Right Forearm
        if (visibility.rightForearm !== false) {
            const upperConnectionKey = `torso_rightUpperArm`;
            const upperPivot = pivotPoints[upperConnectionKey] || { x: 0, y: 0 };
            const upperHeight = dimensions.rightUpperArm?.height || 50;
            const upperRot = rotations["rightUpperArm"] || 0;
            
            const connectionKey = `rightUpperArm_rightForearm`;
            const pivotPoint = pivotPoints[connectionKey] || { x: 0, y: 0 };
            const jointOff = jointOffset[connectionKey] || { x: 0, y: 0 };
            const width = dimensions.rightForearm?.width || 25;
            const height = dimensions.rightForearm?.height || 45;
            const limbRot = rotations["rightForearm"] || 0;
            const selfRot = selfRotations["rightForearm"] || 0;
            
            const upperArmBase = this.applyTransform(rootTransform, {
                x: upperPivot.x || 0,
                y: upperPivot.y || 0,
                rotation: upperRot,
                scaleX: 1,
                scaleY: 1
            });
            
            const forearmParent = this.applyTransform(upperArmBase, {
                x: pivotPoint.x || 0,
                y: (pivotPoint.y || 0) - upperHeight,
                rotation: limbRot,
                scaleX: 1,
                scaleY: 1
            });
            
            const forearmTransform = this.applyTransform(forearmParent, {
                x: jointOff.x || 0,
                y: (jointOff.y || 0) - height / 2,
                rotation: selfRot,
                scaleX: 1,
                scaleY: 1
            });
            
            allObjects.push({
                name: 'rightForearm',
                type: 'limb',
                zIndex: zIndexValues['rightForearm'] || 1,
                width: width * imageScale,
                height: height * imageScale,
                x: forearmTransform.x,
                y: forearmTransform.y,
                rotation: forearmTransform.rotation,
                scaleX: forearmTransform.scaleX,
                scaleY: forearmTransform.scaleY,
                anchorX: 0.5,
                anchorY: 0.5,
                imageKey: 'imagePaths.rightForearm',
                imageData: getImage(rigData.imagePaths?.rightForearm),
                selfRotation: selfRot,
                parentTransform: forearmParent
            });
        }
        
        // Right Hand
        if (visibility.rightHand !== false) {
            const upperConnectionKey = `torso_rightUpperArm`;
            const upperPivot = pivotPoints[upperConnectionKey] || { x: 0, y: 0 };
            const upperHeight = dimensions.rightUpperArm?.height || 50;
            const upperRot = rotations["rightUpperArm"] || 0;
            
            const foreConnectionKey = `rightUpperArm_rightForearm`;
            const forePivot = pivotPoints[foreConnectionKey] || { x: 0, y: 0 };
            const foreHeight = dimensions.rightForearm?.height || 45;
            const foreRot = rotations["rightForearm"] || 0;
            
            const handConnectionKey = `rightForearm_rightHand`;
            const handPivot = pivotPoints[handConnectionKey] || { x: 0, y: 0 };
            const handJointOff = jointOffset[handConnectionKey] || { x: 0, y: 0 };
            const width = dimensions.rightHand?.width || 20;
            const height = dimensions.rightHand?.height || 30;
            const handRot = rotations["rightHand"] || 0;
            const selfRot = selfRotations["rightHand"] || 0;
            
            const upperArmBase = this.applyTransform(rootTransform, {
                x: upperPivot.x || 0,
                y: upperPivot.y || 0,
                rotation: upperRot,
                scaleX: 1,
                scaleY: 1
            });
            
            const forearmBase = this.applyTransform(upperArmBase, {
                x: forePivot.x || 0,
                y: (forePivot.y || 0) - upperHeight,
                rotation: foreRot,
                scaleX: 1,
                scaleY: 1
            });
            
            const handParent = this.applyTransform(forearmBase, {
                x: handPivot.x || 0,
                y: (handPivot.y || 0) - foreHeight,
                rotation: handRot,
                scaleX: 1,
                scaleY: 1
            });
            
            const handTransform = this.applyTransform(handParent, {
                x: handJointOff.x || 0,
                y: (handJointOff.y || 0) - height / 2,
                rotation: selfRot,
                scaleX: 1,
                scaleY: 1
            });
            
            allObjects.push({
                name: 'rightHand',
                type: 'limb',
                zIndex: zIndexValues['rightHand'] || 1,
                width: width * imageScale,
                height: height * imageScale,
                x: handTransform.x,
                y: handTransform.y,
                rotation: handTransform.rotation,
                scaleX: handTransform.scaleX,
                scaleY: handTransform.scaleY,
                anchorX: 0.5,
                anchorY: 0.5,
                imageKey: 'imagePaths.rightHand',
                imageData: getImage(rigData.imagePaths?.rightHand),
                selfRotation: selfRot
            });
        }
        
        // Left Leg chain (leftThigh, leftLeg)
        // Left Thigh
        if (visibility.leftThigh !== false) {
            const connectionKey = `torso_leftThigh`;
            const pivotPoint = pivotPoints[connectionKey] || { x: 0, y: 0 };
            const jointOff = jointOffset[connectionKey] || { x: 0, y: 0 };
            const width = dimensions.leftThigh?.width || 35;
            const height = dimensions.leftThigh?.height || 60;
            const limbRot = rotations['leftThigh'] || 0;
            const selfRot = selfRotations['leftThigh'] || 0;
            
            const thighParentTransform = this.applyTransform(rootTransform, {
                x: pivotPoint.x || 0,
                y: pivotPoint.y || 0,
                rotation: limbRot,
                scaleX: 1,
                scaleY: 1
            });
            
            const thighTransform = this.applyTransform(thighParentTransform, {
                x: jointOff.x || 0,
                y: (jointOff.y || 0) - height / 2,
                rotation: selfRot,
                scaleX: 1,
                scaleY: 1
            });
            
            allObjects.push({
                name: 'leftThigh',
                type: 'limb',
                zIndex: zIndexValues['leftThigh'] || 1,
                width: width * imageScale,
                height: height * imageScale,
                x: thighTransform.x,
                y: thighTransform.y,
                rotation: thighTransform.rotation,
                scaleX: thighTransform.scaleX,
                scaleY: thighTransform.scaleY,
                anchorX: 0.5,
                anchorY: 0.5,
                imageKey: 'imagePaths.leftThigh',
                imageData: getImage(rigData.imagePaths?.leftThigh),
                selfRotation: selfRot,
                parentTransform: thighParentTransform
            });
        }
        
        // Left Leg
        if (visibility.leftLeg !== false) {
            const upperConnectionKey = `torso_leftThigh`;
            const upperPivot = pivotPoints[upperConnectionKey] || { x: 0, y: 0 };
            const upperHeight = dimensions.leftThigh?.height || 60;
            const upperRot = rotations["leftThigh"] || 0;
            
            const connectionKey = `leftThigh_leftLeg`;
            const pivotPoint = pivotPoints[connectionKey] || { x: 0, y: 0 };
            const jointOff = jointOffset[connectionKey] || { x: 0, y: 0 };
            const width = dimensions.leftLeg?.width || 30;
            const height = dimensions.leftLeg?.height || 55;
            const limbRot = rotations["leftLeg"] || 0;
            const selfRot = selfRotations["leftLeg"] || 0;
            
            const thighBase = this.applyTransform(rootTransform, {
                x: upperPivot.x || 0,
                y: upperPivot.y || 0,
                rotation: upperRot,
                scaleX: 1,
                scaleY: 1
            });
            
            const legParent = this.applyTransform(thighBase, {
                x: pivotPoint.x || 0,
                y: (pivotPoint.y || 0) - upperHeight,
                rotation: limbRot,
                scaleX: 1,
                scaleY: 1
            });
            
            const legTransform = this.applyTransform(legParent, {
                x: jointOff.x || 0,
                y: (jointOff.y || 0) - height / 2,
                rotation: selfRot,
                scaleX: 1,
                scaleY: 1
            });
            
            allObjects.push({
                name: 'leftLeg',
                type: 'limb',
                zIndex: zIndexValues['leftLeg'] || 1,
                width: width * imageScale,
                height: height * imageScale,
                x: legTransform.x,
                y: legTransform.y,
                rotation: legTransform.rotation,
                scaleX: legTransform.scaleX,
                scaleY: legTransform.scaleY,
                anchorX: 0.5,
                anchorY: 0.5,
                imageKey: 'imagePaths.leftLeg',
                imageData: getImage(rigData.imagePaths?.leftLeg),
                selfRotation: selfRot
            });
        }
        
        // Right Leg chain (rightThigh, rightLeg)
        // Right Thigh
        if (visibility.rightThigh !== false) {
            const connectionKey = `torso_rightThigh`;
            const pivotPoint = pivotPoints[connectionKey] || { x: 0, y: 0 };
            const jointOff = jointOffset[connectionKey] || { x: 0, y: 0 };
            const width = dimensions.rightThigh?.width || 35;
            const height = dimensions.rightThigh?.height || 60;
            const limbRot = rotations['rightThigh'] || 0;
            const selfRot = selfRotations['rightThigh'] || 0;
            
            const thighParentTransform = this.applyTransform(rootTransform, {
                x: pivotPoint.x || 0,
                y: pivotPoint.y || 0,
                rotation: limbRot,
                scaleX: 1,
                scaleY: 1
            });
            
            const thighTransform = this.applyTransform(thighParentTransform, {
                x: jointOff.x || 0,
                y: (jointOff.y || 0) - height / 2,
                rotation: selfRot,
                scaleX: 1,
                scaleY: 1
            });
            
            allObjects.push({
                name: 'rightThigh',
                type: 'limb',
                zIndex: zIndexValues['rightThigh'] || 1,
                width: width * imageScale,
                height: height * imageScale,
                x: thighTransform.x,
                y: thighTransform.y,
                rotation: thighTransform.rotation,
                scaleX: thighTransform.scaleX,
                scaleY: thighTransform.scaleY,
                anchorX: 0.5,
                anchorY: 0.5,
                imageKey: 'imagePaths.rightThigh',
                imageData: getImage(rigData.imagePaths?.rightThigh),
                selfRotation: selfRot,
                parentTransform: thighParentTransform
            });
        }
        
        // Right Leg
        if (visibility.rightLeg !== false) {
            const upperConnectionKey = `torso_rightThigh`;
            const upperPivot = pivotPoints[upperConnectionKey] || { x: 0, y: 0 };
            const upperHeight = dimensions.rightThigh?.height || 60;
            const upperRot = rotations["rightThigh"] || 0;
            
            const connectionKey = `rightThigh_rightLeg`;
            const pivotPoint = pivotPoints[connectionKey] || { x: 0, y: 0 };
            const jointOff = jointOffset[connectionKey] || { x: 0, y: 0 };
            const width = dimensions.rightLeg?.width || 30;
            const height = dimensions.rightLeg?.height || 55;
            const limbRot = rotations["rightLeg"] || 0;
            const selfRot = selfRotations["rightLeg"] || 0;
            
            const thighBase = this.applyTransform(rootTransform, {
                x: upperPivot.x || 0,
                y: upperPivot.y || 0,
                rotation: upperRot,
                scaleX: 1,
                scaleY: 1
            });
            
            const legParent = this.applyTransform(thighBase, {
                x: pivotPoint.x || 0,
                y: (pivotPoint.y || 0) - upperHeight,
                rotation: limbRot,
                scaleX: 1,
                scaleY: 1
            });
            
            const legTransform = this.applyTransform(legParent, {
                x: jointOff.x || 0,
                y: (jointOff.y || 0) - height / 2,
                rotation: selfRot,
                scaleX: 1,
                scaleY: 1
            });
            
            allObjects.push({
                name: 'rightLeg',
                type: 'limb',
                zIndex: zIndexValues['rightLeg'] || 1,
                width: width * imageScale,
                height: height * imageScale,
                x: legTransform.x,
                y: legTransform.y,
                rotation: legTransform.rotation,
                scaleX: legTransform.scaleX,
                scaleY: legTransform.scaleY,
                anchorX: 0.5,
                anchorY: 0.5,
                imageKey: 'imagePaths.rightLeg',
                imageData: getImage(rigData.imagePaths?.rightLeg),
                selfRotation: selfRot
            });
        }
        
        // Sort all objects by zIndex
        allObjects.sort((a, b) => a.zIndex - b.zIndex);
        
        // Compute pivot points in world space
        const computedPivotPoints = [];
        
        // Head/torso pivot
        const torsoHead = pivotPoints['torso_head'] || { x: 0, y: 0 };
        const headPivotWorld = this.applyTransform(rootTransform, {
            x: torsoHead.x || 0,
            y: torsoHead.y || 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1
        });
        computedPivotPoints.push({
            name: 'torso_head',
            x: headPivotWorld.x,
            y: headPivotWorld.y
        });
        
        // Mouth pivot
        const headAngle = rotations['head'] || 0;
        const headAngleEff = flipHead ? -headAngle : headAngle;
        const headOffX = 0; // head offset defaults to 0
        const headOffY = 0; // head offset defaults to 0
        const headOffEffX = flipHead ? -headOffX : headOffX;
        const cosH = Math.cos(headAngleEff);
        const sinH = Math.sin(headAngleEff);
        const mouthOffset = pivotPoints['head_mouth'] || { x: 0, y: 0 };
        const mouthOffX = flipHead ? -(mouthOffset.x || 0) : (mouthOffset.x || 0);
        const mouthOffY = mouthOffset.y || 0;
        computedPivotPoints.push({
            name: 'head_mouth',
            x: centerX + (torsoHead.x || 0) + headOffEffX + (mouthOffX * cosH - mouthOffY * sinH),
            y: centerY + (torsoHead.y || 0) + headOffY + (mouthOffX * sinH + mouthOffY * cosH)
        });
        
        // Left arm chain pivots
        const lShoulder = pivotPoints['torso_leftUpperArm'] || { x: 0, y: 0 };
        const lShoulderWorld = this.applyTransform(rootTransform, {
            x: lShoulder.x || 0,
            y: lShoulder.y || 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1
        });
        computedPivotPoints.push({ name: 'torso_leftUpperArm', x: lShoulderWorld.x, y: lShoulderWorld.y });
        
        const rL1 = rotations['leftUpperArm'] || 0;
        const leftUpperArmHeight = dimensions.leftUpperArm?.height || 50;
        const lElbowOff = pivotPoints['leftUpperArm_leftForearm'] || { x: 0, y: 0 };
        const lElbowBase = this.applyTransform(rootTransform, {
            x: lShoulder.x || 0,
            y: lShoulder.y || 0,
            rotation: rL1,
            scaleX: 1,
            scaleY: 1
        });
        const lElbowWorld = this.applyTransform(lElbowBase, {
            x: lElbowOff.x || 0,
            y: (lElbowOff.y || 0) - leftUpperArmHeight,
            rotation: 0,
            scaleX: 1,
            scaleY: 1
        });
        computedPivotPoints.push({ name: 'leftUpperArm_leftForearm', x: lElbowWorld.x, y: lElbowWorld.y });
        
        const leftForearmHeight = dimensions.leftForearm?.height || 45;
        const lWristOff = pivotPoints['leftForearm_leftHand'] || { x: 0, y: 0 };
        const lForearmBase = this.applyTransform(lElbowBase, {
            x: lElbowOff.x || 0,
            y: (lElbowOff.y || 0) - leftUpperArmHeight,
            rotation: rotations['leftForearm'] || 0,
            scaleX: 1,
            scaleY: 1
        });
        const lWristWorld = this.applyTransform(lForearmBase, {
            x: lWristOff.x || 0,
            y: (lWristOff.y || 0) - leftForearmHeight,
            rotation: 0,
            scaleX: 1,
            scaleY: 1
        });
        computedPivotPoints.push({ name: 'leftForearm_leftHand', x: lWristWorld.x, y: lWristWorld.y });
        
        // Right arm chain pivots
        const rShoulder = pivotPoints['torso_rightUpperArm'] || { x: 0, y: 0 };
        const rShoulderWorld = this.applyTransform(rootTransform, {
            x: rShoulder.x || 0,
            y: rShoulder.y || 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1
        });
        computedPivotPoints.push({ name: 'torso_rightUpperArm', x: rShoulderWorld.x, y: rShoulderWorld.y });
        
        const rR1 = rotations['rightUpperArm'] || 0;
        const rightUpperArmHeight = dimensions.rightUpperArm?.height || 50;
        const rElbowOff = pivotPoints['rightUpperArm_rightForearm'] || { x: 0, y: 0 };
        const rElbowBase = this.applyTransform(rootTransform, {
            x: rShoulder.x || 0,
            y: rShoulder.y || 0,
            rotation: rR1,
            scaleX: 1,
            scaleY: 1
        });
        const rElbowWorld = this.applyTransform(rElbowBase, {
            x: rElbowOff.x || 0,
            y: (rElbowOff.y || 0) - rightUpperArmHeight,
            rotation: 0,
            scaleX: 1,
            scaleY: 1
        });
        computedPivotPoints.push({ name: 'rightUpperArm_rightForearm', x: rElbowWorld.x, y: rElbowWorld.y });
        
        const rightForearmHeight = dimensions.rightForearm?.height || 45;
        const rWristOff = pivotPoints['rightForearm_rightHand'] || { x: 0, y: 0 };
        const rForearmBase = this.applyTransform(rElbowBase, {
            x: rElbowOff.x || 0,
            y: (rElbowOff.y || 0) - rightUpperArmHeight,
            rotation: rotations['rightForearm'] || 0,
            scaleX: 1,
            scaleY: 1
        });
        const rWristWorld = this.applyTransform(rForearmBase, {
            x: rWristOff.x || 0,
            y: (rWristOff.y || 0) - rightForearmHeight,
            rotation: 0,
            scaleX: 1,
            scaleY: 1
        });
        computedPivotPoints.push({ name: 'rightForearm_rightHand', x: rWristWorld.x, y: rWristWorld.y });
        
        // Left leg chain pivots
        const lHip = pivotPoints['torso_leftThigh'] || { x: 0, y: 0 };
        const lHipWorld = this.applyTransform(rootTransform, {
            x: lHip.x || 0,
            y: lHip.y || 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1
        });
        computedPivotPoints.push({ name: 'torso_leftThigh', x: lHipWorld.x, y: lHipWorld.y });
        
        const rLT1 = rotations['leftThigh'] || 0;
        const leftThighHeight = dimensions.leftThigh?.height || 60;
        const lKneeOff = pivotPoints['leftThigh_leftLeg'] || { x: 0, y: 0 };
        const lThighBase = this.applyTransform(rootTransform, {
            x: lHip.x || 0,
            y: lHip.y || 0,
            rotation: rLT1,
            scaleX: 1,
            scaleY: 1
        });
        const lKneeWorld = this.applyTransform(lThighBase, {
            x: lKneeOff.x || 0,
            y: (lKneeOff.y || 0) - leftThighHeight,
            rotation: 0,
            scaleX: 1,
            scaleY: 1
        });
        computedPivotPoints.push({ name: 'leftThigh_leftLeg', x: lKneeWorld.x, y: lKneeWorld.y });
        
        // Right leg chain pivots
        const rHip = pivotPoints['torso_rightThigh'] || { x: 0, y: 0 };
        const rHipWorld = this.applyTransform(rootTransform, {
            x: rHip.x || 0,
            y: rHip.y || 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1
        });
        computedPivotPoints.push({ name: 'torso_rightThigh', x: rHipWorld.x, y: rHipWorld.y });
        
        const rRT1 = rotations['rightThigh'] || 0;
        const rightThighHeight = dimensions.rightThigh?.height || 60;
        const rKneeOff = pivotPoints['rightThigh_rightLeg'] || { x: 0, y: 0 };
        const rThighBase = this.applyTransform(rootTransform, {
            x: rHip.x || 0,
            y: rHip.y || 0,
            rotation: rRT1,
            scaleX: 1,
            scaleY: 1
        });
        const rKneeWorld = this.applyTransform(rThighBase, {
            x: rKneeOff.x || 0,
            y: (rKneeOff.y || 0) - rightThighHeight,
            rotation: 0,
            scaleX: 1,
            scaleY: 1
        });
        computedPivotPoints.push({ name: 'rightThigh_rightLeg', x: rKneeWorld.x, y: rKneeWorld.y });
        
        // Return the complete data structure
        return {
            objects: allObjects,
            pivotPoints: computedPivotPoints
        };
    }

    /**
     * Universal Canvas renderer - handles both sync (with cache) and async (loads images)
     * 
     * @param canvas - Canvas element to render to
     * @param rigData - Character rig data
     * @param loadedImages - Optional pre-loaded images. If not provided, will check cache or load from network
     * @param cameraOffset - Camera offset for positioning
     * @param showPivotPoints - Whether to show pivot points for debugging
     * @returns Promise that resolves when rendering is complete
     * 
     * @example
     * // With pre-loaded images (fast, synchronous path)
     * await renderer.render(canvas, rigData, myImages);
     * 
     * @example
     * // Without images - auto-loads if needed (async path)
     * await renderer.render(canvas, rigData);
     */
    async render(
        canvas: HTMLCanvasElement, 
        rigData: RigData, 
        loadedImages?: Record<string, HTMLImageElement | HTMLCanvasElement>,
        cameraOffset: Position = { x: 0, y: 0 }, 
        showPivotPoints: boolean = true
    ): Promise<void> {
        // If no images provided, check cache or load
        if (!loadedImages) {
            const cache = this.imageLoader.getImageCache();
            
            // If cache is empty, load images from network
            if (cache.size === 0) {
                console.log('📦 Cache empty - loading images from network...');
                loadedImages = await this.imageLoader.loadAllRigImages(rigData, true);
            } else {
                // Use existing cache
                loadedImages = {};
                cache.forEach((img, key) => {
                    loadedImages![key] = img;
                });
                console.log('📦 Using cached images for rendering');
            }
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to get 2D context from canvas');
        }
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Compute the rig data
        const rigRenderData = this.computeCharacterRigData(rigData, {
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            cameraOffset,
            loadedImages
        });
        
        // Render all objects
        rigRenderData.objects.forEach(obj => {
            // Skip rendering if no image data
            if (!obj.imageData) {
                return;
            }
            
            ctx.save();
            
            // Move to object position
            ctx.translate(obj.x, obj.y);
            
            // Apply rotation
            ctx.rotate(obj.rotation);
            
            // Apply scale
            ctx.scale(obj.scaleX, obj.scaleY);
            
            // Draw image from anchor point (center by default)
            const drawX = -obj.width * obj.anchorX;
            const drawY = -obj.height * obj.anchorY;
            ctx.drawImage(obj.imageData, drawX, drawY, obj.width, obj.height);
            
            ctx.restore();
        });
        
        // Draw pivot points if enabled
        if (showPivotPoints) {
            rigRenderData.pivotPoints.forEach(pivot => {
                ctx.save();
                ctx.fillStyle = 'rgba(0, 150, 255, 0.9)';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(pivot.x, pivot.y, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            });
        }
    }
}

// Export a default renderer instance for convenience
export const defaultRenderer = new CharacterRigRenderer();

// For backwards compatibility - export standalone function
export async function renderCharacterRig(
    canvas: HTMLCanvasElement, 
    rigData: RigData, 
    loadedImages?: Record<string, HTMLImageElement | HTMLCanvasElement>,
    cameraOffset: Position = { x: 0, y: 0 }, 
    showPivotPoints: boolean = true
): Promise<void> {
    return defaultRenderer.render(canvas, rigData, loadedImages, cameraOffset, showPivotPoints);
}

// Export standalone function for computing rig data
export function computeCharacterRigData(rigData: RigData, options: RenderOptions = {}): RigRenderData {
    return defaultRenderer.computeCharacterRigData(rigData, options);
}
