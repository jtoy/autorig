/**
 * Visual Verification Test
 * Uses Skia Canvas to render a character and verify eyes and mouth are present
 * through color comparison in expected regions
 */

import { SkiaRenderer } from '../modules/adapters/skiaRenderer.js';
import { readFile } from 'fs/promises';
import type { RigData } from '../types.js';

interface ColorSample {
    r: number;
    g: number;
    b: number;
    a: number;
}

interface TestRegion {
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
 * Sample multiple points in a region and check if content exists
 */
function hasContentInRegion(
    imageData: ImageData, 
    region: TestRegion, 
    bgColor: ColorSample,
    samplePoints: number = 9
): boolean {
    let pixelsWithContent = 0;
    
    // Sample points in a grid within the region
    const cols = Math.ceil(Math.sqrt(samplePoints));
    const rows = Math.ceil(samplePoints / cols);
    
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = region.x + (region.width * col / (cols - 1 || 1));
            const y = region.y + (region.height * row / (rows - 1 || 1));
            
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
    
    // At least 30% of sampled pixels should have content
    const contentPercentage = pixelsWithContent / samplePoints;
    return contentPercentage >= 0.3;
}

/**
 * Calculate test regions based on rig data
 */
function calculateTestRegions(rigData: RigData, canvasWidth: number, canvasHeight: number): TestRegion[] {
    const regions: TestRegion[] = [];
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2 + 100;
    
    // Left Eye Region
    if (rigData.eyes?.leftEyeXCoor !== undefined && rigData.eyes?.leftEyeYCoor !== undefined) {
        const leftEyeWidth = (rigData.eyes.leftEyeImageWidth || 100) * (rigData.eyes.leftEyeWidthRatio || 1);
        const leftEyeHeight = (rigData.eyes.leftEyeImageHeight || 100) * (rigData.eyes.leftEyeHeightRatio || 1);
        
        regions.push({
            name: 'Left Eye',
            x: centerX + rigData.eyes.leftEyeXCoor - leftEyeWidth / 2,
            y: centerY + rigData.eyes.leftEyeYCoor - leftEyeHeight / 2,
            width: leftEyeWidth,
            height: leftEyeHeight
        });
    }
    
    // Right Eye Region
    if (rigData.eyes?.rightEyeXCoor !== undefined && rigData.eyes?.rightEyeYCoor !== undefined) {
        const rightEyeWidth = (rigData.eyes.rightEyeImageWidth || 100) * (rigData.eyes.rightEyeWidthRatio || 1);
        const rightEyeHeight = (rigData.eyes.rightEyeImageHeight || 100) * (rigData.eyes.rightEyeHeightRatio || 1);
        
        regions.push({
            name: 'Right Eye',
            x: centerX + rigData.eyes.rightEyeXCoor - rightEyeWidth / 2,
            y: centerY + rigData.eyes.rightEyeYCoor - rightEyeHeight / 2,
            width: rightEyeWidth,
            height: rightEyeHeight
        });
    }
    
    // Mouth Region
    if (rigData.mouth?.xCoor !== undefined && rigData.mouth?.yCoor !== undefined) {
        const mouthWidth = (rigData.mouth.width || 60) * (rigData.mouth.size || 1);
        const mouthHeight = (rigData.mouth.height || 40) * (rigData.mouth.size || 1);
        
        regions.push({
            name: 'Mouth',
            x: centerX + rigData.mouth.xCoor - mouthWidth / 2,
            y: centerY + rigData.mouth.yCoor - mouthHeight / 2,
            width: mouthWidth,
            height: mouthHeight
        });
    }
    
    return regions;
}

/**
 * Main test function
 */
async function runVisualTest(inputFile: string): Promise<boolean> {
    console.log('\n🧪 Visual Verification Test');
    console.log('=' .repeat(50));
    console.log(`📦 Loading ${inputFile}...`);
    
    const rigData: RigData = JSON.parse(await readFile(inputFile, 'utf-8'));
    const width = 1000;
    const height = 1000;
    
    console.log(`🎨 Rendering ${width}x${height} canvas...`);
    
    // Render character
    const renderer = new SkiaRenderer();
    await renderer.loadImages(rigData);
    const canvas = await renderer.createCanvas(width, height);
    
    // Fill background with light gray
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, height);
    
    renderer.renderToCanvas(canvas, rigData, {
        canvasWidth: width,
        canvasHeight: height
    }, false);
    
    // Get image data for analysis
    const imageData = ctx.getImageData(0, 0, width, height);
    
    // Get background color (sample from top-left corner)
    const bgColor = getPixelColor(imageData, 10, 10);
    console.log(`📐 Background color: rgba(${bgColor.r}, ${bgColor.g}, ${bgColor.b}, ${bgColor.a})`);
    
    // Calculate test regions
    const regions = calculateTestRegions(rigData, width, height);
    console.log(`\n🎯 Testing ${regions.length} regions...`);
    
    let allPassed = true;
    const results: { region: string; passed: boolean }[] = [];
    
    // Test each region
    for (const region of regions) {
        console.log(`\n  Testing ${region.name}:`);
        console.log(`    Region: (${Math.round(region.x)}, ${Math.round(region.y)}) ${Math.round(region.width)}x${Math.round(region.height)}`);
        
        const hasContent = hasContentInRegion(imageData, region, bgColor);
        
        if (hasContent) {
            console.log(`    ✅ PASS - ${region.name} detected`);
        } else {
            console.log(`    ❌ FAIL - ${region.name} NOT detected`);
            allPassed = false;
        }
        
        results.push({ region: region.name, passed: hasContent });
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Test Summary:');
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    console.log(`   ${passed}/${total} regions passed`);
    
    if (allPassed) {
        console.log('\n✅ All visual tests PASSED\n');
    } else {
        console.log('\n❌ Some visual tests FAILED\n');
        console.log('Failed regions:');
        results.filter(r => !r.passed).forEach(r => {
            console.log(`  - ${r.region}`);
        });
        console.log();
    }
    
    return allPassed;
}

// Run test
async function main() {
    const inputFile = process.argv[2] || 'tank.json';
    
    try {
        const success = await runVisualTest(inputFile);
        process.exit(success ? 0 : 1);
    } catch (error) {
        console.error('❌ Test failed with error:', error);
        process.exit(1);
    }
}

main();
