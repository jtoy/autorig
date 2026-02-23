/**
 * verify command - Math-based sanity checks on rig data (no rendering, no API calls)
 *
 * Usage:
 *   distark-check verify <rig.json> [--checks all|bounds,visibility,proportions,zorder]
 */

import { readFile } from 'fs/promises';
import { CharacterRigRenderer } from '../modules/renderRig.js';
import { ImageLoader } from '../modules/imageLoad.js';
import type { RigData, RenderObject } from '../types.js';

interface CheckResult {
    check: string;
    status: 'passed' | 'failed' | 'warning';
    detail?: string;
}

export interface VerifyReport {
    input: string;
    passed: string[];
    failed: CheckResult[];
    warnings: CheckResult[];
    all_results: CheckResult[];
}

function checkBounds(objects: RenderObject[], width: number, height: number): CheckResult[] {
    const results: CheckResult[] = [];
    for (const obj of objects) {
        const left = obj.x - obj.width * obj.anchorX;
        const top = obj.y - obj.height * obj.anchorY;
        const right = left + obj.width;
        const bottom = top + obj.height;

        if (right < 0 || left > width || bottom < 0 || top > height) {
            results.push({
                check: 'bounds',
                status: 'failed',
                detail: `${obj.name} is completely offscreen (${Math.round(left)},${Math.round(top)} to ${Math.round(right)},${Math.round(bottom)})`,
            });
        } else if (left < 0 || top < 0 || right > width || bottom > height) {
            results.push({
                check: 'bounds',
                status: 'warning',
                detail: `${obj.name} is partially offscreen (${Math.round(left)},${Math.round(top)} to ${Math.round(right)},${Math.round(bottom)})`,
            });
        }
    }
    if (results.length === 0) {
        results.push({ check: 'bounds', status: 'passed' });
    }
    return results;
}

function checkVisibility(rigData: RigData, objects: RenderObject[]): CheckResult[] {
    const results: CheckResult[] = [];
    const expectedParts = ['torso', 'head'];

    for (const part of expectedParts) {
        const visible = rigData.visibility?.[part] !== false;
        const rendered = objects.some(o => o.name === part);
        if (visible && !rendered) {
            results.push({
                check: 'visibility',
                status: 'failed',
                detail: `${part} should be visible but is not in render objects`,
            });
        }
    }

    // Check if imagePaths are defined for limbs (we don't load images in verify)
    const limbParts = objects.filter(o => o.type === 'limb');
    const missingPaths: string[] = [];
    for (const limb of limbParts) {
        const pathKey = limb.name;
        const hasPath = rigData.imagePaths?.[pathKey];
        if (!hasPath) {
            missingPaths.push(limb.name);
        }
    }

    if (missingPaths.length > 0) {
        results.push({
            check: 'visibility',
            status: 'warning',
            detail: `${missingPaths.length} limbs have no imagePath defined: ${missingPaths.join(', ')}`,
        });
    }

    if (results.length === 0) {
        results.push({ check: 'visibility', status: 'passed' });
    }
    return results;
}

function checkProportions(objects: RenderObject[]): CheckResult[] {
    const results: CheckResult[] = [];
    const torso = objects.find(o => o.name === 'torso');
    const head = objects.find(o => o.name === 'head');

    if (torso && head) {
        const headToTorsoRatio = (head.width * head.height) / (torso.width * torso.height);
        if (headToTorsoRatio > 10) {
            results.push({
                check: 'proportions',
                status: 'warning',
                detail: `Head is very large relative to torso (ratio: ${headToTorsoRatio.toFixed(2)})`,
            });
        }
        if (headToTorsoRatio < 0.01) {
            results.push({
                check: 'proportions',
                status: 'warning',
                detail: `Head is very small relative to torso (ratio: ${headToTorsoRatio.toFixed(2)})`,
            });
        }
    }

    for (const obj of objects) {
        if (obj.width <= 0 || obj.height <= 0) {
            results.push({
                check: 'proportions',
                status: 'failed',
                detail: `${obj.name} has invalid dimensions: ${obj.width}x${obj.height}`,
            });
        }
    }

    if (results.length === 0) {
        results.push({ check: 'proportions', status: 'passed' });
    }
    return results;
}

function checkZOrder(objects: RenderObject[]): CheckResult[] {
    const results: CheckResult[] = [];
    const sorted = [...objects].sort((a, b) => a.zIndex - b.zIndex);

    // Eyes/irises should render above head
    const head = sorted.find(o => o.name === 'head');
    const eyeParts = sorted.filter(o => o.type === 'eye' || o.type === 'iris' || o.type === 'eyelid');

    if (head) {
        for (const eye of eyeParts) {
            if (eye.zIndex < head.zIndex) {
                results.push({
                    check: 'zorder',
                    status: 'warning',
                    detail: `${eye.name} (z:${eye.zIndex}) renders behind head (z:${head.zIndex})`,
                });
            }
        }
    }

    if (results.length === 0) {
        results.push({ check: 'zorder', status: 'passed' });
    }
    return results;
}

export async function runVerify(args: string[]): Promise<void> {
    const inputFile = args.find(a => !a.startsWith('-')) || '';
    if (!inputFile) {
        console.error('Usage: distark-check verify <rig.json> [--checks all|bounds,visibility,proportions,zorder]');
        process.exit(1);
    }

    const checksIdx = args.indexOf('--checks');
    const checksStr = checksIdx !== -1 ? args[checksIdx + 1] : 'all';
    const enabledChecks = checksStr === 'all'
        ? ['bounds', 'visibility', 'proportions', 'zorder']
        : checksStr.split(',');

    const width = parseInt(args[args.indexOf('--width') + 1]) || 1000;
    const height = parseInt(args[args.indexOf('--height') + 1]) || 1000;

    const rigData: RigData = JSON.parse(await readFile(inputFile, 'utf-8'));

    // Compute render data (no actual rendering needed)
    const renderer = new CharacterRigRenderer(new ImageLoader());
    const renderData = renderer.computeCharacterRigData(rigData, {
        canvasWidth: width,
        canvasHeight: height,
    });

    const allResults: CheckResult[] = [];

    if (enabledChecks.includes('bounds')) {
        allResults.push(...checkBounds(renderData.objects, width, height));
    }
    if (enabledChecks.includes('visibility')) {
        allResults.push(...checkVisibility(rigData, renderData.objects));
    }
    if (enabledChecks.includes('proportions')) {
        allResults.push(...checkProportions(renderData.objects));
    }
    if (enabledChecks.includes('zorder')) {
        allResults.push(...checkZOrder(renderData.objects));
    }

    const report: VerifyReport = {
        input: inputFile,
        passed: allResults.filter(r => r.status === 'passed').map(r => r.check),
        failed: allResults.filter(r => r.status === 'failed'),
        warnings: allResults.filter(r => r.status === 'warning'),
        all_results: allResults,
    };

    console.log(JSON.stringify(report, null, 2));

    if (report.failed.length > 0) {
        process.exit(1);
    }
}
