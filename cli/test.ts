/**
 * test command - Run a pass/fail visual assertion against a rig, image, or video
 *
 * Usage:
 *   distark-check test <rig.json> --prompt "Does the character have both eyes visible?" [--tries 2]
 *   distark-check test <image.png> --prompt "Are both arms visible?"
 *   distark-check test <video.mp4> --prompt "Does the character wave its hand?"
 *
 * Exit code 0 = pass, 1 = fail
 * Requires GEMINI_API_KEY environment variable.
 */

import { readFile, writeFile } from 'fs/promises';
import { renderRigToBuffer, callGemini } from './shared.js';

interface TestReport {
    input: string;
    prompt: string;
    pass: boolean;
    reason: string;
    attempts: number;
    tries: number;
}

const VIDEO_EXTENSIONS = ['.mp4', '.webm'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

function getMimeType(file: string): string {
    if (file.endsWith('.mp4')) return 'video/mp4';
    if (file.endsWith('.webm')) return 'video/webm';
    if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
    return 'image/png';
}

function isVideo(file: string): boolean {
    return VIDEO_EXTENSIONS.some(ext => file.endsWith(ext));
}

function isImage(file: string): boolean {
    return IMAGE_EXTENSIONS.some(ext => file.endsWith(ext));
}

function parsePassFail(response: string): { pass: boolean; reason: string } {
    // Strip markdown code fences if present
    let cleaned = response.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    try {
        const parsed = JSON.parse(cleaned);
        return {
            pass: !!parsed.pass,
            reason: parsed.reason || '',
        };
    } catch {
        // Fallback: look for pass/fail keywords
        const lower = response.toLowerCase();
        const pass = lower.includes('"pass": true') || lower.includes('"pass":true');
        return {
            pass,
            reason: response.slice(0, 200),
        };
    }
}

export async function runTest(args: string[]): Promise<void> {
    const positional = args.filter(a => !a.startsWith('-') && !a.startsWith('--'));
    const inputFile = positional[0];

    if (!inputFile) {
        console.error('Usage: distark-check test <rig.json|image|video> --prompt "..." [--tries N]');
        process.exit(1);
    }

    const promptIdx = args.indexOf('--prompt');
    if (promptIdx === -1 || !args[promptIdx + 1]) {
        console.error('--prompt is required');
        process.exit(1);
    }
    const userPrompt = args[promptIdx + 1];

    const triesIdx = args.indexOf('--tries');
    const tries = triesIdx !== -1 ? parseInt(args[triesIdx + 1]) || 1 : 1;

    const width = parseInt(args[args.indexOf('--width') + 1]) || 1000;
    const height = parseInt(args[args.indexOf('--height') + 1]) || 1000;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('GEMINI_API_KEY environment variable is required');
        process.exit(1);
    }

    // Load media
    let mediaBase64: string;
    let mimeType: string;

    if (inputFile.endsWith('.json')) {
        console.error(`Rendering ${inputFile} to image...`);
        const buf = await renderRigToBuffer(inputFile, width, height);
        mediaBase64 = Buffer.from(buf).toString('base64');
        mimeType = 'image/png';
    } else if (isVideo(inputFile) || isImage(inputFile)) {
        const buf = await readFile(inputFile);
        mediaBase64 = Buffer.from(buf).toString('base64');
        mimeType = getMimeType(inputFile);
    } else {
        console.error(`Unsupported file type: ${inputFile}`);
        process.exit(1);
    }

    const mediaLabel = isVideo(inputFile) ? 'video' : 'image';
    const wrappedPrompt = [
        `Answer the following yes/no question about this ${mediaLabel}.`,
        `Respond ONLY with JSON: {"pass": true, "reason": "brief explanation"} or {"pass": false, "reason": "brief explanation"}`,
        ``,
        `Question: ${userPrompt}`,
    ].join('\n');

    let pass = false;
    let reason = '';
    let attempt = 0;

    for (attempt = 1; attempt <= tries; attempt++) {
        console.error(`Attempt ${attempt}/${tries}: querying Gemini...`);
        const response = await callGemini(mediaBase64, mimeType, wrappedPrompt, apiKey);
        const result = parsePassFail(response);
        pass = result.pass;
        reason = result.reason;

        console.error(`  Result: ${pass ? 'PASS' : 'FAIL'} - ${reason}`);

        if (pass) break;
    }

    const report: TestReport = {
        input: inputFile,
        prompt: userPrompt,
        pass,
        reason,
        attempts: attempt,
        tries,
    };

    const outIdx = args.indexOf('-o');
    if (outIdx !== -1 && args[outIdx + 1]) {
        await writeFile(args[outIdx + 1], JSON.stringify(report, null, 2));
        console.error(`Saved: ${args[outIdx + 1]}`);
    }

    console.log(JSON.stringify(report, null, 2));

    process.exit(pass ? 0 : 1);
}
