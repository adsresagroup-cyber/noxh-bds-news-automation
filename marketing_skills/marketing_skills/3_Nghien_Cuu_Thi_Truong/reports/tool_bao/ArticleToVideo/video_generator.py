import os
import textwrap
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from moviepy import ImageClip, concatenate_videoclips, AudioFileClip

def process_image_base(img_path, target_width=1080, target_height=1920):
    """
    Creates the base 9:16 image (blurred background + foreground).
    """
    try:
        img = Image.open(img_path).convert("RGBA")
    except Exception as e:
        print(f"Cannot open image {img_path}: {e}")
        return None

    bg = img.copy()
    bg_ratio = bg.width / bg.height
    target_ratio = target_width / target_height
    
    if bg_ratio > target_ratio:
        new_h = target_height
        new_w = int(new_h * bg_ratio)
    else:
        new_w = target_width
        new_h = int(new_w / bg_ratio)
        
    bg = bg.resize((new_w, new_h), Image.Resampling.LANCZOS)
    bg = bg.filter(ImageFilter.GaussianBlur(radius=30))
    
    left = (bg.width - target_width) / 2
    top = (bg.height - target_height) / 2
    right = (bg.width + target_width) / 2
    bottom = (bg.height + target_height) / 2
    bg = bg.crop((left, top, right, bottom))
    
    fg = img.copy()
    fg.thumbnail((target_width, target_height), Image.Resampling.LANCZOS)
    
    fg_x = (target_width - fg.width) // 2
    fg_y = (target_height - fg.height) // 2
    bg.paste(fg, (fg_x, fg_y), fg)
    
    return bg

def add_overlays(base_img, text, logo_path, output_path):
    """
    Adds frame, logo and text to the base image.
    """
    target_width, target_height = base_img.size
    frame = base_img.copy()
    
    # Add bottom frame overlay
    if os.path.exists("frame.png"):
        try:
            overlay_frame = Image.open("frame.png").convert("RGBA")
            fw, fh = overlay_frame.size
            new_fw = target_width
            new_fh = int(fh * (new_fw / fw))
            overlay_frame = overlay_frame.resize((new_fw, new_fh), Image.Resampling.LANCZOS)
            frame.paste(overlay_frame, (0, target_height - new_fh), overlay_frame)
        except Exception as e:
            print("Error adding frame:", e)
            
    # Add logo top-left
    if logo_path and os.path.exists(logo_path):
        try:
            logo = Image.open(logo_path).convert("RGBA")
            # Resize logo to fit well
            logo.thumbnail((300, 300), Image.Resampling.LANCZOS)
            frame.paste(logo, (30, 30), logo)
        except Exception as e:
            pass

    # Add text subtitle (white color)
    draw = ImageDraw.Draw(frame)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 60)
    except:
        font = ImageFont.load_default(size=60)
        
    margin = 60
    max_width = target_width - 2 * margin
    
    wrapped_text = textwrap.fill(text, width=35)
    
    bbox = draw.multiline_textbbox((0, 0), wrapped_text, font=font, align="center")
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    
    text_x = (target_width - text_w) // 2
    # Đưa text xuống dưới chữ NEWS khoảng 2 dòng (khoảng -420)
    text_y = target_height - text_h - 420
    
    # Draw text outline
    outline_color = (0, 0, 0, 255)
    outline_width = 3
    for dx in range(-outline_width, outline_width+1):
        for dy in range(-outline_width, outline_width+1):
            if dx*dx + dy*dy > outline_width*outline_width: continue
            draw.multiline_text((text_x+dx, text_y+dy), wrapped_text, font=font, fill=outline_color, align="center")
            
    # Draw white text
    draw.multiline_text((text_x, text_y), wrapped_text, font=font, fill=(255, 255, 255, 255), align="center")
    
    out = frame.convert("RGB")
    out.save(output_path, "JPEG", quality=90)
    return output_path

