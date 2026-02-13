/**
 * Image Loading Module
 * Handles loading images from MD5 hashes or URLs with caching support
 */

import type { ImageLoadCallback, ImageErrorCallback, RigData } from '../types.js';

/**
 * ImageLoader class - Handles loading and caching images for character rigs
 */
export class ImageLoader {
    private baseHost: string;
    private imageCache: Map<string, HTMLImageElement>;

    /**
     * Creates a new ImageLoader instance
     * @param baseHost - The base URL for the API (default: 'https://orchestrator.distark.com')
     */
    constructor(baseHost: string = 'https://orchestrator.distark.com') {
        this.baseHost = baseHost;
        this.imageCache = new Map();
    }

    /**
     * Set the base host for image loading
     * @param host - The base URL for the API
     */
    setBaseHost(host: string): void {
        this.baseHost = host;
    }

    /**
     * Get the current base host
     * @returns The current base host URL
     */
    getBaseHost(): string {
        return this.baseHost;
    }

    /**
     * Resolve an image source (hash or URL) to a full URL
     * @param imageData - Image hash, URL, or data URL
     * @returns Full URL or null if invalid
     */
    resolveImageSource(imageData: string | null | undefined): string | null {
        if (!imageData || typeof imageData !== 'string') {
            return null;
        }
        
        // Check if it's an MD5 hash (32-character hex string)
        const md5Regex = /^[a-f0-9]{32}$/i;
        if (md5Regex.test(imageData)) {
            return `${this.baseHost}/api/v1/artifacts/${imageData}`;
        }
        
        // Check if it's a truncated hash (ends with ...)
        const truncatedHashRegex = /^[a-f0-9]{20,31}\.{3}$/i;
        if (truncatedHashRegex.test(imageData)) {
            const hash = imageData.replace(/\.{3}$/, '');
            console.warn(`Truncated hash detected for ${imageData}, attempting to load with partial hash`);
            return `${this.baseHost}/api/v1/artifacts/${hash}`;
        }
        
        // Return as-is for URLs and data URLs
        if (imageData.startsWith('http://') || 
            imageData.startsWith('https://') || 
            imageData.startsWith('data:')) {
            return imageData;
        }
        
        return null;
    }

    /**
     * Load an image from a URL/hash and invoke callbacks
     * @param key - Unique key for the image
     * @param imageData - Image hash or URL
     * @param onLoad - Callback when image loads successfully
     * @param onError - Callback when image fails to load (optional)
     */
    loadImage(
        key: string,
        imageData: string | null | undefined,
        onLoad?: ImageLoadCallback,
        onError?: ImageErrorCallback
    ): void {
        const imageUrl = this.resolveImageSource(imageData);
        
        if (!imageUrl) {
            console.warn(`Could not resolve image source for ${key}: ${imageData}`);
            if (onError) {
                onError(key, 'Invalid image source');
            }
            return;
        }
        
        console.log(`📥 Loading image for ${key} from: ${imageUrl.substring(0, 100)}...`);
        
        const img = new Image();
        img.crossOrigin = 'anonymous'; // Enable CORS
        
        img.onload = (): void => {
            console.log(`✓ Successfully loaded image for ${key} (${img.width}x${img.height})`);
            if (onLoad) {
                onLoad(key, img);
            }
        };
        
        img.onerror = (err: Event | string): void => {
            console.error(`✗ Failed to load image for ${key}`);
            console.error(`   URL: ${imageUrl}`);
            console.error(`   Error:`, err);
            if (onError) {
                onError(key, err);
            }
        };
        
        img.src = imageUrl;
    }

