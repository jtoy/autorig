/**
 * Joint Movement Test
 * Verifies that character joints can be moved and limbs render in expected positions
 * Uses color comparison in different screen sectors to detect limb placement
 */

import { SkiaRenderer } from '../modules/adapters/skiaRenderer.js';
import { readFile, writeFile } from 'fs/promises';
import type { RigData } from '../types.js';

interface ColorSample {
    r: number;
    g: number;
    b: number;
    a: number;
}

interface ScreenSector {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Sample pixel color at a specific location
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
 * Check if a color is significantly different from background
 */
function isDifferentFromBackground(color: ColorSample, bgColor: ColorSample, threshold: number = 10): boolean {
    const rDiff = Math.abs(color.r - bgColor.r);
    const gDiff = Math.abs(color.g - bgColor.g);
    const bDiff = Math.abs(color.b - bgColor.b);
    const aDiff = Math.abs(color.a - bgColor.a);
    
    return (rDiff > threshold || gDiff > threshold || bDiff > threshold || aDiff > threshold);
}

/**
 * Check if a sector has content (limbs/body parts)
 */
function hasContentInSector(
    imageData: ImageData,
    sector: ScreenSector,
    bgColor: ColorSample,
    samplePoints: number = 25
): { hasContent: boolean; contentPercentage: number } {
    let pixelsWithContent = 0;
    
    // Sample points in a grid within the sector
    const cols = Math.ceil(Math.sqrt(samplePoints));
    const rows = Math.ceil(samplePoints / cols);
    
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = sector.x + (sector.width * col / (cols - 1 || 1));
            const y = sector.y + (sector.height * row / (rows - 1 || 1));
            
            // Skip if out of bounds
            if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) {
                continue;
            }
            
            const color = getPixelColor(imageData, x, y);
            
            if (isDifferentFromBackground(color, bgColor)) {
                pixelsWithContent++;
            }
        }
    }
    
    const contentPercentage = pixelsWithContent / samplePoints;
    return {
        hasContent: contentPercentage >= 0.15, // At least 15% should have content
        contentPercentage
    };
}

/**
 * Define screen sectors for testing
 */
function defineScreenSectors(width: number, height: number): ScreenSector[] {
    const sectorWidth = width / 3;
    const sectorHeight = height / 3;
    
    return [
        // Top row
        { name: 'Top Left', x: 0, y: 0, width: sectorWidth, height: sectorHeight },
        { name: 'Top Center', x: sectorWidth, y: 0, width: sectorWidth, height: sectorHeight },
        { name: 'Top Right', x: sectorWidth * 2, y: 0, width: sectorWidth, height: sectorHeight },
        
        // Middle row
        { name: 'Middle Left', x: 0, y: sectorHeight, width: sectorWidth, height: sectorHeight },
        { name: 'Middle Center', x: sectorWidth, y: sectorHeight, width: sectorWidth, height: sectorHeight },
        { name: 'Middle Right', x: sectorWidth * 2, y: sectorHeight, width: sectorWidth, height: sectorHeight },
        
        // Bottom row
        { name: 'Bottom Left', x: 0, y: sectorHeight * 2, width: sectorWidth, height: sectorHeight },
        { name: 'Bottom Center', x: sectorWidth, y: sectorHeight * 2, width: sectorWidth, height: sectorHeight },
        { name: 'Bottom Right', x: sectorWidth * 2, y: sectorHeight * 2, width: sectorWidth, height: sectorHeight }
    ];
}

/**
 * Draw sector grid lines on canvas
 */
function drawSectorGrid(ctx: any, sectors: ScreenSector[]): void {
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    
    // Draw vertical lines
    const sectorWidth = sectors[0].width;
    for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(sectorWidth * i, 0);
        ctx.lineTo(sectorWidth * i, ctx.canvas.height);
        ctx.stroke();
    }
    
    // Draw horizontal lines
    const sectorHeight = sectors[0].height;
    for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(0, sectorHeight * i);
        ctx.lineTo(ctx.canvas.width, sectorHeight * i);
        ctx.stroke();
    }
    
    // Draw sector labels
    ctx.fillStyle = '#ff0000';
    ctx.font = 'bold 24px Arial';
    sectors.forEach(sector => {
        const labelX = sector.x + sector.width / 2 - 60;
        const labelY = sector.y + 30;
        ctx.fillText(sector.name, labelX, labelY);
    });
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
        console.error(`    ❌ Failed to save ${filename}:`, error);
    }
}

/**
 * Render character with specific joint rotations
 */
