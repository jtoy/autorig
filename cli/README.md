# distark-check

CLI tool for rig testing and video recording.

## Install

```bash
cd distark_render
npm run build
npm link
```

After code changes, run `npm run build` to recompile.

## Commands

### render

Render a rig JSON to PNG with an optional JSON report.

```bash
distark-check render rig.json -o output.png --width 800 --height 600 --report
```

Report includes: character bounds, centers, rotations, zIndex, visible parts, missing images, pivot points.

### verify

Math-based sanity checks on a rig (no rendering needed).

```bash
distark-check verify rig.json
distark-check verify rig.json --checks bounds,proportions
```

Available checks: `bounds`, `visibility`, `proportions`, `zorder` (default: all).

### animate

Render animation frames to numbered PNGs with a manifest.

```bash
distark-check animate rig.json animation.json -o frames/ --width 800 --height 600
```

Outputs `frame_000.png`, `frame_001.png`, ... plus `manifest.json` with per-frame bounds and deltas.

### diff

Pixel-diff two images.

```bash
distark-check diff before.png after.png -o diff.png --threshold 30
```

Outputs a diff image and JSON report with per-sector (3x3 grid) change percentages.

### query

Send an image or rig to Gemini for visual analysis.

```bash
distark-check query character.png --prompt "Describe this character"
distark-check query rig.json --prompt "Is the character properly proportioned?"
```

Pass `.json` files and they'll be auto-rendered before sending to Gemini.

Requires `GEMINI_API_KEY` env var.

### record

Send a world JSON to the orchestrator, record a video, and download it.

```bash
distark-check record world.json
distark-check record world.json --orc https://orchestrator.distark.com -o output.mp4 --timeout 300
```

Flow: POST world JSON -> poll status -> download video.

Defaults: orchestrator URL from `ORC_URL` env var or `https://orchestrator.distark.com`, timeout 300s.

## Environment Variables

| Variable | Used by | Description |
|---|---|---|
| `GEMINI_API_KEY` | `query` | Gemini API key for visual analysis |
| `ORC_URL` | `record` | Orchestrator URL (default: `https://orchestrator.distark.com`) |
