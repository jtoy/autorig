/**
 * Tests for distark-check CLI commands
 *
 * Tests render, verify, animate, and diff commands using the tank.json fixture.
 * Query is tested structurally (no API key required for test).
 */

import { readFile, mkdir, rm, access } from 'fs/promises';
import { execSync } from 'child_process';
import { join } from 'path';

const CLI = 'node dist/cli/distark-check.js';
const TANK = 'assets/tank.json';
const TEST_DIR = 'test-outputs/cli';

interface TestResult {
    name: string;
    passed: boolean;
    detail?: string;
}

function run(cmd: string): { stdout: string; stderr: string; exitCode: number } {
    try {
        const stdout = execSync(cmd, { encoding: 'utf-8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] });
        return { stdout, stderr: '', exitCode: 0 };
    } catch (err: any) {
        return {
            stdout: err.stdout || '',
            stderr: err.stderr || '',
            exitCode: err.status || 1,
        };
    }
}

async function fileExists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

// ─── RENDER TESTS ───

async function testRenderBasic(): Promise<TestResult> {
    const out = join(TEST_DIR, 'render-basic.png');
    const result = run(`${CLI} render ${TANK} -o ${out}`);

    if (result.exitCode !== 0) {
        return { name: 'render: basic', passed: false, detail: `Exit code ${result.exitCode}: ${result.stderr}` };
    }

    const exists = await fileExists(out);
    if (!exists) {
        return { name: 'render: basic', passed: false, detail: 'Output PNG not created' };
    }

    // Check stdout contains valid JSON report
    try {
        const report = JSON.parse(result.stdout);
        if (!report.dimensions || !report.characters) {
            return { name: 'render: basic', passed: false, detail: 'Report missing fields' };
        }
        if (report.characters.length === 0) {
            return { name: 'render: basic', passed: false, detail: 'No characters in report' };
        }
        return { name: 'render: basic', passed: true };
    } catch {
        return { name: 'render: basic', passed: false, detail: 'stdout is not valid JSON' };
    }
}

async function testRenderWithReport(): Promise<TestResult> {
    const out = join(TEST_DIR, 'render-report.png');
    const result = run(`${CLI} render ${TANK} -o ${out} --report`);

    if (result.exitCode !== 0) {
        return { name: 'render: --report flag', passed: false, detail: result.stderr };
    }

    const reportFile = out.replace('.png', '.report.json');
    const exists = await fileExists(reportFile);
    if (!exists) {
        return { name: 'render: --report flag', passed: false, detail: 'Report file not created' };
    }

    const reportContent = JSON.parse(await readFile(reportFile, 'utf-8'));
    if (!reportContent.visible_parts || !reportContent.pivot_points) {
        return { name: 'render: --report flag', passed: false, detail: 'Report missing visible_parts or pivot_points' };
    }

    return { name: 'render: --report flag', passed: true };
}

async function testRenderCustomDimensions(): Promise<TestResult> {
    const out = join(TEST_DIR, 'render-custom-dim.png');
    const result = run(`${CLI} render ${TANK} -o ${out} --width 500 --height 500`);

    if (result.exitCode !== 0) {
        return { name: 'render: custom dimensions', passed: false, detail: result.stderr };
    }

    const report = JSON.parse(result.stdout);
    if (report.dimensions.width !== 500 || report.dimensions.height !== 500) {
        return { name: 'render: custom dimensions', passed: false, detail: `Got ${report.dimensions.width}x${report.dimensions.height}` };
    }

    return { name: 'render: custom dimensions', passed: true };
}

async function testRenderReportContents(): Promise<TestResult> {
    const out = join(TEST_DIR, 'render-contents.png');
    const result = run(`${CLI} render ${TANK} -o ${out}`);
    const report = JSON.parse(result.stdout);

    // Should have torso and head
    const hasTorso = report.characters.some((c: any) => c.name === 'torso');
    const hasHead = report.characters.some((c: any) => c.name === 'head');
    if (!hasTorso || !hasHead) {
        return { name: 'render: report has torso+head', passed: false, detail: 'Missing torso or head' };
    }

    // visible_parts should be non-empty
    if (report.visible_parts.length === 0) {
        return { name: 'render: report has torso+head', passed: false, detail: 'No visible parts' };
    }

    // pivot_points should be non-empty
    if (report.pivot_points.length === 0) {
        return { name: 'render: report has torso+head', passed: false, detail: 'No pivot points' };
    }

    // Each character should have bounds with x, y, w, h
    for (const ch of report.characters) {
        if (ch.bounds.x === undefined || ch.bounds.y === undefined || ch.bounds.w === undefined || ch.bounds.h === undefined) {
            return { name: 'render: report has torso+head', passed: false, detail: `${ch.name} missing bounds` };
        }
    }

    return { name: 'render: report has torso+head', passed: true };
}

// ─── VERIFY TESTS ───

async function testVerifyBasic(): Promise<TestResult> {
    const result = run(`${CLI} verify ${TANK}`);

    if (result.exitCode !== 0 && !result.stdout.includes('"failed"')) {
        return { name: 'verify: basic', passed: false, detail: result.stderr };
    }

    try {
        const report = JSON.parse(result.stdout);
        if (!report.passed || !report.all_results) {
            return { name: 'verify: basic', passed: false, detail: 'Missing passed or all_results' };
        }
        return { name: 'verify: basic', passed: true };
    } catch {
        return { name: 'verify: basic', passed: false, detail: 'stdout not valid JSON' };
    }
}

async function testVerifySelectiveChecks(): Promise<TestResult> {
    const result = run(`${CLI} verify ${TANK} --checks bounds,proportions`);

    const report = JSON.parse(result.stdout);
    const checkNames = report.all_results.map((r: any) => r.check);

    const hasBounds = checkNames.includes('bounds');
    const hasProportions = checkNames.includes('proportions');
    const hasZorder = checkNames.includes('zorder');

    if (!hasBounds || !hasProportions) {
        return { name: 'verify: selective checks', passed: false, detail: 'Missing requested checks' };
    }
    if (hasZorder) {
        return { name: 'verify: selective checks', passed: false, detail: 'Ran check that was not requested (zorder)' };
    }

    return { name: 'verify: selective checks', passed: true };
}

async function testVerifyProportionsPass(): Promise<TestResult> {
    const result = run(`${CLI} verify ${TANK} --checks proportions`);
    const report = JSON.parse(result.stdout);

    const proportionsCheck = report.all_results.find((r: any) => r.check === 'proportions');
    if (!proportionsCheck || proportionsCheck.status !== 'passed') {
        return { name: 'verify: proportions pass', passed: false, detail: `Status: ${proportionsCheck?.status}` };
    }

    return { name: 'verify: proportions pass', passed: true };
}

// ─── DIFF TESTS ───

async function testDiffIdentical(): Promise<TestResult> {
    // Render same rig twice, diff should be 0%
    const img1 = join(TEST_DIR, 'diff-a.png');
    const img2 = join(TEST_DIR, 'diff-b.png');
    const diffOut = join(TEST_DIR, 'diff-identical.png');

    run(`${CLI} render ${TANK} -o ${img1} --width 500 --height 500`);
    run(`${CLI} render ${TANK} -o ${img2} --width 500 --height 500`);

    const result = run(`${CLI} diff ${img1} ${img2} -o ${diffOut}`);
    if (result.exitCode !== 0) {
        return { name: 'diff: identical images', passed: false, detail: result.stderr };
    }

    const report = JSON.parse(result.stdout);
    if (report.percent_changed !== 0) {
        return { name: 'diff: identical images', passed: false, detail: `Expected 0% changed, got ${report.percent_changed}%` };
    }

    return { name: 'diff: identical images', passed: true };
}

async function testDiffDifferent(): Promise<TestResult> {
    // Use the rendered image vs the diff-identical image (which is dimmed) to guarantee different pixels
    const img1 = join(TEST_DIR, 'diff-a.png');
    const diffOut = join(TEST_DIR, 'diff-different.png');
    const diffImg = join(TEST_DIR, 'diff-identical.png');
    const result = run(`${CLI} diff ${img1} ${diffImg} -o ${diffOut}`);

    if (result.exitCode !== 0) {
        return { name: 'diff: different images', passed: false, detail: result.stderr };
    }

    const report = JSON.parse(result.stdout);
    if (report.percent_changed === 0) {
        return { name: 'diff: different images', passed: false, detail: 'Expected non-zero diff' };
    }
    if (!report.changed_regions || !Array.isArray(report.changed_regions)) {
        return { name: 'diff: different images', passed: false, detail: 'Missing changed_regions' };
    }

    return { name: 'diff: different images', passed: true };
}

async function testDiffOutputFile(): Promise<TestResult> {
    const img1 = join(TEST_DIR, 'diff-a.png');
    const img1b = join(TEST_DIR, 'diff-identical.png');
    const diffOut = join(TEST_DIR, 'diff-output-test.png');

    run(`${CLI} diff ${img1} ${img1b} -o ${diffOut}`);
    const exists = await fileExists(diffOut);
    if (!exists) {
        return { name: 'diff: output file created', passed: false, detail: 'Diff image not created' };
    }

    return { name: 'diff: output file created', passed: true };
}

// ─── QUERY TESTS (structural only, no API call) ───

async function testQueryMissingKey(): Promise<TestResult> {
    // Without GEMINI_API_KEY, should exit with error
    const img = join(TEST_DIR, 'diff-a.png');
    const result = run(`unset GEMINI_API_KEY && GEMINI_API_KEY= ${CLI} query ${img} --prompt "test"`);

    if (result.exitCode === 0) {
        return { name: 'query: rejects without API key', passed: false, detail: 'Should have exited non-zero' };
    }

    const combinedOutput = result.stdout + result.stderr;
    if (!combinedOutput.includes('GEMINI_API_KEY')) {
        return { name: 'query: rejects without API key', passed: false, detail: 'Should mention GEMINI_API_KEY' };
    }

    return { name: 'query: rejects without API key', passed: true };
}

async function testQueryMissingPrompt(): Promise<TestResult> {
    const img = join(TEST_DIR, 'diff-a.png');
    const result = run(`GEMINI_API_KEY=fake ${CLI} query ${img}`);

    if (result.exitCode === 0) {
        return { name: 'query: rejects without --prompt', passed: false, detail: 'Should have exited non-zero' };
    }

    const combinedOutput = result.stdout + result.stderr;
    if (!combinedOutput.includes('--prompt')) {
        return { name: 'query: rejects without --prompt', passed: false, detail: 'Should mention --prompt' };
    }

    return { name: 'query: rejects without --prompt', passed: true };
}

// ─── CLI HELP TESTS ───

async function testHelpOutput(): Promise<TestResult> {
    const result = run(`${CLI}`);

    if (!result.stdout.includes('distark-check')) {
        return { name: 'help: shows usage', passed: false, detail: 'Missing distark-check in output' };
    }
    if (!result.stdout.includes('render') || !result.stdout.includes('verify') || !result.stdout.includes('query')) {
        return { name: 'help: shows usage', passed: false, detail: 'Missing command names' };
    }

    return { name: 'help: shows usage', passed: true };
}

async function testUnknownCommand(): Promise<TestResult> {
    const result = run(`${CLI} foobar`);
    if (result.exitCode === 0) {
        return { name: 'help: unknown command exits non-zero', passed: false, detail: 'Should exit non-zero' };
    }
    return { name: 'help: unknown command exits non-zero', passed: true };
}

// ─── MAIN RUNNER ───

async function main() {
    console.log('\n🧪 distark-check CLI Tests');
    console.log('='.repeat(50));

    // Setup test directory
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });

    const tests: Array<() => Promise<TestResult>> = [
        // Help
        testHelpOutput,
        testUnknownCommand,
        // Render
        testRenderBasic,
        testRenderWithReport,
        testRenderCustomDimensions,
        testRenderReportContents,
        // Verify
        testVerifyBasic,
        testVerifySelectiveChecks,
        testVerifyProportionsPass,
        // Diff
        testDiffIdentical,
        testDiffDifferent,
        testDiffOutputFile,
        // Query (structural)
        testQueryMissingKey,
        testQueryMissingPrompt,
    ];

    const results: TestResult[] = [];

    for (const test of tests) {
        try {
            const result = await test();
            results.push(result);
            console.log(`  ${result.passed ? '✅' : '❌'} ${result.name}${result.detail && !result.passed ? ` - ${result.detail}` : ''}`);
        } catch (err: any) {
            const name = test.name || 'unknown';
            results.push({ name, passed: false, detail: err.message });
            console.log(`  ❌ ${name} - ${err.message}`);
        }
    }

    // Summary
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    console.log('\n' + '='.repeat(50));
    console.log(`📊 ${passed}/${total} tests passed`);

    if (passed === total) {
        console.log('✅ All CLI tests PASSED\n');
    } else {
        console.log('❌ Some CLI tests FAILED\n');
        results.filter(r => !r.passed).forEach(r => {
            console.log(`  ❌ ${r.name}: ${r.detail}`);
        });
        console.log();
    }

    process.exit(passed === total ? 0 : 1);
}

main();
