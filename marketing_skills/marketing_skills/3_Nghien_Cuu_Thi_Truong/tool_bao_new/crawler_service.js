const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const sourcesPath = path.join(__dirname, 'output', 'rss_sources.json');

const defaultSources = [
    { url: "https://vnexpress.net/rss/bat-dong-san.rss", name: "VnExpress" },
    { url: "https://vietnamnet.vn/rss/bat-dong-san.rss", name: "VietnamNet" },
    { url: "https://cafef.vn/bat-dong-san.rss", name: "CafeF" },
    { url: "https://dantri.com.vn/rss/bat-dong-san.rss", name: "Dân Trí" },
    { url: "https://tuoitre.vn/rss/kinh-doanh.rss", name: "Tuổi Trẻ" },
    { url: "https://laodong.vn/rss/bat-dong-san.rss", name: "Lao Động" },
    { url: "https://baoxaydung.vn/rss/bat-dong-san.rss", name: "Báo Xây Dựng" }
];

function getRssSources() {
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    if (!fs.existsSync(sourcesPath)) {
        fs.writeFileSync(sourcesPath, JSON.stringify(defaultSources, null, 2), 'utf8');
        return defaultSources;
    }
    try {
        return JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
    } catch (e) {
        console.error("Failed to read rss_sources.json, using default:", e.message);
        return defaultSources;
    }
}

function saveRssSource(source) {
    const sources = getRssSources();
    if (sources.some(x => x.url.toLowerCase() === source.url.toLowerCase())) return;
    sources.push(source);
    fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2), 'utf8');
}

function deleteRssSource(url) {
    const sources = getRssSources();
    const filtered = sources.filter(x => x.url.toLowerCase() !== url.toLowerCase());
    fs.writeFileSync(sourcesPath, JSON.stringify(filtered, null, 2), 'utf8');
}

const reKeywords = [
    "bất động sản", "bds", "nhà đất", "đất nền", "chung cư", "dự án", "quy hoạch", 
    "nhà ở", "căn hộ", "biệt thự", "shophouse", "đô thị", "đầu tư bđs", "luật đất đai", 
    "đền bù", "thu hồi", "tái định cư", "khu công nghiệp", "giao thông", "hạ tầng", 
    "cao tốc", "lãi suất", "ngân hàng", "tín dụng", "vành đai"
];

function getJaccardSimilarity(t1, t2) {
    if (!t1 || !t2) return 0;
    const w1 = new Set(t1.toLowerCase().split(/\s+/).filter(w => w.length > 1));
    const w2 = new Set(t2.toLowerCase().split(/\s+/).filter(w => w.length > 1));
    if (w1.size === 0 || w2.size === 0) return 0;
    
    const intersection = new Set([...w1].filter(x => w2.has(x)));
    const union = new Set([...w1, ...w2]);
    return intersection.size / union.size;
}

function isDateInRange(pubDate, rangeType, startDate, endDate) {
    if (!pubDate) return true; 
    const date = new Date(pubDate);
    if (isNaN(date.getTime())) return true;
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    
    if (rangeType === 'today') {
        return date >= todayStart && date <= todayEnd;
    } else if (rangeType === 'yesterday') {
        const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
        const yesterdayEnd = new Date(todayEnd.getTime() - 24 * 60 * 60 * 1000);
        return date >= yesterdayStart && date <= yesterdayEnd;
    } else if (rangeType === 'custom') {
        const start = startDate ? new Date(startDate) : null;
        if (start) start.setHours(0,0,0,0);
        const end = endDate ? new Date(endDate) : null;
        if (end) end.setHours(23,59,59,999);
        
        if (start && date < start) return false;
        if (end && date > end) return false;
        return true;
    }
    return true;
}

