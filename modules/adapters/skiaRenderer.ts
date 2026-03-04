/**
 * Skia Canvas Renderer - Pre-built adapter for Node.js/Skia
 * Reduces setup from ~75 lines to ~4 lines
 */

import { ImageLoader } from '../imageLoad.js';
import { CharacterRigRenderer } from '../renderRig.js';
import type { RigData, RenderOptions, RigRenderData } from '../../types.js';

export interface AutoFitResult {
    canvasWidth: number;
    canvasHeight: number;
    cameraOffset: { x: number; y: number };
    renderData: RigRenderData;
}

/**
 * Skia-specific image loader
 * Handles async image loading for Node.js canvas
 */
export class SkiaImageLoader extends ImageLoader {
    constructor(baseHost?: string) {
        super(baseHost);
    }

    /**
     * Async image loading for Skia Canvas
     * Note: This requires the @napi-rs/canvas package's loadImage function
     */
    async loadImageAsync(key: string, imageData: string): Promise<any> {
        const imageUrl = this.resolveImageSource(imageData);

        if (!imageUrl) {
            throw new Error(`Could not resolve image source for ${key}: ${imageData}`);
        }

        // Check cache first
        const cached = this.getCachedImage(key);
        if (cached) {
            return cached;
        }

        // Dynamic import to avoid browser compatibility issues
        let loadImage: any;
        try {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore - Optional dependency
            const module: any = await import('@napi-rs/canvas');
            loadImage = module.loadImage;
        } catch {
            // Fallback to skia-canvas if @napi-rs/canvas is not available
            const module: any = await import('skia-canvas');
            loadImage = module.loadImage;
        }

        const img = await loadImage(imageUrl);
        this.cacheImage(key, img);
        return img;
    }

    async loadAllRigImagesAsync(rigData: RigData): Promise<Record<string, any>> {
        const imagesToLoad: Array<{ hash: string }> = [];

        // Collect all unique image paths from imagePaths
        // CHANGED: We now ONLY track the actual path/hash, not semantic keys
        if (rigData.imagePaths) {
            for (const [, hash] of Object.entries(rigData.imagePaths)) {
                if (hash && typeof hash === 'string' && !hash.includes('[MEDIA_REMOVED]')) {
                    // Only add if not already in list (deduplicate)
                    if (!imagesToLoad.find(item => item.hash === hash)) {
                        imagesToLoad.push({ hash });
                    }
                }
            }
        }

        // Collect all eye images
        if (rigData.eyes) {
            for (const [eyeKey, value] of Object.entries(rigData.eyes)) {
                if (typeof value === 'string' && !value.includes('[MEDIA_REMOVED]') &&
                    (eyeKey.includes('Image') || eyeKey.includes('Iris') || eyeKey.includes('Lid'))) {
                    // Only add if not already in list (deduplicate)
                    if (!imagesToLoad.find(item => item.hash === value)) {
                        imagesToLoad.push({ hash: value });
                    }
                }
            }
        }

        // Collect all mouth images from rigData.mouth
        if ((rigData as any).mouth) {
            for (const [_mouthKey, value] of Object.entries((rigData as any).mouth)) {
                if (typeof value === 'string' && !value.includes('[MEDIA_REMOVED]')) {
                    // Only add if not already in list (deduplicate)
                    if (!imagesToLoad.find(item => item.hash === value)) {
                        imagesToLoad.push({ hash: value });
                    }
                }
            }
        }

        console.log(`📦 Loading ${imagesToLoad.length} images for character rig...`);

        const loadedImages: Record<string, any> = {};
        let loaded = 0;
        let failed = 0;

        // Load all images in parallel
        await Promise.all(
            imagesToLoad.map(async ({ hash }) => {
                // CRITICAL: Use the actual path/hash as the cache key!
                const img = await this.loadImageAsync(hash, hash);
                if (img) {
                    loadedImages[hash] = img;  // Cache by actual path, not semantic key!
                    loaded++;
                } else {
                    failed++;
                }
            })
        );

        console.log(`✓ Loaded ${loaded}/${imagesToLoad.length} images (${failed} failed)`);
        console.log('📦 Image Cache (indexed by actual paths):', Object.keys(loadedImages).map(k => k.substring(0, 50)));
        return loadedImages;
    }
}

/**
 * Skia Canvas Renderer - Complete rendering solution for Node.js
 *
 * Simple Usage:
 *   const renderer = new SkiaRenderer();
 *   await renderer.renderToFile('output.png', rigData, { width: 800, height: 800 });
 *
 * Advanced Usage:
 *   const renderer = new SkiaRenderer();
 *   await renderer.loadImages(rigData);
 *   const canvas = renderer.createCanvas(800, 800);
 *   renderer.render(canvas, rigData);
 *   await canvas.saveAs('output.png');
 */
