/**
 * query command - Send a rendered image to Gemini for visual analysis
 *
 * Usage:
 *   distark-check query <image.png> --prompt "Does the character look natural?"
 *   distark-check query <rig.json> --prompt "Describe the character pose"
 *
 * Requires GEMINI_API_KEY environment variable.
 * Uses gemini-2.5-flash model.
 */

import { readFile, writeFile } from 'fs/promises';
import { SkiaRenderer } from '../modules/adapters/skiaRenderer.js';
import type { RigData } from '../types.js';

interface QueryReport {
    input: string;
    model: string;
    prompt: string;
    response: string;
}

async function renderRigToBuffer(rigFile: string, width: number, height: number): Promise<Buffer> {
    const rigData: RigData = JSON.parse(await readFile(rigFile, 'utf-8'));
    // Redirect console.log to stderr during image loading
    const origLog = console.log;
    console.log = (...a: unknown[]) => console.error(...a);
    const renderer = new SkiaRenderer();
    const buf = await renderer.renderToBuffer(rigData, { canvasWidth: width, canvasHeight: height });
    console.log = origLog;
    return buf;
}

async function callGemini(imageBase64: string, mimeType: string, prompt: string, apiKey: string): Promise<string> {
    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body = {
        contents: [{
            parts: [
                {
                    inline_data: {
                        mime_type: mimeType,
                        data: imageBase64,
                    },
                },
                {
                    text: prompt,
                },
            ],
        }],
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
        },
    };

    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Gemini API error (${resp.status}): ${errText}`);
    }

    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        throw new Error(`Unexpected Gemini response: ${JSON.stringify(data)}`);
    }
    return text;
}

export async function runQuery(args: string[]): Promise<void> {
    const positional = args.filter(a => !a.startsWith('-') && !a.startsWith('--'));
    const inputFile = positional[0];

    if (!inputFile) {
        console.error('Usage: distark-check query <image.png|rig.json> --prompt "..."');
        process.exit(1);
    }

    const promptIdx = args.indexOf('--prompt');
    if (promptIdx === -1 || !args[promptIdx + 1]) {
        console.error('--prompt is required');
        process.exit(1);
    }
    const prompt = args[promptIdx + 1];
    const width = parseInt(args[args.indexOf('--width') + 1]) || 1000;
    const height = parseInt(args[args.indexOf('--height') + 1]) || 1000;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('GEMINI_API_KEY environment variable is required');
        process.exit(1);
    }

    // If input is JSON, render it first; if PNG, read directly
    let imageBuffer: Buffer;
    let mimeType: string;

    if (inputFile.endsWith('.json')) {
        console.error(`Rendering ${inputFile} to image...`);
        imageBuffer = await renderRigToBuffer(inputFile, width, height);
        mimeType = 'image/png';
    } else {
        imageBuffer = await readFile(inputFile) as unknown as Buffer;
        mimeType = inputFile.endsWith('.jpg') || inputFile.endsWith('.jpeg')
            ? 'image/jpeg'
            : 'image/png';
    }

    const imageBase64 = Buffer.from(imageBuffer).toString('base64');

    console.error(`Querying Gemini (gemini-2.5-flash)...`);
    const response = await callGemini(imageBase64, mimeType, prompt, apiKey);

    const report: QueryReport = {
        input: inputFile,
        model: 'gemini-2.5-flash',
        prompt,
        response,
    };

    // Also save response to file if requested
    const outIdx = args.indexOf('-o');
    if (outIdx !== -1 && args[outIdx + 1]) {
        await writeFile(args[outIdx + 1], JSON.stringify(report, null, 2));
        console.error(`Saved: ${args[outIdx + 1]}`);
    }

    console.log(JSON.stringify(report, null, 2));
}
