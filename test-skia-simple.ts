/**
 * Simplified Skia Renderer Example
 *
 * Before: ~75 lines of custom code
 * After: 4 lines!
 *
 * Usage:
 *   npm run build
 *   node dist/test-skia-simple.js [input.json] [output.png] [width] [height]
 */

import { SkiaRenderer } from './modules/adapters/skiaRenderer.js';
import { readFile } from 'fs/promises';
import type { RigData } from './types.js';

async function main() {
    // Parse command line args
    const args = process.argv.slice(2);
    const inputFile = args[0] || 'tank.json';
    const outputFile = args[1] || 'output-tank-simple.png';
    const width = parseInt(args[2]) || 1000;
    const height = parseInt(args[3]) || 1000;

    console.log(`📦 Loading ${inputFile}...`);
    const rigData: RigData = JSON.parse(await readFile(inputFile, 'utf-8'));

    console.log(`🎨 Rendering ${width}x${height}...`);

    // 🎉 SIMPLIFIED API - One line!
    const renderer = new SkiaRenderer();
    await renderer.renderToFile(outputFile, rigData, {
        canvasWidth: width,
        canvasHeight: height,
        showPivots: true
    });

    console.log(`✅ Saved to ${outputFile}`);
}

main().catch(console.error);
