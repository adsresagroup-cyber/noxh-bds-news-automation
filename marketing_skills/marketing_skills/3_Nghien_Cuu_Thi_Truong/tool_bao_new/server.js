require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const puppeteer = require('puppeteer-core');
const { execSync } = require('child_process');

const { scrapeArticle } = require('./scraper');
const { generateAudio, getFFmpegPath } = require('./tts');
const { getDailyNews, generateCuratedScript, getRssSources, saveRssSource, deleteRssSource } = require('./crawler_service');

const app = express();
const PORT = process.env.PORT || 8000;

// Multer storage configuration
const upload = multer({ dest: 'uploads/' });

// Create required directories
const staticDir = path.join(__dirname, 'static');
const outputDir = path.join(__dirname, 'output');
const uploadsDir = path.join(__dirname, 'uploads');

fs.mkdirSync(staticDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

// Serve static assets
app.use('/static', express.static(staticDir));
app.use('/output', express.static(outputDir));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Tasks in-memory status store
const tasks = {};

// Default BGM Config
const defaultBgmUrl = 'https://raw.githubusercontent.com/rafaelreis-hotmart/Audio-Sample-files/refs/heads/master/sample.mp3';
const defaultBgmPath = path.join(staticDir, 'default_bgm.mp3');

async function downloadFile(url, dest) {
    const writer = fs.createWriteStream(dest);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: {
            'User-Agent': 'Mozilla/5.0'
        }
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

async function ensureDefaultBgm() {
    if (!fs.existsSync(defaultBgmPath)) {
        console.log("Downloading default BGM...");
        try {
            await downloadFile(defaultBgmUrl, defaultBgmPath);
            console.log("Default BGM downloaded successfully.");
        } catch (e) {
            console.warn("Could not download default BGM:", e.message);
        }
    }
}

// Fallback logic if Gemini is unavailable
function getFallbackScenes(title, text) {
    const paragraphs = text.split('\n').filter(p => p.trim().length > 10);
    const textToUse = paragraphs.length > 0 ? paragraphs.join(' ') : text;
    
    // Split text into roughly 6 sentences or clauses
    const sentences = textToUse.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 5);
    const totalSentences = sentences.length;
    
    const scenes = [];
    if (totalSentences > 0) {
        const sentencesPerScene = Math.max(1, Math.ceil(totalSentences / 6));
        for (let i = 0; i < 6; i++) {
            const startIdx = i * sentencesPerScene;
            if (startIdx >= totalSentences) break;
            const slice = sentences.slice(startIdx, startIdx + sentencesPerScene);
            scenes.push({ text: slice.join('. ') + '.' });
        }
    } else {
        scenes.push({ text: title });
    }
    
    // Fill up to 6 scenes if needed
    while (scenes.length < 6) {
        scenes.push({ text: scenes[scenes.length - 1]?.text || title });
    }
    
    return {
        title: title.substring(0, 50).toUpperCase(),
        scenes: scenes.slice(0, 6)
    };
}

// AI Content Summarization via OpenRouter (Gemini)
async function summarizeText(title, text) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn("No GEMINI_API_KEY found, using fallback summaries.");
        return getFallbackScenes(title, text);
    }
    
    try {
        const prompt = `Bạn là biên kịch video tin tức ngắn chuyên nghiệp. Hãy biên tập lại bài viết sau thành một kịch bản đọc tin tức video ngắn bằng tiếng Việt.
YÊU CẦU BẮT BUỘC:
1. Kịch bản phải được chia thành đúng 6 phân cảnh (scenes), mỗi phân cảnh là một đoạn thoại ngắn, mạch lạc, thu hút.
2. Tổng độ dài toàn bộ kịch bản khoảng 120-150 từ (tương đương 60 giây đọc).
3. Định dạng phản hồi dưới dạng đối tượng JSON hợp lệ duy nhất có cấu trúc:
{
  "title": "Tiêu đề giật tít ngắn gọn của video (in hoa toàn bộ, dưới 15 từ)",
  "scenes": [
    { "text": "Lời thoại đọc lồng tiếng cho phân cảnh 1 (khoảng 20-25 từ)" },
    { "text": "Lời thoại đọc lồng tiếng cho phân cảnh 2 (khoảng 20-25 từ)" },
    { "text": "Lời thoại đọc lồng tiếng cho phân cảnh 3 (khoảng 20-25 từ)" },
    { "text": "Lời thoại đọc lồng tiếng cho phân cảnh 4 (khoảng 20-25 từ)" },
    { "text": "Lời thoại đọc lồng tiếng cho phân cảnh 5 (khoảng 20-25 từ)" },
    { "text": "Lời thoại đọc lồng tiếng cho phân cảnh 6 (khoảng 20-25 từ)" }
  ]
}
Tuyệt đối chỉ trả về JSON, không thêm bất kỳ văn bản giải thích hay markdown code blocks nào ngoài JSON.

Tiêu đề gốc: ${title}
Nội dung bài viết:
${text}`;

        const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
            model: "google/gemini-2.5-flash",
            messages: [
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.3
        }, {
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            timeout: 30000
        });

        const content = response.data.choices[0].message.content.trim();
        return JSON.parse(content);
    } catch (e) {
        console.error("Gemini API Error:", e.message);
        return getFallbackScenes(title, text);
    }
}

