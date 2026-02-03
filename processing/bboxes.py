import os
import json
import io
import base64
from google.genai import types
from PIL import Image


def parse_json(json_output: str) -> str:
    lines = json_output.splitlines()
    for i, line in enumerate(lines):
        if line.strip() == "```json":
            json_output = "\n".join(lines[i + 1:])
            json_output = json_output.split("```")[0]
            break
    return json_output

def bboxes(client, inputPath, outputFolder):
    """
    Detects 10 parts of a figure and saves crops to outputFolder.

    Note:
        The crops are plain rectangular cutouts, so they keep a solid background.
        If you need transparency, run background removal on each crop afterward.
    
    Args:
        client: The Google GenAI client instance.
        inputPath: Path to the input image file.
        outputFolder: Path where the cropped images will be saved.
    """
    model = "gemini-3-flash-preview"
    temperature = 0
    prompt = """
    Task: ONLY detect and return bounding boxes. Do not edit, redraw, or reinterpret the image.
    Detect exactly these 10 parts of the figure: head, torso, right_upperarm, left_upperarm, right_forearm, left_forearm, right_thigh, left_thigh, right_calf, left_calf.
    Return exactly 10 SEPARATE bounding boxes in [ymin, xmin, ymax, xmax] format normalized to 0-1000.
    IF there are more but you have alredy detected 10, just ignore the rest.
    Always choose the most complete box that contains the entire part.
    Output a JSON array of objects, each with 'box_2d' and 'label'.
    Keep the original drawing exactly as-is: same pose, same fingers, same proportions, same design. No alterations.
    """

    if not os.path.exists(inputPath):
        raise FileNotFoundError(f"Image file not found: {inputPath}")

    image = Image.open(inputPath)
    width, height = image.size

    response = client.models.generate_content(
        model=model,
        contents=[image, prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=temperature,
        )
    )

    bounding_boxes = json.loads(response.text)
    items = bounding_boxes if isinstance(bounding_boxes, list) else bounding_boxes.get("items", [])

    os.makedirs(outputFolder, exist_ok=True)

    for i, item in enumerate(items):
        label = item.get("label", f"part_{i}").replace(" ", "_").lower()
        box = item.get("box_2d") if isinstance(item, dict) else item
        
        if box and len(box) == 4:
            abs_y1 = int(box[0]/1000 * height)
            abs_x1 = int(box[1]/1000 * width)
            abs_y2 = int(box[2]/1000 * height)
            abs_x2 = int(box[3]/1000 * width)
            
            crop = image.crop((abs_x1, abs_y1, abs_x2, abs_y2))
            
            filename = f"{label}.png"
            save_path = os.path.join(outputFolder, filename)
            crop.save(save_path)


def segmentation_masks(client, inputPath, outputFolder, parts=None):
    """
    Generates segmentation masks and transparent cutouts for parts of a figure.

    Args:
        client: The Google GenAI client instance.
        inputPath: Path to the input image file.
        outputFolder: Path where the masks and cutouts will be saved.
        parts: Optional list of part labels to detect.
    """
    model = "gemini-3-flash-preview"
    temperature = 0

    if parts is None:
        parts = [
            "head",
            "right_arm",
            "left_arm",
            "torso",
            "right_thigh",
            "left_thigh",
            "right_forearm",
            "left_forearm",
            "right_leg",
            "left_leg",
        ]

    parts_list = ", ".join([f"'{part}'" for part in parts])

    prompt = f"""
    Task: Detect and return segmentation masks. Do not edit, redraw, or reinterpret the image.
    Detect exactly these parts of the figure: {parts_list}.
    Return a JSON array of objects, each with 'box_2d', 'mask', and 'label'.
    box_2d is [ymin, xmin, ymax, xmax] normalized to 0-1000.
    mask is a base64-encoded PNG (optionally prefixed with data:image/png;base64,).
    Keep the original drawing exactly as-is: same pose, same fingers, same proportions, same design. No alterations.
    """

    if not os.path.exists(inputPath):
        raise FileNotFoundError(f"Image file not found: {inputPath}")

    image = Image.open(inputPath)
    width, height = image.size

    response = client.models.generate_content(
        model=model,
        contents=[image, prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=temperature,
        ),
    )

    segmentation = json.loads(parse_json(response.text))
    items = segmentation if isinstance(segmentation, list) else segmentation.get("items", [])

    os.makedirs(outputFolder, exist_ok=True)

    for i, item in enumerate(items):
        if not isinstance(item, dict):
            continue

        label = item.get("label", f"part_{i}").replace(" ", "_").lower()
        box = item.get("box_2d")
        mask_str = item.get("mask")

        if not box or len(box) != 4 or not mask_str:
            continue

        abs_y1 = int(box[0] / 1000 * height)
        abs_x1 = int(box[1] / 1000 * width)
        abs_y2 = int(box[2] / 1000 * height)
        abs_x2 = int(box[3] / 1000 * width)

        if abs_y1 >= abs_y2 or abs_x1 >= abs_x2:
            continue

        if mask_str.startswith("data:image/png;base64,"):
            mask_str = mask_str.split(",", 1)[1]

        try:
            mask_data = base64.b64decode(mask_str)
        except (ValueError, TypeError):
            continue

        mask = Image.open(io.BytesIO(mask_data)).convert("L")
        mask = mask.resize((abs_x2 - abs_x1, abs_y2 - abs_y1), Image.Resampling.BILINEAR)
        mask = mask.point(lambda p: 255 if p > 128 else 0)

        crop = image.crop((abs_x1, abs_y1, abs_x2, abs_y2)).convert("RGBA")
        crop.putalpha(mask)

        mask_filename = f"{label}_{i}_mask.png"
        segment_filename = f"{label}_{i}_segment.png"

        mask.save(os.path.join(outputFolder, mask_filename))
        crop.save(os.path.join(outputFolder, segment_filename))
