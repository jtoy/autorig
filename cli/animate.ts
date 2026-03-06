/**
 * animate command - Render animation keyframes to numbered PNGs with a manifest
 *
 * Usage:
 *   distark-check animate <rig.json> <animation.json> [-o frames/] [--width 1000] [--height 1000]
 */

import { SkiaRenderer } from '../modules/adapters/skiaRenderer.js';
import { expandDiffBasedAnimation, isDiffBasedFormat } from '../modules/animationDiff.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { RigData, RenderObject } from '../types.js';
import type { FrameData } from '../modules/animationDiff.js';

function resolveAnimationPath(input: string): string {
    // If it's an existing file or ends with .json, use as-is
    if (input.endsWith('.json') || existsSync(input)) {
        return input;
    }
    // Try resolving as a preset name
    const cliDir = dirname(fileURLToPath(import.meta.url));
    // From dist/cli/ go up two levels to package root
    const presetPath = join(cliDir, '..', '..', 'assets', 'presets', `${input}.json`);
    if (existsSync(presetPath)) {
        return presetPath;
    }
    // Fall back to original input (will error on readFile with a clear message)
    return input;
}

interface FrameManifestEntry {
    index: number;
    file: string;
    character_bounds: Record<string, { x: number; y: number; w: number; h: number }>;
    delta_from_prev?: Record<string, { moved?: { dx: number; dy: number }; rotated?: number }>;
}

interface AnimateManifest {
    rig_input: string;
    animation_input: string;
    frame_count: number;
    output_dir: string;
    frames: FrameManifestEntry[];
}

function objBounds(obj: RenderObject): { x: number; y: number; w: number; h: number } {
    return {
        x: Math.round(obj.x - obj.width * obj.anchorX),
        y: Math.round(obj.y - obj.height * obj.anchorY),
        w: Math.round(obj.width),
        h: Math.round(obj.height),
    };
}

export async function runAnimate(args: string[]): Promise<void> {
    const positional = args.filter(a => !a.startsWith('-'));
    const rigFile = positional[0];
    const animFile = positional[1];

    if (!rigFile || !animFile) {
        console.error('Usage: distark-check animate <rig.json> <animation.json> [-o frames/] [--width N] [--height N]');
        process.exit(1);
    }

    const outIdx = args.indexOf('-o');
    const outputDir = outIdx !== -1 ? args[outIdx + 1] : 'frames';
    const width = parseInt(args[args.indexOf('--width') + 1]) || 1000;
    const height = parseInt(args[args.indexOf('--height') + 1]) || 1000;

    const rigData: RigData = JSON.parse(await readFile(rigFile, 'utf-8'));
    const resolvedAnimFile = resolveAnimationPath(animFile);
    console.error(`Animation: ${resolvedAnimFile}`);
    const animRaw = JSON.parse(await readFile(resolvedAnimFile, 'utf-8'));

    // Expand animation frames (handles both diff and full-state formats)
    let frames: FrameData[];
    if (isDiffBasedFormat(animRaw)) {
        frames = expandDiffBasedAnimation(animRaw);
    } else if (Array.isArray(animRaw)) {
        frames = animRaw;
    } else {
        console.error('Unrecognized animation format');
        process.exit(1);
    }

    await mkdir(outputDir, { recursive: true });

    // Redirect console.log to stderr during image loading
    const origLog = console.log;
    console.log = (...a: unknown[]) => console.error(...a);

    const renderer = new SkiaRenderer();
    await renderer.loadImages(rigData);

    console.log = origLog;

    const manifest: AnimateManifest = {
        rig_input: rigFile,
        animation_input: resolvedAnimFile,
        frame_count: frames.length,
        output_dir: outputDir,
        frames: [],
    };

    let prevBoundsMap: Record<string, { x: number; y: number; rot: number }> | null = null;

    for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        const mergedRig: RigData = {
            ...rigData,
            ...frame,
            rotationValues: { ...rigData.rotationValues, ...frame.rotationValues },
            selfRotationValues: { ...rigData.selfRotationValues, ...frame.selfRotationValues },
            dimensionValues: { ...rigData.dimensionValues, ...frame.dimensionValues },
            pivotPoints: { ...rigData.pivotPoints, ...frame.pivotPoints },
            zIndexValues: { ...rigData.zIndexValues, ...frame.zIndexValues },
        };

        const padded = String(i).padStart(3, '0');
        const filename = `${outputDir}/${padded}.png`;

        await renderer.renderToFile(filename, mergedRig, {
            canvasWidth: width,
            canvasHeight: height,
            showPivots: false,
        });

        const renderData = renderer.compute(mergedRig, { canvasWidth: width, canvasHeight: height });

        const boundsMap: Record<string, { x: number; y: number; w: number; h: number }> = {};
        const currentPosMap: Record<string, { x: number; y: number; rot: number }> = {};

        for (const obj of renderData.objects) {
            boundsMap[obj.name] = objBounds(obj);
            currentPosMap[obj.name] = { x: Math.round(obj.x), y: Math.round(obj.y), rot: obj.rotation };
        }

        const entry: FrameManifestEntry = {
            index: i,
            file: `${padded}.png`,
            character_bounds: boundsMap,
        };

        // Compute deltas from previous frame
        if (prevBoundsMap) {
            const deltas: Record<string, { moved?: { dx: number; dy: number }; rotated?: number }> = {};
            for (const [name, pos] of Object.entries(currentPosMap)) {
                const prev = prevBoundsMap[name];
                if (prev) {
                    const dx = pos.x - prev.x;
                    const dy = pos.y - prev.y;
                    const dRot = Math.round((pos.rot - prev.rot) * 180 / Math.PI * 100) / 100;
                    if (dx !== 0 || dy !== 0 || Math.abs(dRot) > 0.01) {
                        const delta: { moved?: { dx: number; dy: number }; rotated?: number } = {};
                        if (dx !== 0 || dy !== 0) delta.moved = { dx, dy };
                        if (Math.abs(dRot) > 0.01) delta.rotated = dRot;
                        deltas[name] = delta;
                    }
                }
            }
            if (Object.keys(deltas).length > 0) {
                entry.delta_from_prev = deltas;
            }
        }

        prevBoundsMap = currentPosMap;
        manifest.frames.push(entry);
        console.error(`Frame ${i}/${frames.length - 1}: ${filename}`);
    }

    const manifestFile = `${outputDir}/manifest.json`;
    await writeFile(manifestFile, JSON.stringify(manifest, null, 2));

    // Output manifest to stdout for LLM
    console.log(JSON.stringify(manifest, null, 2));
}