// Background generation task runner
async function processVideoTask(taskId, url, scriptText, voice, bgmPath, extraImages) {
    const taskDir = path.join(outputDir, taskId);
    fs.mkdirSync(taskDir, { recursive: true });
    
    try {
        // Step 1: Scrape article
        tasks[taskId] = { status: "scraping", message: "Đang cào dữ liệu bài báo..." };
        const scraped = await scrapeArticle(url, path.join(taskDir, 'scraped_images'));
        
        let imageUrls = [...scraped.images];
        if (extraImages && extraImages.length > 0) {
            imageUrls.unshift(...extraImages);
        }
        
        // Copy default "Dự Án Treo" images as fallback/supplement if we have fewer than 6 images
        if (imageUrls.length < 6) {
            const defaultAssetsDir = 'C:\\Users\\Admin\\.antigravity-ide\\marketing_skills\\marketing_skills\\3_Nghien_Cuu_Thi_Truong\\news_project_treo_assets';
            const defaultAssets = ['scene1.png', 'scene2.png', 'scene3.png', 'scene4.png', 'scene5.png', 'scene6.png'];
            
            const defaultImagesDir = path.join(taskDir, 'default_images');
            fs.mkdirSync(defaultImagesDir, { recursive: true });
            
            for (let i = 0; i < defaultAssets.length && imageUrls.length < 6; i++) {
                const assetName = defaultAssets[i];
                const srcPath = path.join(defaultAssetsDir, assetName);
                const destPath = path.join(defaultImagesDir, assetName);
                
                if (fs.existsSync(srcPath)) {
                    fs.copyFileSync(srcPath, destPath);
                    imageUrls.push(destPath);
                }
            }
        }
        
        // Ensure relative URLs are used by the HTML template
        imageUrls = imageUrls.map(img => {
            const rel = path.relative(taskDir, img).replace(/\\/g, '/');
            return rel;
        });

        // Step 2: Summarize text or structure manual script
        tasks[taskId] = { status: "summarizing", message: "Đang biên tập kịch bản (AI)..." };
        let scriptData;
        
        if (scriptText && scriptText.trim()) {
            // Split custom script into 6 paragraphs/sentences
            const lines = scriptText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            const scenes = [];
            
            if (lines.length >= 6) {
                // Take first 6 lines
                for (let i = 0; i < 6; i++) scenes.push({ text: lines[i] });
            } else {
                // Split lines further if necessary
                const allSentences = scriptText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 5);
                const sentencesPerScene = Math.max(1, Math.ceil(allSentences.length / 6));
                for (let i = 0; i < 6; i++) {
                    const slice = allSentences.slice(i * sentencesPerScene, (i + 1) * sentencesPerScene);
                    if (slice.length > 0) {
                        scenes.push({ text: slice.join('. ') + '.' });
                    }
                }
            }
            
            while (scenes.length < 6) {
                scenes.push({ text: scenes[scenes.length - 1]?.text || scraped.title });
            }
            
            scriptData = {
                title: scraped.title.substring(0, 50).toUpperCase(),
                scenes: scenes.slice(0, 6)
            };
        } else {
            scriptData = await summarizeText(scraped.title, scraped.text);
        }

        // Step 3: Generate Voiceover audio
        tasks[taskId] = { status: "tts", message: "Đang tạo giọng lồng tiếng (TTS)..." };
        const fullVoiceoverText = scriptData.scenes.map(s => s.text).join(' ');
        const rawAudioPath = path.join(taskDir, 'voice_raw.mp3');
        await generateAudio(fullVoiceoverText, voice, rawAudioPath);

        // Step 4: Mix with Background Music
        tasks[taskId] = { status: "tts", message: "Đang ghép nhạc nền..." };
        const finalAudioPath = path.join(taskDir, 'audio_final.mp3');
        const ffmpeg = getFFmpegPath();
        const activeBgm = bgmPath || (fs.existsSync(defaultBgmPath) ? defaultBgmPath : null);

        if (activeBgm) {
            console.log(`Mixing audio with BGM: ${activeBgm}...`);
            // Voice volume: 2.0, BGM volume: 0.08, ends when voice ends
            const cmd = `"${ffmpeg}" -i "${rawAudioPath}" -i "${activeBgm}" -filter_complex "[0:a]volume=2.0[a0];[1:a]volume=0.08[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2" -y "${finalAudioPath}"`;
            execSync(cmd, { stdio: 'ignore' });
        } else {
            // Just copy raw audio
            fs.copyFileSync(rawAudioPath, finalAudioPath);
        }

        // Step 5: Generate dynamic simulator page
        tasks[taskId] = { status: "rendering", message: "Đang tạo simulator xem trước..." };
        const slidesTemplate = imageUrls.map((img, idx) => {
            const cls = idx === 0 ? "fade active" : 
                        idx % 3 === 1 ? "slide-left" : 
                        idx % 3 === 2 ? "slide-up" : "zoom";
            return `
            <div class="slide ${cls}" id="slide\${idx + 1}">
                <div class="slide-bg" style="background-image: url('${img}');"></div>
                <img class="slide-img" src="${img}" alt="Slide \${idx + 1}">
            </div>`;
        }).join('\n');

        // Mapping script scenes to dynamic slides
        const sceneDataJson = scriptData.scenes.map((s, idx) => ({
            id: idx + 1,
            slideId: `slide${(idx % imageUrls.length) + 1}`,
            text: s.text,
            words: s.text.split(/\s+/).map((word, i) => ({ text: word, index: i }))
        }));

        // Load simulator template and inject data
        const templatePath = path.join(staticDir, 'simulator_template.html');
        let htmlContent = fs.readFileSync(templatePath, 'utf8');
        htmlContent = htmlContent
            .replace('{TITLE}', scriptData.title)
            .replace('{AUDIO_SRC}', 'audio_final.mp3')
            .replace('{SLIDES_HTML}', slidesTemplate)
            .replace('{SCENES_JSON}', JSON.stringify(sceneDataJson));

        fs.writeFileSync(path.join(taskDir, 'simulator.html'), htmlContent, 'utf8');

        // Step 6: Puppeteer Recording (Frame-by-frame capture)
        tasks[taskId] = { status: "rendering", message: "Đang ghi hình video từng frame..." };
        
        const tempFramesDir = path.join(taskDir, 'temp_frames');
        fs.mkdirSync(tempFramesDir, { recursive: true });

        console.log("Launching Puppeteer...");
        const browser = await puppeteer.launch({
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            headless: true
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 360, height: 640 });
        
        // Open the local simulator page in Puppeteer
        const simulatorUrl = `http://localhost:${PORT}/output/${taskId}/simulator.html?recording=true`;
        console.log(`Opening page: ${simulatorUrl}`);
        await page.goto(simulatorUrl, { waitUntil: 'networkidle0' });

        // Retrieve duration
        const duration = await page.evaluate(() => window.getDuration());
        console.log(`Video duration: ${duration} seconds.`);
        
        const fps = 25;
        const totalFrames = Math.ceil(duration * fps);
        const frameTime = 1 / fps;

        // Step manual seeking and screenshot loop
        for (let f = 0; f < totalFrames; f++) {
            const time = f * frameTime;
            await page.evaluate((t) => window.seekTo(t), time);
            
            const frameFilename = `frame_${String(f).padStart(4, '0')}.jpg`;
            const framePath = path.join(tempFramesDir, frameFilename);
            
            const element = await page.$('#videoContainer');
            await element.screenshot({ path: framePath, type: 'jpeg', quality: 90 });
            
            if (f % 50 === 0) {
                console.log(`Rendered ${f}/${totalFrames} frames.`);
            }
        }
        await browser.close();

        // Step 7: Final FFmpeg Concat & Compile
        tasks[taskId] = { status: "rendering", message: "Đang kết xuất video..." };
        const outputVideoPath = path.join(taskDir, 'video.mp4');

        const cmd = `"${ffmpeg}" -framerate 25 -i "${path.join(tempFramesDir, 'frame_%04d.jpg')}" -i "${finalAudioPath}" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest -y "${outputVideoPath}"`;
        execSync(cmd, { stdio: 'ignore' });
        console.log("FFmpeg compile successful.");

        // Cleanup temporary frame screenshots
        fs.readdirSync(tempFramesDir).forEach(f => fs.unlinkSync(path.join(tempFramesDir, f)));
        fs.rmdirSync(tempFramesDir);

        tasks[taskId] = {
            status: "completed",
            video_url: `/output/${taskId}/video.mp4`,
            simulator_url: `/output/${taskId}/simulator.html`
        };

    } catch (e) {
        console.error(`Task ${taskId} failed:`, e.stack);
        tasks[taskId] = { status: "error", message: e.message };
    }
}

