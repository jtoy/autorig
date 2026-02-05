/**
 * p5.js Renderer - Pre-built adapter for p5.js
 * Reduces setup from ~80 lines to ~3 lines
 */

import { ImageLoader } from '../imageLoad.js';
import { CharacterRigRenderer } from '../renderRig.js';
import type { RigData, RenderOptions, RigRenderData } from '../../types.js';

/**
 * p5-specific image loader
 * Extends ImageLoader to use p5.loadImage instead of browser Image API
 */
export class P5ImageLoader extends ImageLoader {
    private p5: any;

    constructor(p5Instance: any, baseHost?: string) {
        super(baseHost);
        this.p5 = p5Instance;
    }

    /**
     * Override to use p5.loadImage
     * Inherits all caching, URL resolution, and batch loading from base class
     */
    loadImage(
        key: string,
        imageData: string,
        onLoad?: (key: string, img: any) => void,
        onError?: (key: string, error: Event | string) => void
    ): void {
        const imageUrl = this.resolveImageSource(imageData);

        if (!imageUrl) {
            console.warn(`Could not resolve image source for ${key}: ${imageData}`);
            if (onError) onError(key, 'Invalid image source');
            return;
        }

        // Check cache first (from base class)
        const cached = this.getCachedImage(key);
        if (cached) {
            if (onLoad) onLoad(key, cached);
            return;
        }

        // Use p5.loadImage
        this.p5.loadImage(
            imageUrl,
            (img: any) => {
                this.cacheImage(key, img);
                if (onLoad) onLoad(key, img);
            },
            (err: any) => {
                console.error(`Failed to load ${key}:`, err);
                if (onError) onError(key, err);
            }
        );
    }
}

/**
 * p5.js Renderer - Complete rendering solution for p5.js
 *
 * Usage:
 *   const renderer = new P5Renderer(p);
 *   await renderer.loadImages(rigData);
 *   renderer.render(rigData, { width: 800, height: 800 });
 *
 * Advanced Usage (full p5 control):
 *   const renderData = renderer.compute(rigData, options);
 *   // Modify renderData.objects as needed
 *   renderer.renderObjects(renderData.objects);
 */
export class P5Renderer extends CharacterRigRenderer {
    private p5: any;
    private loadedImages: Record<string, any> = {};
    private isReady: boolean = false;

    constructor(p5Instance: any, baseHost?: string) {
        const imageLoader = new P5ImageLoader(p5Instance, baseHost);
        super(imageLoader);
        this.p5 = p5Instance;
    }

    /**
     * Load all images for a character rig
     * Must be called before renderRig()
     */
    async loadImages(rigData: RigData): Promise<void> {
        this.loadedImages = await this.imageLoader.loadAllRigImages(rigData, true);
        this.isReady = true;
    }

    /**
     * Compute rig render data (for advanced control)
     * Returns the computed transforms that you can modify before rendering
     */
    compute(rigData: RigData, options?: Partial<RenderOptions>): RigRenderData {
        if (!this.isReady) {
            throw new Error('Images not loaded. Call loadImages() first.');
        }

        const renderOptions: RenderOptions = {
            canvasWidth: options?.canvasWidth ?? this.p5.width,
            canvasHeight: options?.canvasHeight ?? this.p5.height,
            cameraOffset: options?.cameraOffset ?? { x: 0, y: 0 },
            loadedImages: this.loadedImages
        };

        return this.computeCharacterRigData(rigData, renderOptions);
    }

    /**
     * Render objects to p5 canvas
     * Can be used with modified render data for custom effects
     */
    renderObjects(objects: any[], showPivots: boolean = false, pivotPoints?: any[]): void {
        objects.forEach(obj => {
            if (!obj.imageData) return;

            this.p5.push();
            this.p5.translate(obj.x, obj.y);
            this.p5.rotate(obj.rotation);
            this.p5.scale(obj.scaleX, obj.scaleY);

            const drawX = -obj.width * obj.anchorX;
            const drawY = -obj.height * obj.anchorY;
            this.p5.image(obj.imageData, drawX, drawY, obj.width, obj.height);

            this.p5.pop();
        });

        // Draw pivot points if requested
        if (showPivots && pivotPoints) {
            pivotPoints.forEach((pivot: any) => {
                this.p5.push();
                this.p5.fill(0, 150, 255, 230);
                this.p5.stroke(0);
                this.p5.strokeWeight(1);
                this.p5.circle(pivot.x, pivot.y, 8);
                this.p5.pop();
            });
        }
    }

    /**
     * Simple one-line render (compute + renderObjects)
     *
     * @param rigData - Character rig data
     * @param options - Render options (width, height, camera offset)
     * @param showPivots - Whether to show pivot points for debugging
     */
    renderRig(rigData: RigData, options?: Partial<RenderOptions>, showPivots: boolean = false): void {
        const renderData = this.compute(rigData, options);
        this.renderObjects(renderData.objects, showPivots, renderData.pivotPoints);
    }

    /**
     * Check if images are loaded and ready to render
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