async function renderWithRotations(
    renderer: SkiaRenderer,
    rigData: RigData,
    rotations: Record<string, number>,
    width: number,
    height: number,
    saveFilename?: string
): Promise<{ imageData: ImageData; canvas: any }> {
    // Create modified rig data with new rotations
    const modifiedRigData: RigData = {
        ...rigData,
        rotationValues: {
            ...(rigData.rotationValues || {}),
            ...rotations
        }
    };
    
    const canvas = await renderer.createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Fill background
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, height);
    
    // Render character
    renderer.renderToCanvas(canvas, modifiedRigData, {
        canvasWidth: width,
        canvasHeight: height
    }, false);
    
    // Save if filename provided
    if (saveFilename) {
        // Save version with grid lines
        const sectors = defineScreenSectors(width, height);
        drawSectorGrid(ctx, sectors);
        await saveCanvas(canvas, saveFilename);
    }
    
    return {
        imageData: ctx.getImageData(0, 0, width, height),
        canvas
    };
}

/**
 * Test Case: Arm Raised Test
 */
async function testArmRaised(renderer: SkiaRenderer, rigData: RigData, width: number, height: number): Promise<boolean> {
    console.log('\n  Test 1: Left Arm Raised');
    console.log('  ' + '-'.repeat(40));
    
    // Save before image (default pose)
    await renderWithRotations(renderer, rigData, {}, width, height, 'test-outputs/test-output-1-before.png');
    
    // Rotate left arm upward (negative rotation)
    const result = await renderWithRotations(renderer, rigData, {
        leftUpperArm: -Math.PI / 2  // 90 degrees up
    }, width, height, 'test-outputs/test-output-1-after.png');
    
    const imageData = result.imageData;
    
    const bgColor = getPixelColor(imageData, 10, 10);
    const sectors = defineScreenSectors(width, height);
    
    // Check top-left and middle-left sectors (where raised left arm should be)
    const topLeft = sectors.find(s => s.name === 'Top Left')!;
    const middleLeft = sectors.find(s => s.name === 'Middle Left')!;
    
    const topLeftResult = hasContentInSector(imageData, topLeft, bgColor);
    const middleLeftResult = hasContentInSector(imageData, middleLeft, bgColor);
    
    console.log(`    Top Left sector: ${topLeftResult.contentPercentage.toFixed(2)}% content - ${topLeftResult.hasContent ? '✅' : '❌'}`);
    console.log(`    Middle Left sector: ${middleLeftResult.contentPercentage.toFixed(2)}% content - ${middleLeftResult.hasContent ? '✅' : '❌'}`);
    
    // At least one of these sectors should have the raised arm
    const passed = topLeftResult.hasContent || middleLeftResult.hasContent;
    console.log(`    Result: ${passed ? '✅ PASS' : '❌ FAIL'} - Arm detected in expected region`);
    
    return passed;
}

/**
 * Test Case: Leg Forward Test
 */
async function testLegForward(renderer: SkiaRenderer, rigData: RigData, width: number, height: number): Promise<boolean> {
    console.log('\n  Test 2: Right Leg Forward');
    console.log('  ' + '-'.repeat(40));
    
    // Save before image
    await renderWithRotations(renderer, rigData, {}, width, height, 'test-outputs/test-output-2-before.png');
    
    // Rotate right leg forward
    const result = await renderWithRotations(renderer, rigData, {
        rightThigh: Math.PI / 4,  // 45 degrees forward
        rightLeg: -Math.PI / 6     // Slight bend at knee
    }, width, height, 'test-outputs/test-output-2-after.png');
    
    const imageData = result.imageData;
    
    const bgColor = getPixelColor(imageData, 10, 10);
    const sectors = defineScreenSectors(width, height);
    
    // Check middle-right and bottom-right sectors (where forward leg should be)
    const middleRight = sectors.find(s => s.name === 'Middle Right')!;
    const bottomRight = sectors.find(s => s.name === 'Bottom Right')!;
    
    const middleRightResult = hasContentInSector(imageData, middleRight, bgColor);
    const bottomRightResult = hasContentInSector(imageData, bottomRight, bgColor);
    
    console.log(`    Middle Right sector: ${middleRightResult.contentPercentage.toFixed(2)}% content - ${middleRightResult.hasContent ? '✅' : '❌'}`);
    console.log(`    Bottom Right sector: ${bottomRightResult.contentPercentage.toFixed(2)}% content - ${bottomRightResult.hasContent ? '✅' : '❌'}`);
    
    // At least one of these sectors should have the forward leg
    const passed = middleRightResult.hasContent || bottomRightResult.hasContent;
    console.log(`    Result: ${passed ? '✅ PASS' : '❌ FAIL'} - Leg detected in expected region`);
    
    return passed;
}

/**
 * Test Case: Head Rotation Test
 */
