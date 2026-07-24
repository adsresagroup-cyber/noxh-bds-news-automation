import os
import json
from dotenv import load_dotenv

load_dotenv()

# We will try to use Gemini API if available, otherwise just truncate the text for MVP
def summarize_text(text, target_words=130):
    """
    Summarizes the text to approximately `target_words` words, 
    which corresponds to roughly 60 seconds of speech.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel('gemini-1.5-flash')
            duration_sec = int(target_words / 2.5)
            prompt = f"Biên tập lại bài viết sau đây thành một kịch bản đọc tin tức bằng tiếng Việt. YÊU CẦU BẮT BUỘC: Độ dài bài viết MỚI phải đạt CHÍNH XÁC khoảng {target_words} từ (tương đương {duration_sec} giây đọc). Nếu bài gốc quá ngắn, hãy tự viết mở rộng thêm phân tích/chi tiết để đạt đủ {target_words} từ. Nếu bài gốc dài, hãy tóm tắt lại. Bỏ qua tên tác giả, ngày tháng. Vào thẳng vấn đề chính:\n\n{text}"
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            print(f"Error using Gemini API: {e}")
            pass
            
    # Fallback to naive truncation if no API key or error
    print("Warning: Using naive truncation for summarization because no GEMINI_API_KEY was found or an error occurred.")
    
    # Aggressively clean up typical news prefixes (date, author, category)
    import re
    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        line_lower = line.lower()
        if len(line) < 100 and ('|' in line or 'am' in line_lower or 'pm' in line_lower or 'theo ' in line_lower):
            continue
        cleaned_lines.append(line)
    
    clean_text = " ".join(cleaned_lines)
    
    words = clean_text.split()
    if len(words) > target_words:
        summary = " ".join(words[:target_words])
    else:
        summary = clean_text
    return summary
