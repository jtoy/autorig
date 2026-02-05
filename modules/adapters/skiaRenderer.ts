/**
 * Skia Canvas Renderer - Pre-built adapter for Node.js/Skia
 * Reduces setup from ~75 lines to ~4 lines
 */

import { ImageLoader } from '../imageLoad.js';
import { CharacterRigRenderer } from '../renderRig.js';
import type { RigData, RenderOptions, RigRenderData } from '../../types.js';

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

    /**
     * Load all rig images asynchronously
     * Uses the same key format as the original test-skia.ts (imagePaths.*, eyes.*)
     */
    async loadAllRigImagesAsync(rigData: RigData): Promise<Record<string, any>> {
        const imagesToLoad: Array<{ key: string; hash: string }> = [];

        // Collect all image paths from imagePaths
        if (rigData.imagePaths) {
            for (const [key, hash] of Object.entries(rigData.imagePaths)) {
                if (hash && typeof hash === 'string' && !hash.includes('[MEDIA_REMOVED]')) {
                    imagesToLoad.push({ key: `imagePaths.${key}`, hash });
                }
            }
        }

        // Collect all eye images
        if (rigData.eyes) {
            for (const [key, value] of Object.entries(rigData.eyes)) {
                if (typeof value === 'string' && !value.includes('[MEDIA_REMOVED]') &&
                    (key.includes('Image') || key.includes('Iris') || key.includes('Lid'))) {
                    imagesToLoad.push({ key: `eyes.${key}`, hash: value });
                }
            }
        }

        console.log(`📦 Loading ${imagesToLoad.length} images for character rig...`);

        const loadedImages: Record<string, any> = {};
        let loaded = 0;
        let failed = 0;

        // Load all images in parallel
        await Promise.all(
            imagesToLoad.map(async ({ key, hash }) => {
                const img = await this.loadImageAsync(key, hash);
                if (img) {
                    loadedImages[key] = img;
                    loaded++;
                } else {
                    failed++;
                }
            })
        );

        console.log(`✓ Loaded ${loaded}/${imagesToLoad.length} images (${failed} failed)`);
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
        options?: Partial<RenderOptions> & { showPivots?: boolean }
    ): Promise<void> {
        // Load images if not already loaded
        if (!this.isReady) {
            await this.loadImages(rigData);
        }

        // Create canvas
        const width = options?.canvasWidth ?? 800;
        const height = options?.canvasHeight ?? 800;
        const canvas = await this.createCanvas(width, height);

        // Render
        this.renderToCanvas(canvas, rigData, options, options?.showPivots);

        // Save to file
        const fs = await import('fs/promises');
        const buffer = await canvas.toBuffer('image/png');
        await fs.writeFile(outputPath, buffer);
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