def create_video(image_paths, audio_path, summary_text, output_filepath="output.mp4", logo_path="logo.png", bgm_path=None):
    """
    Creates a video from a list of images and an audio file.
    Each image is displayed for a duration proportional to the audio.
    """
    if not image_paths:
        raise ValueError("No images provided for video generation.")
        
    audio_clip = AudioFileClip(audio_path)
    
    # Speed up audio by 1.25x
    try:
        audio_clip = audio_clip.with_speed_scaled(1.25)
    except AttributeError:
        # Fallback for moviepy v1
        try:
            import moviepy.audio.fx.all as afx
            audio_clip = audio_clip.fx(afx.speedx, 1.25)
        except ImportError:
            pass
        
    final_audio = audio_clip
    
    if bgm_path and os.path.exists(bgm_path):
        try:
            from moviepy import CompositeAudioClip, concatenate_audioclips
            bgm_clip = AudioFileClip(bgm_path)
            
            # Loop bgm to match duration if necessary
            if bgm_clip.duration < audio_clip.duration:
                num_loops = int(audio_clip.duration / bgm_clip.duration) + 1
                bgm_clip = concatenate_audioclips([bgm_clip] * num_loops)
                
            try:
                bgm_clip = bgm_clip.with_duration(audio_clip.duration).with_volume_scaled(0.15)
            except AttributeError:
                # Fallback for moviepy v1
                bgm_clip = bgm_clip.set_duration(audio_clip.duration).volumex(0.15)
                
            final_audio = CompositeAudioClip([audio_clip, bgm_clip])
        except Exception as e:
            print(f"Error adding BGM: {e}")

    audio_duration = final_audio.duration
    # Extract words
    import re
    summary_text = re.sub(r'http[s]?://\S+', '', summary_text)
    
    words = summary_text.split()
    total_words = len(words)
    if total_words == 0:
        words = ["Video"]
        total_words = 1
        
    # Pre-process all valid images
    valid_base_images = []
    for img_path in image_paths:
        try:
            base = process_image_base(img_path)
            if base:
                valid_base_images.append(base)
        except Exception as e:
            print(f"Error processing {img_path}: {e}")
            
    if not valid_base_images:
        raise ValueError("Could not load any valid images for the video.")
        
    import itertools
    base_image_cycle = itertools.cycle(valid_base_images)
    
    # Chunk text into max 6 words per line
    chunk_size = 6
    chunks = [" ".join(words[i:i+chunk_size]) for i in range(0, total_words, chunk_size)]
    
    duration_per_chunk = audio_duration / len(chunks)
    
    clips = []
    current_base = next(base_image_cycle)
    image_index = 0
    current_image_accum = 0.0
    
    for c, chunk in enumerate(chunks):
        target_duration = 5.0 if image_index < 2 else 15.0
        
        # Switch to new image if we have accumulated enough time on the current one
        # Exception: do not switch if it's the very first chunk (c == 0)
        if c > 0 and current_image_accum >= target_duration:
            current_base = next(base_image_cycle)
            image_index += 1
            current_image_accum = 0.0
            is_new_image = True
        else:
            is_new_image = False
            
        current_image_accum += duration_per_chunk
            
        processed_path = f"images/processed_{c}.jpg"
        add_overlays(current_base, chunk, logo_path, processed_path)
        
        clip = ImageClip(processed_path).with_duration(duration_per_chunk)
        if is_new_image:
            try:
                import moviepy.video.fx as vfx
                clip = clip.with_effects([vfx.FadeIn(0.4, initial_color=[255, 255, 255])])
            except AttributeError:
                clip = clip.fadein(0.4, [255, 255, 255])
            except ImportError:
                clip = clip.fadein(0.4, [255, 255, 255])
                
        clips.append(clip)
            
    if not clips:
        raise ValueError("Could not load any images for the video.")
        
    video = concatenate_videoclips(clips, method="compose")
    video = video.with_audio(final_audio)
    
    video.write_videofile(output_filepath, fps=24, codec="libx264", audio_codec="aac", threads=4)
    
    try:
        audio_clip.close()
        final_audio.close()
    except:
        pass
    video.close()
    
    return output_filepath
