from PIL import Image


def remove_background_simple(image_path: str, tolerance: int = 30):
    """
    Removes a solid background by sampling the top-left pixel and setting close colors to transparent.

    Args:
        image_path: Path to the PNG image to process (overwritten in place).
        tolerance: Color tolerance (0-255).
    """
    image = Image.open(image_path).convert("RGBA")
    bg = image.getpixel((0, 0))[:3]
    pixels = image.getdata()
    new_pixels = []

    for r, g, b, a in pixels:
        if max(abs(r - bg[0]), abs(g - bg[1]), abs(b - bg[2])) <= tolerance:
            new_pixels.append((r, g, b, 0))
        else:
            new_pixels.append((r, g, b, a))

    image.putdata(new_pixels)
    image.save(image_path)