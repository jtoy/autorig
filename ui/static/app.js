/* ── State ──────────────────────────────────────────────────────── */
let sessionId = null;
let rigData = null;
let parts = [];           // [{name, image (data url)}]
let selectedPart = null;
let loadedImages = {};    // name → Image object for preview
let animating = true;
let animTime = 0;
let lastFrame = 0;
let originalImageSrc = null; // data URL of the uploaded original image

/* Editor state */
let editorTool = 'draw';
let editorImg = null;     // loaded Image for current part
let undoStack = [];

/* Lightbox state */
let lightboxMode = null;  // 'original' | 'rig' | 'compare'
let lightboxAnimating = false;
let lightboxAnimTime = 0;
let lightboxLastFrame = 0;
let lightboxRafId = null;
let compareOpacity = 0.5; // 0 = original only, 1 = rig only
let compareOrigImg = null; // cached Image for compare overlay

/* Rig interaction state */
let rigEditMode = 'view'; // 'view' | 'pivot' | 'part'
let rigDragging = null;   // { key, startX, startY, origX, origY } or null
let rigFitScale = 1;      // cached from last render
let rigOffsetX = 0;
let rigOffsetY = 0;

/* ── Upload ─────────────────────────────────────────────────────── */
document.getElementById('uploadInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setStatus('Uploading...', 'running');
    const form = new FormData();
    form.append('file', file);
    if (sessionId) form.append('session_id', sessionId);

    try {
        const res = await fetch('/api/upload', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        sessionId = data.session_id;
        setStatus('Image uploaded', 'done');
        document.getElementById('btnRunAll').disabled = false;
        document.getElementById('btnDiecut').disabled = false;

        // Show original image thumbnail
        if (data.image_preview) {
            originalImageSrc = data.image_preview;
            showOriginalThumb(data.image_preview);
        }
    } catch (err) {
        setStatus('Upload failed: ' + err.message, 'error');
    }
});

/* ── Pipeline ───────────────────────────────────────────────────── */
async function runFullPipeline() {
    if (!sessionId) return;
    setStatus('Running full pipeline (this takes a few minutes)...', 'running');
    disableButtons(true);

    try {
        const rounds = parseInt(document.getElementById('diecutRounds').value) || 5;
        const res = await fetch(`/api/run-all?session_id=${sessionId}&rounds=${rounds}`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);

        parts = data.parts || [];
        rigData = data.rig || null;
        renderPartsPanel();
        if (rigData) {
            await loadRigImages();
            buildRigControls();
            showRigThumb();
            showCompareThumb();
        }
        setStatus('Pipeline complete!', 'done');
    } catch (err) {
        setStatus('Pipeline error: ' + err.message, 'error');
    } finally {
        disableButtons(false);
    }
}

async function runDiecut() {
    if (!sessionId) return;
    setStatus('Running diecut...', 'running');
    disableButtons(true);

    try {
        const rounds = parseInt(document.getElementById('diecutRounds').value) || 5;
        let res = await fetch(`/api/diecut?session_id=${sessionId}&rounds=${rounds}`, { method: 'POST' });
        let data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        setStatus('Diecut done, running bboxes...', 'running');

        res = await fetch(`/api/bboxes?session_id=${sessionId}`, { method: 'POST' });
        data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        setStatus('Bboxes done, removing backgrounds...', 'running');

        res = await fetch(`/api/remove-bg?session_id=${sessionId}`, { method: 'POST' });
        data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        parts = data.parts || [];
        renderPartsPanel();
        setStatus('Parts ready, regenerating rig...', 'running');

        res = await fetch(`/api/rig?session_id=${sessionId}`, { method: 'POST' });
        data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        rigData = data.rig;
        await loadRigImages();
        buildRigControls();
        showRigThumb();
        showCompareThumb();
        setStatus('Re-diecut complete!', 'done');
    } catch (err) {
        setStatus('Error: ' + err.message, 'error');
    } finally {
        disableButtons(false);
    }
}

async function regenRig() {
    if (!sessionId) return;
    setStatus('Regenerating rig...', 'running');
    try {
        const res = await fetch(`/api/regenerate-rig?session_id=${sessionId}`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        rigData = data.rig;
        await loadRigImages();
        buildRigControls();
        showRigThumb();
        showCompareThumb();
        setStatus('Rig regenerated!', 'done');
    } catch (err) {
        setStatus('Error: ' + err.message, 'error');
    }
}

async function loadExistingRig() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            rigData = JSON.parse(text);
            // Extract parts from rig imagePaths
            parts = [];
            if (rigData.imagePaths) {
                const nameMap = {
                    head: 'head', torso: 'torso',
                    leftUpperArm: 'left_upperarm', rightUpperArm: 'right_upperarm',
                    leftForearm: 'left_forearm', rightForearm: 'right_forearm',
                    leftThigh: 'left_thigh', rightThigh: 'right_thigh',
                    leftLeg: 'left_calf', rightLeg: 'right_calf',
                };
                for (const [rigName, dataUrl] of Object.entries(rigData.imagePaths)) {
                    const partName = nameMap[rigName] || rigName;
                    parts.push({ name: partName, image: dataUrl });
                }
            }
            renderPartsPanel();
            await loadRigImages();
            buildRigControls();
            showRigThumb();
            showCompareThumb();
            document.getElementById('btnRegenRig').disabled = false;
            setStatus('Rig loaded from file', 'done');
        } catch (err) {
            setStatus('Error loading rig: ' + err.message, 'error');
        }
    };
    input.click();
}

/* ── Parts Panel ────────────────────────────────────────────────── */
const ALL_PART_NAMES = [
    'head', 'torso',
    'left_upperarm', 'right_upperarm',
    'left_forearm', 'right_forearm',
    'left_thigh', 'right_thigh',
    'left_calf', 'right_calf',
];

