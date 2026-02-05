# Bug Fixes

## Issue 1: Tank Not Rendering (Only Pivot Points Visible)

**Problem:** Running `test-skia-simple` only showed pivot points, not the tank character.

**Root Cause:** Image keys weren't prefixed correctly. The renderer expects keys like:
- `imagePaths.head`, `imagePaths.torso`, etc.
- `eyes.leftIris`, `eyes.rightEyeImage`, etc.

But the SkiaImageLoader was using unprefixed keys like `head`, `torso`, etc.

**Fix:** Updated `SkiaImageLoader.loadAllRigImagesAsync()` to match the original test-skia.ts format:

```typescript
// ✅ Correct format
imagesToLoad.push({ key: `imagePaths.${key}`, hash });
imagesToLoad.push({ key: `eyes.${key}`, hash: value });
```

**Result:** Tank now renders correctly with all 32 images loaded.

---

## Issue 2: Advanced Example Rendering Wrong Angles/Shapes

**Problem:** `test-skia-advanced` modified the render data (e.g., made head bigger, changed arm rotations) but the output showed the original unmodified character.

**Root Cause:** The advanced example computed and modified render data:

```typescript
const renderData = renderer.compute(rigData, options);
renderData.objects.forEach(obj => {
    if (obj.name === 'head') {
        obj.scaleX *= 1.3;  // Modify computed data
    }
});
```

But then called `renderToCanvas()`, which **re-computed** the render data from scratch, ignoring all modifications!

```typescript
// ❌ This re-computes and ignores our modifications
renderer.renderToCanvas(canvas, rigData, options, true);
```

**Fix:** Added `renderObjects()` method to SkiaRenderer that renders pre-computed data directly:

```typescript
/**
 * Render pre-computed and modified render data
 */
renderObjects(ctx: any, objects: any[], showPivots?: boolean, pivotPoints?: any[]): void
```

Updated the advanced example to use it:

```typescript
// ✅ Render our modified data
const ctx = canvas.getContext('2d');
renderer.renderObjects(ctx, renderData.objects, true, renderData.pivotPoints);
```

**Result:** Advanced example now correctly shows:
- Character 1.2x bigger (dimension modifications)
- Head 1.3x bigger (scale modification)
- Left arm waving (rotation modifications)
- Head tilted (rotation modifications)

---

## Verification

### Simple Example
```bash
$ npm run test-skia-simple
✓ Loaded 32/32 images (0 failed)
✅ Saved to output-tank-simple.png (138K)
```
Shows tank in default pose.

### Advanced Example
```bash
$ npm run test-skia-advanced
✓ Loaded 32/32 images (0 failed)
📊 Render data has 19 objects
  ✏️  Made head bigger: 1.30x
  ✏️  Detected arm part: leftForearm
✅ Saved to output-tank-advanced.png (230K)
```
Shows tank with modifications:
- Waving left arm
- Tilted head
- 1.2x bigger body
- 1.3x bigger head

File size increased from 199K → 230K due to larger character size.

---

## Pattern for Advanced Control

### ❌ Wrong (modifications ignored)
```javascript
const renderData = renderer.compute(rigData);
renderData.objects[0].scaleX *= 2;  // Modify

// This re-computes and ignores modifications!
renderer.renderToCanvas(canvas, rigData);
```

### ✅ Correct (modifications applied)
```javascript
const renderData = renderer.compute(rigData);
renderData.objects[0].scaleX *= 2;  // Modify

const ctx = canvas.getContext('2d');
// Render the modified data directly
renderer.renderObjects(ctx, renderData.objects);
```

---

## API Updates

### SkiaRenderer - New Method

**`renderObjects(ctx, objects, showPivots?, pivotPoints?)`**
- Renders pre-computed render data
- Use when you want to modify transforms/scales before rendering
- Does NOT re-compute - renders exactly what you give it

**`renderToCanvas(canvas, rigData, options?, showPivots?)`**
- Computes render data and renders it
- Use for simple rendering without modifications
- Always re-computes from rigData

---

## Same Pattern for P5Renderer

The P5Renderer already had this pattern correct:

```javascript
// Compute
const renderData = renderer.compute(rigData, options);

// Modify
renderData.objects.forEach(obj => {
    if (obj.name === 'head') obj.scaleX *= 2;
});

// Render modified data
renderer.renderObjects(renderData.objects, showPivots, renderData.pivotPoints);
```

Or use the simple one-liner if no modifications needed:

```javascript
renderer.renderRig(rigData, options);  // Computes + renders
```

Both patterns now work consistently across p5 and Skia!
