import os
from google import genai
from google.genai import types
from PIL import Image

def diecut(client, imagePath, outputPath):
    """
    Performs character die-cutting for animation using Gemini.
    Separates head, torso, arms, hands, legs, and feet into a single image.
    
    Args:
        client: The Google GenAI client instance.
        imagePath: Path to the input image file.
        outputPath: Path where the resulting image will be saved.
    """
    model = "gemini-3-pro-image-preview"
    temperature = 0
    prompt = """
    I need to die-cut the character for animation. Separate head, torso, arms, hands, legs, and feet: 10 parts.
    Parts: 'head', 'right_arm', 'left_arm', 'torso', 'right_leg', 'left_leg', 'right_hand', 'left_hand', 'right_foot', 'left_foot'.
    torso: is from neck to hips
    legs: are from hips to feet
    arms: are from shoulders to elbows
    hands: are from elbow to fingertips
    feet: are from ankles to toes
    Keep the original drawing exactly as-is: same pose, same fingers, same proportions, same design. No alterations.
    Drawing is allowed if there is a missing part, but keep the style consistent.
    White background.
    """

    if not os.path.exists(imagePath):
       raise FileNotFoundError(f"Image file not found: {imagePath}")

    image = Image.open(imagePath)
    
    response = client.models.generate_content(
        model=model,
        contents=[prompt, image],
        config=types.GenerateContentConfig(
            temperature=temperature,
        ),
    )

    for part in response.parts:
        if part.text is not None:
            print(f"Response text: {part.text}")
        elif part.inline_data is not None:
            generated_img = part.as_image()
            generated_img.save(outputPath)
            break
