# turtlediecutter

Character die-cutting pipeline using Gemini.

## Requirements
- Conda env: `conjurors`
- Python deps from `requirements.txt`
- Google GenAI API key (environment variable)
- (Optional) `distark-check` CLI for rig validation

## Setup
1) Activate env
```
conda activate conjurors
```

2) Install deps (inside env)
```
pip install -r requirements.txt
```

3) Set API key
```
export GEMINI_API_KEY="your_key_here"
```

4) Install distark-check (optional, for rig validation)
```
npm install distark-render
```

## Run: full pipeline (diecut -> bboxes -> remove background -> rig -> validate)
```
python agent.py --image resources/hippo.png --diecut-output diecut.png --pieces-dir parts
```

Outputs:
- `diecut.png`: composite diecut image
- `parts/`: 10 part PNG crops
- `rig.json`: distark-compatible rig (validated with `distark-check verify` if installed)

## Notes
- The diecut step uses a 3-round refinement with reviewer feedback.
- If you want the review to raise on failure, set `fail_on_review=True` in `processing/diecut.py`.
- If `distark-check` is not installed, rig generation still works but skips validation with a warning.