function renderPartsPanel() {
    const el = document.getElementById('partsList');
    el.innerHTML = '';

    ALL_PART_NAMES.forEach(name => {
        const part = parts.find(p => p.name === name);
        const div = document.createElement('div');
        div.className = 'part-item' + (part ? '' : ' missing') + (selectedPart === name ? ' selected' : '');
        div.onclick = () => selectPart(name);

        const img = document.createElement('img');
        img.src = part ? part.image : '';
        img.alt = name;
        if (!part) img.style.visibility = 'hidden';

        const label = document.createElement('span');
        label.className = 'part-label';
        label.textContent = name.replace(/_/g, ' ');

        div.appendChild(img);
        div.appendChild(label);
        el.appendChild(div);
    });
}

function selectPart(name) {
    selectedPart = name;
    renderPartsPanel();
    loadPartInEditor(name);
}

/* ── Part Editor ────────────────────────────────────────────────── */
function loadPartInEditor(name) {
    const part = parts.find(p => p.name === name);
    const canvas = document.getElementById('editorCanvas');
    const placeholder = document.getElementById('editorPlaceholder');

    if (!part) {
        canvas.style.display = 'none';
        placeholder.style.display = 'block';
        placeholder.textContent = `Part "${name}" not available`;
        return;
    }

    placeholder.style.display = 'none';
    canvas.style.display = 'block';

    const img = new Image();
    img.onload = () => {
        editorImg = img;
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        undoStack = [ctx.getImageData(0, 0, canvas.width, canvas.height)];

        document.getElementById('resizeW').value = img.width;
        document.getElementById('resizeH').value = img.height;
        document.getElementById('resizeScale').value = 100;
        document.getElementById('scaleLabel').textContent = '100%';
    };
    img.src = part.image;
}

function setTool(tool) {
    editorTool = tool;
    document.querySelectorAll('.editor-toolbar button').forEach(b => b.classList.remove('active'));
    document.getElementById('tool' + tool.charAt(0).toUpperCase() + tool.slice(1)).classList.add('active');
}

/* Canvas drawing */
const editorCanvas = document.getElementById('editorCanvas');
let drawing = false;
let lastX = 0, lastY = 0;

// Listen on the wrapper so drawing can start from transparent areas around
// the canvas (e.g. erasing near part edges). Coordinates are mapped to the
// canvas regardless of where the click lands in the wrapper.
document.getElementById('editorWrap').addEventListener('mousedown', (e) => {
    // Only start drawing when a part is loaded in the editor
    if (editorCanvas.style.display === 'none') return;

    const rect = editorCanvas.getBoundingClientRect();
    const scaleX = editorCanvas.width / rect.width;
    const scaleY = editorCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (editorTool === 'fill') {
        // Only fill if click is inside canvas bounds
        if (x >= 0 && y >= 0 && x < editorCanvas.width && y < editorCanvas.height) {
            floodFill(x | 0, y | 0);
            saveUndoState();
        }
        return;
    }

    drawing = true;
    lastX = x;
    lastY = y;
});

// Use document-level listeners so drawing continues if pointer briefly
// leaves the canvas element (e.g. over erased/transparent areas or when
// the canvas is CSS-scaled).
document.addEventListener('mousemove', (e) => {
    if (!drawing) return;
    const rect = editorCanvas.getBoundingClientRect();
    const scaleX = editorCanvas.width / rect.width;
    const scaleY = editorCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const ctx = editorCanvas.getContext('2d');
    const size = parseInt(document.getElementById('brushSize').value);

    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (editorTool === 'draw') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = document.getElementById('brushColor').value;
    } else if (editorTool === 'erase') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
    }

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.globalCompositeOperation = 'source-over';
    lastX = x;
    lastY = y;
});

document.addEventListener('mouseup', () => {
    if (drawing) {
        drawing = false;
        saveUndoState();
    }
});

function saveUndoState() {
    const ctx = editorCanvas.getContext('2d');
    undoStack.push(ctx.getImageData(0, 0, editorCanvas.width, editorCanvas.height));
    if (undoStack.length > 30) undoStack.shift();
}

function editorUndo() {
    if (undoStack.length <= 1) return;
    undoStack.pop();
    const ctx = editorCanvas.getContext('2d');
    ctx.putImageData(undoStack[undoStack.length - 1], 0, 0);
}

function floodFill(startX, startY) {
    const ctx = editorCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, editorCanvas.width, editorCanvas.height);
    const data = imgData.data;
    const w = editorCanvas.width;
    const h = editorCanvas.height;

    const color = document.getElementById('brushColor').value;
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);

    const idx = (startY * w + startX) * 4;
    const tr = data[idx], tg = data[idx + 1], tb = data[idx + 2], ta = data[idx + 3];

    if (r === tr && g === tg && b === tb && 255 === ta) return;

    const tolerance = 30;
    const stack = [[startX, startY]];
    const visited = new Uint8Array(w * h);

    function matches(i) {
        return Math.abs(data[i] - tr) + Math.abs(data[i + 1] - tg) +
               Math.abs(data[i + 2] - tb) + Math.abs(data[i + 3] - ta) <= tolerance * 4;
    }

    while (stack.length > 0) {
        const [cx, cy] = stack.pop();
        const ci = cy * w + cx;
        if (cx < 0 || cx >= w || cy < 0 || cy >= h || visited[ci]) continue;
        const pi = ci * 4;
        if (!matches(pi)) continue;
        visited[ci] = 1;
        data[pi] = r;
        data[pi + 1] = g;
        data[pi + 2] = b;
        data[pi + 3] = 255;
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }

    ctx.putImageData(imgData, 0, 0);
}

async function editorSave() {
    if (!selectedPart) return;

    // Update the part's data URL in our local state
    const dataUrl = editorCanvas.toDataURL('image/png');
    const part = parts.find(p => p.name === selectedPart);
    if (part) {
        part.image = dataUrl;
    }

    // Update rig imagePaths if we have a rig
    if (rigData && rigData.imagePaths) {
        const rigNameMap = {
            head: 'head', torso: 'torso',
            left_upperarm: 'leftUpperArm', right_upperarm: 'rightUpperArm',
            left_forearm: 'leftForearm', right_forearm: 'rightForearm',
            left_thigh: 'leftThigh', right_thigh: 'rightThigh',
            left_calf: 'leftLeg', right_calf: 'rightLeg',
        };
        const rigName = rigNameMap[selectedPart];
        if (rigName) {
            rigData.imagePaths[rigName] = dataUrl;
            await loadRigImages();
        }
    }

    // Upload to server if we have a session
    if (sessionId) {
        const blob = await new Promise(r => editorCanvas.toBlob(r, 'image/png'));
        const form = new FormData();
        form.append('file', blob, `${selectedPart}.png`);
        try {
            await fetch(`/api/parts/${selectedPart}?session_id=${sessionId}`, {
                method: 'PUT', body: form
            });
        } catch (err) {
            console.warn('Failed to save to server:', err);
        }
    }

    renderPartsPanel();
    setStatus('Part saved', 'done');
}