// API Endpoints
app.post('/api/generate', upload.fields([
    { name: 'bgm_file', maxCount: 1 },
    { name: 'extra_images', maxCount: 10 }
]), async (req, res) => {
    const { url, script, voice, duration } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: "Missing article URL" });
    }

    const taskId = `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const taskDir = path.join(outputDir, taskId);
    fs.mkdirSync(taskDir, { recursive: true });

    // Handle uploaded BGM file
    let bgmPath = null;
    if (req.files && req.files['bgm_file']) {
        const file = req.files['bgm_file'][0];
        bgmPath = path.join(taskDir, `uploaded_bgm${path.extname(file.originalname)}`);
        fs.renameSync(file.path, bgmPath);
    }

    // Handle extra images
    const extraImagesPaths = [];
    if (req.files && req.files['extra_images']) {
        const files = req.files['extra_images'];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const dest = path.join(taskDir, `extra_image_${i}${path.extname(file.originalname)}`);
            fs.renameSync(file.path, dest);
            extraImagesPaths.push(dest);
        }
    }

    tasks[taskId] = { status: "starting", message: "Đang khởi tạo nhiệm vụ..." };

    // Fire off background process
    processVideoTask(taskId, url, script, voice || 'vi-VN-NamMinhNeural', bgmPath, extraImagesPaths);

    res.json({ task_id: taskId });
});

app.get('/api/status/:task_id', (req, res) => {
    const taskId = req.params.task_id;
    if (!tasks[taskId]) {
        return res.status(404).json({ error: "Task not found" });
    }
    res.json(tasks[taskId]);
});

// Curated News Script processing pipeline
async function processCuratedVideoTask(taskId, newsUrls, scriptData, voice, bgmPath, extraImages) {
    const taskDir = path.join(outputDir, taskId);
    fs.mkdirSync(taskDir, { recursive: true });
    
    try {
        tasks[taskId] = { status: "scraping", message: "Đang tải hình ảnh từ các bài báo..." };
        let imageUrls = [];
        
        // Scraping images from selected articles in parallel
        const scrapePromises = newsUrls.map(async (url, idx) => {
            try {
                const scraped = await scrapeArticle(url, path.join(taskDir, `scraped_images_${idx}`));
                return scraped.images || [];
            } catch (err) {
                console.warn(`Failed to scrape ${url}:`, err.message);
                return [];
            }
        });
        
        const results = await Promise.all(scrapePromises);
        results.forEach(imgs => imageUrls.push(...imgs));
        
        if (extraImages && extraImages.length > 0) {
            imageUrls.unshift(...extraImages);
        }
        
        // Copy default images as fallback if we have fewer than 6 images
        if (imageUrls.length < 6) {
            const defaultAssetsDir = 'C:\\Users\\Admin\\.antigravity-ide\\marketing_skills\\marketing_skills\\3_Nghien_Cuu_Thi_Truong\\news_project_treo_assets';
            const defaultAssets = ['scene1.png', 'scene2.png', 'scene3.png', 'scene4.png', 'scene5.png', 'scene6.png'];
            const defaultImagesDir = path.join(taskDir, 'default_images');
            fs.mkdirSync(defaultImagesDir, { recursive: true });
            
            for (let i = 0; i < defaultAssets.length && imageUrls.length < 6; i++) {
                const assetName = defaultAssets[i];
                const srcPath = path.join(defaultAssetsDir, assetName);
                const destPath = path.join(defaultImagesDir, assetName);
                if (fs.existsSync(srcPath)) {
                    fs.copyFileSync(srcPath, destPath);
                    imageUrls.push(destPath);
                }
            }
        }
        
        // Limit to 12 images max to make the rendering fast
        imageUrls = imageUrls.slice(0, 12);
        
        // Ensure relative URLs are used by the HTML template
        imageUrls = imageUrls.map(img => {
            const rel = path.relative(taskDir, img).replace(/\\/g, '/');
            return rel;
        });

        // Step 2: Voiceover audio from script
        tasks[taskId] = { status: "tts", message: "Đang tạo giọng lồng tiếng (TTS)..." };
        const fullVoiceoverText = scriptData.scenes.map(s => s.text).join(' ');
        const rawAudioPath = path.join(taskDir, 'voice_raw.mp3');
        await generateAudio(fullVoiceoverText, voice, rawAudioPath);

        // Step 3: Mix with Background Music
        tasks[taskId] = { status: "tts", message: "Đang ghép nhạc nền..." };
        const finalAudioPath = path.join(taskDir, 'audio_final.mp3');
        const ffmpeg = getFFmpegPath();
        const activeBgm = bgmPath || (fs.existsSync(defaultBgmPath) ? defaultBgmPath : null);

        if (activeBgm) {
            console.log(`Mixing audio with BGM: ${activeBgm}...`);
            const cmd = `"${ffmpeg}" -i "${rawAudioPath}" -i "${activeBgm}" -filter_complex "[0:a]volume=2.0[a0];[1:a]volume=0.08[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2" -y "${finalAudioPath}"`;
            execSync(cmd, { stdio: 'ignore' });
        } else {
            fs.copyFileSync(rawAudioPath, finalAudioPath);
        }

        // Step 4: Generate dynamic simulator page
        tasks[taskId] = { status: "rendering", message: "Đang tạo simulator xem trước..." };
        const slidesTemplate = imageUrls.map((img, idx) => {
            const cls = idx === 0 ? "fade active" : 
                        idx % 3 === 1 ? "slide-left" : 
                        idx % 3 === 2 ? "slide-up" : "zoom";
            return `
            <div class="slide ${cls}" id="slide${idx + 1}">
                <div class="slide-bg" style="background-image: url('${img}');"></div>
                <img class="slide-img" src="${img}" alt="Slide ${idx + 1}">
            </div>`;
        }).join('\n');

        const sceneDataJson = scriptData.scenes.map((s, idx) => ({
            id: idx + 1,
            slideId: `slide${(idx % imageUrls.length) + 1}`,
            text: s.text,
            words: s.text.split(/\s+/).map((word, i) => ({ text: word, index: i }))
        }));

        const templatePath = path.join(staticDir, 'simulator_template.html');
        let htmlContent = fs.readFileSync(templatePath, 'utf8');
        htmlContent = htmlContent
            .replace('{TITLE}', scriptData.title)
            .replace('{AUDIO_SRC}', 'audio_final.mp3')
            .replace('{SLIDES_HTML}', slidesTemplate)
            .replace('{SCENES_JSON}', JSON.stringify(sceneDataJson));

        fs.writeFileSync(path.join(taskDir, 'simulator.html'), htmlContent, 'utf8');

        // Step 5: Puppeteer Recording
        tasks[taskId] = { status: "rendering", message: "Đang ghi hình video từng frame..." };
        const tempFramesDir = path.join(taskDir, 'temp_frames');
        fs.mkdirSync(tempFramesDir, { recursive: true });

        console.log("Launching Puppeteer for curated video...");
        const browser = await puppeteer.launch({
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            headless: true
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 360, height: 640 });
        
        const simulatorUrl = `http://localhost:${PORT}/output/${taskId}/simulator.html?recording=true`;
        console.log(`Opening curated simulator: ${simulatorUrl}`);
        await page.goto(simulatorUrl, { waitUntil: 'networkidle0' });

        const duration = await page.evaluate(() => window.getDuration());
        const fps = 25;
        const totalFrames = Math.ceil(duration * fps);
        const frameTime = 1 / fps;

        for (let f = 0; f < totalFrames; f++) {
            const time = f * frameTime;
            await page.evaluate((t) => window.seekTo(t), time);
            const frameFilename = `frame_${String(f).padStart(4, '0')}.jpg`;
            const framePath = path.join(tempFramesDir, frameFilename);
            const element = await page.$('#videoContainer');
            await element.screenshot({ path: framePath, type: 'jpeg', quality: 90 });
        }
        await browser.close();

        // Step 6: Final FFmpeg Compile
        tasks[taskId] = { status: "rendering", message: "Đang kết xuất video..." };
        const outputVideoPath = path.join(taskDir, 'video.mp4');
        const cmd = `"${ffmpeg}" -framerate 25 -i "${path.join(tempFramesDir, 'frame_%04d.jpg')}" -i "${finalAudioPath}" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest -y "${outputVideoPath}"`;
        execSync(cmd, { stdio: 'ignore' });

        // Cleanup
        fs.readdirSync(tempFramesDir).forEach(f => fs.unlinkSync(path.join(tempFramesDir, f)));
        fs.rmdirSync(tempFramesDir);

        tasks[taskId] = {
            status: "completed",
            video_url: `/output/${taskId}/video.mp4`,
            simulator_url: `/output/${taskId}/simulator.html`
        };

    } catch (e) {
        console.error(`Curated Task ${taskId} failed:`, e.stack);
        tasks[taskId] = { status: "error", message: e.message };
    }
}

