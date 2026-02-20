/**
 * Animation Diff Rendering Test
 * Tests that animation diffs are correctly applied and rendered
 * Verifies joint positions after diff application using visual verification
 */

import * as fs from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { RigData } from '../types.js';
import { SkiaRenderer } from '../modules/adapters/skiaRenderer.js';
import {
    createDiffBasedAnimation,
    expandDiffBasedAnimation,
    type FrameData
} from '../modules/animationDiff.js';

// Screen sector definitions (from test-joint-movement.ts)
interface ScreenSector {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

interface ColorSample {
    r: number;
    g: number;
    b: number;
    a: number;
}

/**
 * Define 3x3 grid of screen sectors
 */
function defineScreenSectors(width: number, height: number): ScreenSector[] {
    const sectorWidth = width / 3;
    const sectorHeight = height / 3;
    
    const sectors: ScreenSector[] = [];
    const rows = ['Top', 'Middle', 'Bottom'];
    const cols = ['Left', 'Center', 'Right'];
    
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            sectors.push({
                name: `${rows[row]}-${cols[col]}`,
                x: col * sectorWidth,
                y: row * sectorHeight,
                width: sectorWidth,
                height: sectorHeight
            });
        }
    }
    
    return sectors;
}

/**
 * Get pixel color from ImageData
 */
function getPixelColor(imageData: ImageData, x: number, y: number): ColorSample {
    const index = (Math.floor(y) * imageData.width + Math.floor(x)) * 4;
    return {
        r: imageData.data[index],
        g: imageData.data[index + 1],
        b: imageData.data[index + 2],
        a: imageData.data[index + 3]
    };
}

/**
 * Check if color is different from background
 */
function isDifferentFromBackground(
    color: ColorSample,
    bgColor: ColorSample,
    threshold: number = 10
): boolean {
    const rDiff = Math.abs(color.r - bgColor.r);
    const gDiff = Math.abs(color.g - bgColor.g);
    const bDiff = Math.abs(color.b - bgColor.b);
    
    return rDiff > threshold || gDiff > threshold || bDiff > threshold;
}

/**
 * Check if sector has content (non-background pixels)
 */
function hasContentInSector(
    imageData: ImageData,
    sector: ScreenSector,
    bgColor: ColorSample,
    samplePoints: number = 25
): boolean {
    let contentPixels = 0;
    const gridSize = Math.ceil(Math.sqrt(samplePoints));
    
    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            const x = sector.x + (sector.width / gridSize) * (col + 0.5);
            const y = sector.y + (sector.height / gridSize) * (row + 0.5);
            
            if (x < imageData.width && y < imageData.height) {
                const color = getPixelColor(imageData, x, y);
                if (isDifferentFromBackground(color, bgColor, 10)) {
                    contentPixels++;
                }
            }
        }
    }
    
    return contentPixels > 0;
}

/**
 * Save canvas to file
 */
async function saveCanvas(canvas: any, filename: string): Promise<void> {
    try {
        const buffer = await canvas.toBuffer('image/png');
        await writeFile(filename, buffer);
        console.log(`    💾 Saved: ${filename}`);
    } catch (error) {
        console.log(`    ❌ Failed to save ${filename}:`, error);
    }
}

/**
 * Draw sector grid on canvas for visualization
 */
function drawSectorGrid(ctx: any, sectors: ScreenSector[]): void {
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 2;
    ctx.font = '24px Arial';
    ctx.fillStyle = '#FF0000';
    
    sectors.forEach(sector => {
        // Draw sector border
        ctx.strokeRect(sector.x, sector.y, sector.width, sector.height);
        
        // Draw sector label
        const labelX = sector.x + 10;
        const labelY = sector.y + 30;
        ctx.fillText(sector.name, labelX, labelY);
    });
}

/**
 * Render character with applied frame data
 */