function resizePart() {
    if (!selectedPart || !editorImg) return;
    const newW = parseInt(document.getElementById('resizeW').value);
    const newH = parseInt(document.getElementById('resizeH').value);
    if (!newW || !newH || newW < 1 || newH < 1) return;

    const canvas = document.getElementById('editorCanvas');
    const ctx = canvas.getContext('2d');

    // Create temp canvas with old content
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    tmp.getContext('2d').drawImage(canvas, 0, 0);

    // Resize
    canvas.width = newW;
    canvas.height = newH;
    ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, 0, 0, newW, newH);
    saveUndoState();

    // Update rig dimensions
    if (rigData && rigData.dimensionValues) {
        const rigNameMap = {
            head: 'head', torso: 'torso',
            left_upperarm: 'leftUpperArm', right_upperarm: 'rightUpperArm',
            left_forearm: 'leftForearm', right_forearm: 'rightForearm',
            left_thigh: 'leftThigh', right_thigh: 'rightThigh',
            left_calf: 'leftLeg', right_calf: 'rightLeg',
        };
        const rn = rigNameMap[selectedPart];
        if (rn && rigData.dimensionValues[rn]) {
            rigData.dimensionValues[rn].width = newW;
            rigData.dimensionValues[rn].height = newH;
            buildRigControls();
        }
    }
}

function scalePartPreview(val) {
    document.getElementById('scaleLabel').textContent = val + '%';
    const canvas = document.getElementById('editorCanvas');
    const scale = val / 100;
    canvas.style.transform = `scale(${scale})`;
}

/* ── Rig Image Loading ──────────────────────────────────────────── */
async function loadRigImages() {
    if (!rigData || !rigData.imagePaths) return;
    loadedImages = {};

    const promises = Object.entries(rigData.imagePaths).map(([key, src]) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                loadedImages[key] = img;
                resolve();
            };
            img.onerror = () => resolve();
            img.src = src;
        });
    });

    await Promise.all(promises);
}

/* ── Rig Controls ───────────────────────────────────────────────── */
function buildRigControls() {
    if (!rigData) return;
    const el = document.getElementById('rigControlsContent');
    el.innerHTML = '';

    // Dimensions
    if (rigData.dimensionValues) {
        const sec = createRigSection('Dimensions');
        for (const [name, val] of Object.entries(rigData.dimensionValues)) {
            const row = document.createElement('div');
            row.className = 'rig-fields';
            row.innerHTML = `
                <div class="rig-field"><label>${name}</label></div>
                <div class="rig-field">
                    <label>w</label>
                    <input type="number" value="${val.width}" onchange="updateRigDim('${name}','width',this.value)">
                </div>
                <div class="rig-field">
                    <label>h</label>
                    <input type="number" value="${val.height}" onchange="updateRigDim('${name}','height',this.value)">
                </div>
            `;
            sec.querySelector('.rig-fields-wrap').appendChild(row);
        }
        el.appendChild(sec);
    }

    // Pivot Points
    if (rigData.pivotPoints) {
        const sec = createRigSection('Pivot Points');
        for (const [name, val] of Object.entries(rigData.pivotPoints)) {
            const row = document.createElement('div');
            row.className = 'rig-fields';
            row.innerHTML = `
                <div class="rig-field"><label>${name}</label></div>
                <div class="rig-field">
                    <label>x</label>
                    <input type="number" value="${val.x}" onchange="updateRigPivot('${name}','x',this.value)">
                </div>
                <div class="rig-field">
                    <label>y</label>
                    <input type="number" value="${val.y}" onchange="updateRigPivot('${name}','y',this.value)">
                </div>
            `;
            sec.querySelector('.rig-fields-wrap').appendChild(row);
        }
        el.appendChild(sec);
    }

    // Joint Offsets
    if (rigData.jointOffset) {
        const sec = createRigSection('Joint Offsets');
        for (const [name, val] of Object.entries(rigData.jointOffset)) {
            const row = document.createElement('div');
            row.className = 'rig-fields';
            row.innerHTML = `
                <div class="rig-field"><label>${name}</label></div>
                <div class="rig-field">
                    <label>x</label>
                    <input type="number" value="${val.x}" onchange="updateRigJoint('${name}','x',this.value)">
                </div>
                <div class="rig-field">
                    <label>y</label>
                    <input type="number" value="${val.y}" onchange="updateRigJoint('${name}','y',this.value)">
                </div>
            `;
            sec.querySelector('.rig-fields-wrap').appendChild(row);
        }
        el.appendChild(sec);
    }

    // Z-Index
    if (rigData.zIndexValues) {
        const sec = createRigSection('Z-Index');
        const wrap = sec.querySelector('.rig-fields-wrap');
        const row = document.createElement('div');
        row.className = 'rig-fields';
        for (const [name, val] of Object.entries(rigData.zIndexValues)) {
            row.innerHTML += `
                <div class="rig-field">
                    <label>${name}</label>
                    <input type="number" value="${val}" onchange="updateRigZ('${name}',this.value)">
                </div>
            `;
        }
        wrap.appendChild(row);
        el.appendChild(sec);
    }

    document.getElementById('btnRegenRig').disabled = false;
}

function createRigSection(title) {
    const sec = document.createElement('div');
    sec.className = 'rig-section';
    sec.innerHTML = `<h3 onclick="this.parentElement.classList.toggle('collapsed')">${title}</h3><div class="rig-fields-wrap"></div>`;
    return sec;
}

