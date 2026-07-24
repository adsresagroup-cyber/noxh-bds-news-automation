from fastapi import FastAPI, BackgroundTasks
import uvicorn
import threading
import time
from tts import generate_audio

def run_tts():
    try:
        generate_audio("Xin chào", "test_fastapi.mp3", "vi-VN-NamMinhNeural")
        print("TTS Success inside thread")
    except Exception as e:
        print("TTS Failed inside thread:", e)

def test_bg():
    print("Testing bg task...")
    run_tts()

test_bg()
