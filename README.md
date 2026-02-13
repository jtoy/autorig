# Distark Render

Rendering-agnostic character rig system with TypeScript. Render 2D character rigs to HTML Canvas with automatic image loading and caching.

## Installation

```bash
npm install distark-render
```

## Usage

### Browser (ES Modules)

```html
<canvas id="canvas" width="800" height="800"></canvas>

<script type="module">
  import { ImageLoader, CharacterRigRenderer } from 'https://unpkg.com/distark-render';

  const imageLoader = new ImageLoader();
  const renderer = new CharacterRigRenderer(imageLoader);
  const canvas = document.getElementById('canvas');

  // Load character data
  const characterData = await fetch('character.json').then(r => r.json());

  // Render to canvas
  await renderer.render(canvas, characterData);
</script>
```

### Node.js

```javascript
import { ImageLoader, CharacterRigRenderer } from 'distark-render';

const imageLoader = new ImageLoader();
const renderer = new CharacterRigRenderer(imageLoader);
const canvas = document.getElementById('canvas');
const characterData = await fetch('character.json').then(r => r.json());
await renderer.render(canvas, characterData);
```

## Features

- 🎨 Rendering-agnostic architecture
- 🖼️ Automatic image loading and caching
- 🔄 Support for MD5 hashes and direct URLs
- 👁️ Eye and mouth animation systems
- ⚡ TypeScript support with full type definitions
- 🌐 Works in browser and Node.js

## Testing with Command Line

You can quickly test character rigs from the command line using the built-in test script:

```bash
# Build the project first
npm run build

# Run test-skia with default settings (renders tank.json)
npm run test-skia

# Or run directly with custom parameters:
node dist/tests/test-skia.js [input.json] [output.png] [width] [height]

# Examples:
node dist/tests/test-skia.js tank.json output.png 1000 1000
node dist/tests/test-skia.js character.json render.png 800 600
```

**Parameters:**
- `input.json` - Path to your character rig JSON file (default: `assets/tank.json`)
- `output.png` - Output image filename (default: `output-tank.png`)
- `width` - Canvas width in pixels (default: `1000`)
- `height` - Canvas height in pixels (default: `1000`)

The test script will:
1. Load your character rig JSON
2. Automatically fetch and cache all images
3. Render the character to a PNG file
4. Show pivot points for debugging

## API

### ImageLoader

Handles loading images from URLs or MD5 hashes with automatic caching.

```typescript
const imageLoader = new ImageLoader(baseHost?: string);
```

### CharacterRigRenderer

Renders character rigs to canvas.

```typescript
const renderer = new CharacterRigRenderer(imageLoader?: ImageLoader);
await renderer.render(canvas, rigData, loadedImages?, cameraOffset?, showPivotPoints?);
```


