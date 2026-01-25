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
        "head, torso, right_arm, left_arm, right_hand, left_hand, right_leg, left_leg, right_foot, left_foot. "
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
        "Output filenames are the labels in English: head, right_arm, left_arm, torso, right_leg, "
        "left_leg, right_hand, left_hand, right_foot, left_foot (e.g., head.png)."
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

def agenticDiecut(task: str):
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
            "You are an animator artist. Your mission is to die-cut characters. "
            "You have tools to: 1) 'diecut' an image, 2) 'bboxes' to extract parts, "
            "and 3) 'remove_background' from extracted parts. "
            "Follow the user instructions naturally."
        ),
        debug=True
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
    parser.add_argument("prompt", nargs="*", help="Natural language command for the agent")
    args = parser.parse_args()

    if not args.prompt:
        parser.print_help()
        return

    task = " ".join(args.prompt)
    agenticDiecut(task)

if __name__ == "__main__":
    main()