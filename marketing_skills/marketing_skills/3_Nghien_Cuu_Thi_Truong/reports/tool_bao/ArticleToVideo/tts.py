import os
import asyncio
import requests
import time
from gtts import gTTS
from dotenv import load_dotenv

def generate_audio(text, output_filepath="audio.mp3", voice="vi-VN-NamMinhNeural"):
    """
    Generates TTS audio from text.
    Uses FPT AI, Edge-TTS, or gTTS depending on the voice ID.
    """
    load_dotenv(override=True)
    
    # FPT AI Integration (Requires FPT_API_KEY in .env)
    if voice.startswith("fpt_"):
        fpt_key = os.getenv("FPT_API_KEY")
        if fpt_key:
            fpt_voice = voice.replace("fpt_", "")
            url = "https://api.fpt.ai/hmi/tts/v5"
            headers = {
                "api-key": fpt_key,
                "voice": fpt_voice
            }
            payload = text
            try:
                response = requests.post(url, data=payload.encode('utf-8'), headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    if "async" in data:
                        audio_url = data["async"]
                        # Poll until audio is ready
                        for _ in range(30):
                            time.sleep(2)
                            try:
                                audio_res = requests.get(audio_url)
                                # FPT AI returns 404 or JSON while processing. Only save if 200 and not JSON
                                if audio_res.status_code == 200 and "application/json" not in audio_res.headers.get("Content-Type", ""):
                                    with open(output_filepath, "wb") as f:
                                        f.write(audio_res.content)
                                    return output_filepath
                            except Exception:
                                pass
                        print("FPT API timeout while polling.")
                else:
                    print("FPT API Error:", response.text)
            except Exception as e:
                print("FPT API Exception:", e)
        else:
            print("FPT_API_KEY not found in .env!")

    # ElevenLabs Integration (Requires ELEVENLABS_API_KEY in .env)
    elif voice.startswith("eleven_"):
        eleven_key = os.getenv("ELEVENLABS_API_KEY")
        if eleven_key:
            voice_id = voice.replace("eleven_", "")
            url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
            headers = {
                "Accept": "audio/mpeg",
                "Content-Type": "application/json",
                "xi-api-key": eleven_key
            }
            payload = {
                "text": text,
                "model_id": "eleven_turbo_v2_5",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75
                }
            }
            try:
                response = requests.post(url, json=payload, headers=headers)
                if response.status_code == 200:
                    with open(output_filepath, "wb") as f:
                        f.write(response.content)
                    return output_filepath
                else:
                    error_msg = f"ElevenLabs API Error: {response.text}"
                    print(error_msg)
                    raise Exception(error_msg)
            except Exception as e:
                print("ElevenLabs API Exception:", e)
                raise Exception(f"Lỗi kết nối ElevenLabs: {str(e)}")
        else:
            print("ELEVENLABS_API_KEY not found in .env!")
            raise Exception("Thiếu mã ELEVENLABS_API_KEY trong file .env")

    # Microsoft Edge TTS Integration
    elif voice.startswith("vi-VN-"):
        try:
            import edge_tts
            
            async def _generate():
                communicate = edge_tts.Communicate(text, voice)
                await communicate.save(output_filepath)
                
            asyncio.run(_generate())
            
            if os.path.exists(output_filepath):
                return output_filepath
        except Exception as e:
            print(f"Edge-TTS Error: {e}. Falling back to gTTS.")

    # Fallback to gTTS (Northern Female)
    tts = gTTS(text=text, lang='vi', slow=False)
    tts.save(output_filepath)
    return output_filepath
