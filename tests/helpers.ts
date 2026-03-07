/**
 * Shared test helpers for distark-render tests
 */
import type { RenderObject } from '../types.js';

export interface BoundsResult {
    name: string;
    left: number;
    top: number;
    right: number;
    bottom: number;
    clipped: boolean;
}

let passed = 0;
let failed = 0;

export function assert(condition: boolean, message: string): void {
    if (condition) {
        console.log(`  ✅ PASS: ${message}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${message}`);
        failed++;
    }
}

export function checkAllBounds(objects: RenderObject[], width: number, height: number): BoundsResult[] {
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

export function printSummary(): void {
    console.log(`\n${'='.repeat(40)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

export function getResults(): { passed: number; failed: number } {
    return { passed, failed };
}
