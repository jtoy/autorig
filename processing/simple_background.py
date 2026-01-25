from PIL import Image, ImageDraw, ImageFilter


def remove_background_simple(image_path: str, tolerance: int = 30):
    """
    Removes the background using a flood-fill approach and cleans up edges.
    """
    image = Image.open(image_path).convert("RGBA")
    width, height = image.size
    
    # We'll work on a temporary RGB copy for color comparison
    rgb_image = image.convert("RGB")
    
    # Create a mask image to floodfill (initially all black)
    mask = Image.new("L", (width, height), 0)
    
    # We use a white fill for the background area in our mask
    # We need to sample the actual background color for the floodfill thresh to work
    for seed in [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]:
        ImageDraw.floodfill(mask, seed, 255, value_thresh=tolerance, image=rgb_image)
    
    # Clean up the mask: Dilate it slightly to catch anti-aliased edges
    # MaxFilter(3) will expand the white (255) areas by 1 pixel
    mask = mask.filter(ImageFilter.MaxFilter(3))
    
    # Optional: slight blur to feather the edges
    mask = mask.filter(ImageFilter.GaussianBlur(radius=0.5))
    
    # Apply mask to alpha channel
    # Original alpha * (1 - mask/255)
    # But simpler: just use mask to set transparency
    pixels = image.getdata()
    mask_pixels = mask.getdata()
    new_pixels = []
    
    for i in range(len(pixels)):
        r, g, b, a = pixels[i]
        m = mask_pixels[i]
        
        # New alpha: if mask is 255 (bg), alpha is 0. If mask is 0 (fg), alpha is original.
        # We can interpolate for smoother edges
        new_a = int(a * (1.0 - m / 255.0))
        new_pixels.append((r, g, b, new_a))
            
    image.putdata(new_pixels)
    image.save(image_path)
