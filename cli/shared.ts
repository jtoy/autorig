/**
 * Shared helpers for CLI commands (query, test, etc.)
 */

import { readFile } from 'fs/promises';
import { SkiaRenderer } from '../modules/adapters/skiaRenderer.js';
import type { RigData } from '../types.js';

export async function renderRigToBuffer(rigFile: string, width: number, height: number): Promise<Buffer> {
    const rigData: RigData = JSON.parse(await readFile(rigFile, 'utf-8'));
    // Redirect console.log to stderr during image loading
    const origLog = console.log;
    console.log = (...a: unknown[]) => console.error(...a);
    const renderer = new SkiaRenderer();
    const buf = await renderer.renderToBuffer(rigData, { canvasWidth: width, canvasHeight: height });
    console.log = origLog;
    return buf;
}

export async function callGemini(base64Data: string, mimeType: string, prompt: string, apiKey: string): Promise<string> {
    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body = {
        contents: [{
            parts: [
                {
                    inline_data: {
                        mime_type: mimeType,
                        data: base64Data,
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
