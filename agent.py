import argparse
import os
from typing import Type
from pydantic import BaseModel, Field

from langchain.tools import BaseTool
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import create_agent
from google import genai

from processing import diecut
from processing import bboxes
from processing import change_background, change_alpha
from processing.simple_background import remove_background_simple
from processing.genai_background import remove_background_genai

client = genai.Client()

class DiecutInput(BaseModel):
    image_path: str = Field(description="Input image path (e.g., 'tobyturtle.png')")
    output_path: str = Field(description="Output path for the diecut image (e.g., 'diecut.png')")

class DiecutTool(BaseTool):
    name: str = "diecut"
    description: str = (
        "Create a single composite diecut image that preserves the original pose and proportions, "
        "with the character cleanly separated into these 10 parts in the same image: "
        "head, torso, right_arm, left_arm, right_forearm, left_forearm, right_thigh, left_thigh, right_leg, left_leg. "
        "Input: image_path. Output: diecut composite saved to output_path."
    )
    args_schema: Type[BaseModel] = DiecutInput

    def _run(self, image_path: str, output_path: str):
        try:
            diecut(client, image_path, output_path)
            return f"Diecut image saved successfully to {output_path}"
        except Exception as e:
            return f"Error running diecut: {str(e)}"

class BboxesInput(BaseModel):
    image_path: str = Field(description="Input image path")
    output_folder: str = Field(description="Folder where cropped parts will be saved")

class BboxesTool(BaseTool):
    name: str = "bboxes"
    description: str = (
        "Detects exactly 10 body parts in the given image and writes PNG crops into output_folder. "
        "Output filenames are the labels in English: head, torso, right_arm, left_arm, right_forearm, "
        "left_forearm, right_thigh, left_thigh, right_leg, left_leg (e.g., head.png)."
    )
    args_schema: Type[BaseModel] = BboxesInput

    def _run(self, image_path: str, output_folder: str):
        try:
            bboxes(client, image_path, output_folder)
            return f"Part crops saved successfully to folder {output_folder}"
        except Exception as e:
            return f"Error running bboxes: {str(e)}"

class RemoveBackgroundInput(BaseModel):
    pieces_dir: str = Field(description="Folder with PNG parts output from bboxes")
    use_genai: bool = Field(default=False, description="Use GenAI background removal (slower)")
    tolerance: int = Field(default=30, description="Color tolerance for local removal (0-255)")

class RemoveBackgroundTool(BaseTool):
    name: str = "remove_background"
    description: str = (
        "Removes background for every PNG part inside pieces_dir. By default it uses a fast local "
        "color-based removal and overwrites each PNG in-place. If use_genai=true, it uses slower "
        "GenAI background passes."
    )
    args_schema: Type[BaseModel] = RemoveBackgroundInput

    def _run(self, pieces_dir: str, use_genai: bool = False, tolerance: int = 30):
        try:
            removeBackground(pieces_dir, use_genai=use_genai, tolerance=tolerance)
            return f"Background removed for all parts in {pieces_dir}"
        except Exception as e:
            return f"Error running removeBackground: {str(e)}"


def removeBackground(pieces_dir: str, use_genai: bool = False, tolerance: int = 30):
    if not os.path.isdir(pieces_dir):
        raise FileNotFoundError(f"Parts folder not found: {pieces_dir}")

    for filename in os.listdir(pieces_dir):
        if not filename.lower().endswith(".png"):
            continue

        part_path = os.path.join(pieces_dir, filename)
        base_name = os.path.splitext(filename)[0]

        if use_genai:
            remove_background_genai(client, part_path, tolerance=tolerance)
        else:
            remove_background_simple(part_path, tolerance=tolerance)

def agenticDiecut(image_path: str, diecut_output: str, pieces_dir: str):
    model = "gemini-3-pro-preview"
    temperature = 0
    llm = ChatGoogleGenerativeAI(
        model=model,
        temperature=temperature,
        convert_system_message_to_human=True
    )

    tools = [DiecutTool(), BboxesTool(), RemoveBackgroundTool()]

    agent = create_agent(
        model=llm,
        tools=tools,
        system_prompt=(
            "You are an animator artist specializing in character die-cutting. "
            "You must execute the following steps SEQUENTIALLY. Wait for each tool to finish before calling the next: "
            "1. Call 'diecut' to create the composite image. "
            "2. AFTER 'diecut' succeeds, call 'bboxes' to extract the pieces into a folder. "
            "3. AFTER 'bboxes' succeeds, call 'remove_background' on that folder to clean the pieces. "
            "DO NOT call these tools in parallel in the same turn, as each depends on the previous one's output."
        ),
        debug=True
    )

    task = (
        f"Take the image '{image_path}', first apply diecut saving it as "
        f"'{diecut_output}', then extract the pieces from that result into the "
        f"folder '{pieces_dir}', then remove the background from all pieces in "
        f"that folder."
    )

    print(f"Running task: {task}")

    try:
        for update in agent.stream(
            {"messages": [{"role": "user", "content": task}]},
            stream_mode="updates",
        ):
            print(update)
    except Exception as e:
        print(f"Error during agent execution: {str(e)}")

def main():
    parser = argparse.ArgumentParser(description="Run diecut + piece extraction with an agent.")
    parser.add_argument("--image", default="resources/hippo.png", help="Input image path")
    parser.add_argument("--diecut-output", default="diecut.png", help="Diecut output path")
    parser.add_argument("--pieces-dir", default="parts", help="Pieces output folder")
    args = parser.parse_args()

    agenticDiecut(args.image, args.diecut_output, args.pieces_dir)

if __name__ == "__main__":
    main()