function updateRigDim(name, prop, val) {
    if (!rigData || !rigData.dimensionValues || !rigData.dimensionValues[name]) return;
    rigData.dimensionValues[name][prop] = parseInt(val);
}

function updateRigPivot(name, prop, val) {
    if (!rigData || !rigData.pivotPoints || !rigData.pivotPoints[name]) return;
    rigData.pivotPoints[name][prop] = parseInt(val);
}

function updateRigJoint(name, prop, val) {
    if (!rigData || !rigData.jointOffset || !rigData.jointOffset[name]) return;
    rigData.jointOffset[name][prop] = parseInt(val);
}

function updateRigZ(name, val) {
    if (!rigData || !rigData.zIndexValues) return;
    rigData.zIndexValues[name] = parseInt(val);
}

/* ── Animation Preview (ported from distark-render) ─────────────── */
/* Matches distark_render/modules/renderRig.ts exactly */

const VIRTUAL_W = 1000;
const VIRTUAL_H = 1000;

function applyTransform(parent, local) {
    const cos = Math.cos(parent.rotation);
    const sin = Math.sin(parent.rotation);
    return {
        x: parent.x + (local.x * cos - local.y * sin) * parent.scaleX,
        y: parent.y + (local.x * sin + local.y * cos) * parent.scaleY,
        rotation: parent.rotation + local.rotation,
        scaleX: parent.scaleX * local.scaleX,
        scaleY: parent.scaleY * local.scaleY,
    };
}

function computeRig(rig) {
    /* Match distark_render: centerY = canvasHeight/2 + 100 */
    const centerX = VIRTUAL_W / 2;
    const centerY = VIRTUAL_H / 2 + 100;
    const rotations = rig.rotationValues || {};
    const selfRotations = rig.selfRotationValues || {};
    const dimensions = rig.dimensionValues || {};
    const pivotPoints = rig.pivotPoints || {};
    const jointOffset = rig.jointOffset || {};
    const zIndexValues = rig.zIndexValues || {};
    const visibility = rig.visibility || {};
    const imageScale = rig.imageScale ?? 1.0;

    const objects = [];
    const root = { x: centerX, y: centerY, rotation: 0, scaleX: 1, scaleY: 1 };

    // Torso — anchor bottom-center (0.5, 1)
    if (visibility.torso !== false) {
        const tw = (dimensions.torso?.width || 60) * imageScale;
        const th = (dimensions.torso?.height || 120) * imageScale;
        const selfRot = selfRotations.torso || 0;
        objects.push({
            name: 'torso', x: root.x, y: root.y,
            rotation: root.rotation + selfRot,
            scaleX: root.scaleX, scaleY: root.scaleY,
            w: tw, h: th, anchorX: 0.5, anchorY: 1,
            zIndex: zIndexValues.torso || 8,
            img: loadedImages.torso,
        });
    }

    // Head
    if (visibility.head !== false) {
        const pivot = pivotPoints.torso_head || { x: 0, y: 0 };
        const joff = jointOffset.torso_head || { x: 0, y: 0 };
        const hw = (dimensions.head?.width || 80) * imageScale;
        const hh = (dimensions.head?.height || 80) * imageScale;
        const headRot = rotations.head || 0;
        const selfRot = selfRotations.head || 0;

        const headParent = applyTransform(root, {
            x: pivot.x || 0, y: pivot.y || 0,
            rotation: headRot, scaleX: 1, scaleY: 1,
        });
        const headT = applyTransform(headParent, {
            x: joff.x || 0, y: (joff.y || 0) - hh / 2,
            rotation: selfRot, scaleX: 1, scaleY: 1,
        });
        objects.push({
            name: 'head', x: headT.x, y: headT.y,
            rotation: headT.rotation, scaleX: headT.scaleX, scaleY: headT.scaleY,
            w: hw, h: hh, anchorX: 0.5, anchorY: 0.5,
            zIndex: zIndexValues.head || 9,
            img: loadedImages.head,
        });
    }

    // Arms and legs — matches distark_render's per-limb chain exactly
    function addChain(parentPivotKey, upperName, upperImgKey,
                      elbowPivotKey, lowerName, lowerImgKey) {
        if (visibility[upperName] !== false) {
            const pivot = pivotPoints[parentPivotKey] || { x: 0, y: 0 };
            const joff = jointOffset[parentPivotKey] || { x: 0, y: 0 };
            const w = (dimensions[upperName]?.width || 30) * imageScale;
            const h = (dimensions[upperName]?.height || 50) * imageScale;
            const limbRot = rotations[upperName] || 0;
            const selfRot = selfRotations[upperName] || 0;

            // Step 1: root → shoulder joint (with limb rotation)
            const parentT = applyTransform(root, {
                x: pivot.x || 0, y: pivot.y || 0,
                rotation: limbRot, scaleX: 1, scaleY: 1,
            });
            // Step 2: joint offset + center image (with self rotation)
            const upperT = applyTransform(parentT, {
                x: joff.x || 0, y: (joff.y || 0) - h / 2,
                rotation: selfRot, scaleX: 1, scaleY: 1,
            });
            objects.push({
                name: upperName, x: upperT.x, y: upperT.y,
                rotation: upperT.rotation, scaleX: upperT.scaleX, scaleY: upperT.scaleY,
                w, h, anchorX: 0.5, anchorY: 0.5,
                zIndex: zIndexValues[upperName] || 1,
                img: loadedImages[upperImgKey || upperName],
            });

            // Lower limb
            if (visibility[lowerName] !== false) {
                const upperH = (dimensions[upperName]?.height || 50);
                const ePivot = pivotPoints[elbowPivotKey] || { x: 0, y: 0 };
                const eJoff = jointOffset[elbowPivotKey] || { x: 0, y: 0 };
                const lw = (dimensions[lowerName]?.width || 25) * imageScale;
                const lh = (dimensions[lowerName]?.height || 45) * imageScale;
                const lRot = rotations[lowerName] || 0;
                const lSelfRot = selfRotations[lowerName] || 0;

                // Step 3: elbow/knee joint offset from upper parent
                const foreParent = applyTransform(parentT, {
                    x: ePivot.x || 0, y: (ePivot.y || 0) - upperH,
                    rotation: lRot, scaleX: 1, scaleY: 1,
                });
                // Step 4: center lower image
                const foreT = applyTransform(foreParent, {
                    x: eJoff.x || 0, y: (eJoff.y || 0) - lh / 2,
                    rotation: lSelfRot, scaleX: 1, scaleY: 1,
                });
                objects.push({
                    name: lowerName, x: foreT.x, y: foreT.y,
                    rotation: foreT.rotation, scaleX: foreT.scaleX, scaleY: foreT.scaleY,
                    w: lw, h: lh, anchorX: 0.5, anchorY: 0.5,
                    zIndex: zIndexValues[lowerName] || 1,
                    img: loadedImages[lowerImgKey || lowerName],
                });
            }
        }
    }

    addChain('torso_leftUpperArm', 'leftUpperArm', 'leftUpperArm',
             'leftUpperArm_leftForearm', 'leftForearm', 'leftForearm');
    addChain('torso_rightUpperArm', 'rightUpperArm', 'rightUpperArm',
             'rightUpperArm_rightForearm', 'rightForearm', 'rightForearm');
    addChain('torso_leftThigh', 'leftThigh', 'leftThigh',
             'leftThigh_leftLeg', 'leftLeg', 'leftLeg');
    addChain('torso_rightThigh', 'rightThigh', 'rightThigh',
             'rightThigh_rightLeg', 'rightLeg', 'rightLeg');

    objects.sort((a, b) => a.zIndex - b.zIndex);
    return objects;
}

