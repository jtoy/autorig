/**
 * Test: Auto-fit mode
 *
 * Verifies that when autoFit is enabled, the entire character fits within
 * the canvas bounds (no clipping of head or any other part).
 *
 * RED/GREEN TDD:
 *   - RED:   Without autoFit, some parts may be clipped (partially offscreen)
 *   - GREEN: With autoFit, ALL visible parts fit within canvas bounds
 */

import { SkiaRenderer } from '../modules/adapters/skiaRenderer.js';
import { readFile } from 'fs/promises';
import type { RigData, RenderObject } from '../types.js';

interface BoundsResult {
    name: string;
    left: number;
    top: number;
    right: number;
    bottom: number;
    clipped: boolean;
}

function checkAllBounds(objects: RenderObject[], width: number, height: number): BoundsResult[] {
    return objects.map(obj => {
        const left = obj.x - obj.width * obj.anchorX;
        const top = obj.y - obj.height * obj.anchorY;
        const right = left + obj.width;
        const bottom = top + obj.height;
        const clipped = left < 0 || top < 0 || right > width || bottom > height;
        return {
            name: obj.name,
            left: Math.round(left),
            top: Math.round(top),
            right: Math.round(right),
            bottom: Math.round(bottom),
            clipped,
        };
    });
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
    if (condition) {
        console.log(`  ✅ PASS: ${message}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${message}`);
        failed++;
    }
}

async function main() {
    const inputFile = process.argv[2] || 'assets/tank.json';
    console.log(`Loading ${inputFile}...`);
    const rigData: RigData = JSON.parse(await readFile(inputFile, 'utf-8'));

    const renderer = new SkiaRenderer();
    await renderer.loadImages(rigData);

    // -------------------------------------------------------
    // Test 1: Default mode (no autoFit) — demonstrate clipping happens
    // -------------------------------------------------------
    console.log('\n--- Test 1: Default render (no autoFit) ---');
    const defaultW = 1000, defaultH = 1000;
    const defaultData = renderer.compute(rigData, {
        canvasWidth: defaultW,
        canvasHeight: defaultH,
    });

    const defaultBounds = checkAllBounds(defaultData.objects, defaultW, defaultH);
    const defaultClipped = defaultBounds.filter(b => b.clipped);
    console.log(`  Objects: ${defaultData.objects.length}, Clipped: ${defaultClipped.length}`);
    for (const c of defaultClipped) {
        console.log(`    ${c.name}: (${c.left},${c.top})→(${c.right},${c.bottom})`);
    }

    // -------------------------------------------------------
    // Test 2: autoFit mode — ALL visible parts must be within bounds
    // -------------------------------------------------------
    console.log('\n--- Test 2: autoFit render ---');
    const autoFitResult = await renderer.computeAutoFit(rigData, {
        canvasWidth: defaultW,
        canvasHeight: defaultH,
    });

    const { canvasWidth: fitW, canvasHeight: fitH, renderData: fitData } = autoFitResult;
    console.log(`  AutoFit canvas: ${fitW}x${fitH}`);

    const fitBounds = checkAllBounds(fitData.objects, fitW, fitH);
    const fitClipped = fitBounds.filter(b => b.clipped);

    assert(fitClipped.length === 0,
        `No parts clipped with autoFit (clipped: ${fitClipped.map(c => c.name).join(', ') || 'none'})`);

    for (const c of fitClipped) {
        console.log(`    CLIPPED: ${c.name}: (${c.left},${c.top})→(${c.right},${c.bottom}) in ${fitW}x${fitH}`);
    }

    // -------------------------------------------------------
    // Test 3: autoFit preserves all objects (none dropped)
    // -------------------------------------------------------
    console.log('\n--- Test 3: autoFit preserves all objects ---');
    assert(fitData.objects.length === defaultData.objects.length,
        `Same object count: default=${defaultData.objects.length} autoFit=${fitData.objects.length}`);

    // -------------------------------------------------------
    // Test 4: autoFit with padding — all objects have at least some margin
    // -------------------------------------------------------
    console.log('\n--- Test 4: autoFit has padding (objects not touching edge) ---');
    const PADDING = 20; // autoFit should add at least this much padding
    const tooClose = fitBounds.filter(b =>
        b.left < PADDING || b.top < PADDING || b.right > fitW - PADDING || b.bottom > fitH - PADDING
    );
    assert(tooClose.length === 0,
        `All parts have >= ${PADDING}px padding (touching edge: ${tooClose.map(c => c.name).join(', ') || 'none'})`);

    // -------------------------------------------------------
    // Test 5: renderToFile with autoFit produces a file
    // -------------------------------------------------------
    console.log('\n--- Test 5: renderToFile with autoFit ---');
    const outPath = '/tmp/test-autofit-output.png';
    await renderer.renderToFile(outPath, rigData, {
        canvasWidth: defaultW,
        canvasHeight: defaultH,
        autoFit: true,
    });
    const fs = await import('fs');
    const exists = fs.existsSync(outPath);
    assert(exists, `autoFit renderToFile creates output file`);
    if (exists) {
        const stat = fs.statSync(outPath);
        assert(stat.size > 1000, `Output file has reasonable size (${stat.size} bytes)`);
    }

    // -------------------------------------------------------
    // Summary
    // -------------------------------------------------------
    console.log(`\n${'='.repeat(40)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
