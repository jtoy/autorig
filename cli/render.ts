/**
 * render command - Render a rig JSON to PNG and output a structured JSON report
 *
 * Usage:
 *   distark-check render <rig.json> [-o output.png] [--width 1000] [--height 1000] [--report] [--no-autofit]
 */

import { SkiaRenderer } from '../modules/adapters/skiaRenderer.js';
import { readFile, writeFile } from 'fs/promises';
import type { RigData, RigRenderData, RenderObject } from '../types.js';

export interface RenderReport {
    input: string;
    output: string;
    dimensions: { width: number; height: number };
    characters: Array<{
        name: string;
        type: string;
        bounds: { x: number; y: number; w: number; h: number };
        center: { x: number; y: number };
        rotation: number;
        zIndex: number;
        hasImage: boolean;
    }>;
    visible_parts: string[];
    missing_images: string[];
    pivot_points: Array<{ name: string; x: number; y: number }>;
}

function computeBounds(obj: RenderObject): { x: number; y: number; w: number; h: number } {
    const drawX = obj.x - obj.width * obj.anchorX;
    const drawY = obj.y - obj.height * obj.anchorY;
    return { x: Math.round(drawX), y: Math.round(drawY), w: Math.round(obj.width), h: Math.round(obj.height) };
}

function buildReport(
    inputFile: string,
    outputFile: string,
    width: number,
    height: number,
    renderData: RigRenderData
): RenderReport {
    const characters = renderData.objects.map(obj => ({
        name: obj.name,
        type: obj.type,
        bounds: computeBounds(obj),
        center: { x: Math.round(obj.x), y: Math.round(obj.y) },
        rotation: Math.round(obj.rotation * 180 / Math.PI * 100) / 100,
        zIndex: obj.zIndex,
        hasImage: !!obj.imageData,
    }));

    return {
        input: inputFile,
        output: outputFile,
        dimensions: { width, height },
        characters,
        visible_parts: characters.filter(c => c.hasImage).map(c => c.name),
        missing_images: characters.filter(c => !c.hasImage).map(c => c.name),
        pivot_points: renderData.pivotPoints.map(p => ({
            name: p.name,
            x: Math.round(p.x),
            y: Math.round(p.y),
        })),
    };
}

export async function runRender(args: string[]): Promise<void> {
    const inputFile = args.find(a => !a.startsWith('-')) || '';
    if (!inputFile) {
        console.error('Usage: distark-check render <rig.json> [-o output.png] [--width N] [--height N] [--report]');
        process.exit(1);
    }

    const outputIdx = args.indexOf('-o');
    const outputFile = outputIdx !== -1 ? args[outputIdx + 1] : inputFile.replace(/\.json$/, '.png');
    const width = parseInt(args[args.indexOf('--width') + 1]) || 1000;
    const height = parseInt(args[args.indexOf('--height') + 1]) || 1000;
    const wantReport = args.includes('--report');
    const autoFit = !args.includes('--no-autofit');

    const rigData: RigData = JSON.parse(await readFile(inputFile, 'utf-8'));

    // Redirect console.log to stderr during image loading (SkiaImageLoader logs progress)
    const origLog = console.log;
    console.log = (...a: unknown[]) => console.error(...a);

    const renderer = new SkiaRenderer();
    await renderer.loadImages(rigData);

    let finalWidth = width;
    let finalHeight = height;

    if (autoFit) {
        const fit = renderer.computeAutoFit(rigData, { canvasWidth: width, canvasHeight: height });
        finalWidth = fit.canvasWidth;
        finalHeight = fit.canvasHeight;

        // Render with auto-fit dimensions
        await renderer.renderToFile(outputFile, rigData, {
            canvasWidth: width,
            canvasHeight: height,
            autoFit: true,
            showPivots: false,
        });
    } else {
        await renderer.renderToFile(outputFile, rigData, {
            canvasWidth: width,
            canvasHeight: height,
            autoFit: false,
            showPivots: false,
        });
    }

    // Restore console.log
    console.log = origLog;

    console.error(`Rendered: ${outputFile} (${finalWidth}x${finalHeight}${autoFit ? ' autoFit' : ''})`);

    // Compute report data using the final dimensions
    const renderData = autoFit
        ? renderer.computeAutoFit(rigData, { canvasWidth: width, canvasHeight: height }).renderData
        : renderer.compute(rigData, { canvasWidth: finalWidth, canvasHeight: finalHeight });
    const report = buildReport(inputFile, outputFile, finalWidth, finalHeight, renderData);

    if (wantReport) {
        const reportFile = outputFile.replace(/\.png$/, '.report.json');
        await writeFile(reportFile, JSON.stringify(report, null, 2));
        console.error(`Report: ${reportFile}`);
    }

    // Always output report to stdout for LLM consumption (clean JSON only)
    console.log(JSON.stringify(report, null, 2));
}