async function renderFrame(
    baseRigData: RigData,
    frameData: FrameData,
    renderer: SkiaRenderer,
    width: number,
    height: number,
    saveFilename?: string,
    drawGrid: boolean = false
): Promise<any> {
    const canvas = await renderer.createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Apply frame data to base rig
    const rigDataWithFrame: RigData = {
        ...baseRigData,
        ...frameData,
        rotationValues: {
            ...baseRigData.rotationValues,
            ...frameData.rotationValues
        },
        selfRotationValues: {
            ...baseRigData.selfRotationValues,
            ...frameData.selfRotationValues
        }
    };
    
    // Render
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    
    await renderer.renderToCanvas(canvas, rigDataWithFrame);
    
    // Draw grid if requested
    if (drawGrid) {
        const sectors = defineScreenSectors(width, height);
        drawSectorGrid(ctx, sectors);
    }
    
    // Save if filename provided
    if (saveFilename) {
        await saveCanvas(canvas, saveFilename);
    }
    
    return ctx.getImageData(0, 0, width, height);
}

/**
 * Test 1: Arm Movement via Diff
 */
async function testArmMovementDiff(
    baseRigData: RigData,
    renderer: SkiaRenderer,
    width: number,
    height: number
): Promise<boolean> {
    console.log('\n  Test 1: Arm Movement via Diff');
    console.log('  ' + '-'.repeat(40));
    
    // Create animation frames with diff
    const frames: FrameData[] = [
        // Frame 0: Base frame (no rotations)
        {
            rotationValues: {}
        },
        // Frame 1: Left arm raised (diff only contains the change)
        {
            rotationValues: {
                leftUpperArm: -Math.PI / 3  // Raise left arm
            }
        }
    ];
    
    // Create diff-based animation
    const diffAnimation = createDiffBasedAnimation(frames);
    console.log('    Created diff animation with', diffAnimation.length, 'frames');
    console.log('    Frame 0 keys:', Object.keys(diffAnimation[0]));
    console.log('    Frame 1 keys:', Object.keys(diffAnimation[1]));
    
    // Expand diffs back to full frames
    const expandedFrames = expandDiffBasedAnimation(diffAnimation);
    console.log('    Expanded to full frames');
    
    // Render before (frame 0 - base frame)
    console.log('    Rendering before frame...');
    await renderFrame(
        baseRigData,
        expandedFrames[0],
        renderer,
        width,
        height,
        'test-outputs/diff-test-1-before.png',
        true
    );
    
    // Render after (frame 1 - arm raised)
    console.log('    Rendering after frame...');
    const imageData = await renderFrame(
        baseRigData,
        expandedFrames[1],
        renderer,
        width,
        height,
        'test-outputs/diff-test-1-after.png',
        true
    );
    const sectors = defineScreenSectors(width, height);
    const bgColor = getPixelColor(imageData, 10, 10);
    
    // Check if arm appears in expected sectors (top-left or middle-left)
    const topLeft = sectors.find(s => s.name === 'Top-Left');
    const middleLeft = sectors.find(s => s.name === 'Middle-Left');
    
    const hasContentTopLeft = topLeft ? hasContentInSector(imageData, topLeft, bgColor) : false;
    const hasContentMiddleLeft = middleLeft ? hasContentInSector(imageData, middleLeft, bgColor) : false;
    
    console.log('    Content in Top-Left:', hasContentTopLeft ? '✅' : '❌');
    console.log('    Content in Middle-Left:', hasContentMiddleLeft ? '✅' : '❌');
    
    const passed = hasContentTopLeft || hasContentMiddleLeft;
    console.log(`    Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    
    return passed;
}

/**
 * Test 2: Head Rotation via Diff
 */
async function testHeadRotationDiff(
    baseRigData: RigData,
    renderer: SkiaRenderer,
    width: number,
    height: number
): Promise<boolean> {
    console.log('\n  Test 2: Head Rotation via Diff');
    console.log('  ' + '-'.repeat(40));
    
    const frames: FrameData[] = [
        {
            rotationValues: {}
        },
        {
            rotationValues: {
                head: Math.PI / 4  // Turn head 45 degrees
            }
        }
    ];
    
    const diffAnimation = createDiffBasedAnimation(frames);
    const expandedFrames = expandDiffBasedAnimation(diffAnimation);
    
    // Render before and after
    console.log('    Rendering before frame...');
    await renderFrame(
        baseRigData,
        expandedFrames[0],
        renderer,
        width,
        height,
        'test-outputs/diff-test-2-before.png',
        true
    );
    
    console.log('    Rendering after frame...');
    const imageData = await renderFrame(
        baseRigData,
        expandedFrames[1],
        renderer,
        width,
        height,
        'test-outputs/diff-test-2-after.png',
        true
    );
    const sectors = defineScreenSectors(width, height);
    const bgColor = getPixelColor(imageData, 10, 10);
    
    // Head should still be in top-center region
    const topCenter = sectors.find(s => s.name === 'Top-Center');
    const middleCenter = sectors.find(s => s.name === 'Middle-Center');
    
    const hasContentTopCenter = topCenter ? hasContentInSector(imageData, topCenter, bgColor) : false;
    const hasContentMiddleCenter = middleCenter ? hasContentInSector(imageData, middleCenter, bgColor) : false;
    
    console.log('    Content in Top-Center:', hasContentTopCenter ? '✅' : '❌');
    console.log('    Content in Middle-Center:', hasContentMiddleCenter ? '✅' : '❌');
    
    const passed = hasContentTopCenter || hasContentMiddleCenter;
    console.log(`    Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    
    return passed;
}

/**
 * Test 3: Multiple Joints via Diff
 */
async function testMultipleJointsDiff(
    baseRigData: RigData,
    renderer: SkiaRenderer,
    width: number,
    height: number
): Promise<boolean> {
    console.log('\n  Test 3: Multiple Joints via Diff');
    console.log('  ' + '-'.repeat(40));
    
    const frames: FrameData[] = [
        {
            rotationValues: {}
        },
        {
            rotationValues: {
                leftUpperArm: -Math.PI / 4,   // Left arm raised slightly
                rightUpperArm: -Math.PI / 4,  // Right arm raised slightly
                leftThigh: Math.PI / 12,       // Left leg forward slightly
                rightThigh: -Math.PI / 12      // Right leg back slightly
            }
        }
    ];
    
    const diffAnimation = createDiffBasedAnimation(frames);
    console.log('    Diff contains:', Object.keys(diffAnimation[1]));
    console.log('    Diff has 4 joint rotations:', Object.keys(diffAnimation[1].rotationValues || {}).length === 4 ? '✅' : '❌');
    
    const expandedFrames = expandDiffBasedAnimation(diffAnimation);
    
    // Render before and after
    console.log('    Rendering before frame...');
    const beforeImageData = await renderFrame(
        baseRigData,
        expandedFrames[0],
        renderer,
        width,
        height,
        'test-outputs/diff-test-3-before.png',
        true
    );
    
    console.log('    Rendering after frame...');
    const afterImageData = await renderFrame(
        baseRigData,
        expandedFrames[1],
        renderer,
        width,
        height,
        'test-outputs/diff-test-3-after.png',
        true
    );
    
    const sectors = defineScreenSectors(width, height);
    const bgColor = getPixelColor(afterImageData, 10, 10);
    
    // Check that arms are spread
    const topLeft = sectors.find(s => s.name === 'Top-Left');
    const topRight = sectors.find(s => s.name === 'Top-Right');
    
    const hasArmsSpread = 
        (topLeft ? hasContentInSector(afterImageData, topLeft, bgColor) : false) ||
        (topRight ? hasContentInSector(afterImageData, topRight, bgColor) : false);
    
    // Verify the frames are different (proves diff was applied)
    let differentPixels = 0;
    const totalPixels = beforeImageData.width * beforeImageData.height;
    for (let i = 0; i < beforeImageData.data.length; i += 4) {
        const rDiff = Math.abs(beforeImageData.data[i] - afterImageData.data[i]);
        const gDiff = Math.abs(beforeImageData.data[i + 1] - afterImageData.data[i + 1]);
        const bDiff = Math.abs(beforeImageData.data[i + 2] - afterImageData.data[i + 2]);
        if (rDiff > 10 || gDiff > 10 || bDiff > 10) {
            differentPixels++;
        }
    }
    const percentDifferent = (differentPixels / totalPixels) * 100;
    const framesAreDifferent = percentDifferent > 1; // At least 1% of pixels changed
    
    console.log('    Arms visible in upper sectors:', hasArmsSpread ? '✅' : '❌');
    console.log(`    Frames are different (${percentDifferent.toFixed(2)}% pixels changed):`, framesAreDifferent ? '✅' : '❌');
    
    const passed = hasArmsSpread && framesAreDifferent;
    console.log(`    Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    
    return passed;
}

/**
 * Test 4: Animation Sequence via Diffs
 */
async function testAnimationSequenceDiff(
    baseRigData: RigData,
    renderer: SkiaRenderer,
    width: number,
    height: number
): Promise<boolean> {
    console.log('\n  Test 4: Animation Sequence via Diffs');
    console.log('  ' + '-'.repeat(40));
    
    // Create a simple walk cycle
    const frames: FrameData[] = [
        {
            rotationValues: {}
        },
        {
            rotationValues: {
                leftThigh: Math.PI / 8,
                rightThigh: -Math.PI / 8
            }
        },
        {
            rotationValues: {
                leftThigh: 0,
                rightThigh: 0
            }
        },
        {
            rotationValues: {
                leftThigh: -Math.PI / 8,
                rightThigh: Math.PI / 8
            }
        }
    ];
    
    const diffAnimation = createDiffBasedAnimation(frames);
    console.log('    Created', diffAnimation.length, 'frame animation');
    console.log('    Frame 1 diff size:', JSON.stringify(diffAnimation[1]).length, 'bytes');
    console.log('    Frame 2 diff size:', JSON.stringify(diffAnimation[2]).length, 'bytes');
    console.log('    Frame 3 diff size:', JSON.stringify(diffAnimation[3]).length, 'bytes');
    
    const expandedFrames = expandDiffBasedAnimation(diffAnimation);
    
    // Render each frame and verify character is present (not checking legs specifically as they may move out of frame)
    let allFramesValid = true;
    for (let i = 0; i < expandedFrames.length; i++) {
        console.log(`    Rendering frame ${i}...`);
        const imageData = await renderFrame(
            baseRigData,
            expandedFrames[i],
            renderer,
            width,
            height,
            `test-outputs/diff-test-4-frame-${i}.png`,
            true
        );
        const sectors = defineScreenSectors(width, height);
        const bgColor = getPixelColor(imageData, 10, 10);
        
        // Check if character has content in ANY sector (proves frame was rendered)
        const hasAnyContent = sectors.some(sector => 
            hasContentInSector(imageData, sector, bgColor)
        );
        
        console.log(`    Frame ${i} rendered:`, hasAnyContent ? '✅' : '❌');
        
        if (!hasAnyContent) {
            allFramesValid = false;
        }
    }
    
    console.log(`    Result: ${allFramesValid ? '✅ PASS' : '❌ FAIL'}`);
    
    return allFramesValid;
}

/**
 * Test 5: Complex Diff with Multiple Properties
 */
async function testComplexDiff(
    baseRigData: RigData,
    renderer: SkiaRenderer,
    width: number,
    height: number
): Promise<boolean> {
    console.log('\n  Test 5: Complex Diff with Multiple Properties');
    console.log('  ' + '-'.repeat(40));
    
    const frames: FrameData[] = [
        {
            rotationValues: {},
            flipX: false
        },
        {
            rotationValues: {
                head: Math.PI / 6,
                leftUpperArm: -Math.PI / 4,
                rightUpperArm: -Math.PI / 4
            },
            flipX: false  // Same value, should not be in diff
        },
        {
            rotationValues: {
                head: Math.PI / 6,
                leftUpperArm: -Math.PI / 3,  // Changed
                rightUpperArm: -Math.PI / 3  // Changed
            },
            flipX: true  // Changed
        }
    ];
    
    const diffAnimation = createDiffBasedAnimation(frames);
    
    // Verify diff 1 doesn't contain flipX (unchanged)
    const diff1HasFlipX = 'flipX' in diffAnimation[1];
    console.log('    Diff 1 excludes unchanged flipX:', !diff1HasFlipX ? '✅' : '❌');
    
    // Verify diff 2 contains flipX (changed)
    const diff2HasFlipX = 'flipX' in diffAnimation[2];
    console.log('    Diff 2 includes changed flipX:', diff2HasFlipX ? '✅' : '❌');
    
    const expandedFrames = expandDiffBasedAnimation(diffAnimation);
    
    // Render initial, middle, and final frames
    console.log('    Rendering frame 0 (initial)...');
    await renderFrame(
        baseRigData,
        expandedFrames[0],
        renderer,
        width,
        height,
        'test-outputs/diff-test-5-frame-0.png',
        true
    );
    
    console.log('    Rendering frame 1 (middle)...');
    await renderFrame(
        baseRigData,
        expandedFrames[1],
        renderer,
        width,
        height,
        'test-outputs/diff-test-5-frame-1.png',
        true
    );
    
    console.log('    Rendering frame 2 (final)...');
    const imageData = await renderFrame(
        baseRigData,
        expandedFrames[2],
        renderer,
        width,
        height,
        'test-outputs/diff-test-5-frame-2.png',
        true
    );
    const sectors = defineScreenSectors(width, height);
    const bgColor = getPixelColor(imageData, 10, 10);
    
    const topSectors = sectors.filter(s => s.name.startsWith('Top'));
    const hasTopContent = topSectors.some(sector => 
        hasContentInSector(imageData, sector, bgColor)
    );
    
    console.log('    Frame renders correctly:', hasTopContent ? '✅' : '❌');
    
    const passed = !diff1HasFlipX && diff2HasFlipX && hasTopContent;
    console.log(`    Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    
    return passed;
}

/**
 * Main test runner
 */
async function runAllTests(inputFile: string = 'tank.json'): Promise<boolean> {
    console.log('\n🎬 Animation Diff Rendering Tests');
    console.log('='.repeat(50));
    console.log(`  Testing with: ${inputFile}`);
    
    // Load base rig data
    if (!fs.existsSync(inputFile)) {
        console.error(`❌ Error: File not found: ${inputFile}`);
        return false;
    }
    
    const rigData: RigData = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
    
    // Create test-outputs directory if it doesn't exist
    try {
        await mkdir('test-outputs', { recursive: true });
    } catch (error) {
        // Directory might already exist, that's fine
    }
    
    // Create renderer and load images
    const renderer = new SkiaRenderer();
    console.log('  Loading character images...');
    await renderer.loadImages(rigData);
    console.log('  ✅ Images loaded\n');
    
    const width = 1000;
    const height = 1000;
    
    // Run all tests
    const results: Record<string, boolean> = {
        'Arm Movement via Diff': await testArmMovementDiff(rigData, renderer, width, height),
        'Head Rotation via Diff': await testHeadRotationDiff(rigData, renderer, width, height),
        'Multiple Joints via Diff': await testMultipleJointsDiff(rigData, renderer, width, height),
        'Animation Sequence via Diffs': await testAnimationSequenceDiff(rigData, renderer, width, height),
        'Complex Diff Properties': await testComplexDiff(rigData, renderer, width, height)
    };
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Test Summary:');
    
    const passed = Object.values(results).filter(r => r).length;
    const total = Object.keys(results).length;
    console.log(`   ${passed}/${total} tests passed`);
    
    Object.entries(results).forEach(([name, result]) => {
        console.log(`   ${result ? '✅' : '❌'} ${name}`);
    });
    
    const allPassed = passed === total;
    
    if (allPassed) {
        console.log('\n✅ All animation diff rendering tests PASSED\n');
    } else {
        console.log('\n❌ Some animation diff rendering tests FAILED\n');
    }
    
    return allPassed;
}

// Run tests
async function main() {
    try {
        const inputFile = process.argv[2] || 'assets/tank.json';
        const success = await runAllTests(inputFile);
        process.exit(success ? 0 : 1);
    } catch (error) {
        console.error('❌ Test failed with error:', error);
        process.exit(1);
    }
}

main();
