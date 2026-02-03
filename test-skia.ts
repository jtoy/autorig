/**
 * Skia Canvas Command-Line Test
 * Renders a character rig using Skia Canvas and saves to a file
 * 
 * Architecture:
 * - Uses ImageLoader from modules/imageLoad.ts (extended for Node.js compatibility)
 * - Uses CharacterRigRenderer from modules/renderRig.ts (computes all transforms)
 * - SkiaImageLoader adapts browser ImageLoader to work with Skia Canvas's Image type
 * - CharacterRigRenderer.computeCharacterRigData() handles all rig calculations
 * - Rendering logic draws the computed render objects to Skia Canvas
 * 
 * Usage: npm run test-skia
 */

import { Canvas, loadImage as skiaLoadImage } from 'skia-canvas';
import { readFile } from 'fs/promises';
import { CharacterRigRenderer } from './modules/renderRig.js';
import { ImageLoader } from './modules/imageLoad.js';
import type { RigData } from './types.js';

/**
 * Skia Canvas adapter for ImageLoader
 * Extends the browser-based ImageLoader to work with Skia Canvas in Node.js
 * 
 * Key differences from browser version:
 * - Uses skia-canvas's loadImage() instead of browser's Image()
 * - Returns Skia Canvas Image type instead of HTMLImageElement
 * - Otherwise maintains the same API and caching behavior
 */
class SkiaImageLoader extends ImageLoader {
    /**
     * Override loadImage to use Skia Canvas's loadImage instead of browser Image
     */
    async loadImageAsync(key: string, imageData: string | null | undefined): Promise<any | null> {
        const imageUrl = this.resolveImageSource(imageData);
        
        if (!imageUrl) {
            console.warn(`Could not resolve image source for ${key}: ${imageData}`);
            return null;
        }
        
        // Check cache first
        const cached = this.getCachedImage(key);
        if (cached) {
            console.log(`✓ Using cached image for ${key}`);
            return cached;
        }
        
        try {
            console.log(`📥 Loading image for ${key} from: ${imageUrl.substring(0, 80)}...`);
            const img = await skiaLoadImage(imageUrl);
            console.log(`✓ Successfully loaded image for ${key} (${img.width}x${img.height})`);
            
            // Cache it
            this.cacheImage(key, img as any);
            
            return img;
        } catch (error) {
            console.error(`✗ Failed to load image for ${key}`);
            console.error(`   URL: ${imageUrl}`);
            console.error(`   Error:`, error);
            return null;
        }
    }

    /**
     * Load all images for a character rig using Skia Canvas
     */
    async loadAllRigImagesSkia(rigData: RigData): Promise<Record<string, any>> {
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
 * Main test function
 */
async function main() {
    try {
        console.log('🚀 Skia Canvas Test - Character Rig Renderer\n');
        
        // Parse command line arguments
        const args = process.argv.slice(2);
        const inputFile = args[0] || 'tank.json';
        const outputFile = args[1] || 'output.png';
        const width = parseInt(args[2]) || 1000;
        const height = parseInt(args[3]) || 1000;
        
        // Load rig data
        console.log('📥 Loading rig data...');
        const rigDataRaw = await readFile(inputFile, 'utf-8');
        const rigData: RigData = JSON.parse(rigDataRaw);
        console.log(`✓ Loaded rig data for: ${rigData.name || rigData.id}\n`);
        
        // Create image loader and load all images
        const imageLoader = new SkiaImageLoader();
        const loadedImages = await imageLoader.loadAllRigImagesSkia(rigData);
        console.log('');
        
        // Create Skia Canvas
        console.log('🎨 Creating canvas...');
        const canvas = new Canvas(width, height);
        console.log(`✓ Canvas created (${width}x${height})\n`);
        
        // Create renderer with the image loader
        const renderer = new CharacterRigRenderer(imageLoader);
        
        // Render the character using the renderer's render method
        console.log('🖌️  Rendering character...');
        const ctx = canvas.getContext('2d');
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Compute rig data
        const rigRenderData = renderer.computeCharacterRigData(rigData, {
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            cameraOffset: { x: 0, y: 0 },
            loadedImages: loadedImages as any
        });
        
        // Render all objects
        rigRenderData.objects.forEach(obj => {
            if (!obj.imageData) return;
            
            ctx.save();
            ctx.translate(obj.x, obj.y);
            ctx.rotate(obj.rotation);
            ctx.scale(obj.scaleX, obj.scaleY);
            
            const drawX = -obj.width * obj.anchorX;
            const drawY = -obj.height * obj.anchorY;
            ctx.drawImage(obj.imageData as any, drawX, drawY, obj.width, obj.height);
            
            ctx.restore();
        });
        
        // Draw pivot points
        rigRenderData.pivotPoints.forEach(pivot => {
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
        
        console.log('✓ Character rendered\n');
        
        // Save to file
        console.log(`💾 Saving to ${outputFile}...`);
        await canvas.saveAs(outputFile);
        console.log(`✓ Saved successfully!\n`);
        
        console.log('🎉 Done! Your character has been rendered to:', outputFile);
        
    } catch (error) {
        console.error('\n❌ Error:', error);
        process.exit(1);
    }
}

// Run the test
main();