/* Compute bounding box of all rendered objects */
function computeBounds(objects) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const obj of objects) {
        if (!obj.img) continue;
        // Approximate bounds (ignoring rotation for bbox — close enough)
        const hw = obj.w / 2;
        const hh = obj.h / 2;
        const r = Math.sqrt(hw * hw + hh * hh); // max radius
        minX = Math.min(minX, obj.x - r);
        minY = Math.min(minY, obj.y - r);
        maxX = Math.max(maxX, obj.x + r);
        maxY = Math.max(maxY, obj.y + r);
    }
    if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: VIRTUAL_W, maxY: VIRTUAL_H };
    return { minX, minY, maxX, maxY };
}

/* Walk cycle animation */
function applyWalkCycle(rig, t) {
    // Create a copy of rotationValues to animate
    const rotations = { ...rig.rotationValues };

    const swing = 0.35;
    const kneeSwing = 0.25;
    const armSwing = 0.3;
    const forearmSwing = 0.2;

    // Legs swing opposite
    rotations.leftThigh = (rotations.leftThigh || -Math.PI) + Math.sin(t) * swing;
    rotations.rightThigh = (rotations.rightThigh || Math.PI) - Math.sin(t) * swing;

    // Knees bend forward during stride
    rotations.leftLeg = (rotations.leftLeg || 0) + Math.max(0, -Math.sin(t)) * kneeSwing;
    rotations.rightLeg = (rotations.rightLeg || 0) + Math.max(0, Math.sin(t)) * kneeSwing;

    // Arms swing opposite to legs
    rotations.leftUpperArm = (rotations.leftUpperArm || -Math.PI) - Math.sin(t) * armSwing;
    rotations.rightUpperArm = (rotations.rightUpperArm || Math.PI) + Math.sin(t) * armSwing;

    // Forearms follow with slight delay
    rotations.leftForearm = (rotations.leftForearm || 0) - Math.sin(t + 0.5) * forearmSwing;
    rotations.rightForearm = (rotations.rightForearm || 0) + Math.sin(t + 0.5) * forearmSwing;

    // Slight head bob
    rotations.head = (rotations.head || 0) + Math.sin(t * 2) * 0.03;

    return { ...rig, rotationValues: rotations };
}

function renderPreview(timestamp) {
    if (!rigData) {
        requestAnimationFrame(renderPreview);
        return;
    }

    const canvas = document.getElementById('previewCanvas');
    const ctx = canvas.getContext('2d');
    const speed = parseFloat(document.getElementById('animSpeed').value) || 1;

    if (animating) {
        const dt = timestamp - lastFrame;
        animTime += (dt / 1000) * speed * 3;
    }
    lastFrame = timestamp;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply walk cycle if animating
    const frameRig = animating ? applyWalkCycle(rigData, animTime) : rigData;

    // Compute at virtual 1000x1000 canvas (matching distark_render)
    const objects = computeRig(frameRig);

    // Auto-scale to fit the preview canvas with padding
    const bounds = computeBounds(objects);
    const charW = bounds.maxX - bounds.minX;
    const charH = bounds.maxY - bounds.minY;
    const padding = 20;
    const scaleX = (canvas.width - padding * 2) / Math.max(charW, 1);
    const scaleY = (canvas.height - padding * 2) / Math.max(charH, 1);
    const fitScale = Math.min(scaleX, scaleY, 1); // never upscale
    const offsetX = (canvas.width - charW * fitScale) / 2 - bounds.minX * fitScale;
    const offsetY = (canvas.height - charH * fitScale) / 2 - bounds.minY * fitScale;

    // Cache transform for mouse interaction
    rigFitScale = fitScale;
    rigOffsetX = offsetX;
    rigOffsetY = offsetY;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(fitScale, fitScale);

    // Draw all objects — highlight hovered part in 'part' mode
    objects.forEach(obj => {
        if (!obj.img) return;
        ctx.save();
        ctx.translate(obj.x, obj.y);
        ctx.rotate(obj.rotation);
        ctx.scale(obj.scaleX, obj.scaleY);
        const dx = -obj.w * obj.anchorX;
        const dy = -obj.h * obj.anchorY;
        if (rigEditMode === 'part' && rigDragging && rigDragging.partName === obj.name) {
            ctx.shadowColor = '#e94560';
            ctx.shadowBlur = 10 / fitScale;
        }
        ctx.drawImage(obj.img, dx, dy, obj.w, obj.h);
        ctx.restore();
    });

    // Draw pivot points
    const rootX = VIRTUAL_W / 2;
    const rootY = VIRTUAL_H / 2 + 100;
    const inPivotMode = rigEditMode === 'pivot';
    if (rigData.pivotPoints) {
        for (const [key, pv] of Object.entries(rigData.pivotPoints)) {
            const wx = rootX + (pv.x || 0);
            const wy = rootY + (pv.y || 0);
            const r = inPivotMode ? 8 / fitScale : 4 / fitScale;
            const isActive = rigDragging && rigDragging.key === key;
            ctx.save();
            ctx.fillStyle = isActive ? '#e94560' : (inPivotMode ? 'rgba(0, 180, 255, 0.9)' : 'rgba(0, 150, 255, 0.8)');
            ctx.beginPath();
            ctx.arc(wx, wy, r, 0, Math.PI * 2);
            ctx.fill();
            if (inPivotMode) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5 / fitScale;
                ctx.stroke();
            }
            ctx.restore();
            // Label in pivot mode
            if (inPivotMode) {
                const sx = wx;
                const sy = wy - r - 2 / fitScale;
                ctx.save();
                ctx.font = `${10 / fitScale}px sans-serif`;
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'center';
                ctx.fillText(key.replace('torso_', '').replace('UpperArm_', '→'), sx, sy);
                ctx.restore();
            }
        }
    }

    ctx.restore(); // undo the fitScale transform

    // Draw labels (in screen space so text isn't scaled)
    if (rigEditMode === 'view') {
        objects.forEach(obj => {
            if (!obj.img) return;
            const sx = obj.x * fitScale + offsetX;
            const sy = obj.y * fitScale + offsetY;
            ctx.save();
            ctx.font = '9px sans-serif';
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillText(obj.name, sx - 20, sy - obj.h * fitScale * 0.3);
            ctx.restore();
        });
    }

    // Mode indicator
    if (rigEditMode !== 'view') {
        ctx.save();
        ctx.font = '11px sans-serif';
        ctx.fillStyle = rigEditMode === 'pivot' ? '#00b4ff' : '#e94560';
        ctx.fillText(rigEditMode === 'pivot' ? 'PIVOT MODE — drag dots' : 'PART MODE — drag parts', 8, canvas.height - 8);
        ctx.restore();
    }

    requestAnimationFrame(renderPreview);
}

