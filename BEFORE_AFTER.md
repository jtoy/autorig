# Before & After: API Simplification

## The Problem

Using p5.js or Skia Canvas required writing **75-80 lines of custom boilerplate code** for each engine.

---

## p5.js Example

### ❌ BEFORE (test-p5.html - 192 lines total, ~80 custom code)

```javascript
import { ImageLoader } from './dist/modules/imageLoad.js';
import { CharacterRigRenderer } from './dist/modules/renderRig.js';

// ❌ Had to write custom adapter class (25 lines)
class P5ImageLoader extends ImageLoader {
    constructor(p5Instance) {
        super();
        this.p5 = p5Instance;
    }

    loadImage(key, imageData, onLoad, onError) {
        const imageUrl = this.resolveImageSource(imageData);

        if (!imageUrl) {
            console.warn(`Could not resolve image source for ${key}: ${imageData}`);
            if (onError) onError(key, 'Invalid image source');
            return;
        }

        const cached = this.getCachedImage(key);
        if (cached) {
            if (onLoad) onLoad(key, cached);
            return;
        }

        this.p5.loadImage(
            imageUrl,
            (img) => {
                this.cacheImage(key, img);
                if (onLoad) onLoad(key, img);
            },
            (err) => {
                console.error(`✗ Failed to load ${key}:`, err);
                if (onError) onError(key, err);
            }
        );
    }
}

// ❌ Had to write manual p5 sketch setup (50+ lines)
const sketch = (p) => {
    let rigData;
    let loadedImages;
    let renderer;
    let imageLoader;
    let isLoaded = false;

    p.setup = async function() {
        const canvas = p.createCanvas(800, 800);
        canvas.parent('canvas-container');
        p.background(240);

        try {
            imageLoader = new P5ImageLoader(p);
            renderer = new CharacterRigRenderer(imageLoader);

            const response = await fetch('tank.json');
            rigData = await response.json();

            loadedImages = await imageLoader.loadAllRigImages(rigData);
            isLoaded = true;
            p.redraw();
        } catch (error) {
            console.error('❌ Failed to load:', error);
        }
    };

    p.draw = function() {
        p.background(240);

        // ❌ Manual rendering loop (20+ lines)
        const rigRenderData = renderer.computeCharacterRigData(rigData, {
            canvasWidth: p.width,
            canvasHeight: p.height,
            cameraOffset: { x: 0, y: 0 },
            loadedImages: loadedImages
        });

        rigRenderData.objects.forEach(obj => {
            if (!obj.imageData) return;

            p.push();
            p.translate(obj.x, obj.y);
            p.rotate(obj.rotation);
            p.scale(obj.scaleX, obj.scaleY);

            const drawX = -obj.width * obj.anchorX;
            const drawY = -obj.height * obj.anchorY;
            p.image(obj.imageData, drawX, drawY, obj.width, obj.height);
            p.pop();
        });

        p.noLoop();
    };
};

new p5(sketch);
```

### ✅ AFTER (test-p5-simple.html - 62 lines total, ~15 custom code)

```javascript
import { P5Renderer } from './dist/modules/adapters/p5Renderer.js';

const sketch = (p) => {
    let rigData;
    let renderer;

    p.setup = async function() {
        p.createCanvas(800, 800);

        rigData = await fetch('tank.json').then(r => r.json());

        // ✅ Only 2 lines to set up!
        renderer = new P5Renderer(p);
        await renderer.loadImages(rigData);
    };

    p.draw = function() {
        if (!renderer.ready()) return;

        p.background(240);

        // ✅ One line to render!
        renderer.renderRig(rigData, {
            width: p.width,
            height: p.height
        }, true);  // true = show pivot points

        p.noLoop();
    };
};

new p5(sketch);
```

**Reduction: 192 lines → 62 lines (68% total reduction)**
**Custom code: 80 lines → 15 lines (81% reduction)**

---

## Skia Canvas (Node.js) Example

### ❌ BEFORE (test-skia.ts - 211 lines total, ~75 custom code)