    /**
     * Load multiple images in parallel
     * @param imagesToLoad - Array of {key, hash} objects
     * @param onProgress - Optional callback for progress updates
     * @returns Promise that resolves with loaded images map
     */
    async loadImages(
        imagesToLoad: Array<{ key: string; hash: string }>,
        onProgress?: (loaded: number, total: number, failed: number) => void
    ): Promise<Record<string, HTMLImageElement>> {
        const loadedImages: Record<string, HTMLImageElement> = {};
        let loaded = 0;
        let failed = 0;
        const total = imagesToLoad.length;

        const loadPromises = imagesToLoad.map(({ key, hash }) => {
            return new Promise<void>((resolve) => {
                this.loadImage(
                    key,
                    hash,
                    (loadedKey, img) => {
                        loadedImages[loadedKey] = img;
                        loaded++;
                        if (onProgress) {
                            onProgress(loaded, total, failed);
                        }
                        resolve();
                    },
                    () => {
                        failed++;
                        if (onProgress) {
                            onProgress(loaded, total, failed);
                        }
                        resolve();
                    }
                );
            });
        });

        await Promise.all(loadPromises);
        return loadedImages;
    }

    /**
     * Get the image cache
     * @returns The image cache Map
     */
    getImageCache(): Map<string, HTMLImageElement> {
        return this.imageCache;
    }

    /**
     * Clear the image cache
     */
    clearImageCache(): void {
        this.imageCache.clear();
        console.log('🗑️ Image cache cleared');
    }

    /**
     * Get image from cache or return undefined
     * @param key - Image key
     */
    getCachedImage(key: string): HTMLImageElement | undefined {
        return this.imageCache.get(key);
    }

    /**
     * Manually add image to cache
     * @param key - Image key
     * @param image - Image element
     */
    cacheImage(key: string, image: HTMLImageElement): void {
        this.imageCache.set(key, image);
    }

    /**
     * Load image with caching support
     * Checks cache first, only loads if not cached
     */
    loadImageWithCache(
        key: string,
        imageData: string | null | undefined,
        onLoad?: ImageLoadCallback,
        onError?: ImageErrorCallback
    ): void {
        // Check cache first
        const cached = this.imageCache.get(key);
        if (cached) {
            console.log(`✓ Using cached image for ${key}`);
            if (onLoad) {
                onLoad(key, cached);
            }
            return;
        }

        // Not in cache, load it
        this.loadImage(
            key,
            imageData,
            (loadedKey, img) => {
                // Add to cache
                this.imageCache.set(loadedKey, img);
                console.log(`💾 Cached image for ${loadedKey}`);
                if (onLoad) {
                    onLoad(loadedKey, img);
                }
            },
            onError
        );
    }

