/**
 * Test: Auto-fit via SkiaRenderer (integration)
 *
 * Tests that SkiaRenderer inherits computeAutoFit from base and
 * that renderToFile with autoFit produces a valid output file.
 * Requires image loading (network or local).
 */

import { SkiaRenderer } from '../modules/adapters/skiaRenderer.js';
import { readFile } from 'fs/promises';
import type { RigData } from '../types.js';
import { assert, checkAllBounds, printSummary } from './helpers.js';

async function main() {
    const inputFile = process.argv[2] || 'assets/tank.json';
    console.log(`Loading ${inputFile}...`);
    const rigData: RigData = JSON.parse(await readFile(inputFile, 'utf-8'));

    const renderer = new SkiaRenderer();
    await renderer.loadImages(rigData);

    // -------------------------------------------------------
    // Test 1: computeAutoFit works through SkiaRenderer (inherited)
    // -------------------------------------------------------
    console.log('\n--- Test 1: SkiaRenderer.computeAutoFit (inherited from base) ---');
    const defaultW = 1000, defaultH = 1000;
    const fit = renderer.computeAutoFit(rigData, {
        canvasWidth: defaultW,
        canvasHeight: defaultH,
        loadedImages: renderer.getLoadedImages(),
    });

    assert(fit.canvasWidth > 0, `canvasWidth > 0 (got ${fit.canvasWidth})`);
    assert(fit.canvasHeight > 0, `canvasHeight > 0 (got ${fit.canvasHeight})`);

    // -------------------------------------------------------
    // Test 2: All parts fit within autoFit canvas bounds
    // -------------------------------------------------------
    console.log('\n--- Test 2: All parts fit with autoFit ---');
    const bounds = checkAllBounds(fit.renderData.objects, fit.canvasWidth, fit.canvasHeight);
    const clipped = bounds.filter(b => b.clipped);
    assert(clipped.length === 0,
        `No parts clipped (clipped: ${clipped.map(c => c.name).join(', ') || 'none'})`);

    // -------------------------------------------------------
    // Test 3: autoFit preserves all objects
    // -------------------------------------------------------
    console.log('\n--- Test 3: autoFit preserves all objects ---');
    const defaultData = renderer.compute(rigData, {
        canvasWidth: defaultW, canvasHeight: defaultH,
    });
    assert(fit.renderData.objects.length === defaultData.objects.length,
        `Same object count: default=${defaultData.objects.length} autoFit=${fit.renderData.objects.length}`);

    // -------------------------------------------------------
    // Test 4: renderToFile with autoFit produces a file
    // -------------------------------------------------------
    console.log('\n--- Test 4: renderToFile with autoFit ---');
    const outPath = '/tmp/test-autofit-output.png';
    await renderer.renderToFile(outPath, rigData, {
        canvasWidth: defaultW,
        canvasHeight: defaultH,
        autoFit: true,
    });
    const fs = await import('fs');
    const exists = fs.existsSync(outPath);
    assert(exists, 'autoFit renderToFile creates output file');
    if (exists) {
        const stat = fs.statSync(outPath);
        assert(stat.size > 1000, `Output file has reasonable size (${stat.size} bytes)`);
    }

    printSummary();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
