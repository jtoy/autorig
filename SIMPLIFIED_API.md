# Simplified API Guide

## Overview

The new simplified API reduces setup code from **~80 lines to just 3-5 lines** while still maintaining **full control** for advanced use cases.

## Quick Comparison

### Before (Original API)
```javascript
// Had to write custom P5ImageLoader adapter (25 lines)
// Had to write manual rendering loop (50 lines)
// Total: ~80 lines of custom code
```

### After (Simplified API)
```javascript
import { P5Renderer } from 'distark-render/p5';

const renderer = new P5Renderer(p);
await renderer.loadImages(rigData);
renderer.renderRig(rigData);
// Total: 3 lines!
```

---

## Browser Canvas (Already Simple)

The browser Canvas API was already simple and remains unchanged:

```javascript
import { CharacterRigRenderer, ImageLoader } from 'distark-render';

const imageLoader = new ImageLoader();
const renderer = new CharacterRigRenderer(imageLoader);
await renderer.render(canvas, rigData);
```

---

## p5.js Integration

### Simple Usage (Recommended for Most Cases)

```javascript
import { P5Renderer } from 'distark-render/p5';

const sketch = (p) => {
  let rigData;
  let renderer;

  p.setup = async function() {
    p.createCanvas(800, 800);

    rigData = await fetch('character.json').then(r => r.json());

    // Setup renderer and load images
    renderer = new P5Renderer(p);
    await renderer.loadImages(rigData);
  };

  p.draw = function() {
    if (!renderer.ready()) return;

    p.background(240);

    // One line to render!
    renderer.renderRig(rigData, {
      width: p.width,
      height: p.height
    });
  };
};

new p5(sketch);
```

### Advanced Usage (Full Control)

You have complete control to modify the rig data or render data:

```javascript
p.draw = function() {
  if (!renderer.ready()) return;

  p.background(240);

  // 🎨 Modify rig data before computing
  rigData.rotationValues.head = p.atan2(p.mouseY - p.height/2, p.mouseX - p.width/2) * 0.2;
  rigData.rotationValues.leftArm = p.sin(p.frameCount * 0.1) * 30;

  // 🎨 Compute render data
  const renderData = renderer.compute(rigData, {
    width: p.width,
    height: p.height
  });

  // 🎨 Modify individual parts
  renderData.objects.forEach(obj => {
    if (obj.name === 'head') {
      obj.scaleX *= 1.2;  // Make head bigger
      obj.scaleY *= 1.2;
    }

    if (obj.name === 'torso') {
      // Add breathing effect
      const breathe = 1 + p.sin(p.frameCount * 0.05) * 0.02;
      obj.scaleX *= breathe;
      obj.scaleY *= breathe;
    }
  });

  // 🎨 Render with modifications
  renderer.renderObjects(renderData.objects, true, renderData.pivotPoints);

  // 🎨 Add custom p5 effects
  const head = renderData.objects.find(obj => obj.name === 'head');
  if (head) {
    p.stroke(255, 0, 0);
    p.line(head.x, head.y, p.mouseX, p.mouseY);
  }
};
```

### P5Renderer API Reference

**Constructor**
```javascript
new P5Renderer(p5Instance, baseHost?)
```
- `p5Instance`: Your p5.js instance
- `baseHost`: Optional base URL for image loading

**Methods**
```javascript
await renderer.loadImages(rigData)        // Load all images
renderer.renderRig(rigData, options?, showPivots?)  // Simple render
const data = renderer.compute(rigData, options)  // Get render data
renderer.renderObjects(objects, showPivots?, pivotPoints?)  // Custom render
renderer.ready()                          // Check if loaded
renderer.getLoadedImages()                // Get image cache
```

---

## Skia Canvas (Node.js) Integration

### Simple Usage - One-Liner

```javascript
import { SkiaRenderer } from 'distark-render/skia';
import { readFile } from 'fs/promises';

const rigData = JSON.parse(await readFile('character.json', 'utf-8'));

const renderer = new SkiaRenderer();
await renderer.renderToFile('output.png', rigData, {
  canvasWidth: 1000,
  canvasHeight: 1000
});
```

### Advanced Usage - Full Control