    /**
     * Load all images for a character rig and populate the cache
     * CRITICAL: Images are cached by their ACTUAL PATH (hash/URL), not semantic keys!
     * This prevents overwriting when switching between variations with different images.
     * 
     * @param rigData - Character rig data
     * @param useCache - Whether to use existing cache (default: true)
     * @param onProgress - Progress callback
     * @returns Promise that resolves with the image cache as a plain object (indexed by actual paths)
     */
    async loadAllRigImages(
        rigData: RigData,
        useCache: boolean = true,
        onProgress?: (loaded: number, total: number, failed: number) => void
    ): Promise<Record<string, HTMLImageElement>> {
        const imagesToLoad: Array<{ hash: string }> = [];
        
        // Collect all image paths from imagePaths
        // CHANGED: We now ONLY track the actual path/hash, not semantic keys
        if (rigData.imagePaths) {
            for (const [, hash] of Object.entries(rigData.imagePaths)) {
                if (hash && typeof hash === 'string' && !hash.includes('[MEDIA_REMOVED]')) {
                    // Check if this actual path is already cached
                    const alreadyCached = this.imageCache.get(hash);
                    if (!useCache || !alreadyCached) {
                        // Not cached - need to load it (but only add once per unique hash)
                        if (!imagesToLoad.find(item => item.hash === hash)) {
                            imagesToLoad.push({ hash });
                        }
                    }
                }
            }
        }
        
        // Collect all eye images
        if (rigData.eyes) {
            for (const [eyeKey, value] of Object.entries(rigData.eyes)) {
                if (typeof value === 'string' && !value.includes('[MEDIA_REMOVED]') && 
                    (eyeKey.includes('Image') || eyeKey.includes('Iris') || eyeKey.includes('Lid'))) {
                    const hash = value;
                    
                    // Check if this actual path is already cached
                    const alreadyCached = this.imageCache.get(hash);
                    if (!useCache || !alreadyCached) {
                        // Not cached - need to load it (but only add once per unique hash)
                        if (!imagesToLoad.find(item => item.hash === hash)) {
                            imagesToLoad.push({ hash });
                        }
                    }
                }
            }
        }
        
        // Collect all mouth images from rigData.mouth
        if ((rigData as any).mouth) {
            for (const [_mouthKey, value] of Object.entries((rigData as any).mouth)) {
                if (typeof value === 'string' && !value.includes('[MEDIA_REMOVED]')) {
                    const hash = value;
                    
                    // Check if this actual path is already cached
                    const alreadyCached = this.imageCache.get(hash);
                    if (!useCache || !alreadyCached) {
                        // Not cached - need to load it (but only add once per unique hash)
                        if (!imagesToLoad.find(item => item.hash === hash)) {
                            imagesToLoad.push({ hash });
                        }
                    }
                }
            }
        }
        
        console.log(`📦 Loading ${imagesToLoad.length} images for character rig...`);
        
        let loaded = 0;
        let failed = 0;
        const total = imagesToLoad.length;
        
        // If nothing to load, return cache immediately
        if (total === 0) {
            console.log('✓ All images already cached!');
            const result: Record<string, HTMLImageElement> = {};
            this.imageCache.forEach((img, key) => {
                result[key] = img;
            });
            console.log('📦 Image Cache (indexed by actual paths):', Object.keys(result).map(k => k.substring(0, 50)));
            return result;
        }
        
        const loadPromises = imagesToLoad.map(({ hash }) => {
            return new Promise<void>((resolve) => {
                // Double-check cache (might have been added by another concurrent load)
                const hashCached = this.imageCache.get(hash);
                if (hashCached) {
                    console.log(`✓ Already cached: ${hash.substring(0, 50)}...`);
                    loaded++;
                    if (onProgress) {
                        onProgress(loaded, total, failed);
                    }
                    resolve();
                    return;
                }
                
                // Not in cache, load it now
                // CRITICAL: Use the actual path/hash as the cache key!
                this.loadImage(
                    hash,  // ← Cache key is the actual path, not a semantic key!
                    hash,  // ← Load from this path
                    (cacheKey, img) => {
                        // Cache ONLY by actual path (hash/URL)
                        // DO NOT cache by semantic keys like "imagePaths.head"
                        this.imageCache.set(cacheKey, img);
                        console.log(`💾 Cached image by path: ${cacheKey.substring(0, 50)}... (${img.width}x${img.height})`);
                        loaded++;
                        if (onProgress) {
                            onProgress(loaded, total, failed);
                        }
                        resolve();
                    },
                    (cacheKey, error) => {
                        console.error(`❌ Failed to load: ${cacheKey.substring(0, 50)}...`, error);
                        failed++;
                        if (onProgress) {
                            onProgress(loaded, total, failed);
                        }
                        resolve();
                    }
                );
            });
        });
        
        await Promise.all(loadPromises);
        
        console.log(`✓ Loaded ${loaded}/${total} images (${failed} failed)`);
        
        // Return cache as plain object (indexed by actual paths)
        const result: Record<string, HTMLImageElement> = {};
        this.imageCache.forEach((img, key) => {
            result[key] = img;
        });
        
        console.log('📦 Image Cache (indexed by actual paths):', Object.keys(result).map(k => k.substring(0, 50)));
        
        return result;
    }
}

// Export a default instance for backwards compatibility
export const defaultImageLoader = new ImageLoader();
