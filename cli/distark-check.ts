#!/usr/bin/env node
/**
 * distark-check - CLI tool for LLM-driven rig testing
 *
 * Commands:
 *   render   <rig.json>                    Render rig to PNG + JSON report
 *   verify   <rig.json>                    Math-based sanity checks (no rendering)
 *   animate  <rig.json> <animation.json>   Render animation frames + manifest
 *   diff     <before.png> <after.png>      Pixel-diff two images
 *   query    <image|rig> --prompt "..."     Send to Gemini for visual analysis
 */

import { runRender } from './render.js';
import { runVerify } from './verify.js';
import { runAnimate } from './animate.js';
import { runDiff } from './diff.js';
import { runQuery } from './query.js';
import { runRecord } from './record.js';
import { runTest } from './test.js';

const USAGE = `distark-check - CLI tool for LLM-driven rig testing

Commands:
  render   <rig.json> [-o out.png] [--width N] [--height N] [--report]
  verify   <rig.json> [--checks all|bounds,visibility,proportions,zorder]
  animate  <rig.json> <animation.json> [-o frames/] [--width N] [--height N]
  diff     <before.png> <after.png> [-o diff.png] [--threshold N]
  query    <image.png|rig.json> --prompt "..." [-o report.json]
  test     <rig.json|image|video> --prompt "..." [--tries N] [-o report.json]
  record   <world.json> [--orc https://orchestrator.distark.com] [-o out.mp4] [--timeout 300]

Environment:
  GEMINI_API_KEY    Required for 'query' and 'test' commands
  ORC_URL           Orchestrator URL for 'record' command (default: http://localhost:3000)
`;

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const command = args[0];
    const commandArgs = args.slice(1);

    switch (command) {
        case 'render':
            await runRender(commandArgs);
            break;
        case 'verify':
            await runVerify(commandArgs);
            break;
        case 'animate':
            await runAnimate(commandArgs);
            break;
        case 'diff':
            await runDiff(commandArgs);
            break;
        case 'query':
            await runQuery(commandArgs);
            break;
        case 'record':
            await runRecord(commandArgs);
            break;
        case 'test':
            await runTest(commandArgs);
            break;
        default:
            console.log(USAGE);
            process.exit(command ? 1 : 0);
    }
}

main().catch(err => {
    console.error(err.message || err);
    process.exit(1);
});
