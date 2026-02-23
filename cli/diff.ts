/**
 * diff command - Compare two rendered PNGs and output a pixel-diff image + report
 *
 * Usage:
 *   distark-check diff <before.png> <after.png> [-o diff.png] [--threshold 10]
 */

import { readFile, writeFile } from 'fs/promises';

interface DiffReport {
    before: string;
    after: string;
    diff_image: string;
    dimensions: { width: number; height: number };
    total_pixels: number;
    changed_pixels: number;
    percent_changed: number;
    changed_regions: Array<{
        sector: string;
        percent_changed: number;
    }>;
}

export async function runDiff(args: string[]): Promise<void> {
    const positional = args.filter(a => !a.startsWith('-'));
    const beforeFile = positional[0];
    const afterFile = positional[1];

    if (!beforeFile || !afterFile) {
        console.error('Usage: distark-check diff <before.png> <after.png> [-o diff.png] [--threshold N]');
        process.exit(1);
    }

    const outIdx = args.indexOf('-o');
    const diffFile = outIdx !== -1 ? args[outIdx + 1] : 'diff.png';
    const threshIdx = args.indexOf('--threshold');
    const threshold = threshIdx !== -1 ? parseInt(args[threshIdx + 1]) : 10;

    // Dynamic import skia-canvas
    let loadImage: (src: string | Buffer) => Promise<any>;
    let createCanvas: (w: number, h: number) => any;

    try {
        // @ts-ignore - Optional dependency
        const mod: any = await import('@napi-rs/canvas');
        loadImage = mod.loadImage;
        createCanvas = mod.createCanvas;
    } catch {
        const mod: any = await import('skia-canvas');
        loadImage = mod.loadImage;
        createCanvas = mod.Canvas
            ? (w: number, h: number) => new mod.Canvas(w, h)
            : mod.createCanvas;
    }

    // Load both images
    const beforeBuf = await readFile(beforeFile);
    const afterBuf = await readFile(afterFile);
    const beforeImg = await loadImage(beforeBuf);
    const afterImg = await loadImage(afterBuf);

    const width = beforeImg.width;
    const height = beforeImg.height;

    if (afterImg.width !== width || afterImg.height !== height) {
        console.error(`Image dimensions mismatch: ${width}x${height} vs ${afterImg.width}x${afterImg.height}`);
        process.exit(1);
    }

    // Draw both to get pixel data
    const canvasBefore = createCanvas(width, height);
    const ctxBefore = canvasBefore.getContext('2d');
    ctxBefore.drawImage(beforeImg, 0, 0);
    const dataBefore = ctxBefore.getImageData(0, 0, width, height);

    const canvasAfter = createCanvas(width, height);
    const ctxAfter = canvasAfter.getContext('2d');
    ctxAfter.drawImage(afterImg, 0, 0);
    const dataAfter = ctxAfter.getImageData(0, 0, width, height);

    // Create diff image
    const canvasDiff = createCanvas(width, height);
    const ctxDiff = canvasDiff.getContext('2d');
    const diffData = ctxDiff.createImageData(width, height);

    let changedPixels = 0;
    const totalPixels = width * height;

    // Track per-sector changes (3x3 grid)
    const sectorW = width / 3;
    const sectorH = height / 3;
    const sectorChanges = new Array(9).fill(0);
    const sectorTotals = new Array(9).fill(0);
    const sectorNames = [
        'Top-Left', 'Top-Center', 'Top-Right',
        'Middle-Left', 'Middle-Center', 'Middle-Right',
        'Bottom-Left', 'Bottom-Center', 'Bottom-Right',
    ];

    for (let i = 0; i < dataBefore.data.length; i += 4) {
        const pixelIdx = i / 4;
        const px = pixelIdx % width;
        const py = Math.floor(pixelIdx / width);
        const sectorCol = Math.min(Math.floor(px / sectorW), 2);
        const sectorRow = Math.min(Math.floor(py / sectorH), 2);
        const sectorIdx = sectorRow * 3 + sectorCol;
        sectorTotals[sectorIdx]++;

        const rDiff = Math.abs(dataBefore.data[i] - dataAfter.data[i]);
        const gDiff = Math.abs(dataBefore.data[i + 1] - dataAfter.data[i + 1]);
        const bDiff = Math.abs(dataBefore.data[i + 2] - dataAfter.data[i + 2]);

        if (rDiff > threshold || gDiff > threshold || bDiff > threshold) {
            changedPixels++;
            sectorChanges[sectorIdx]++;
            // Red highlight for changed pixels
            diffData.data[i] = 255;
            diffData.data[i + 1] = 0;
            diffData.data[i + 2] = 0;
            diffData.data[i + 3] = 255;
        } else {
            // Dimmed version of original for context
            diffData.data[i] = Math.floor(dataAfter.data[i] * 0.3);
            diffData.data[i + 1] = Math.floor(dataAfter.data[i + 1] * 0.3);
            diffData.data[i + 2] = Math.floor(dataAfter.data[i + 2] * 0.3);
            diffData.data[i + 3] = 255;
        }
    }

    ctxDiff.putImageData(diffData, 0, 0);

    // Save diff image
    const buffer = await canvasDiff.toBuffer('image/png');
    await writeFile(diffFile, buffer);

    const changedRegions = sectorNames
        .map((name, idx) => ({
            sector: name,
            percent_changed: sectorTotals[idx] > 0
                ? Math.round(sectorChanges[idx] / sectorTotals[idx] * 10000) / 100
                : 0,
        }))
        .filter(r => r.percent_changed > 0);

    const report: DiffReport = {
        before: beforeFile,
        after: afterFile,
        diff_image: diffFile,
        dimensions: { width, height },
        total_pixels: totalPixels,
        changed_pixels: changedPixels,
        percent_changed: Math.round(changedPixels / totalPixels * 10000) / 100,
        changed_regions: changedRegions,
    };

    console.log(JSON.stringify(report, null, 2));
}
