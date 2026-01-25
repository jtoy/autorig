import numpy as np
from PIL import Image

def change_alpha(black_path, white_path, output_path, threshold=30):
    """
    Combines an image with a black background and one with a white background
    to create a PNG with a transparent background.

    Args:
        black_path (str): Path to the image with a black background.
        white_path (str): Path to the image with a white background.
        output_path (str): Path where the resulting transparent PNG will be saved.
        threshold (int): Tolerance value (0-255) for color difference.
    """
    try:
        img_b = Image.open(black_path).convert("RGB")
        img_w = Image.open(white_path).convert("RGB")
    except FileNotFoundError as e:
        print(f"Error loading images: {e}")
        return None

    if img_b.size != img_w.size:
        print("Error: Images must have the same dimensions.")
        return None

    # Convert to Numpy arrays for fast calculation
    arr_b = np.array(img_b, dtype=np.int16)
    arr_w = np.array(img_w, dtype=np.int16)

    # Calculate the absolute difference between the two images
    diff = np.abs(arr_b - arr_w)
    diff_map = np.max(diff, axis=2)

    # Create Alpha mask based on the difference
    alpha_channel = np.zeros_like(diff_map, dtype=np.uint8)
    
    # Where difference is low, it's the object (opaque)
    alpha_channel[diff_map <= threshold] = 255

    # Merge channels
    r, g, b = img_w.split()
    alpha_img = Image.fromarray(alpha_channel)
    final_img = Image.merge("RGBA", (r, g, b, alpha_img))

    final_img.save(output_path, "PNG")
    return final_img