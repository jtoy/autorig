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