export class SkiaRenderer extends CharacterRigRenderer {
    private loadedImages: Record<string, any> = {};
    private isReady: boolean = false;

    constructor(baseHost?: string) {
        const imageLoader = new SkiaImageLoader(baseHost);
        super(imageLoader);
    }

    /**
     * Load all images for a character rig
     */
    async loadImages(rigData: RigData): Promise<void> {
        const loader = this.getImageLoader() as SkiaImageLoader;
        this.loadedImages = await loader.loadAllRigImagesAsync(rigData);
        this.isReady = true;
    }

    /**
     * Create a Skia canvas
     */
    async createCanvas(width: number, height: number): Promise<any> {
        try {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore - Optional dependency
            const module: any = await import('@napi-rs/canvas');
            return module.createCanvas(width, height);
        } catch {
            // Fallback to skia-canvas
            const module: any = await import('skia-canvas');
            return module.Canvas ? new module.Canvas(width, height) : module.createCanvas(width, height);
        }
    }

    /**
     * Compute rig render data (for advanced control)
     */
    compute(rigData: RigData, options: Partial<RenderOptions> = {}): RigRenderData {
        if (!this.isReady) {
            throw new Error('Images not loaded. Call loadImages() first.');
        }

        const renderOptions: RenderOptions = {
            canvasWidth: options.canvasWidth ?? 800,
            canvasHeight: options.canvasHeight ?? 800,
            cameraOffset: options.cameraOffset ?? { x: 0, y: 0 },
            loadedImages: this.loadedImages
        };

        return this.computeCharacterRigData(rigData, renderOptions);
    }

    /**
     * Compute auto-fit: finds the bounding box of all rendered objects
     * and returns adjusted canvas dimensions + camera offset so everything fits.
     */
    computeAutoFit(rigData: RigData, options: Partial<RenderOptions> = {}, padding = 40): AutoFitResult {
        // First pass: compute at a large canvas to avoid initial clipping
        const initW = (options.canvasWidth ?? 800) * 3;
        const initH = (options.canvasHeight ?? 800) * 3;
        const initData = this.compute(rigData, {
            ...options,
            canvasWidth: initW,
            canvasHeight: initH,
        });

        // Find AABB of all objects
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const obj of initData.objects) {
            const left = obj.x - obj.width * obj.anchorX;
            const top = obj.y - obj.height * obj.anchorY;
            const right = left + obj.width;
            const bottom = top + obj.height;
            if (left < minX) minX = left;
            if (top < minY) minY = top;
            if (right > maxX) maxX = right;
            if (bottom > maxY) maxY = bottom;
        }

        // Character bounding box center in the initial large canvas
        const charCenterX = (minX + maxX) / 2;
        const charCenterY = (minY + maxY) / 2;
        const charWidth = maxX - minX;
        const charHeight = maxY - minY;

        // Target canvas = character size + padding on each side
        const fitW = Math.ceil(charWidth + padding * 2);
        const fitH = Math.ceil(charHeight + padding * 2);

        // Camera offset so character center lands at canvas center
        // In renderRig: centerX = canvasWidth/2 + cameraOffset.x
        //               centerY = canvasHeight/2 + 100 + cameraOffset.y
        // Character center in init pass was at (charCenterX, charCenterY).
        // Init centerX was: initW/2 + camX_init, init centerY was: initH/2 + 100 + camY_init
        // We want the character center to be at (fitW/2, fitH/2) in the new canvas.
        // New centerX = fitW/2 + camX_new, new centerY = fitH/2 + 100 + camY_new
        // The character positions are relative to (centerX, centerY) in the same way,
        // so: fitW/2 + camX_new = charCenterX - (initW/2 + camX_init) + fitW/2 + camX_new
        // Actually simpler: just figure out the offset needed.
        const camXInit = options.cameraOffset?.x ?? 0;
        const camYInit = options.cameraOffset?.y ?? 0;

        // In the initial pass, the root was at:
        //   rootX = initW/2 + camXInit
        //   rootY = initH/2 + 100 + camYInit
        // In the fit pass, we want the character's AABB center at fitW/2, fitH/2.
        // The character AABB center relative to root is:
        //   relCX = charCenterX - (initW/2 + camXInit)
        //   relCY = charCenterY - (initH/2 + 100 + camYInit)
        // In the fit canvas, root will be at (fitW/2 + newCamX, fitH/2 + 100 + newCamY)
        // Character AABB center will be at root + rel = (fitW/2 + newCamX + relCX, fitH/2 + 100 + newCamY + relCY)
        // We want that = (fitW/2, fitH/2)
        // So: newCamX = -relCX, newCamY = -relCY - 100

