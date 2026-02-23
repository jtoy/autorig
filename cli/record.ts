/**
 * record command - Send a world JSON to orchestrator for recording, poll until done
 *
 * Usage:
 *   distark-check record <world.json> [--orc http://localhost:3000] [-o output.mp4] [--timeout 300]
 *
 * Flow:
 *   1. POST world JSON to orchestrator /recording endpoint
 *   2. Poll /recording/status/:key every 3 seconds
 *   3. When done, download video to output path
 */

import { readFile, writeFile } from 'fs/promises';

interface RecordReport {
    input: string;
    output: string;
    key: string;
    status: string;
    media_id?: string;
    download_url?: string;
    elapsed_seconds: number;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runRecord(args: string[]): Promise<void> {
    const inputFile = args.find(a => !a.startsWith('-')) || '';
    if (!inputFile) {
        console.error('Usage: distark-check record <world.json> [--orc http://localhost:3000] [-o output.mp4] [--timeout 300]');
        process.exit(1);
    }

    const orcIdx = args.indexOf('--orc');
    const orcBase = orcIdx !== -1 ? args[orcIdx + 1] : (process.env.ORC_URL || 'https://orchestrator.distark.com');
    const outIdx = args.indexOf('-o');
    const outputFile = outIdx !== -1 ? args[outIdx + 1] : inputFile.replace(/\.json$/, '.mp4');
    const timeoutIdx = args.indexOf('--timeout');
    const timeoutSec = timeoutIdx !== -1 ? parseInt(args[timeoutIdx + 1]) : 300;

    // Read world JSON
    const worldJson = await readFile(inputFile, 'utf-8');
    // Validate it's valid JSON
    JSON.parse(worldJson);

    console.error(`Posting world JSON to ${orcBase}/recording ...`);

    // POST to orchestrator
    const postResp = await fetch(`${orcBase}/recording`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ world_json: worldJson }),
    });

    if (!postResp.ok) {
        const errBody = await postResp.text();
        throw new Error(`Orchestrator POST failed (${postResp.status}): ${errBody}`);
    }

    const postData = await postResp.json() as { success: boolean; key: string; message: string };
    const key = postData.key;
    if (!key) {
        throw new Error(`No key returned from orchestrator: ${JSON.stringify(postData)}`);
    }

    console.error(`Recording started. Key: ${key}`);
    console.error(`Polling ${orcBase}/recording/status/${key} ...`);

    // Poll for completion
    const startTime = Date.now();
    const pollInterval = 3000;
    let result: { status: string; download_url?: string; media_id?: string; error?: string } | null = null;

    while (true) {
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed > timeoutSec) {
            throw new Error(`Timed out after ${timeoutSec}s waiting for recording to complete`);
        }

        await sleep(pollInterval);

        const statusResp = await fetch(`${orcBase}/recording/status/${key}`);
        if (!statusResp.ok) {
            console.error(`  Status poll returned ${statusResp.status}, retrying...`);
            continue;
        }

        result = await statusResp.json() as typeof result;
        const elapsedRound = Math.round(elapsed);
        console.error(`  [${elapsedRound}s] status: ${result!.status}`);

        if (result!.status === 'done') break;
        if (result!.status === 'failed') {
            throw new Error(`Recording failed: ${result!.error || 'unknown error'}`);
        }
    }

    const elapsedTotal = Math.round((Date.now() - startTime) / 1000);

    // Download video if we have a URL
    if (result!.download_url) {
        console.error(`Downloading video from ${result!.download_url} ...`);
        const videoResp = await fetch(result!.download_url);
        if (!videoResp.ok) {
            throw new Error(`Failed to download video: ${videoResp.status}`);
        }
        const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
        await writeFile(outputFile, videoBuffer);
        console.error(`Saved: ${outputFile} (${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB)`);
    }

    const report: RecordReport = {
        input: inputFile,
        output: outputFile,
        key,
        status: result!.status,
        media_id: result!.media_id,
        download_url: result!.download_url,
        elapsed_seconds: elapsedTotal,
    };

    console.log(JSON.stringify(report, null, 2));
}