// Route to fetch daily summarized real estate news with date range filters
app.get('/api/daily-news', async (req, res) => {
    const force = req.query.force === 'true';
    const rangeType = req.query.range || 'today';
    const startDate = req.query.start || '';
    const endDate = req.query.end || '';
    try {
        const news = await getDailyNews(force, rangeType, startDate, endDate);
        res.json(news);
    } catch (e) {
        console.error("Daily News API Error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// Route to generate script from selected stories with prompt and custom AI provider configuration
app.post('/api/generate-script', async (req, res) => {
    const { selected_news, prompt, llm_provider, llm_api_key, llm_model, llm_base_url } = req.body;
    if (!selected_news || !Array.isArray(selected_news) || selected_news.length === 0 || selected_news.length > 4) {
        return res.status(400).json({ error: "Yêu cầu chọn từ 1 đến 4 tin tức để viết kịch bản." });
    }
    
    try {
        const scriptData = await generateCuratedScript(selected_news, prompt, {
            provider: llm_provider,
            apiKey: llm_api_key,
            model: llm_model,
            baseUrl: llm_base_url
        });
        res.json(scriptData);
    } catch (e) {
        console.error("Generate Script API Error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// Get RSS sources list
app.get('/api/rss-sources', (req, res) => {
    try {
        const sources = getRssSources();
        res.json(sources);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Add RSS source
app.post('/api/rss-sources', (req, res) => {
    const { url, name } = req.body;
    if (!url || !name) {
        return res.status(400).json({ error: "Thiếu URL hoặc Tên nguồn báo" });
    }
    try {
        saveRssSource({ url, name });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete RSS source
app.delete('/api/rss-sources', (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: "Thiếu URL nguồn báo cần xóa" });
    }
    try {
        deleteRssSource(url);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Route to generate video from curated script
app.post('/api/generate-curated-video', upload.fields([
    { name: 'bgm_file', maxCount: 1 },
    { name: 'extra_images', maxCount: 10 }
]), async (req, res) => {
    const { script_data, voice, news_urls } = req.body;
    
    if (!script_data) {
        return res.status(400).json({ error: "Thiếu dữ liệu kịch bản" });
    }
    if (!news_urls) {
        return res.status(400).json({ error: "Thiếu danh sách liên kết tin tức" });
    }

    let parsedScriptData;
    let parsedUrls;
    try {
        parsedScriptData = typeof script_data === 'string' ? JSON.parse(script_data) : script_data;
        parsedUrls = typeof news_urls === 'string' ? JSON.parse(news_urls) : news_urls;
    } catch (err) {
        return res.status(400).json({ error: "Định dạng JSON của script_data hoặc news_urls không hợp lệ" });
    }

    const taskId = `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const taskDir = path.join(outputDir, taskId);
    fs.mkdirSync(taskDir, { recursive: true });

    // Handle BGM file
    let bgmPath = null;
    if (req.files && req.files['bgm_file']) {
        const file = req.files['bgm_file'][0];
        bgmPath = path.join(taskDir, `uploaded_bgm${path.extname(file.originalname)}`);
        fs.renameSync(file.path, bgmPath);
    }

    // Handle extra images
    const extraImagesPaths = [];
    if (req.files && req.files['extra_images']) {
        const files = req.files['extra_images'];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const dest = path.join(taskDir, `extra_image_${i}${path.extname(file.originalname)}`);
            fs.renameSync(file.path, dest);
            extraImagesPaths.push(dest);
        }
    }

    tasks[taskId] = { status: "starting", message: "Đang khởi tạo nhiệm vụ video tổng hợp..." };

    // Start background process
    processCuratedVideoTask(taskId, parsedUrls, parsedScriptData, voice || 'vi-VN-NamMinhNeural', bgmPath, extraImagesPaths);

    res.json({ task_id: taskId });
});

// Default UI routes
app.get('/', (req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
});

// Boot server
ensureDefaultBgm().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running at http://localhost:${PORT}`);
    });
});
