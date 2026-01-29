// Canvas-based character rig renderer
// Directly ported from RiggerClasses.js Body.draw() method for vanilla JavaScript

// Character rig renderer - renders full hierarchical body structure with exact React implementation
function renderCharacterRig(canvas, rigData, loadedImages, cameraOffset = { x: 0, y: 0 }, showPivotPoints = true) {
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Get rendering parameters from rigData
    const centerX = canvas.width / 2 + cameraOffset.x;
    const centerY = canvas.height / 2 + 100 + cameraOffset.y;
    const rotations = rigData.rotationValues || {};
    const selfRotations = rigData.selfRotationValues || {};
    const dimensions = rigData.dimensionValues || {};
    const pivotPoints = rigData.pivotPoints || {};
    const jointOffset = rigData.jointOffset || {};
    const zIndexValues = rigData.zIndexValues || {};
    const eyes = rigData.eyes || {};
    const visibility = {}; // Default: all visible
    const flipX = false; // No flip by default
    const flipHead = false; // No head flip by default
    const imageScale = 1.0; // Default image scale
    
    // Helper: draw limb without children (equivalent to drawLimbWithoutChildren in React)
    const drawLimbWithoutChildren = (limbName, limbWidth, limbHeight, selfRot, imageKey) => {
        ctx.save();
        // Apply self-rotation around the center of the limb
        ctx.translate(0, -limbHeight / 2);
        ctx.rotate(selfRot);
        ctx.translate(0, limbHeight / 2);
        
        const img = loadedImages[imageKey];
        if (img) {
            // Draw image centered at (0, -limbHeight/2)
            ctx.drawImage(img, -limbWidth * imageScale / 2, -limbHeight * imageScale / 2 - limbHeight / 2, limbWidth * imageScale, limbHeight * imageScale);
        }
        ctx.restore();
    };
    
    // Create array of all limbs/components with their draw functions (matching React's allLimbs array)
    const allLimbs = [];
    
    // Torso
    allLimbs.push({
        name: 'torso',
        zIndex: zIndexValues['torso'] || 1,
        draw: () => {
            if (visibility.torso === false) return;
            ctx.save();
            ctx.rotate(selfRotations["torso"] || 0);
            
            const torsoWidth = dimensions.torso?.width || 60;
            const torsoHeight = dimensions.torso?.height || 120;
            
            const img = loadedImages['imagePaths.torso'];
            if (img) {
                ctx.drawImage(img, -torsoWidth/2, -torsoHeight, torsoWidth * imageScale, torsoHeight * imageScale);
            } else {
                ctx.fillStyle = '#8B7355';
                ctx.strokeStyle = '#000';
                ctx.fillRect(-torsoWidth/2, -torsoHeight, torsoWidth * imageScale, torsoHeight * imageScale);
                ctx.strokeRect(-torsoWidth/2, -torsoHeight, torsoWidth * imageScale, torsoHeight * imageScale);
            }
            ctx.restore();
        }
    });
    
    // Head
    allLimbs.push({
        name: 'head',
        zIndex: zIndexValues['head'] || 1,
        draw: () => {
            if (visibility.head === false) return;
            const connectionKey = `torso_head`;
            const pivotPoint = pivotPoints[connectionKey] || { x: 0, y: 0 };
            const headJointOffset = jointOffset[connectionKey] || { x: 0, y: 0 };
            const headWidth = dimensions.head?.width || 80;
            const headHeight = dimensions.head?.height || 80;
            
            ctx.save();
            ctx.translate(pivotPoint.x || 0, pivotPoint.y || 0);
            
            // Apply head flip if needed
            if (flipHead) {
                ctx.scale(-1, 1);
            }
            
            ctx.translate(0, 0); // head.offsetX and offsetY default to 0
            ctx.rotate(rotations["head"] || 0);
            ctx.translate(headJointOffset.x || 0, headJointOffset.y || 0);
            
            drawLimbWithoutChildren('head', headWidth, headHeight, selfRotations["head"] || 0, 'imagePaths.head');
            
            ctx.restore();
        }
    });
    
    // Mouth
    allLimbs.push({
        name: 'mouth',
        zIndex: zIndexValues['mouth'] || 1,
        draw: () => {
            if (visibility.mouth === false) return;
            const headPivot = pivotPoints['torso_head'] || { x: 0, y: 0 };
            const mouthOffset = pivotPoints['head_mouth'] || { x: 0, y: 0 };
            const mouthWidth = dimensions.mouth?.width || 40;
            const mouthHeight = dimensions.mouth?.height || 30;
            
            ctx.save();
            ctx.translate(headPivot.x || 0, headPivot.y || 0);
            if (flipHead) {
                ctx.scale(-1, 1);
            }
            ctx.translate(0, 0);
            ctx.rotate(rotations["head"] || 0);
            
            const offsetX = Number.isFinite(mouthOffset.x) ? mouthOffset.x : 0;
            const offsetY = Number.isFinite(mouthOffset.y) ? mouthOffset.y : 0;
            ctx.translate(offsetX, offsetY);
            
            drawLimbWithoutChildren('mouth', mouthWidth, mouthHeight, selfRotations["mouth"] || 0, 'imagePaths.mouth');
            
            ctx.restore();
        }
    });
    
    // Left Eye
    allLimbs.push({
        name: 'leftEye',
        zIndex: zIndexValues['leftEye'] || 6,
        draw: () => {
            if (visibility.leftEye === false) return;
            const headPivot = pivotPoints['torso_head'] || { x: 0, y: 0 };
            
            const img = loadedImages['eyes.leftEyeImage'];
            if (img && eyes) {
                ctx.save();
                ctx.translate(headPivot.x || 0, headPivot.y || 0);
                if (flipHead) {
                    ctx.scale(-1, 1);
                }
                ctx.translate(0, 0);
                ctx.rotate(rotations["head"] || 0);
                
                const offsetX = Number.isFinite(eyes.leftEyeXCoor) ? eyes.leftEyeXCoor : -10;
                const offsetY = Number.isFinite(eyes.leftEyeYCoor) ? eyes.leftEyeYCoor : -5;
                ctx.translate(offsetX, offsetY);
                
                const baseLeftEyeWidth = eyes.leftEyeImageWidth || 20;
                const baseLeftEyeHeight = eyes.leftEyeImageHeight || 15;
                const leftEyeWidth = baseLeftEyeWidth * (eyes.leftEyeWidthRatio || 1.0);
                const leftEyeHeight = baseLeftEyeHeight * (eyes.leftEyeHeightRatio || 1.0);
                ctx.drawImage(img, -leftEyeWidth/2, -leftEyeHeight/2, leftEyeWidth, leftEyeHeight);
                ctx.restore();
            }
        }
    });
    
    // Right Eye
    allLimbs.push({
        name: 'rightEye',
        zIndex: zIndexValues['rightEye'] || 3,
        draw: () => {
            if (visibility.rightEye === false) return;
            const headPivot = pivotPoints['torso_head'] || { x: 0, y: 0 };
            
            const img = loadedImages['eyes.rightEyeImage'];
            if (img && eyes) {
                ctx.save();
                ctx.translate(headPivot.x || 0, headPivot.y || 0);
                if (flipHead) {
                    ctx.scale(-1, 1);
                }
                ctx.translate(0, 0);
                ctx.rotate(rotations["head"] || 0);
                
                const offsetX = Number.isFinite(eyes.rightEyeXCoor) ? eyes.rightEyeXCoor : 10;
                const offsetY = Number.isFinite(eyes.rightEyeYCoor) ? eyes.rightEyeYCoor : -5;
                ctx.translate(offsetX, offsetY);
                
                const baseRightEyeWidth = eyes.rightEyeImageWidth || 20;
                const baseRightEyeHeight = eyes.rightEyeImageHeight || 15;
                const rightEyeWidth = baseRightEyeWidth * (eyes.rightEyeWidthRatio || 1.0);
                const rightEyeHeight = baseRightEyeHeight * (eyes.rightEyeHeightRatio || 1.0);
                ctx.drawImage(img, -rightEyeWidth/2, -rightEyeHeight/2, rightEyeWidth, rightEyeHeight);
                ctx.restore();
            }
        }
    });
    
    // Left Iris
    allLimbs.push({
        name: 'leftIris',
        zIndex: zIndexValues['leftIris'] || 7,
        draw: () => {
            if (visibility.leftIris === false) return;
            const headPivot = pivotPoints['torso_head'] || { x: 0, y: 0 };
            
            const img = loadedImages['eyes.leftIris'];
            if (img && eyes) {
                ctx.save();
                ctx.translate(headPivot.x || 0, headPivot.y || 0);
                if (flipHead) {
                    ctx.scale(-1, 1);
                }
                ctx.translate(0, 0);
                ctx.rotate(rotations["head"] || 0);
                
                const offsetX = Number.isFinite(eyes.leftIrisXCoor) ? eyes.leftIrisXCoor : -10;
                const offsetY = Number.isFinite(eyes.leftIrisYCoor) ? eyes.leftIrisYCoor : -5;
                ctx.translate(offsetX, offsetY);
                
                const baseLeftIrisWidth = eyes.leftIrisWidth || 10;
                const baseLeftIrisHeight = eyes.leftIrisHeight || 10;
                const leftIrisWidth = baseLeftIrisWidth * (eyes.leftIrisWidthRatio || 1.0);
                const leftIrisHeight = baseLeftIrisHeight * (eyes.leftIrisHeightRatio || 1.0);
                ctx.drawImage(img, -leftIrisWidth/2, -leftIrisHeight/2, leftIrisWidth, leftIrisHeight);
                ctx.restore();
            }
        }
    });
    
    // Right Iris
    allLimbs.push({
        name: 'rightIris',
        zIndex: zIndexValues['rightIris'] || 4,
        draw: () => {
            if (visibility.rightIris === false) return;
            const headPivot = pivotPoints['torso_head'] || { x: 0, y: 0 };
            
            const img = loadedImages['eyes.rightIris'];
            if (img && eyes) {
                ctx.save();
                ctx.translate(headPivot.x || 0, headPivot.y || 0);
                if (flipHead) {
                    ctx.scale(-1, 1);
                }
                ctx.translate(0, 0);
                ctx.rotate(rotations["head"] || 0);
                
                const offsetX = Number.isFinite(eyes.rightIrisXCoor) ? eyes.rightIrisXCoor : 10;
                const offsetY = Number.isFinite(eyes.rightIrisYCoor) ? eyes.rightIrisYCoor : -5;
                ctx.translate(offsetX, offsetY);
                
                const baseRightIrisWidth = eyes.rightIrisWidth || 10;
                const baseRightIrisHeight = eyes.rightIrisHeight || 10;
                const rightIrisWidth = baseRightIrisWidth * (eyes.rightIrisWidthRatio || 1.0);
                const rightIrisHeight = baseRightIrisHeight * (eyes.rightIrisHeightRatio || 1.0);
                ctx.drawImage(img, -rightIrisWidth/2, -rightIrisHeight/2, rightIrisWidth, rightIrisHeight);
                ctx.restore();
            }
        }
    });
    
    // Left Eye Lid
    allLimbs.push({
        name: 'leftEyeLid',
        zIndex: zIndexValues['leftEyeLid'] || 8,
        draw: () => {
            if (visibility.leftEyeLid === false) return;
            const headPivot = pivotPoints['torso_head'] || { x: 0, y: 0 };
            
            // Check for different eye lid states (simplified - would need currentEyeState parameter)
            const eyeLidImage = loadedImages['eyes.leftEyeLidOpen'] || 
                               loadedImages['eyes.leftEyeLidHalfClosed'] || 
                               loadedImages['eyes.leftEyeLidClosed'];
            
            if (eyeLidImage && eyes) {
                ctx.save();
                ctx.translate(headPivot.x || 0, headPivot.y || 0);
                if (flipHead) {
                    ctx.scale(-1, 1);
                }
                ctx.translate(0, 0);
                ctx.rotate(rotations["head"] || 0);
                
                const offsetX = Number.isFinite(eyes.leftEyeLidXCoor) ? eyes.leftEyeLidXCoor : -10;
                const offsetY = Number.isFinite(eyes.leftEyeLidYCoor) ? eyes.leftEyeLidYCoor : -5;
                ctx.translate(offsetX, offsetY);
                
                const baseLeftEyeLidWidth = eyes.leftEyeLidOpenWidth || eyes.leftEyeLidHalfClosedWidth || eyes.leftEyeLidClosedWidth || 20;
                const baseLeftEyeLidHeight = eyes.leftEyeLidOpenHeight || eyes.leftEyeLidHalfClosedHeight || eyes.leftEyeLidClosedHeight || 15;
                const leftEyeLidWidth = baseLeftEyeLidWidth * (eyes.leftEyeLidWidthRatio || 1.0);
                const leftEyeLidHeight = baseLeftEyeLidHeight * (eyes.leftEyeLidHeightRatio || 1.0);
                ctx.drawImage(eyeLidImage, -leftEyeLidWidth/2, -leftEyeLidHeight/2, leftEyeLidWidth, leftEyeLidHeight);
                ctx.restore();
            }
        }
    });
    
    // Right Eye Lid
    allLimbs.push({
        name: 'rightEyeLid',
        zIndex: zIndexValues['rightEyeLid'] || 5,
        draw: () => {
            if (visibility.rightEyeLid === false) return;
            const headPivot = pivotPoints['torso_head'] || { x: 0, y: 0 };
            
            // Check for different eye lid states (simplified - would need currentEyeState parameter)
            const eyeLidImage = loadedImages['eyes.rightEyeLidOpen'] || 
                               loadedImages['eyes.rightEyeLidHalfClosed'] || 
                               loadedImages['eyes.rightEyeLidClosed'];
            
            if (eyeLidImage && eyes) {
                ctx.save();
                ctx.translate(headPivot.x || 0, headPivot.y || 0);
                if (flipHead) {
                    ctx.scale(-1, 1);
                }
                ctx.translate(0, 0);
                ctx.rotate(rotations["head"] || 0);
                
                const offsetX = Number.isFinite(eyes.rightEyeLidXCoor) ? eyes.rightEyeLidXCoor : 10;
                const offsetY = Number.isFinite(eyes.rightEyeLidYCoor) ? eyes.rightEyeLidYCoor : -5;
                ctx.translate(offsetX, offsetY);
                
                const baseRightEyeLidWidth = eyes.rightEyeLidOpenWidth || 20;
                const baseRightEyeLidHeight = eyes.rightEyeLidOpenHeight || 15;
                const rightEyeLidWidth = baseRightEyeLidWidth * (eyes.rightEyeLidWidthRatio || 1.0);
                const rightEyeLidHeight = baseRightEyeLidHeight * (eyes.rightEyeLidHeightRatio || 1.0);
                ctx.drawImage(eyeLidImage, -rightEyeLidWidth/2, -rightEyeLidHeight/2, rightEyeLidWidth, rightEyeLidHeight);
                ctx.restore();
            }
        }
    });
    
    // Left Arm chain (leftUpperArm, leftForearm, leftHand)
    allLimbs.push({
        name: 'leftUpperArm',
        zIndex: zIndexValues['leftUpperArm'] || 1,
        draw: () => {
            if (visibility.leftUpperArm === false) return;
            const connectionKey = `torso_leftUpperArm`;
            const pivotPoint = pivotPoints[connectionKey] || { x: 0, y: 0 };
            const jointOff = jointOffset[connectionKey] || { x: 0, y: 0 };
            const width = dimensions.leftUpperArm?.width || 30;
            const height = dimensions.leftUpperArm?.height || 50;
            
            ctx.save();
            ctx.translate(pivotPoint.x || 0, pivotPoint.y || 0);
            ctx.rotate(rotations['leftUpperArm'] || 0);
            ctx.translate(jointOff.x || 0, jointOff.y || 0);
            drawLimbWithoutChildren('leftUpperArm', width, height, selfRotations['leftUpperArm'] || 0, 'imagePaths.leftUpperArm');
            ctx.restore();
        }
    });
    
    allLimbs.push({
        name: 'leftForearm',
        zIndex: zIndexValues['leftForearm'] || 1,
        draw: () => {
            if (visibility.leftForearm === false) return;
            const upperConnectionKey = `torso_leftUpperArm`;
            const upperPivot = pivotPoints[upperConnectionKey] || { x: 0, y: 0 };
            const upperHeight = dimensions.leftUpperArm?.height || 50;
            
            const connectionKey = `leftUpperArm_leftForearm`;
            const pivotPoint = pivotPoints[connectionKey] || { x: 0, y: 0 };
            const jointOff = jointOffset[connectionKey] || { x: 0, y: 0 };
            const width = dimensions.leftForearm?.width || 25;
            const height = dimensions.leftForearm?.height || 45;
            
            ctx.save();
            ctx.translate(upperPivot.x || 0, upperPivot.y || 0);
            ctx.rotate(rotations["leftUpperArm"] || 0);
            ctx.translate(0, -upperHeight);
            ctx.translate(pivotPoint.x || 0, pivotPoint.y || 0);
            ctx.rotate(rotations["leftForearm"] || 0);
            ctx.translate(jointOff.x || 0, jointOff.y || 0);
            drawLimbWithoutChildren('leftForearm', width, height, selfRotations["leftForearm"] || 0, 'imagePaths.leftForearm');
            ctx.restore();
        }
    });
    
    allLimbs.push({
        name: 'leftHand',
        zIndex: zIndexValues['leftHand'] || 1,
        draw: () => {
            if (visibility.leftHand === false) return;
            const upperConnectionKey = `torso_leftUpperArm`;
            const upperPivot = pivotPoints[upperConnectionKey] || { x: 0, y: 0 };
            const upperHeight = dimensions.leftUpperArm?.height || 50;
            
            const foreConnectionKey = `leftUpperArm_leftForearm`;
            const forePivot = pivotPoints[foreConnectionKey] || { x: 0, y: 0 };
            const foreHeight = dimensions.leftForearm?.height || 45;
            
            const handConnectionKey = `leftForearm_leftHand`;
            const handPivot = pivotPoints[handConnectionKey] || { x: 0, y: 0 };
            const handJointOff = jointOffset[handConnectionKey] || { x: 0, y: 0 };
            const width = dimensions.leftHand?.width || 20;
            const height = dimensions.leftHand?.height || 30;
            
            ctx.save();
            ctx.translate(upperPivot.x || 0, upperPivot.y || 0);
            ctx.rotate(rotations["leftUpperArm"] || 0);
            ctx.translate(0, -upperHeight);
            ctx.translate(forePivot.x || 0, forePivot.y || 0);
            ctx.rotate(rotations["leftForearm"] || 0);
            ctx.translate(0, -foreHeight);
            ctx.translate(handPivot.x || 0, handPivot.y || 0);
            ctx.rotate(rotations["leftHand"] || 0);
            ctx.translate(handJointOff.x || 0, handJointOff.y || 0);
            drawLimbWithoutChildren('leftHand', width, height, selfRotations["leftHand"] || 0, 'imagePaths.leftHand');
            ctx.restore();
        }
    });
    
    // Right Arm chain (rightUpperArm, rightForearm, rightHand)
    allLimbs.push({
        name: 'rightUpperArm',
        zIndex: zIndexValues['rightUpperArm'] || 1,
        draw: () => {
            if (visibility.rightUpperArm === false) return;
            const connectionKey = `torso_rightUpperArm`;
            const pivotPoint = pivotPoints[connectionKey] || { x: 0, y: 0 };
            const jointOff = jointOffset[connectionKey] || { x: 0, y: 0 };
            const width = dimensions.rightUpperArm?.width || 30;
            const height = dimensions.rightUpperArm?.height || 50;
            
            ctx.save();
            ctx.translate(pivotPoint.x || 0, pivotPoint.y || 0);
            ctx.rotate(rotations['rightUpperArm'] || 0);
            ctx.translate(jointOff.x || 0, jointOff.y || 0);
            drawLimbWithoutChildren('rightUpperArm', width, height, selfRotations['rightUpperArm'] || 0, 'imagePaths.rightUpperArm');
            ctx.restore();
        }
    });
    
    allLimbs.push({
        name: 'rightForearm',
        zIndex: zIndexValues['rightForearm'] || 1,
        draw: () => {
            if (visibility.rightForearm === false) return;
            const upperConnectionKey = `torso_rightUpperArm`;
            const upperPivot = pivotPoints[upperConnectionKey] || { x: 0, y: 0 };
            const upperHeight = dimensions.rightUpperArm?.height || 50;
            
            const connectionKey = `rightUpperArm_rightForearm`;
            const pivotPoint = pivotPoints[connectionKey] || { x: 0, y: 0 };
            const jointOff = jointOffset[connectionKey] || { x: 0, y: 0 };
            const width = dimensions.rightForearm?.width || 25;
            const height = dimensions.rightForearm?.height || 45;
            
            ctx.save();
            ctx.translate(upperPivot.x || 0, upperPivot.y || 0);
            ctx.rotate(rotations["rightUpperArm"] || 0);
            ctx.translate(0, -upperHeight);
            ctx.translate(pivotPoint.x || 0, pivotPoint.y || 0);
            ctx.rotate(rotations["rightForearm"] || 0);
            ctx.translate(jointOff.x || 0, jointOff.y || 0);
            drawLimbWithoutChildren('rightForearm', width, height, selfRotations["rightForearm"] || 0, 'imagePaths.rightForearm');
            ctx.restore();
        }
    });
    
    allLimbs.push({
        name: 'rightHand',
        zIndex: zIndexValues['rightHand'] || 1,
        draw: () => {
            if (visibility.rightHand === false) return;
            const upperConnectionKey = `torso_rightUpperArm`;
            const upperPivot = pivotPoints[upperConnectionKey] || { x: 0, y: 0 };
            const upperHeight = dimensions.rightUpperArm?.height || 50;
            
            const foreConnectionKey = `rightUpperArm_rightForearm`;
            const forePivot = pivotPoints[foreConnectionKey] || { x: 0, y: 0 };
            const foreHeight = dimensions.rightForearm?.height || 45;
            
            const handConnectionKey = `rightForearm_rightHand`;
            const handPivot = pivotPoints[handConnectionKey] || { x: 0, y: 0 };
            const handJointOff = jointOffset[handConnectionKey] || { x: 0, y: 0 };
            const width = dimensions.rightHand?.width || 20;
            const height = dimensions.rightHand?.height || 30;
            
            ctx.save();
            ctx.translate(upperPivot.x || 0, upperPivot.y || 0);
            ctx.rotate(rotations["rightUpperArm"] || 0);
            ctx.translate(0, -upperHeight);
            ctx.translate(forePivot.x || 0, forePivot.y || 0);
            ctx.rotate(rotations["rightForearm"] || 0);
            ctx.translate(0, -foreHeight);
            ctx.translate(handPivot.x || 0, handPivot.y || 0);
            ctx.rotate(rotations["rightHand"] || 0);
            ctx.translate(handJointOff.x || 0, handJointOff.y || 0);
            drawLimbWithoutChildren('rightHand', width, height, selfRotations["rightHand"] || 0, 'imagePaths.rightHand');
            ctx.restore();
        }
    });
    
    // Left Leg chain (leftThigh, leftLeg)
    allLimbs.push({
        name: 'leftThigh',
        zIndex: zIndexValues['leftThigh'] || 1,
        draw: () => {
            if (visibility.leftThigh === false) return;
            const connectionKey = `torso_leftThigh`;
            const pivotPoint = pivotPoints[connectionKey] || { x: 0, y: 0 };
            const jointOff = jointOffset[connectionKey] || { x: 0, y: 0 };
            const width = dimensions.leftThigh?.width || 35;
            const height = dimensions.leftThigh?.height || 60;
            
            ctx.save();
            ctx.translate(pivotPoint.x || 0, pivotPoint.y || 0);
            ctx.rotate(rotations['leftThigh'] || 0);
            ctx.translate(jointOff.x || 0, jointOff.y || 0);
            drawLimbWithoutChildren('leftThigh', width, height, selfRotations['leftThigh'] || 0, 'imagePaths.leftThigh');
            ctx.restore();
        }
    });
    
    allLimbs.push({
        name: 'leftLeg',
        zIndex: zIndexValues['leftLeg'] || 1,
        draw: () => {
            if (visibility.leftLeg === false) return;
            const upperConnectionKey = `torso_leftThigh`;
            const upperPivot = pivotPoints[upperConnectionKey] || { x: 0, y: 0 };
            const upperHeight = dimensions.leftThigh?.height || 60;
            
            const connectionKey = `leftThigh_leftLeg`;
            const pivotPoint = pivotPoints[connectionKey] || { x: 0, y: 0 };
            const jointOff = jointOffset[connectionKey] || { x: 0, y: 0 };
            const width = dimensions.leftLeg?.width || 30;
            const height = dimensions.leftLeg?.height || 55;
            
            ctx.save();
            ctx.translate(upperPivot.x || 0, upperPivot.y || 0);
            ctx.rotate(rotations["leftThigh"] || 0);
            ctx.translate(0, -upperHeight);
            ctx.translate(pivotPoint.x || 0, pivotPoint.y || 0);
            ctx.rotate(rotations["leftLeg"] || 0);
            ctx.translate(jointOff.x || 0, jointOff.y || 0);
            drawLimbWithoutChildren('leftLeg', width, height, selfRotations["leftLeg"] || 0, 'imagePaths.leftLeg');
            ctx.restore();
        }
    });
    
    // Right Leg chain (rightThigh, rightLeg)
    allLimbs.push({
        name: 'rightThigh',
        zIndex: zIndexValues['rightThigh'] || 1,
        draw: () => {
            if (visibility.rightThigh === false) return;
            const connectionKey = `torso_rightThigh`;
            const pivotPoint = pivotPoints[connectionKey] || { x: 0, y: 0 };
            const jointOff = jointOffset[connectionKey] || { x: 0, y: 0 };
            const width = dimensions.rightThigh?.width || 35;
            const height = dimensions.rightThigh?.height || 60;
            
            ctx.save();
            ctx.translate(pivotPoint.x || 0, pivotPoint.y || 0);
            ctx.rotate(rotations['rightThigh'] || 0);
            ctx.translate(jointOff.x || 0, jointOff.y || 0);
            drawLimbWithoutChildren('rightThigh', width, height, selfRotations['rightThigh'] || 0, 'imagePaths.rightThigh');
            ctx.restore();
        }
    });
    
    allLimbs.push({
        name: 'rightLeg',
        zIndex: zIndexValues['rightLeg'] || 1,
        draw: () => {
            if (visibility.rightLeg === false) return;
            const upperConnectionKey = `torso_rightThigh`;
            const upperPivot = pivotPoints[upperConnectionKey] || { x: 0, y: 0 };
            const upperHeight = dimensions.rightThigh?.height || 60;
            
            const connectionKey = `rightThigh_rightLeg`;
            const pivotPoint = pivotPoints[connectionKey] || { x: 0, y: 0 };
            const jointOff = jointOffset[connectionKey] || { x: 0, y: 0 };
            const width = dimensions.rightLeg?.width || 30;
            const height = dimensions.rightLeg?.height || 55;
            
            ctx.save();
            ctx.translate(upperPivot.x || 0, upperPivot.y || 0);
            ctx.rotate(rotations["rightThigh"] || 0);
            ctx.translate(0, -upperHeight);
            ctx.translate(pivotPoint.x || 0, pivotPoint.y || 0);
            ctx.rotate(rotations["rightLeg"] || 0);
            ctx.translate(jointOff.x || 0, jointOff.y || 0);
            drawLimbWithoutChildren('rightLeg', width, height, selfRotations["rightLeg"] || 0, 'imagePaths.rightLeg');
            ctx.restore();
        }
    });
    
    // Sort all limbs by zIndex (matching React's sorting logic)
    allLimbs.sort((a, b) => a.zIndex - b.zIndex);
    
    // Begin drawing - set up character position and flip
    ctx.save();
    ctx.translate(centerX, centerY);
    
    // Apply X-axis flip for entire character if needed
    if (flipX) {
        ctx.scale(-1, 1);
    }
    
    // Draw all components in z-index order
    allLimbs.forEach(limb => {
        limb.draw();
    });
    
    // Draw pivot points if enabled
    if (showPivotPoints) {
        const drawMarker = (x, y, color = 'rgba(0, 150, 255, 0.9)') => {
            ctx.save();
            ctx.fillStyle = color;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        };

        // Head/torso pivot
        const torsoHead = pivotPoints['torso_head'] || { x: 0, y: 0 };
        drawMarker(torsoHead.x || 0, torsoHead.y || 0);

        // Mouth pivot (relative to head pivot and head rotation/offset, honoring flipHead)
        const headAngle = rotations['head'] || 0;
        const headAngleEff = flipHead ? -headAngle : headAngle;
        const headOffX = dimensions.head?.offsetX || 0;
        const headOffY = dimensions.head?.offsetY || 0;
        const headOffEffX = flipHead ? -headOffX : headOffX;
        const cosH = Math.cos(headAngleEff);
        const sinH = Math.sin(headAngleEff);
        const mouthOffset = pivotPoints['head_mouth'] || { x: 0, y: 0 };
        const mouthOffX = flipHead ? -(mouthOffset.x || 0) : (mouthOffset.x || 0);
        const mouthOffY = mouthOffset.y || 0;
        const mouthX = (torsoHead.x || 0) + headOffEffX + (mouthOffX * cosH - mouthOffY * sinH);
        const mouthY = (torsoHead.y || 0) + headOffY + (mouthOffX * sinH + mouthOffY * cosH);
        drawMarker(mouthX, mouthY);

        // Left arm chain pivots (shoulder, elbow, wrist)
        const lShoulder = pivotPoints['torso_leftUpperArm'] || { x: 0, y: 0 };
        drawMarker(lShoulder.x, lShoulder.y);
        const rL1 = rotations['leftUpperArm'] || 0;
        const cosL1 = Math.cos(rL1), sinL1 = Math.sin(rL1);
        const leftUpperArmHeight = dimensions.leftUpperArm?.height || 50;
        const lElbowOff = pivotPoints['leftUpperArm_leftForearm'] || { x: 0, y: 0 };
        const lElbow = {
            x: lShoulder.x + (0 * cosL1 - (-leftUpperArmHeight) * sinL1) + ((lElbowOff.x || 0) * cosL1 - (lElbowOff.y || 0) * sinL1),
            y: lShoulder.y + (0 * sinL1 + (-leftUpperArmHeight) * cosL1) + ((lElbowOff.x || 0) * sinL1 + (lElbowOff.y || 0) * cosL1)
        };
        drawMarker(lElbow.x, lElbow.y);
        const rL2 = rL1 + (rotations['leftForearm'] || 0);
        const cosL2 = Math.cos(rL2), sinL2 = Math.sin(rL2);
        const leftForearmHeight = dimensions.leftForearm?.height || 45;
        const lWristOff = pivotPoints['leftForearm_leftHand'] || { x: 0, y: 0 };
        const lWrist = {
            x: lElbow.x + (0 * cosL2 - (-leftForearmHeight) * sinL2) + ((lWristOff.x || 0) * cosL2 - (lWristOff.y || 0) * sinL2),
            y: lElbow.y + (0 * sinL2 + (-leftForearmHeight) * cosL2) + ((lWristOff.x || 0) * sinL2 + (lWristOff.y || 0) * cosL2)
        };
        drawMarker(lWrist.x, lWrist.y);

        // Right arm chain pivots (shoulder, elbow, wrist)
        const rShoulder = pivotPoints['torso_rightUpperArm'] || { x: 0, y: 0 };
        drawMarker(rShoulder.x, rShoulder.y);
        const rR1 = rotations['rightUpperArm'] || 0;
        const cosR1 = Math.cos(rR1), sinR1 = Math.sin(rR1);
        const rightUpperArmHeight = dimensions.rightUpperArm?.height || 50;
        const rElbowOff = pivotPoints['rightUpperArm_rightForearm'] || { x: 0, y: 0 };
        const rElbow = {
            x: rShoulder.x + (0 * cosR1 - (-rightUpperArmHeight) * sinR1) + ((rElbowOff.x || 0) * cosR1 - (rElbowOff.y || 0) * sinR1),
            y: rShoulder.y + (0 * sinR1 + (-rightUpperArmHeight) * cosR1) + ((rElbowOff.x || 0) * sinR1 + (rElbowOff.y || 0) * cosR1)
        };
        drawMarker(rElbow.x, rElbow.y);
        const rR2 = rR1 + (rotations['rightForearm'] || 0);
        const cosR2 = Math.cos(rR2), sinR2 = Math.sin(rR2);
        const rightForearmHeight = dimensions.rightForearm?.height || 45;
        const rWristOff = pivotPoints['rightForearm_rightHand'] || { x: 0, y: 0 };
        const rWrist = {
            x: rElbow.x + (0 * cosR2 - (-rightForearmHeight) * sinR2) + ((rWristOff.x || 0) * cosR2 - (rWristOff.y || 0) * sinR2),
            y: rElbow.y + (0 * sinR2 + (-rightForearmHeight) * cosR2) + ((rWristOff.x || 0) * sinR2 + (rWristOff.y || 0) * cosR2)
        };
        drawMarker(rWrist.x, rWrist.y);

        // Left leg chain pivots (hip, knee)
        const lHip = pivotPoints['torso_leftThigh'] || { x: 0, y: 0 };
        drawMarker(lHip.x, lHip.y);
        const rLT1 = rotations['leftThigh'] || 0;
        const cosLT1 = Math.cos(rLT1), sinLT1 = Math.sin(rLT1);
        const leftThighHeight = dimensions.leftThigh?.height || 60;
        const lKneeOff = pivotPoints['leftThigh_leftLeg'] || { x: 0, y: 0 };
        const lKnee = {
            x: lHip.x + (0 * cosLT1 - (-leftThighHeight) * sinLT1) + ((lKneeOff.x || 0) * cosLT1 - (lKneeOff.y || 0) * sinLT1),
            y: lHip.y + (0 * sinLT1 + (-leftThighHeight) * cosLT1) + ((lKneeOff.x || 0) * sinLT1 + (lKneeOff.y || 0) * cosLT1)
        };
        drawMarker(lKnee.x, lKnee.y);

        // Right leg chain pivots (hip, knee)
        const rHip = pivotPoints['torso_rightThigh'] || { x: 0, y: 0 };
        drawMarker(rHip.x, rHip.y);
        const rRT1 = rotations['rightThigh'] || 0;
        const cosRT1 = Math.cos(rRT1), sinRT1 = Math.sin(rRT1);
        const rightThighHeight = dimensions.rightThigh?.height || 60;
        const rKneeOff = pivotPoints['rightThigh_rightLeg'] || { x: 0, y: 0 };
        const rKnee = {
            x: rHip.x + (0 * cosRT1 - (-rightThighHeight) * sinRT1) + ((rKneeOff.x || 0) * cosRT1 - (rKneeOff.y || 0) * sinRT1),
            y: rHip.y + (0 * sinRT1 + (-rightThighHeight) * cosRT1) + ((rKneeOff.x || 0) * sinRT1 + (rKneeOff.y || 0) * cosRT1)
        };
        drawMarker(rKnee.x, rKnee.y);
    }
    
    ctx.restore();

}

// Expose functions globally for use in rigger.js
if (typeof window !== 'undefined') {
    window.RigRenderer = window.RigRenderer || {};
    window.RigRenderer.renderCharacterRig = renderCharacterRig;
}