function toggleAnimation() {
    animating = !animating;
    const btn = document.getElementById('btnPlay');
    btn.textContent = animating ? 'Pause' : 'Play';
    btn.classList.toggle('active', animating);
}

/* ── Rig Edit Modes (Pivot / Part drag) ─────────────────────────── */
function setRigEditMode(mode) {
    rigEditMode = mode;
    rigDragging = null;
    ['View', 'Pivot', 'Part'].forEach(m => {
        const btn = document.getElementById('rigMode' + m);
        if (btn) btn.classList.toggle('active', m.toLowerCase() === mode);
    });
    // Pause animation in edit modes for precision
    if (mode !== 'view' && animating) {
        toggleAnimation();
    }
    // Change cursor
    const canvas = document.getElementById('previewCanvas');
    canvas.style.cursor = mode === 'view' ? 'default' : (mode === 'pivot' ? 'crosshair' : 'grab');
}

// Convert screen coordinates to virtual rig space
function screenToVirtual(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
    const vx = (sx - rigOffsetX) / rigFitScale;
    const vy = (sy - rigOffsetY) / rigFitScale;
    return { sx, sy, vx, vy };
}

// Find nearest pivot point within grab radius
function findNearestPivot(vx, vy) {
    if (!rigData || !rigData.pivotPoints) return null;
    const rootX = VIRTUAL_W / 2;
    const rootY = VIRTUAL_H / 2 + 100;
    const grabR = 15 / rigFitScale;
    let best = null;
    let bestDist = grabR;
    for (const [key, pv] of Object.entries(rigData.pivotPoints)) {
        const px = rootX + (pv.x || 0);
        const py = rootY + (pv.y || 0);
        const d = Math.hypot(vx - px, vy - py);
        if (d < bestDist) {
            bestDist = d;
            best = key;
        }
    }
    return best;
}

// Find which body part is under the cursor
function findPartUnderCursor(vx, vy) {
    if (!rigData) return null;
    const objects = computeRig(rigData);
    // Check in reverse z-order (top-most first)
    for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        if (!obj.img) continue;
        // Approximate hit test: un-rotate point into part-local space
        const dx = vx - obj.x;
        const dy = vy - obj.y;
        const cos = Math.cos(-obj.rotation);
        const sin = Math.sin(-obj.rotation);
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;
        const hw = obj.w * obj.anchorX;
        const hh = obj.h * obj.anchorY;
        if (lx >= -hw && lx <= obj.w - hw && ly >= -hh && ly <= obj.h - hh) {
            return obj.name;
        }
    }
    return null;
}

// Map part name to its pivot key (child → parent_child pivot key)
const PART_TO_PIVOT = {
    head: 'torso_head',
    leftUpperArm: 'torso_leftUpperArm',
    rightUpperArm: 'torso_rightUpperArm',
    leftThigh: 'torso_leftThigh',
    rightThigh: 'torso_rightThigh',
    leftForearm: 'leftUpperArm_leftForearm',
    rightForearm: 'rightUpperArm_rightForearm',
    leftLeg: 'leftThigh_leftLeg',
    rightLeg: 'rightThigh_rightLeg',
};

// Preview canvas mouse events
const previewCanvas = document.getElementById('previewCanvas');

previewCanvas.addEventListener('mousedown', (e) => {
    if (rigEditMode === 'view' || !rigData) return;
    const { vx, vy } = screenToVirtual(e, previewCanvas);

    if (rigEditMode === 'pivot') {
        const key = findNearestPivot(vx, vy);
        if (!key) return;
        const pv = rigData.pivotPoints[key];
        rigDragging = {
            key,
            startVX: vx, startVY: vy,
            origX: pv.x || 0, origY: pv.y || 0,
        };
        previewCanvas.style.cursor = 'grabbing';
    } else if (rigEditMode === 'part') {
        const partName = findPartUnderCursor(vx, vy);
        if (!partName || partName === 'torso') return; // can't drag torso (it's the root)
        const pivotKey = PART_TO_PIVOT[partName];
        if (!pivotKey || !rigData.pivotPoints[pivotKey]) return;
        const pv = rigData.pivotPoints[pivotKey];
        rigDragging = {
            key: pivotKey,
            partName,
            startVX: vx, startVY: vy,
            origX: pv.x || 0, origY: pv.y || 0,
        };
        previewCanvas.style.cursor = 'grabbing';
    }
});

