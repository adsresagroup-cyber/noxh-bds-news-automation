import os
from fastapi import FastAPI, BackgroundTasks, Request, Form, UploadFile, File

# ... existing imports ...
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid
import asyncio

from scraper import scrape_article
from summarizer import summarize_text
from tts import generate_audio
from video_generator import create_video

app = FastAPI(title="Article to Video API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure directories exist
os.makedirs("static", exist_ok=True)
os.makedirs("output", exist_ok=True)
os.makedirs("images", exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/output", StaticFiles(directory="output"), name="output")

# In-memory store for task statuses
tasks = {}

def process_video_task(task_id: str, url: str, script: str = None, duration_sec: int = 60, bgm_path: str = None, voice: str = "gtts", extra_images: list = None):
    try:
        tasks[task_id] = {"status": "scraping", "message": "Đang cào dữ liệu bài báo..."}
        article_data = scrape_article(url)
        
        if extra_images:
            article_data["images"].extend(extra_images)
            
        if not article_data["images"]:
            tasks[task_id] = {"status": "error", "message": "Không tìm thấy hình ảnh trong bài báo và không có ảnh bổ sung."}
            return
            
        if script and script.strip():
            tasks[task_id] = {"status": "summarizing", "message": "Đang dùng kịch bản Voice-off của bạn..."}
            summary = script.strip()
        else:
            tasks[task_id] = {"status": "summarizing", "message": "Đang tóm tắt nội dung (AI)..."}
            # Calculate target words based on duration (approx 2.5 words per second)
            target_words = int(duration_sec * 2.5)
            summary = summarize_text(article_data["text"], target_words=target_words)
        
        tasks[task_id] = {"status": "tts", "message": "Đang tạo giọng đọc (Voiceover)..."}
        audio_path = f"output/{task_id}.mp3"
        generate_audio(summary, audio_path, voice)
        
        tasks[task_id] = {"status": "rendering", "message": "Đang ghép video..."}
        video_path = f"output/{task_id}.mp4"
        create_video(article_data["images"], audio_path, summary, video_path, "logo.png", bgm_path)
        
        tasks[task_id] = {"status": "completed", "video_url": f"/output/{task_id}.mp4"}
        
    except Exception as e:
        print(f"Error processing task {task_id}: {e}")
        tasks[task_id] = {"status": "error", "message": str(e)}

from typing import List

@app.post("/api/generate")
async def generate_video(
    background_tasks: BackgroundTasks,
    url: str = Form(...),
    script: str = Form(None),
    duration: str = Form("60"),
    voice: str = Form("gtts"),
    bgm_file: UploadFile = File(None),
    extra_images: List[UploadFile] = File(None)
):
    task_id = str(uuid.uuid4())
    
    # Save BGM file if provided
    bgm_path = None
    if bgm_file and bgm_file.filename:
        bgm_path = f"output/{task_id}_bgm.mp3"
        with open(bgm_path, "wb") as f:
            f.write(await bgm_file.read())
            
    # Save extra images
    saved_extra_images = []
    if extra_images:
        for i, img in enumerate(extra_images):
            if img and img.filename:
                ext = img.filename.split(".")[-1]
                img_path = f"images/{task_id}_extra_{i}.{ext}"
                with open(img_path, "wb") as f:
                    f.write(await img.read())
                saved_extra_images.append(img_path)
            
    # Parse duration
    try:
        duration_sec = int(duration)
    except:
        duration_sec = 60
        
    tasks[task_id] = {"status": "starting", "message": "Đang khởi tạo..."}
    background_tasks.add_task(process_video_task, task_id, url, script, duration_sec, bgm_path, voice, saved_extra_images)
    return {"task_id": task_id}

@app.get("/api/status/{task_id}")
async def get_status(task_id: str):
    if task_id not in tasks:
        return {"status": "not_found"}
    return tasks[task_id]

@app.get("/", response_class=HTMLResponse)
async def get_ui():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
