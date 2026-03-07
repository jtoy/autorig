/**
 * Test: computeAutoFit on base CharacterRigRenderer
 *
 * Verifies the autoFit logic works at the base class level (no Skia dependency).
 * This is what the HTML/browser path will use via renderCharacterRig().
 */

import { CharacterRigRenderer } from '../modules/renderRig.js';
import { readFile } from 'fs/promises';
import type { RigData, AutoFitResult } from '../types.js';
import { assert, checkAllBounds, printSummary } from './helpers.js';

async function main() {
    const inputFile = process.argv[2] || 'assets/tank.json';
    console.log(`Loading ${inputFile}...`);
    const rigData: RigData = JSON.parse(await readFile(inputFile, 'utf-8'));

    const renderer = new CharacterRigRenderer();

    // -------------------------------------------------------
    // Test 1: computeAutoFit exists on base class
    // -------------------------------------------------------
    console.log('\n--- Test 1: computeAutoFit exists on base CharacterRigRenderer ---');
    assert(typeof renderer.computeAutoFit === 'function',
        'computeAutoFit is a method on CharacterRigRenderer');

    // -------------------------------------------------------
    // Test 2: computeAutoFit returns valid result
    // -------------------------------------------------------
    console.log('\n--- Test 2: computeAutoFit returns valid dimensions ---');
    const fit: AutoFitResult = renderer.computeAutoFit(rigData);

    assert(fit.canvasWidth > 0, `canvasWidth > 0 (got ${fit.canvasWidth})`);
    assert(fit.canvasHeight > 0, `canvasHeight > 0 (got ${fit.canvasHeight})`);
    assert(fit.renderData.objects.length > 0, `renderData has objects (${fit.renderData.objects.length})`);
    assert(typeof fit.cameraOffset.x === 'number', 'cameraOffset.x is a number');
    assert(typeof fit.cameraOffset.y === 'number', 'cameraOffset.y is a number');

    // -------------------------------------------------------
    // Test 3: All parts fit within autoFit canvas bounds
    // -------------------------------------------------------
    console.log('\n--- Test 3: All parts fit within autoFit canvas ---');
    const bounds = checkAllBounds(fit.renderData.objects, fit.canvasWidth, fit.canvasHeight);
    const clipped = bounds.filter(b => b.clipped);
    assert(clipped.length === 0,
        `No parts clipped (clipped: ${clipped.map(c => c.name).join(', ') || 'none'})`);

    // -------------------------------------------------------
    // Test 4: autoFit has padding (default 40)
    // -------------------------------------------------------
    console.log('\n--- Test 4: autoFit has padding ---');
    const PADDING = 20;
    const tooClose = bounds.filter(b =>
        b.left < PADDING || b.top < PADDING ||
        b.right > fit.canvasWidth - PADDING || b.bottom > fit.canvasHeight - PADDING
    );
    assert(tooClose.length === 0,
        `All parts have >= ${PADDING}px margin (edge-touching: ${tooClose.map(c => c.name).join(', ') || 'none'})`);

    // -------------------------------------------------------
    // Test 5: autoFit with no-autofit produces different dimensions
    // -------------------------------------------------------
    console.log('\n--- Test 5: Default compute vs autoFit differ ---');
    const defaultData = renderer.computeCharacterRigData(rigData, {
        canvasWidth: 800, canvasHeight: 800,
    });
    const defaultBounds = checkAllBounds(defaultData.objects, 800, 800);
    const defaultClipped = defaultBounds.filter(b => b.clipped);
    // Default at 800x800 should clip at least some parts (demonstrating autoFit value)
    assert(defaultClipped.length > 0 || fit.canvasWidth !== 800 || fit.canvasHeight !== 800,
        'autoFit produces different canvas size or fixes clipping');

    printSummary();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