document.addEventListener('mousemove', (e) => {
    if (!rigDragging || rigEditMode === 'view') return;
    const { vx, vy } = screenToVirtual(e, previewCanvas);
    const dx = vx - rigDragging.startVX;
    const dy = vy - rigDragging.startVY;
    const newX = Math.round(rigDragging.origX + dx);
    const newY = Math.round(rigDragging.origY + dy);
    rigData.pivotPoints[rigDragging.key].x = newX;
    rigData.pivotPoints[rigDragging.key].y = newY;
});

document.addEventListener('mouseup', () => {
    if (rigDragging) {
        rigDragging = null;
        previewCanvas.style.cursor = rigEditMode === 'pivot' ? 'crosshair' : 'grab';
        // Rebuild rig controls once on drop to sync number inputs
        buildRigControls();
    }
});

/* ── Thumbnails & Lightbox ──────────────────────────────────────── */
function showOriginalThumb(src) {
    const section = document.getElementById('originalThumbSection');
    const img = document.getElementById('originalThumb');
    img.src = src;
    section.style.display = 'block';
}

function showRigThumb() {
    if (!rigData || Object.keys(loadedImages).length === 0) return;
    const section = document.getElementById('rigThumbSection');
    section.style.display = 'block';

    const canvas = document.getElementById('rigThumb');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const objects = computeRig(rigData);
    const bounds = computeBounds(objects);
    const charW = bounds.maxX - bounds.minX;
    const charH = bounds.maxY - bounds.minY;
    const pad = 8;
    const sx = (canvas.width - pad * 2) / Math.max(charW, 1);
    const sy = (canvas.height - pad * 2) / Math.max(charH, 1);
    const fitScale = Math.min(sx, sy, 1);
    const ox = (canvas.width - charW * fitScale) / 2 - bounds.minX * fitScale;
    const oy = (canvas.height - charH * fitScale) / 2 - bounds.minY * fitScale;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(fitScale, fitScale);
    objects.forEach(obj => {
        if (!obj.img) return;
        ctx.save();
        ctx.translate(obj.x, obj.y);
        ctx.rotate(obj.rotation);
        ctx.scale(obj.scaleX, obj.scaleY);
        ctx.drawImage(obj.img, -obj.w * obj.anchorX, -obj.h * obj.anchorY, obj.w, obj.h);
        ctx.restore();
    });
    ctx.restore();
}

