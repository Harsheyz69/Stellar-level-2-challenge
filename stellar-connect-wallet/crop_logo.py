import os
from PIL import Image, ImageChops

def trim(im):
    bg = Image.new(im.mode, im.size, im.getpixel((0,0)))
    diff = ImageChops.difference(im, bg)
    diff = ImageChops.add(diff, diff, 2.0, -100)
    bbox = diff.getbbox()
    if bbox:
        return im.crop(bbox)
    return im

# Load image
img_path = r"C:\Users\harsh\.gemini\antigravity\brain\07179cf1-5df4-4468-837f-af5155e96b25\hero_logo_verification_dark_mode_1776270585893.png"
if not os.path.exists(img_path):
    print("Screenshot not found at:", img_path)
    exit(1)

img = Image.open(img_path)

# Approximate crop to the center where the logo is
w, h = img.size
# Crop a 400x400 area in the center horizontally, and slightly above center vertically
box = (w//2 - 200, h//2 - 200, w//2 + 200, h//2)
cropped = img.crop(box)

# Now trim away the background
bg_color = cropped.getpixel((0, 0))
bg = Image.new(cropped.mode, cropped.size, bg_color)
diff = ImageChops.difference(cropped, bg)
diff = ImageChops.add(diff, diff, 2.0, -10)
bbox = diff.getbbox()

if bbox:
    # Add a little padding to make it a nice square
    logo = cropped.crop(bbox)
    lw, lh = logo.size
    size = max(lw, lh) + 20
    square = Image.new("RGB", (size, size), bg_color)
    square.paste(logo, ((size - lw) // 2, (size - lh) // 2))
else:
    square = cropped

# Resize and save
public_dir = r"c:\Users\harsh\OneDrive\Desktop\stellar-connect-wallet\Stellar-connect-wallet-challenge\stellar-connect-wallet\public"
square.resize((512, 512)).save(os.path.join(public_dir, "logo512.png"))
square.resize((192, 192)).save(os.path.join(public_dir, "logo192.png"))
square.resize((64, 64)).save(os.path.join(public_dir, "favicon.ico"), format='ICO')

print("Created favicon.ico, logo192.png, logo512.png")