```javascript
import { SkiaRenderer } from 'distark-render/skia';
import { readFile, writeFile } from 'fs/promises';

const rigData = JSON.parse(await readFile('character.json', 'utf-8'));

// Create renderer and load images
const renderer = new SkiaRenderer();
await renderer.loadImages(rigData);

// 🎨 Modify rig data
rigData.rotationValues.leftArm = 45;
rigData.rotationValues.head = 15;

// 🎨 Compute and modify render data
const renderData = renderer.compute(rigData, {
  canvasWidth: 1200,
  canvasHeight: 1200
});

renderData.objects.forEach(obj => {
  if (obj.name === 'head') {
    obj.scaleX *= 1.3;
    obj.scaleY *= 1.3;
  }
});

// 🎨 Render modified data to canvas
const canvas = await renderer.createCanvas(1200, 1200);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#f0f0f0';
ctx.fillRect(0, 0, canvas.width, canvas.height);

// Render with modifications
renderer.renderObjects(ctx, renderData.objects, true, renderData.pivotPoints);

// Save to file
const buffer = await canvas.toBuffer('image/png');
await writeFile('output.png', buffer);
```

### SkiaRenderer API Reference

**Constructor**
```javascript
new SkiaRenderer(baseHost?)
```
- `baseHost`: Optional base URL for image loading

**Methods**
```javascript
await renderer.loadImages(rigData)              // Load all images
await renderer.renderToFile(path, rigData, opts?)  // One-line render to file
await renderer.renderToBuffer(rigData, opts?, format?)  // Render to buffer
const canvas = await renderer.createCanvas(w, h)  // Create canvas
const data = renderer.compute(rigData, options)  // Get render data
renderer.renderToCanvas(canvas, rigData, opts?, showPivots?)  // Compute + render
renderer.renderObjects(ctx, objects, showPivots?, pivotPoints?)  // Render pre-computed data
renderer.ready()                                // Check if loaded
renderer.getLoadedImages()                      // Get image cache
```

---

## Package Exports

```javascript
// Core (browser Canvas)
import { CharacterRigRenderer, ImageLoader } from 'distark-render';
import type { RigData, RenderOptions } from 'distark-render/types';

// p5.js adapter
import { P5Renderer, P5ImageLoader } from 'distark-render/p5';

// Skia Canvas adapter (Node.js)
import { SkiaRenderer, SkiaImageLoader } from 'distark-render/skia';
```

---

## Examples

Run the examples:

```bash
# Build the project
npm run build

# Browser examples (start dev server)
npm run serve

# Then open:
# - http://localhost:8080/test.html (original browser example)
# - http://localhost:8080/test-p5-simple.html (simplified p5)
# - http://localhost:8080/test-p5-advanced.html (advanced p5 control)

# Node.js/Skia examples
npm run test-skia-simple          # Simplified one-liner
npm run test-skia-advanced        # Advanced with modifications
```

---

## Migration Guide

### Migrating from Original p5 API

**Before:**
```javascript
class P5ImageLoader extends ImageLoader { /* 25 lines */ }
const imageLoader = new P5ImageLoader(p);
const renderer = new CharacterRigRenderer(imageLoader);
// Manual rendering loop (50 lines)
```

**After:**
```javascript
import { P5Renderer } from 'distark-render/p5';
const renderer = new P5Renderer(p);
await renderer.loadImages(rigData);
renderer.renderRig(rigData);
```

### Migrating from Original Skia API

**Before:**
```javascript
class SkiaImageLoader extends ImageLoader { /* 65 lines */ }
// Manual image loading, canvas creation, rendering (75 lines total)
```

**After:**
```javascript
import { SkiaRenderer } from 'distark-render/skia';
const renderer = new SkiaRenderer();
await renderer.renderToFile('output.png', rigData, options);
```

---

## Key Benefits

✅ **Dramatically less code** - 3-5 lines instead of 75-80 lines
✅ **Easier to learn** - Simple API for common cases
✅ **Full control when needed** - Advanced API for custom effects
✅ **Type-safe** - Full TypeScript support
✅ **Same performance** - No overhead, just convenience wrappers
✅ **Backward compatible** - Original API still works

---

## Questions?

See the example files:
- `test-p5-simple.html` - Basic p5 usage
- `test-p5-advanced.html` - Advanced p5 control
- `test-skia-simple.ts` - Basic Skia usage
- `test-skia-advanced.ts` - Advanced Skia control