function showCompareThumb() {
    if (!rigData || !originalImageSrc || Object.keys(loadedImages).length === 0) return;
    const section = document.getElementById('compareThumbSection');
    section.style.display = 'block';

    // Load original image for compare if not cached
    if (!compareOrigImg || compareOrigImg.src !== originalImageSrc) {
        compareOrigImg = new Image();
        compareOrigImg.src = originalImageSrc;
    }

    const canvas = document.getElementById('compareThumb');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw original at half opacity
    if (compareOrigImg.complete) {
        ctx.globalAlpha = 0.5;
        const scale = Math.min(canvas.width / compareOrigImg.width, canvas.height / compareOrigImg.height);
        const w = compareOrigImg.width * scale;
        const h = compareOrigImg.height * scale;
        ctx.drawImage(compareOrigImg, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        ctx.globalAlpha = 1.0;
    }

    // Draw rig at half opacity on top
    ctx.globalAlpha = 0.5;
    const objects = computeRig(rigData);
    const bounds = computeBounds(objects);
    const charW = bounds.maxX - bounds.minX;
    const charH = bounds.maxY - bounds.minY;
    const pad = 8;
    const sx = (canvas.width - pad * 2) / Math.max(charW, 1);
    const sy = (canvas.height - pad * 2) / Math.max(charH, 1);
    const fitScale = Math.min(sx, sy, 1);
    const ox = (canvas.width - charW * fitScale) / 2 - bounds.minX * fitScale;
    const oy = (canvas.height - charH * fitScale) / 2 - bounds.minY * fitScale;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(fitScale, fitScale);
    objects.forEach(obj => {
        if (!obj.img) return;
        ctx.save();
        ctx.translate(obj.x, obj.y);
        ctx.rotate(obj.rotation);
        ctx.scale(obj.scaleX, obj.scaleY);
        ctx.drawImage(obj.img, -obj.w * obj.anchorX, -obj.h * obj.anchorY, obj.w, obj.h);
        ctx.restore();
    });
    ctx.restore();
    ctx.globalAlpha = 1.0;
}

function openLightbox(mode) {
    lightboxMode = mode;
    const lb = document.getElementById('lightbox');
    const title = document.getElementById('lightboxTitle');
    const img = document.getElementById('lightboxImg');
    const canvas = document.getElementById('lightboxCanvas');
    const footer = document.getElementById('lightboxFooter');

    lb.classList.add('open');

    if (mode === 'original') {
        title.textContent = 'Original Image';
        img.src = originalImageSrc || '';
        img.style.display = 'block';
        canvas.style.display = 'none';
        footer.innerHTML = '';
    } else if (mode === 'rig') {
        title.textContent = 'Rig Preview';
        img.style.display = 'none';
        canvas.style.display = 'block';
        footer.innerHTML = `
            <button id="lbPlayBtn" class="${lightboxAnimating ? 'active' : ''}"
                    onclick="toggleLightboxAnim()">
                ${lightboxAnimating ? 'Pause' : 'Play'}
            </button>
            <label style="font-size:11px;color:#aaa">Speed:</label>
            <input type="range" id="lbAnimSpeed" min="0.1" max="3" step="0.1" value="1" style="width:80px">
        `;
        lightboxAnimating = true;
        lightboxAnimTime = 0;
        lightboxLastFrame = 0;
        document.getElementById('lbPlayBtn').classList.add('active');
        document.getElementById('lbPlayBtn').textContent = 'Pause';
        lightboxRafId = requestAnimationFrame(renderLightboxRig);
    } else if (mode === 'compare') {
        title.textContent = 'Compare: Original vs Rig';
        img.style.display = 'none';
        canvas.style.display = 'block';
        compareOpacity = 0.5;
        footer.innerHTML = `
            <label style="font-size:11px;color:#aaa">Original</label>
            <input type="range" id="compareSlider" min="0" max="100" value="50"
                   style="width:200px" oninput="updateCompareOpacity(this.value)">
            <label style="font-size:11px;color:#aaa">Rig</label>
            <span style="margin-left:12px;font-size:11px;color:#aaa" id="compareLabel">50/50</span>
        `;
        // Load original image for compare canvas
        if (!compareOrigImg || compareOrigImg.src !== originalImageSrc) {
            compareOrigImg = new Image();
            compareOrigImg.onload = () => renderCompareFrame();
            compareOrigImg.src = originalImageSrc || '';
        } else {
            renderCompareFrame();
        }
    }
}

function closeLightbox(event) {
    // If called from overlay click, only close if clicking backdrop
    if (event && event.target !== document.getElementById('lightbox')) return;
    document.getElementById('lightbox').classList.remove('open');
    lightboxMode = null;
    if (lightboxRafId) {
        cancelAnimationFrame(lightboxRafId);
        lightboxRafId = null;
    }
    lightboxAnimating = false;
}

function toggleLightboxAnim() {
    lightboxAnimating = !lightboxAnimating;
    const btn = document.getElementById('lbPlayBtn');
    if (btn) {
        btn.textContent = lightboxAnimating ? 'Pause' : 'Play';
        btn.classList.toggle('active', lightboxAnimating);
    }
}

function renderLightboxRig(timestamp) {
    if (lightboxMode !== 'rig' || !rigData) return;

    const canvas = document.getElementById('lightboxCanvas');
    const ctx = canvas.getContext('2d');
    const speedEl = document.getElementById('lbAnimSpeed');
    const speed = speedEl ? parseFloat(speedEl.value) || 1 : 1;

    if (lightboxAnimating) {
        if (lightboxLastFrame > 0) {
            const dt = timestamp - lightboxLastFrame;
            lightboxAnimTime += (dt / 1000) * speed * 3;
        }
    }
    lightboxLastFrame = timestamp;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const frameRig = lightboxAnimating ? applyWalkCycle(rigData, lightboxAnimTime) : rigData;
    const objects = computeRig(frameRig);

    const bounds = computeBounds(objects);
    const charW = bounds.maxX - bounds.minX;
    const charH = bounds.maxY - bounds.minY;
    const padding = 30;
    const sx = (canvas.width - padding * 2) / Math.max(charW, 1);
    const sy = (canvas.height - padding * 2) / Math.max(charH, 1);
    const fitScale = Math.min(sx, sy, 1);
    const offsetX = (canvas.width - charW * fitScale) / 2 - bounds.minX * fitScale;
    const offsetY = (canvas.height - charH * fitScale) / 2 - bounds.minY * fitScale;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(fitScale, fitScale);

    objects.forEach(obj => {
        if (!obj.img) return;
        ctx.save();
        ctx.translate(obj.x, obj.y);
        ctx.rotate(obj.rotation);
        ctx.scale(obj.scaleX, obj.scaleY);
        ctx.drawImage(obj.img, -obj.w * obj.anchorX, -obj.h * obj.anchorY, obj.w, obj.h);
        ctx.restore();
    });

    ctx.restore();

    lightboxRafId = requestAnimationFrame(renderLightboxRig);
}

function updateCompareOpacity(val) {
    compareOpacity = val / 100;
    const label = document.getElementById('compareLabel');
    if (label) label.textContent = `${100 - val}/${val}`;
    renderCompareFrame();
}

function renderCompareFrame() {
    const canvas = document.getElementById('lightboxCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw original image (opacity = 1 - compareOpacity)
    if (compareOrigImg && compareOrigImg.complete) {
        ctx.globalAlpha = 1.0 - compareOpacity;
        const scale = Math.min(canvas.width / compareOrigImg.width, canvas.height / compareOrigImg.height);
        const w = compareOrigImg.width * scale;
        const h = compareOrigImg.height * scale;
        ctx.drawImage(compareOrigImg, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        ctx.globalAlpha = 1.0;
    }

    // Draw rig on top (opacity = compareOpacity)
    if (rigData && Object.keys(loadedImages).length > 0) {
        ctx.globalAlpha = compareOpacity;
        const objects = computeRig(rigData);
        const bounds = computeBounds(objects);
        const charW = bounds.maxX - bounds.minX;
        const charH = bounds.maxY - bounds.minY;
        const padding = 30;
        const sx = (canvas.width - padding * 2) / Math.max(charW, 1);
        const sy = (canvas.height - padding * 2) / Math.max(charH, 1);
        const fitScale = Math.min(sx, sy, 1);
        const offsetX = (canvas.width - charW * fitScale) / 2 - bounds.minX * fitScale;
        const offsetY = (canvas.height - charH * fitScale) / 2 - bounds.minY * fitScale;

        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(fitScale, fitScale);
        objects.forEach(obj => {
            if (!obj.img) return;
            ctx.save();
            ctx.translate(obj.x, obj.y);
            ctx.rotate(obj.rotation);
            ctx.scale(obj.scaleX, obj.scaleY);
            ctx.drawImage(obj.img, -obj.w * obj.anchorX, -obj.h * obj.anchorY, obj.w, obj.h);
            ctx.restore();
        });
        ctx.restore();
        ctx.globalAlpha = 1.0;
    }
}

/* ── Utilities ──────────────────────────────────────────────────── */
function setStatus(msg, type) {
    const el = document.getElementById('status');
    el.textContent = msg;
    el.className = type || '';
}

function disableButtons(disabled) {
    document.getElementById('btnRunAll').disabled = disabled;
    document.getElementById('btnDiecut').disabled = disabled;
    document.getElementById('btnRegenRig').disabled = disabled;
}

/* ── Init ───────────────────────────────────────────────────────── */
requestAnimationFrame(renderPreview);