        const relCX = charCenterX - (initW / 2 + camXInit);
        const relCY = charCenterY - (initH / 2 + 100 + camYInit);
        const newCamX = -relCX;
        const newCamY = -relCY - 100;

        // Re-compute with the fitted dimensions
        const fitData = this.compute(rigData, {
            ...options,
            canvasWidth: fitW,
            canvasHeight: fitH,
            cameraOffset: { x: newCamX, y: newCamY },
        });

        return {
            canvasWidth: fitW,
            canvasHeight: fitH,
            cameraOffset: { x: newCamX, y: newCamY },
            renderData: fitData,
        };
    }

    /**
     * Render objects to canvas context
     * Use this to render pre-computed and modified render data
     */
    renderObjects(ctx: any, objects: any[], showPivots: boolean = false, pivotPoints?: any[]): void {
        objects.forEach(obj => {
            if (!obj.imageData) return;

            ctx.save();
            ctx.translate(obj.x, obj.y);
            ctx.rotate(obj.rotation);
            ctx.scale(obj.scaleX, obj.scaleY);

            const drawX = -obj.width * obj.anchorX;
            const drawY = -obj.height * obj.anchorY;
            ctx.drawImage(obj.imageData, drawX, drawY, obj.width, obj.height);

            ctx.restore();
        });

        // Draw pivot points if requested
        if (showPivots && pivotPoints) {
            pivotPoints.forEach(pivot => {
                ctx.save();
                ctx.fillStyle = 'rgba(0, 150, 255, 0.9)';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(pivot.x, pivot.y, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            });
        }
    }

    /**
     * Render to a canvas (Skia Canvas 2D API)
     * Computes render data and renders it
     */
    renderToCanvas(canvas: any, rigData: RigData, options?: Partial<RenderOptions>, showPivots: boolean = false): void {
        const ctx = canvas.getContext('2d');
        const renderData = this.compute(rigData, {
            ...options,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height
        });

        // Clear canvas
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Render using renderObjects
        this.renderObjects(ctx, renderData.objects, showPivots, renderData.pivotPoints);
    }

    /**
     * One-liner: Render directly to file
     *
     * @param outputPath - Path to save PNG file
     * @param rigData - Character rig data
     * @param options - Render options (width, height, camera offset)
     */
    async renderToFile(
        outputPath: string,
        rigData: RigData,
        options?: Partial<RenderOptions> & { showPivots?: boolean; autoFit?: boolean }
    ): Promise<void> {
        // Load images if not already loaded
        if (!this.isReady) {
            await this.loadImages(rigData);
        }

        const useAutoFit = options?.autoFit ?? true;

        if (useAutoFit) {
            const fit = this.computeAutoFit(rigData, options);
            const canvas = await this.createCanvas(fit.canvasWidth, fit.canvasHeight);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, fit.canvasWidth, fit.canvasHeight);
            this.renderObjects(ctx, fit.renderData.objects, options?.showPivots, fit.renderData.pivotPoints);

            const fs = await import('fs/promises');
            const buffer = await canvas.toBuffer('image/png');
            await fs.writeFile(outputPath, buffer);
        } else {
            const width = options?.canvasWidth ?? 800;
            const height = options?.canvasHeight ?? 800;
            const canvas = await this.createCanvas(width, height);
            this.renderToCanvas(canvas, rigData, options, options?.showPivots);

            const fs = await import('fs/promises');
            const buffer = await canvas.toBuffer('image/png');
            await fs.writeFile(outputPath, buffer);
        }
    }

    /**
     * Render to buffer (for streaming, HTTP responses, etc.)
     */
    async renderToBuffer(
        rigData: RigData,
        options?: Partial<RenderOptions>,
        format: 'png' | 'jpeg' = 'png'
    ): Promise<Buffer> {
        if (!this.isReady) {
            await this.loadImages(rigData);
        }

        const width = options?.canvasWidth ?? 800;
        const height = options?.canvasHeight ?? 800;
        const canvas = await this.createCanvas(width, height);

        this.renderToCanvas(canvas, rigData, options);

        return await canvas.toBuffer(`image/${format}`);
    }

    /**
     * Check if images are loaded
     */
    ready(): boolean {
        return this.isReady;
    }

    /**
     * Get loaded images (for custom rendering)
     */
    getLoadedImages(): Record<string, any> {
        return this.loadedImages;
    }
}
