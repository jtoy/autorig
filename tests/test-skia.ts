/**
 * Test: Skia Canvas Rendering
 * Verifies that SkiaRenderer can load images, compute render data, and produce a PNG.
 */

import { SkiaRenderer } from '../modules/adapters/skiaRenderer.js';
import { readFile, stat } from 'fs/promises';
import type { RigData } from '../types.js';

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
    console.log('\n🧪 Skia Renderer Tests');
    console.log('='.repeat(40));

    const inputFile = 'assets/tank.json';
    const outputFile = 'test-outputs/test-skia-output.png';

    // Ensure test-outputs dir exists
    const { mkdir } = await import('fs/promises');
    await mkdir('test-outputs', { recursive: true });

    const rigData: RigData = JSON.parse(await readFile(inputFile, 'utf-8'));

    const renderer = new SkiaRenderer();

    // Test 1: loadImages succeeds
    console.log('\n  Test 1: Load images');
    await renderer.loadImages(rigData);
    assert(renderer.ready(), 'Renderer is ready after loadImages');

    // Test 2: compute returns objects
    console.log('\n  Test 2: Compute render data');
    const data = renderer.compute(rigData, { canvasWidth: 1000, canvasHeight: 1000 });
    assert(data.objects.length > 0, `Computed ${data.objects.length} render objects`);
    assert(data.pivotPoints.length > 0, `Computed ${data.pivotPoints.length} pivot points`);

    // Test 3: renderToFile produces a valid PNG
    console.log('\n  Test 3: Render to file');
    await renderer.renderToFile(outputFile, rigData, {
        canvasWidth: 1000,
        canvasHeight: 1000,
        showPivots: true,
    });
    const info = await stat(outputFile);
    assert(info.size > 1000, `Output PNG has reasonable size (${info.size} bytes)`);

    // Summary
    console.log(`\n${'='.repeat(40)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
