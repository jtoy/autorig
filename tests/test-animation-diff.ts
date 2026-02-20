/**
 * Animation Diff System Unit Tests
 * Tests diff creation, application, and round-trip conversion
 * No rendering required - pure data transformation tests
 */

import {
    createDiffBasedAnimation,
    expandDiffBasedAnimation,
    loadAnimation,
    validateDiffBasedAnimation,
    isDiffBasedFormat,
    calculateCompressionStats,
    type FrameData
} from '../modules/animationDiff.js';

/**
 * Deep equality check for objects
 */
function deepEqual(obj1: any, obj2: any): boolean {
    if (obj1 === obj2) return true;
    if (obj1 == null || obj2 == null) return false;
    if (typeof obj1 !== typeof obj2) return false;
    
    if (typeof obj1 === 'object') {
        const keys1 = Object.keys(obj1).sort();
        const keys2 = Object.keys(obj2).sort();
        
        if (keys1.length !== keys2.length) return false;
        if (keys1.join(',') !== keys2.join(',')) return false;
        
        return keys1.every(key => deepEqual(obj1[key], obj2[key]));
    }
    
    return false;
}

/**
 * Test 1: Basic Diff Creation and Application
 */
function testBasicDiffCreation(): boolean {
    console.log('\n  Test 1: Basic Diff Creation');
    console.log('  ' + '-'.repeat(40));
    
    // Create sample frames
    const frames: FrameData[] = [
        // Frame 0: Base frame
        {
            rotationValues: { head: 0, leftArm: 0, rightArm: 0 },
            selfRotationValues: { torso: 0 },
            visibility: { head: true, torso: true }
        },
        // Frame 1: Only head rotates
        {
            rotationValues: { head: 0.5, leftArm: 0, rightArm: 0 },
            selfRotationValues: { torso: 0 },
            visibility: { head: true, torso: true }
        },
        // Frame 2: Head and arm rotate
        {
            rotationValues: { head: 1.0, leftArm: 0.3, rightArm: 0 },
            selfRotationValues: { torso: 0 },
            visibility: { head: true, torso: true }
        }
    ];
    
    // Create diff-based animation
    const diffAnimation = createDiffBasedAnimation(frames);
    
    // Verify diff format
    console.log('    Base frame keys:', Object.keys(diffAnimation[0]));
    console.log('    Diff 1 keys:', Object.keys(diffAnimation[1]));
    console.log('    Diff 2 keys:', Object.keys(diffAnimation[2]));
    
    // Diff 1 should only have rotationValues with changed head
    const expectedDiff1 = {
        rotationValues: { head: 0.5 }
    };
    
    const diff1Match = deepEqual(diffAnimation[1], expectedDiff1);
    console.log(`    Diff 1 correct: ${diff1Match ? '✅' : '❌'}`);
    
    // Expand back to full frames
    const expandedFrames = expandDiffBasedAnimation(diffAnimation);
    
    // Verify round-trip
    const roundTripMatch = deepEqual(frames, expandedFrames);
    console.log(`    Round-trip match: ${roundTripMatch ? '✅' : '❌'}`);
    
    const passed = diff1Match && roundTripMatch;
    console.log(`    Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    
    return passed;
}

/**
 * Test 2: Nested Object Diffs
 */
function testNestedObjectDiffs(): boolean {
    console.log('\n  Test 2: Nested Object Diffs');
    console.log('  ' + '-'.repeat(40));
    
    const frames: FrameData[] = [
        {
            rotationValues: { head: 0, leftArm: 0, rightArm: 0 },
            eyes: {
                leftEyeXCoor: -10,
                leftEyeYCoor: -5,
                rightEyeXCoor: 10,
                rightEyeYCoor: -5
            }
        },
        {
            rotationValues: { head: 0, leftArm: 0, rightArm: 0 },
            eyes: {
                leftEyeXCoor: -12,  // Changed
                leftEyeYCoor: -5,
                rightEyeXCoor: 10,
                rightEyeYCoor: -5
            }
        }
    ];
    
    const diffAnimation = createDiffBasedAnimation(frames);
    
    // Diff should only contain the changed eye property
    const expectedDiff = {
        eyes: { leftEyeXCoor: -12 }
    };
    
    const diffMatch = deepEqual(diffAnimation[1], expectedDiff);
    console.log('    Diff contains only changed eye property:', diffMatch ? '✅' : '❌');
    
    // Expand and verify
    const expandedFrames = expandDiffBasedAnimation(diffAnimation);
    const roundTripMatch = deepEqual(frames, expandedFrames);
    console.log('    Round-trip match:', roundTripMatch ? '✅' : '❌');
    
    const passed = diffMatch && roundTripMatch;
    console.log(`    Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    
    return passed;
}

/**
 * Test 3: No Changes (Empty Diff)
 */
function testNoChanges(): boolean {
    console.log('\n  Test 3: No Changes (Empty Diff)');
    console.log('  ' + '-'.repeat(40));
    
    const frames: FrameData[] = [
        { rotationValues: { head: 0 }, visibility: { head: true } },
        { rotationValues: { head: 0 }, visibility: { head: true } }  // Identical
    ];
    
    const diffAnimation = createDiffBasedAnimation(frames);
    
    // Second frame should be empty object (no changes)
    const isEmptyDiff = Object.keys(diffAnimation[1]).length === 0;
    console.log('    Diff is empty object:', isEmptyDiff ? '✅' : '❌');
    
    // Expand and verify
    const expandedFrames = expandDiffBasedAnimation(diffAnimation);
    const roundTripMatch = deepEqual(frames, expandedFrames);
    console.log('    Round-trip match:', roundTripMatch ? '✅' : '❌');
    
    const passed = isEmptyDiff && roundTripMatch;
    console.log(`    Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    
    return passed;
}

/**
 * Test 4: Multiple Property Changes
 */
function testMultiplePropertyChanges(): boolean {
    console.log('\n  Test 4: Multiple Property Changes');
    console.log('  ' + '-'.repeat(40));
    
    const frames: FrameData[] = [
        {
            rotationValues: { head: 0, leftArm: 0 },
            selfRotationValues: { torso: 0 },
            visibility: { head: true },
            flipX: false
        },
        {
            rotationValues: { head: 0.5, leftArm: 0.3 },  // Both changed
            selfRotationValues: { torso: 0.1 },            // Changed
            visibility: { head: true },                    // No change
            flipX: true                                     // Changed
        }
    ];
    
    const diffAnimation = createDiffBasedAnimation(frames);
    
    // Verify diff has all changed properties
    const diff = diffAnimation[1];
    const hasRotations = diff.rotationValues !== undefined;
    const hasSelfRotations = diff.selfRotationValues !== undefined;
    const hasFlipX = diff.flipX !== undefined;
    const noVisibility = diff.visibility === undefined;  // Should NOT be in diff (unchanged)
    
    console.log('    Has rotationValues:', hasRotations ? '✅' : '❌');
    console.log('    Has selfRotationValues:', hasSelfRotations ? '✅' : '❌');
    console.log('    Has flipX:', hasFlipX ? '✅' : '❌');
    console.log('    Visibility excluded (unchanged):', noVisibility ? '✅' : '❌');
    
    // Expand and verify
    const expandedFrames = expandDiffBasedAnimation(diffAnimation);
    const roundTripMatch = deepEqual(frames, expandedFrames);
    console.log('    Round-trip match:', roundTripMatch ? '✅' : '❌');
    
    const passed = hasRotations && hasSelfRotations && hasFlipX && noVisibility && roundTripMatch;
    console.log(`    Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    
    return passed;
}

/**
 * Test 5: Legacy Verbose Format Support
 */
function testLegacyVerboseFormat(): boolean {
    console.log('\n  Test 5: Legacy Verbose Format Support');
    console.log('  ' + '-'.repeat(40));
    
    const verboseFormat = {
        version: '1.0',
        baseFrame: { rotationValues: { head: 0 } },
        diffs: [
            null,
            { rotationValues: { head: 0.5 } },
            { rotationValues: { head: 1.0 } }
        ]
    };
    
    // Should be detected as diff format
    const isDetected = isDiffBasedFormat(verboseFormat);
    console.log('    Detected as diff format:', isDetected ? '✅' : '❌');
    
    // Should validate
    const isValid = validateDiffBasedAnimation(verboseFormat);
    console.log('    Validates correctly:', isValid ? '✅' : '❌');
    
    // Should expand correctly
    const expanded = expandDiffBasedAnimation(verboseFormat);
    const expectedFrames = [
        { rotationValues: { head: 0 } },
        { rotationValues: { head: 0.5 } },
        { rotationValues: { head: 1.0 } }
    ];
    
    const expandsCorrectly = deepEqual(expanded, expectedFrames);
    console.log('    Expands correctly:', expandsCorrectly ? '✅' : '❌');
    
    const passed = isDetected && isValid && expandsCorrectly;
    console.log(`    Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    
    return passed;
}

/**
 * Test 6: Compression Stats
 */
function testCompressionStats(): boolean {
    console.log('\n  Test 6: Compression Stats');
    console.log('  ' + '-'.repeat(40));
    
    const frames: FrameData[] = [
        {
            rotationValues: { head: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 },
            selfRotationValues: { torso: 0, leftHand: 0, rightHand: 0 },
            dimensionValues: { head: { width: 80, height: 80 }, torso: { width: 60, height: 120 } },
            visibility: { head: true, torso: true }
        },
        {
            rotationValues: { head: 0.1, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 },  // Only head changed
            selfRotationValues: { torso: 0, leftHand: 0, rightHand: 0 },
            dimensionValues: { head: { width: 80, height: 80 }, torso: { width: 60, height: 120 } },
            visibility: { head: true, torso: true }
        },
        {
            rotationValues: { head: 0.2, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 },  // Only head changed
            selfRotationValues: { torso: 0, leftHand: 0, rightHand: 0 },
            dimensionValues: { head: { width: 80, height: 80 }, torso: { width: 60, height: 120 } },
            visibility: { head: true, torso: true }
        }
    ];
    
    const diffAnimation = createDiffBasedAnimation(frames);
    const stats = calculateCompressionStats(frames, diffAnimation);
    
    console.log('    Original size:', stats.originalSize, 'bytes');
    console.log('    Compressed size:', stats.compressedSize, 'bytes');
    console.log('    Saved:', stats.savedBytes, 'bytes');
    console.log('    Compression ratio:', stats.compressionRatio);
    
    // Should have significant compression since only one value changes per frame
    const hasSavings = stats.savedBytes > 0;
    const hasRatio = parseFloat(stats.compressionRatio) > 0;
    
    console.log('    Has savings:', hasSavings ? '✅' : '❌');
    console.log('    Has compression ratio:', hasRatio ? '✅' : '❌');
    
    const passed = hasSavings && hasRatio;
    console.log(`    Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    
    return passed;
}

/**
 * Test 7: Format Detection
 */
function testFormatDetection(): boolean {
    console.log('\n  Test 7: Format Detection');
    console.log('  ' + '-'.repeat(40));
    
    // Full-state format (should NOT be detected as diff)
    const fullStateFormat = [
        { rotationValues: { head: 0 }, imagePaths: { head: 'abc' }, dimensionValues: { head: { width: 80, height: 80 } } },
        { rotationValues: { head: 0.5 }, imagePaths: { head: 'abc' }, dimensionValues: { head: { width: 80, height: 80 } } }
    ];
    
    // Diff format (should be detected)
    const diffFormat = [
        { rotationValues: { head: 0 }, imagePaths: { head: 'abc' }, dimensionValues: { head: { width: 80, height: 80 } } },
        { rotationValues: { head: 0.5 } }  // Missing imagePaths and dimensionValues (diff!)
    ];
    
    const fullStateDetected = !isDiffBasedFormat(fullStateFormat);
    const diffDetected = isDiffBasedFormat(diffFormat);
    
    console.log('    Full-state NOT detected as diff:', fullStateDetected ? '✅' : '❌');
    console.log('    Diff format detected:', diffDetected ? '✅' : '❌');
    
    const passed = fullStateDetected && diffDetected;
    console.log(`    Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    
    return passed;
}

/**
 * Test 8: Load Animation (Smart Loader)
 */
function testLoadAnimation(): boolean {
    console.log('\n  Test 8: Load Animation (Smart Loader)');
    console.log('  ' + '-'.repeat(40));
    
    // Test with diff format
    const diffFormat = [
        { rotationValues: { head: 0 }, imagePaths: { head: 'abc' } },
        { rotationValues: { head: 0.5 } }
    ];
    
    const loadedDiff = loadAnimation(diffFormat);
    const diffExpanded = loadedDiff.length === 2 && loadedDiff[1].imagePaths?.head === 'abc';
    console.log('    Diff format loaded and expanded:', diffExpanded ? '✅' : '❌');
    
    // Test with full-state format
    const fullStateFormat = [
        { rotationValues: { head: 0 }, imagePaths: { head: 'abc' } },
        { rotationValues: { head: 0.5 }, imagePaths: { head: 'abc' } }
    ];
    
    const loadedFull = loadAnimation(fullStateFormat);
    const fullStatePassthrough = deepEqual(loadedFull, fullStateFormat);
    console.log('    Full-state passed through:', fullStatePassthrough ? '✅' : '❌');
    
    const passed = diffExpanded && fullStatePassthrough;
    console.log(`    Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    
    return passed;
}

/**
 * Test 9: Complex Character Animation
 */
function testComplexCharacterAnimation(): boolean {
    console.log('\n  Test 9: Complex Character Animation');
    console.log('  ' + '-'.repeat(40));
    
    const frames: FrameData[] = [
        // Frame 0: T-pose
        {
            rotationValues: {
                head: 0,
                leftUpperArm: -Math.PI / 2,
                rightUpperArm: -Math.PI / 2,
                leftThigh: 0,
                rightThigh: 0
            },
            eyes: {
                leftIrisXCoor: 0,
                leftIrisYCoor: 0,
                rightIrisXCoor: 0,
                rightIrisYCoor: 0
            },
            mouth: {
                xCoor: 0,
                yCoor: 0
            }
        },
        // Frame 1: Head turns, eyes look left
        {
            rotationValues: {
                head: 0.3,                    // Changed
                leftUpperArm: -Math.PI / 2,
                rightUpperArm: -Math.PI / 2,
                leftThigh: 0,
                rightThigh: 0
            },
            eyes: {
                leftIrisXCoor: -5,            // Changed
                leftIrisYCoor: 0,
                rightIrisXCoor: -5,           // Changed
                rightIrisYCoor: 0
            },
            mouth: {
                xCoor: 0,
                yCoor: 0
            }
        },
        // Frame 2: Arms down, eyes center
        {
            rotationValues: {
                head: 0.3,
                leftUpperArm: 0,              // Changed
                rightUpperArm: 0,             // Changed
                leftThigh: 0,
                rightThigh: 0
            },
            eyes: {
                leftIrisXCoor: 0,             // Changed
                leftIrisYCoor: 0,
                rightIrisXCoor: 0,            // Changed
                rightIrisYCoor: 0
            },
            mouth: {
                xCoor: 0,
                yCoor: 0
            }
        }
    ];
    
    const diffAnimation = createDiffBasedAnimation(frames);
    const expandedFrames = expandDiffBasedAnimation(diffAnimation);
    
    // Verify each frame matches
    let allMatch = true;
    for (let i = 0; i < frames.length; i++) {
        if (!deepEqual(frames[i], expandedFrames[i])) {
            console.log(`    Frame ${i} mismatch ❌`);
            allMatch = false;
        }
    }
    
    console.log('    All frames match after round-trip:', allMatch ? '✅' : '❌');
    
    // Check compression
    const stats = calculateCompressionStats(frames, diffAnimation);
    const hasCompression = stats.savedBytes > 0;
    console.log('    Achieved compression:', hasCompression ? '✅' : '❌');
    console.log('    Compression ratio:', stats.compressionRatio);
    
    const passed = allMatch && hasCompression;
    console.log(`    Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    
    return passed;
}

/**
 * Test 10: Mouth Shape Animation
 */
function testMouthShapeAnimation(): boolean {
    console.log('\n  Test 10: Mouth Shape Animation');
    console.log('  ' + '-'.repeat(40));
    
    const frames: FrameData[] = [
        {
            rotationValues: { head: 0 },
            mouth: {
                width: 60,
                height: 40,
                xCoor: 0,
                yCoor: -50
            }
        },
        {
            rotationValues: { head: 0 },
            mouth: {
                width: 70,      // Changed
                height: 40,
                xCoor: 0,
                yCoor: -50
            }
        },
        {
            rotationValues: { head: 0 },
            mouth: {
                width: 70,
                height: 50,     // Changed
                xCoor: 2,       // Changed
                yCoor: -50
            }
        }
    ];
    
    const diffAnimation = createDiffBasedAnimation(frames);
    
    // Diff 1 should only have mouth.width
    const diff1HasOnlyWidth = !!(diffAnimation[1].mouth && 
                               Object.keys(diffAnimation[1].mouth).length === 1 &&
                               (diffAnimation[1].mouth as any).width === 70);
    
    console.log('    Diff 1 has only changed mouth property:', diff1HasOnlyWidth ? '✅' : '❌');
    
    // Expand and verify
    const expandedFrames = expandDiffBasedAnimation(diffAnimation);
    const roundTripMatch = deepEqual(frames, expandedFrames);
    console.log('    Round-trip match:', roundTripMatch ? '✅' : '❌');
    
    const passed = diff1HasOnlyWidth && roundTripMatch;
    console.log(`    Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    
    return passed;
}

/**
 * Main test runner
 */
async function runAllTests(): Promise<boolean> {
    console.log('\n🧪 Animation Diff System Tests');
    console.log('=' .repeat(50));
    
    const results: Record<string, boolean> = {
        'Basic Diff Creation': testBasicDiffCreation(),
        'Nested Object Diffs': testNestedObjectDiffs(),
        'No Changes (Empty Diff)': testNoChanges(),
        'Multiple Property Changes': testMultiplePropertyChanges(),
        'Legacy Verbose Format': testLegacyVerboseFormat(),
        'Compression Stats': testCompressionStats(),
        'Format Detection': testFormatDetection(),
        'Smart Loader': testLoadAnimation(),
        'Complex Character Animation': testComplexCharacterAnimation(),
        'Mouth Shape Animation': testMouthShapeAnimation()
    };
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Test Summary:');
    
    const passed = Object.values(results).filter(r => r).length;
    const total = Object.keys(results).length;
    console.log(`   ${passed}/${total} tests passed`);
    
    Object.entries(results).forEach(([name, result]) => {
        console.log(`   ${result ? '✅' : '❌'} ${name}`);
    });
    
    const allPassed = passed === total;
    
    if (allPassed) {
        console.log('\n✅ All animation diff tests PASSED\n');
    } else {
        console.log('\n❌ Some animation diff tests FAILED\n');
    }
    
    return allPassed;
}

// Run tests
async function main() {
    try {
        const success = await runAllTests();
        process.exit(success ? 0 : 1);
    } catch (error) {
        console.error('❌ Test failed with error:', error);
        process.exit(1);
    }
}

main();