async function scrapeRssFeeds(rangeType = 'today', startDate = '', endDate = '') {
    const candidates = [];
    const activeFeeds = getRssSources();
    
    for (const feed of activeFeeds) {
        try {
            console.log(`Scraping RSS feed: ${feed.name} (${feed.url})`);
            const response = await axios.get(feed.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 10000
            });
            
            if (response.status !== 200) continue;
            
            const $ = cheerio.load(response.data, { xmlMode: true });
            
            $('item').each((i, el) => {
                const title = $(el).find('title').text().trim();
                const link = $(el).find('link').text().trim();
                const pubDate = $(el).find('pubDate').text().trim();
                
                if (!isDateInRange(pubDate, rangeType, startDate, endDate)) return;

                let rawDesc = $(el).find('description').text().trim();
                let cleanDesc = rawDesc;
                
                if (rawDesc.includes('<')) {
                    try {
                        const $desc = cheerio.load(rawDesc);
                        cleanDesc = $desc.text().trim();
                    } catch (err) {
                        cleanDesc = rawDesc.replace(/<[^>]*>/g, '').trim();
                    }
                }
                
                if (!title || !link) return;
                
                const textToCheck = `${title} ${cleanDesc}`.toLowerCase();
                const isRelevant = reKeywords.some(kw => textToCheck.includes(kw));
                
                if (isRelevant) {
                    candidates.push({ title, link, pubDate, description: cleanDesc, source: feed.name });
                }
            });
        } catch (e) {
            console.warn(`Failed to scrape RSS feed ${feed.name}: ${e.message}`);
        }
    }
    
    const candidatesBySource = {};
    for (const item of candidates) {
        if (!candidatesBySource[item.source]) candidatesBySource[item.source] = [];
        candidatesBySource[item.source].push(item);
    }
    
    const uniqueCandidates = [];
    const sourceNames = Object.keys(candidatesBySource);
    let maxLen = 0;
    sourceNames.forEach(srcName => maxLen = Math.max(maxLen, candidatesBySource[srcName].length));
    
    for (let i = 0; i < maxLen; i++) {
        for (const srcName of sourceNames) {
            if (i < candidatesBySource[srcName].length) {
                const item = candidatesBySource[srcName][i];
                if (uniqueCandidates.some(x => x.link === item.link)) continue;
                const isDuplicate = uniqueCandidates.some(x => getJaccardSimilarity(x.title, item.title) > 0.45);
                if (isDuplicate) continue;
                uniqueCandidates.push(item);
                if (uniqueCandidates.length >= 45) break;
            }
        }
        if (uniqueCandidates.length >= 45) break;
    }
    return uniqueCandidates;
}

function cleanJsonString(str) {
    let cleaned = str.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    return cleaned;
}