async function testHeadRotation(renderer: SkiaRenderer, rigData: RigData, width: number, height: number): Promise<boolean> {
    console.log('\n  Test 3: Head Turned');
    console.log('  ' + '-'.repeat(40));
    
    // Save before image
    await renderWithRotations(renderer, rigData, {}, width, height, 'test-outputs/test-output-3-before.png');
    
    // Rotate head to the side
    const result = await renderWithRotations(renderer, rigData, {
        head: Math.PI / 6  // 30 degrees to the side
    }, width, height, 'test-outputs/test-output-3-after.png');
    
    const imageData = result.imageData;
    
    const bgColor = getPixelColor(imageData, 10, 10);
    const sectors = defineScreenSectors(width, height);
    
    // Check top-center and middle-center sectors (where head should be)
    const topCenter = sectors.find(s => s.name === 'Top Center')!;
    const middleCenter = sectors.find(s => s.name === 'Middle Center')!;
    
    const topCenterResult = hasContentInSector(imageData, topCenter, bgColor);
    const middleCenterResult = hasContentInSector(imageData, middleCenter, bgColor);
    
    console.log(`    Top Center sector: ${topCenterResult.contentPercentage.toFixed(2)}% content - ${topCenterResult.hasContent ? '✅' : '❌'}`);
    console.log(`    Middle Center sector: ${middleCenterResult.contentPercentage.toFixed(2)}% content - ${middleCenterResult.hasContent ? '✅' : '❌'}`);
    
    // Both sectors should have content (head and torso)
    const passed = topCenterResult.hasContent && middleCenterResult.hasContent;
    console.log(`    Result: ${passed ? '✅ PASS' : '❌ FAIL'} - Head detected in expected region`);
    
    return passed;
}

/**
 * Test Case: Multiple Joints Test
 */
async function testMultipleJoints(renderer: SkiaRenderer, rigData: RigData, width: number, height: number): Promise<boolean> {
    console.log('\n  Test 4: Multiple Joints Moving');
    console.log('  ' + '-'.repeat(40));
    
    // Save before image
    await renderWithRotations(renderer, rigData, {}, width, height, 'test-outputs/test-output-4-before.png');
    
    // Move multiple joints simultaneously (T-pose)
    const result = await renderWithRotations(renderer, rigData, {
        leftUpperArm: -Math.PI / 2,   // Left arm up
        rightUpperArm: -Math.PI / 2,  // Right arm up
        leftThigh: Math.PI / 6,        // Left leg forward
        rightThigh: -Math.PI / 6       // Right leg back
    }, width, height, 'test-outputs/test-output-4-after.png');
    
    const imageData = result.imageData;
    
    const bgColor = getPixelColor(imageData, 10, 10);
    const sectors = defineScreenSectors(width, height);
    
    // Count sectors with content
    let sectorsWithContent = 0;
    sectors.forEach(sector => {
        const result = hasContentInSector(imageData, sector, bgColor);
        if (result.hasContent) {
            sectorsWithContent++;
        }
    });
    
    console.log(`    Sectors with content: ${sectorsWithContent}/9`);
    
    // With arms and legs spread, we should have content in at least 5 sectors
    const passed = sectorsWithContent >= 5;
    console.log(`    Result: ${passed ? '✅ PASS' : '❌ FAIL'} - Multiple limbs detected`);
    
    return passed;
}

/**
 * Main test function
 */
async function runJointMovementTests(inputFile: string): Promise<boolean> {
    console.log('\n🦾 Joint Movement Test');
    console.log('=' .repeat(50));
    console.log(`📦 Loading ${inputFile}...`);
    
    const rigData: RigData = JSON.parse(await readFile(inputFile, 'utf-8'));
    const width = 1000;
    const height = 1000;
    
    console.log(`🎨 Setting up renderer...`);
    const renderer = new SkiaRenderer();
    await renderer.loadImages(rigData);
    
    console.log('\n🧪 Running joint movement tests...');
    
    // Run all tests
    const results = {
        'Arm Raised': await testArmRaised(renderer, rigData, width, height),
        'Leg Forward': await testLegForward(renderer, rigData, width, height),
        'Head Rotation': await testHeadRotation(renderer, rigData, width, height),
        'Multiple Joints': await testMultipleJoints(renderer, rigData, width, height)
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
        console.log('\n✅ All joint movement tests PASSED\n');
    } else {
        console.log('\n❌ Some joint movement tests FAILED\n');
    }
    
    return allPassed;
}

// Run test
async function main() {
    const inputFile = process.argv[2] || 'assets/tank.json';
    
    try {
        const success = await runJointMovementTests(inputFile);
        process.exit(success ? 0 : 1);
    } catch (error) {
        console.error('❌ Test failed with error:', error);
        process.exit(1);
    }
}

main();
