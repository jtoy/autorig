/**
 * Advanced Skia Renderer Example
 * Shows how to access and modify render data before rendering
 *
 * Usage:
 *   npm run build
 *   node dist/test-skia-advanced.js [input.json] [output.png]
 */

import { SkiaRenderer } from './modules/adapters/skiaRenderer.js';
import { readFile } from 'fs/promises';
import type { RigData } from './types.js';

async function main() {
    const args = process.argv.slice(2);
    const inputFile = args[0] || 'tank.json';
    const outputFile = args[1] || 'output-tank-advanced.png';

    console.log(`📦 Loading ${inputFile}...`);
    const rigData: RigData = JSON.parse(await readFile(inputFile, 'utf-8'));

    // 🎨 ADVANCED: Modify rig data before computing
    console.log(`🎨 Applying custom modifications...`);

    // Make character wave
    rigData.rotationValues = rigData.rotationValues || {};
    rigData.rotationValues.leftArm = 45;  // Arm up
    rigData.rotationValues.leftForearm = -30; // Forearm bent
    rigData.rotationValues.leftHand = 20; // Hand rotated

    // Tilt head
    rigData.rotationValues.head = 15;

    // Make character bigger
    if (rigData.dimensionValues) {
        Object.keys(rigData.dimensionValues).forEach(key => {
            rigData.dimensionValues![key].width *= 1.2;
            rigData.dimensionValues![key].height *= 1.2;
        });
    }

    // Create renderer and load images
    const renderer = new SkiaRenderer();
    await renderer.loadImages(rigData);

    // 🎨 ADVANCED: Compute render data and modify it
    const renderData = renderer.compute(rigData, {
        canvasWidth: 1200,
        canvasHeight: 1200
    });

    console.log(`📊 Render data has ${renderData.objects.length} objects`);

    // Modify individual parts
    renderData.objects.forEach(obj => {
        // Make head slightly bigger
        if (obj.name === 'head') {
            obj.scaleX *= 1.3;
            obj.scaleY *= 1.3;
            console.log(`  ✏️  Made head bigger: ${obj.scaleX.toFixed(2)}x`);
        }

        // Tint effect (would require custom rendering)
        if (obj.name.includes('arm')) {
            console.log(`  ✏️  Detected arm part: ${obj.name}`);
        }
    });

    // Create canvas and render with modifications
    console.log(`🖼️  Creating canvas...`);
    const canvas = await renderer.createCanvas(1200, 1200);
    const ctx = canvas.getContext('2d');

    // Clear canvas
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render with our modified render data
    renderer.renderObjects(ctx, renderData.objects, true, renderData.pivotPoints);

    // Save
    console.log(`💾 Saving to ${outputFile}...`);
    const fs = await import('fs/promises');
    const buffer = await canvas.toBuffer('image/png');
    await fs.writeFile(outputFile, buffer);

    console.log(`✅ Saved to ${outputFile}`);
    console.log(`📏 Canvas size: ${canvas.width}x${canvas.height}`);
}

main().catch(console.error);