```javascript
import { ImageLoader } from './modules/imageLoad.js';
import { CharacterRigRenderer } from './modules/renderRig.js';
import { loadImage as skiaLoadImage } from 'skia-canvas';

// ❌ Had to write custom adapter class (65 lines)
class SkiaImageLoader extends ImageLoader {
    async loadImageAsync(key: string, imageData: string): Promise<any> {
        const imageUrl = this.resolveImageSource(imageData);
        if (!imageUrl) {
            throw new Error(`Could not resolve image source for ${key}: ${imageData}`);
        }

        const cached = this.getCachedImage(key);
        if (cached) return cached;

        const img = await skiaLoadImage(imageUrl);
        this.cacheImage(key, img);
        return img;
    }

    async loadAllRigImagesSkia(rigData: RigData): Promise<Record<string, any>> {
        const imageMap: Record<string, any> = {};
        const imagePaths = rigData.imagePaths || {};
        const imageKeys = new Set<string>();

        // Collect all image keys...
        for (const [key, path] of Object.entries(imagePaths)) {
            if (path && typeof path === 'string') {
                imageKeys.add(key);
            }
        }

        // Eye images...
        if (rigData.eyes) {
            // ... more collection logic
        }

        // Load all images in parallel
        const loadPromises = Array.from(imageKeys).map(async (key) => {
            try {
                const img = await this.loadImageAsync(key, imagePaths[key]);
                imageMap[key] = img;
            } catch (error) {
                console.error(`Failed to load image ${key}:`, error);
            }
        });

        await Promise.all(loadPromises);
        return imageMap;
    }
}

// ❌ Had to write CLI setup and manual rendering (75+ lines)
async function main() {
    const args = process.argv.slice(2);
    const inputFile = args[0] || 'tank.json';
    const outputFile = args[1] || 'output.png';
    const width = parseInt(args[2]) || 1000;
    const height = parseInt(args[3]) || 1000;

    const rigData = JSON.parse(await readFile(inputFile, 'utf-8'));

    const imageLoader = new SkiaImageLoader();
    const renderer = new CharacterRigRenderer(imageLoader);

    const loadedImages = await imageLoader.loadAllRigImagesSkia(rigData);

    const { createCanvas } = await import('skia-canvas');
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, height);

    const rigRenderData = renderer.computeCharacterRigData(rigData, {
        canvasWidth: width,
        canvasHeight: height,
        cameraOffset: { x: 0, y: 0 },
        loadedImages
    });

    // ❌ Manual rendering loop (30+ lines)
    rigRenderData.objects.forEach(obj => {
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

    const buffer = await canvas.toBuffer('image/png');
    await writeFile(outputFile, buffer);
}

main().catch(console.error);
```

### ✅ AFTER (test-skia-simple.ts - 36 lines total, ~10 custom code)

```javascript
import { SkiaRenderer } from './modules/adapters/skiaRenderer.js';
import { readFile } from 'fs/promises';

async function main() {
    const args = process.argv.slice(2);
    const inputFile = args[0] || 'tank.json';
    const outputFile = args[1] || 'output.png';
    const width = parseInt(args[2]) || 1000;
    const height = parseInt(args[3]) || 1000;

    const rigData = JSON.parse(await readFile(inputFile, 'utf-8'));

    // ✅ One-liner to render!
    const renderer = new SkiaRenderer();
    await renderer.renderToFile(outputFile, rigData, {
        canvasWidth: width,
        canvasHeight: height,
        showPivots: true
    });

    console.log(`✅ Saved to ${outputFile}`);
}

main().catch(console.error);
```

**Reduction: 211 lines → 36 lines (83% total reduction)**
**Custom code: 75 lines → 10 lines (87% reduction)**

---

## Advanced Control - Still Available!

### Modify Rig Data Before Rendering

```javascript
// Make character wave
rigData.rotationValues.leftArm = 45;
rigData.rotationValues.leftForearm = -30;

// Flip character
rigData.flipX = true;

// Make head follow mouse (p5)
const mouseAngle = p.atan2(p.mouseY - p.height/2, p.mouseX - p.width/2);
rigData.rotationValues.head = mouseAngle * 0.2;
```

### Modify Render Data After Computing

```javascript
// Get computed render data
const renderData = renderer.compute(rigData, options);

// Modify individual parts
renderData.objects.forEach(obj => {
    if (obj.name === 'head') {
        obj.scaleX *= 1.2;  // Make head bigger
        obj.rotation += 0.1; // Rotate head
    }

    if (obj.name === 'torso') {
        // Add breathing effect
        const breathe = 1 + Math.sin(time * 0.05) * 0.02;
        obj.scaleX *= breathe;
        obj.scaleY *= breathe;
    }
});

// Render with modifications
renderer.renderObjects(renderData.objects);
```

### Access Individual Body Parts

```javascript
const renderData = renderer.compute(rigData);

// Find specific parts
const head = renderData.objects.find(obj => obj.name === 'head');
const leftHand = renderData.objects.find(obj => obj.name === 'leftHand');

// Custom physics, collision detection, effects
if (distance(mouseX, mouseY, head.x, head.y) < head.width / 2) {
    // Head is being hovered
    head.scaleX = head.scaleY = 1.2;
}
```

---

## Summary

| Aspect | Before | After | Improvement |
|--------|--------|-------|-------------|
| **p5 Total Lines** | 192 | 62 | **68% reduction** |
| **p5 Custom Code** | 80 | 15 | **81% reduction** |
| **Skia Total Lines** | 211 | 36 | **83% reduction** |
| **Skia Custom Code** | 75 | 10 | **87% reduction** |
| **Setup Complexity** | Write adapters + loops | 2-3 lines | **~96% simpler** |
| **Control** | Full | Full | **No change** |
| **Learning Curve** | Steep | Gentle | **Much easier** |

---

## How to Use

### Browser Canvas (unchanged)
```javascript
import { CharacterRigRenderer, ImageLoader } from 'distark-render';
const renderer = new CharacterRigRenderer(new ImageLoader());
await renderer.render(canvas, rigData);
```

### p5.js (NEW!)
```javascript
import { P5Renderer } from 'distark-render/p5';
const renderer = new P5Renderer(p);
await renderer.loadImages(rigData);
renderer.renderRig(rigData);
```

### Skia/Node.js (NEW!)
```javascript
import { SkiaRenderer } from 'distark-render/skia';
const renderer = new SkiaRenderer();
await renderer.renderToFile('output.png', rigData, options);
```

**See `SIMPLIFIED_API.md` for complete documentation.**
