/**
 * Skia Canvas Command-Line Test
 * Renders a character rig using Skia Canvas and saves to a file
 *
 * Uses the simplified SkiaRenderer adapter for easy rendering
 *
 * Usage:
 *   npm run build
 *   node dist/test-skia.js [input.json] [output.png] [width] [height]
 */

import { SkiaRenderer } from './modules/adapters/skiaRenderer.js';
import { readFile } from 'fs/promises';
import type { RigData } from './types.js';

async function main() {
    // Parse command line args
    const args = process.argv.slice(2);
    const inputFile = args[0] || 'assets/tank.json';
    const outputFile = args[1] || 'output-tank.png';
    const width = parseInt(args[2]) || 1000;
    const height = parseInt(args[3]) || 1000;

    console.log(`📦 Loading ${inputFile}...`);
    const rigData: RigData = JSON.parse(await readFile(inputFile, 'utf-8'));

    console.log(`🎨 Rendering ${width}x${height}...`);

    // Render using simplified API
    const renderer = new SkiaRenderer();
    await renderer.renderToFile(outputFile, rigData, {
        canvasWidth: width,
        canvasHeight: height,
        showPivots: true
    });

    console.log(`✅ Saved to ${outputFile}`);
}

main().catch(console.error);