async function getDailyNews(force = false, rangeType = 'today', startDate = '', endDate = '') {
    const today = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    
    const dateParamsId = `${rangeType}_${startDate || ''}_${endDate || ''}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cachePath = path.join(outputDir, `daily_news_${todayStr}_${dateParamsId}.json`);
    
    if (!force && fs.existsSync(cachePath)) {
        try {
            const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            if (cached && cached.length > 0) return cached;
        } catch (e) { console.warn("Failed to read daily news cache:", e.message); }
    }
    
    const candidates = await scrapeRssFeeds(rangeType, startDate, endDate);
    if (candidates.length === 0) return [];
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        const fallbackList = candidates.slice(0, 25).map((item, idx) => ({
            id: idx + 1, title: item.title, link: item.link, source: item.source, 
            summary: item.description ? item.description.substring(0, 150) + "..." : item.title
        }));
        fs.writeFileSync(cachePath, JSON.stringify(fallbackList, null, 2), 'utf8');
        return fallbackList;
    }
    
    try {
        const prompt = `Bạn là biên tập viên báo chí và chuyên gia phân tích thị trường Bất động sản Việt Nam.
1. Chọn ra đúng 25 tin tức quan trọng.
2. Với mỗi tin, hãy viết tóm tắt 2-3 câu súc tích.
3. Tuyển chọn tin tức cân đối giữa các nguồn báo.
4. Định dạng đối tượng JSON cấu trúc: {"articles": [{"title": "...", "link": "...", "source": "...", "summary": "..."}]}
Tuyệt đối chỉ trả về JSON, không giải thích.

Danh sách: ${JSON.stringify(candidates.map((c, i) => ({ id: i + 1, title: c.title, link: c.link, source: c.source, description: c.description.substring(0, 300) })), null, 2)}`;

        const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
            model: "google/gemini-2.5-flash",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.2
        }, { headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 45000 });
        
        const content = response.data.choices[0].message.content.trim();
        const parsed = JSON.parse(cleanJsonString(content));
        
        if (parsed && parsed.articles && parsed.articles.length > 0) {
            const formatted = parsed.articles.map((item, idx) => ({
                id: idx + 1, title: item.title, link: item.link, source: item.source, summary: item.summary
            }));
            fs.writeFileSync(cachePath, JSON.stringify(formatted, null, 2), 'utf8');
            return formatted;
        } else throw new Error("Invalid output");
    } catch (e) {
        const fallbackList = candidates.slice(0, 25).map((item, idx) => ({
            id: idx + 1, title: item.title, link: item.link, source: item.source, summary: item.description ? item.description.substring(0, 150) + "..." : item.title
        }));
        fs.writeFileSync(cachePath, JSON.stringify(fallbackList, null, 2), 'utf8');
        return fallbackList;
    }
}

function wrapRawTextAsJson(text, defaultTitle = "BẢN TIN BẤT ĐỘNG SẢN") {
    // Clean markdown code blocks if any
    let cleanText = text.replace(/^```[a-z]*\s*/i, '').replace(/```$/, '').trim();
    
    // Split by sentences
    const sentences = cleanText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 5);
    const scenes = [];
    
    if (sentences.length >= 6) {
        const sentencesPerScene = Math.max(1, Math.ceil(sentences.length / 6));
        for (let i = 0; i < 6; i++) {
            const slice = sentences.slice(i * sentencesPerScene, (i + 1) * sentencesPerScene);
            if (slice.length > 0) {
                scenes.push({
                    id: i + 1,
                    text: slice.join('. ') + '.',
                    visuals: `Cảnh quay minh họa phân đoạn ${i + 1}`
                });
            }
        }
    } else {
        const lines = cleanText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length >= 6) {
            for (let i = 0; i < 6; i++) {
                scenes.push({
                    id: i + 1,
                    text: lines[i],
                    visuals: `Cảnh quay minh họa phân đoạn ${i + 1}`
                });
            }
        } else {
            for (let i = 0; i < Math.max(1, lines.length); i++) {
                scenes.push({
                    id: i + 1,
                    text: lines[i] || cleanText,
                    visuals: `Cảnh quay minh họa phân đoạn ${i + 1}`
                });
            }
        }
    }
    
    while (scenes.length < 6) {
        scenes.push({
            id: scenes.length + 1,
            text: scenes[scenes.length - 1]?.text || defaultTitle,
            visuals: `Cảnh quay minh họa phân đoạn ${scenes.length + 1}`
        });
    }
    
    return {
        title: defaultTitle,
        script: cleanText,
        scenes: scenes.slice(0, 6)
    };
}

async function generateCuratedScript(selectedNews, userPrompt, llmConfig = {}) {
    let provider = llmConfig.provider || 'gemini';
    let apiKey = llmConfig.apiKey || '';
    let model = llmConfig.model || '';
    let baseUrl = llmConfig.baseUrl || '';
    
    if (!apiKey) {
        if (provider === 'gemini') {
            apiKey = process.env.GEMINI_API_KEY;
        } else if (provider === 'openai') {
            apiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
        } else if (provider === 'anthropic') {
            apiKey = process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY;
        }
    }
    
    if (!apiKey) {
        throw new Error(`Thiếu API Key cho nhà cung cấp ${provider}. Vui lòng nhập API Key.`);
    }

    if (!model) {
        if (provider === 'gemini') model = 'google/gemini-2.5-flash';
        else if (provider === 'openai') model = 'gpt-4o-mini';
        else if (provider === 'anthropic') model = 'claude-3-5-sonnet-20240620';
    }

    const prompt = `Bạn là một nhà biên kịch video tin tức ngắn chuyên nghiệp và chuyên gia phân tích thị trường Bất động sản Việt Nam.
Hãy viết một kịch bản video ngắn dựa trên các tin tức được chọn dưới đây. Bạn phải tuân thủ tuyệt đối và bám sát các yêu cầu bổ sung của người dùng về độ dài kịch bản, phong cách kể chuyện và cách diễn đạt.

Các tin tức được chọn:
${selectedNews.map((news, idx) => `[Tin ${idx + 1}] Tiêu đề: ${news.title}\nNguồn: ${news.source}\nTóm tắt: ${news.summary}`).join('\n\n')}

Yêu cầu bổ sung từ người dùng (Prompt của người dùng - ĐÂY LÀ YÊU CẦU ƯU TIÊN HÀNG ĐẦU):
"${userPrompt || 'Viết kịch bản ngắn gọn, thu hút, giọng điệu chuyên nghiệp.'}"

YÊU CẦU BẮT BUỘC VỀ ĐỊNH DẠNG:
1. Kịch bản phải được liên kết logic, liền mạch giữa các tin tức được cung cấp ở trên để tạo thành một bản tin tổng hợp thống nhất. Có chuyển cảnh mượt mà giữa các phần.
2. Cấu trúc kịch bản bắt buộc phải được chia thành đúng 6 phân cảnh (scenes). 
3. Tổng số từ của 6 phân cảnh và độ dài của mỗi phân cảnh phải điều chỉnh tương ứng để BÁM SÁT VÀ ĐÁP ỨNG ĐÚNG yêu cầu về độ dài kịch bản của người dùng ở trên.
   - Ví dụ: Nếu người dùng yêu cầu kịch bản dài từ 250 đến 290 từ, hãy viết mỗi phân cảnh có phần thoại ("text") khoảng 40-50 từ để tổng cộng đạt đúng khoảng 250-290 từ.
   - Mỗi phân cảnh gồm:
     - "text": Lời thoại đọc lồng tiếng (Voiceover) bằng tiếng Việt.
     - "visuals": Mô tả hình ảnh hiển thị cho cảnh đó (khoảng 10-15 từ).
4. Trả về kết quả dưới dạng đối tượng JSON duy nhất có định dạng:
{
  "title": "TIÊU ĐỀ NỔI BẬT CỦA BẢN TIN (In hoa, dưới 15 từ)",
  "script": "Nội dung kịch bản định dạng văn bản thô đầy đủ của kịch bản (chỉ gồm phần thoại của 6 cảnh ghép lại liên tục) để sao chép",
  "scenes": [
    { "id": 1, "text": "Lời thoại phân cảnh 1...", "visuals": "Mô tả hình ảnh phân cảnh 1..." },
    { "id": 2, "text": "Lời thoại phân cảnh 2...", "visuals": "Mô tả hình ảnh phân cảnh 2..." },
    { "id": 3, "text": "Lời thoại phân cảnh 3...", "visuals": "Mô tả hình ảnh phân cảnh 3..." },
    { "id": 4, "text": "Lời thoại phân cảnh 4...", "visuals": "Mô tả hình ảnh phân cảnh 4..." },
    { "id": 5, "text": "Lời thoại phân cảnh 5...", "visuals": "Mô tả hình ảnh phân cảnh 5..." },
    { "id": 6, "text": "Lời thoại phân cảnh 6...", "visuals": "Mô tả hình ảnh phân cảnh 6..." }
  ]
}
Tuyệt đối chỉ trả về JSON. Không sử dụng dấu ngoặc kép đôi (") chưa được trốn (escaped) trong các chuỗi giá trị JSON. Tuyệt đối không thêm bất kỳ giải thích hay markdown code blocks nào ngoài JSON.`;

    console.log(`Sending script draft request to provider: ${provider}, model: ${model}, URL: ${baseUrl || 'default'}...`);
    let content = '';

    try {
        if (provider === 'custom' && baseUrl) {
            let endpoint = baseUrl;
            if (!endpoint.endsWith('/chat/completions')) {
                endpoint = endpoint.replace(/\/+$/, '') + '/chat/completions';
            }
            const response = await axios.post(endpoint, {
                model: model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.3
            }, {
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                timeout: 45000
            });
            content = response.data.choices[0].message.content.trim();
        }
        else if (provider === 'openai') {
            const response = await axios.post("https://api.openai.com/v1/chat/completions", {
                model: model,
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
                temperature: 0.3
            }, {
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                timeout: 45000
            });
            content = response.data.choices[0].message.content.trim();
        } 
        else if (provider === 'anthropic') {
            const response = await axios.post("https://api.anthropic.com/v1/messages", {
                model: model,
                max_tokens: 4000,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.3
            }, {
                headers: {
                    "x-api-key": apiKey,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json"
                },
                timeout: 45000
            });
            content = response.data.content[0].text.trim();
        } 
        else {
            // Default OpenRouter
            const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
                model: model,
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
                temperature: 0.3
            }, {
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                timeout: 45000
            });
            content = response.data.choices[0].message.content.trim();
        }

        return JSON.parse(cleanJsonString(content));
    } catch (e) {
        console.warn("Script parsing failed, attempting raw wrapper logic:", e.message);
        if (content) {
            return wrapRawTextAsJson(content, selectedNews[0]?.title.toUpperCase() || "BẢN TIN BẤT ĐỘNG SẢN");
        }
        throw e;
    }
}

module.exports = {
    getDailyNews,
    generateCuratedScript,
    getRssSources,
    saveRssSource,
    deleteRssSource
};
