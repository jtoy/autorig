import io
import os
from google.genai import types
from PIL import Image

def diecut(client, imagePath, outputPath, fail_on_review: bool = False):
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
    EXTRACT the character into 10 separate pieces on a white background: 
    head, torso, right_upperarm, left_upperarm, right_forearm, left_forearm, right_thigh, left_thigh, right_calf, left_calf.
    MUST be 10 EXACTLY.
    You have to put the pieces along the horizontal axis, with some spacing in between. As the example shows.
    Keep the original position, style, line weight, proportions, and details EXACTLY as in the original image.
    Please keep attention to the hands. We do not have common fingers! Do not try to redraw or modify them.
    
    Image 1 is the example of an input. Image 2 is the example of a good diecut, use it as a guide but not as a model. Image 3 is the input to process.
    """

    if not os.path.exists(imagePath):
       raise FileNotFoundError(f"Image file not found: {imagePath}")

    # Load zero-shot examples
    example_input_path = os.path.join(os.path.dirname(__file__), "..", "resources", "tobyturtle.png")
    example_output_path = os.path.join(os.path.dirname(__file__), "..", "resources", "tobyturtle-diecut2.png")
    
    example_input = Image.open(example_input_path)

    example_output = Image.open(example_output_path)

    image = Image.open(imagePath)
    
    def pil_to_bytes(img):
        buffer = io.BytesIO()
        img.save(buffer, "PNG")
        return buffer.getvalue()

    def extract_inline_image(parts):
        for part in parts:
            if part.inline_data is not None:
                return part.inline_data.data, (part.inline_data.mime_type or "image/png")
        return None, None

    def review_image(original_bytes, generated_bytes, generated_mime):
        verifier_model = "gemini-3-pro-preview"
        verify_prompt = """
        Compare the ORIGINAL image with the DIECUT result.
        Reject if there are any style changes, finger/detail modifications, pose/layout changes,
        missing/extra parts, or labels. Reply with 'REJECTED' and a brief reason if any issue exists.
        Reply with 'APPROVED' only if it is a faithful extraction.
        The diecut parts must be placed along the horizontal axis with some spacing in between, as shown in the example:
        head, torso, right_upperarm, left_upperarm, right_forearm, left_forearm, right_thigh, left_thigh, right_calf, left_calf.
        MUST be 10 EXACTLY.

        Write the things to correct as a bulleted list. Like this:
        Things to correct:
        - Reason 1
        - Reason 2
        
        
        Image 1 example. Image 2 example diecut. Image 3 is the image to diecut. Image 4 is the DIECUT to verify.
        """

        verify_response = client.models.generate_content(
            model=verifier_model,
            contents=[
                types.Part.from_bytes(data=pil_to_bytes(example_input), mime_type="image/png"),
                types.Part.from_text(text="EXAMPLE OF CHARACTER INPUT"),
                types.Part.from_bytes(data=pil_to_bytes(example_output), mime_type="image/png"),
                types.Part.from_text(text="EXAMPLE OF A GOOD DIECUT"),
                types.Part.from_text(text=verify_prompt),
                types.Part.from_text(text="ORIGINAL"),
                types.Part.from_bytes(data=original_bytes, mime_type="image/png"),
                types.Part.from_text(text="DIECUT"),
                types.Part.from_bytes(data=generated_bytes, mime_type=generated_mime or "image/png"),
            ],
            config=types.GenerateContentConfig(temperature=0),
        )

        feedback = verify_response.text.strip()
        approved = "APPROVED" in feedback.upper() and "REJECTED" not in feedback.upper()
        return feedback, approved

    chat = client.chats.create(
        model=model,
        config=types.GenerateContentConfig(
            response_modalities=["TEXT", "IMAGE"],
            temperature=temperature,
            image_config=types.ImageConfig(
                aspect_ratio="16:9",
                # image_size="1K",
            ),
        ),
    )

    round_prompts = 5
    generated_bytes = None
    generated_mime = None
    last_feedback = None
    for round_index in range(1, round_prompts + 1):
        if round_index == 1:
            message_parts = [
                types.Part.from_text(text=prompt),
                types.Part.from_text(text="Example Input"),
                types.Part.from_bytes(data=pil_to_bytes(example_input), mime_type="image/png"),
                types.Part.from_text(text="Example Output"),
                types.Part.from_bytes(data=pil_to_bytes(example_output), mime_type="image/png"),
                types.Part.from_text(text="Now process this image"),
                types.Part.from_bytes(data=pil_to_bytes(image), mime_type="image/png"),
            ]
        else:
            if generated_bytes is None:
                raise ValueError("No generated image returned from previous round.")
            message_parts = [
                types.Part.from_text(text=last_feedback),
            ]

        response = chat.send_message(message_parts)
        generated_bytes, generated_mime = extract_inline_image(response.parts)
        if generated_bytes is None:
            raise ValueError("No image returned by model.")

        feedback, approved = review_image(pil_to_bytes(image), generated_bytes, generated_mime)
        print(f"Verification Result (round {round_index}): {feedback}")
        last_feedback = None if approved else feedback

        if round_index == round_prompts and not approved:
            if fail_on_review:
                print("Final review failed; saving output and raising error per fail_on_review=True.")
            else:
                print("Final review failed; saving output without raising.")

    if generated_bytes is None:
        raise ValueError("No final image bytes available for saving.")

    output_image = Image.open(io.BytesIO(generated_bytes))
    output_image.save(outputPath)

    if last_feedback and fail_on_review:
        raise ValueError(f"Visual verification failed: {last_feedback}")
