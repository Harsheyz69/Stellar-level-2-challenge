import os
from PIL import Image

# Load the user-provided logo image
img_path = r"C:\Users\harsh\.gemini\antigravity\brain\07179cf1-5df4-4468-837f-af5155e96b25\media__1776270949363.png"

try:
    img = Image.open(img_path)
except Exception as e:
    print(f"Error opening image: {e}")
    exit(1)

# Ensure the image is square by cropping from center if it's rectangular
w, h = img.size
min_dim = min(w, h)
left = (w - min_dim) / 2
top = (h - min_dim) / 2
right = (w + min_dim) / 2
bottom = (h + min_dim) / 2

img_square = img.crop((left, top, right, bottom))
# Convert to RGBA just to be safe with formats
img_square = img_square.convert("RGBA")

# Resize and save
public_dir = r"c:\Users\harsh\OneDrive\Desktop\stellar-connect-wallet\Stellar-connect-wallet-challenge\stellar-connect-wallet\public"

# Create resolutions
img_square.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(public_dir, "logo512.png"))
img_square.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(public_dir, "logo192.png"))

# For ICO, we might need to composite a white background if there is transparency
# or resize appropriately. Pillow can save direct to ICO.
img_square.resize((64, 64), Image.Resampling.LANCZOS).save(os.path.join(public_dir, "favicon.ico"), format='ICO')

print("Created favicon.ico, logo192.png, logo512.png using the new user-provided logo.")
