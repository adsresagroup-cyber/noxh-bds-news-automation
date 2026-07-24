const fs = require('fs');
const path = require('path');

const rssFeeds = [
    "https://plo.vn/rss/do-thi.rss",
    "https://plo.vn/rss/kinh-te.rss",
    "https://plo.vn/rss/thoi-su.rss",
    "https://vnexpress.net/rss/bat-dong-san.rss",
    "https://vietnamnet.vn/rss/bat-dong-san.rss",
    "https://cafef.vn/bat-dong-san.rss",
    "https://dantri.com.vn/rss/bat-dong-san.rss",
    "https://tuoitre.vn/rss/kinh-doanh.rss",
    "https://laodong.vn/rss/bat-dong-san.rss",
    "https://baoxaydung.vn/rss/bat-dong-san.rss"
];

function matchesHcm(title, desc) {
    const text = `${title} ${desc}`.toLowerCase();
    
    // 1. Direct match for specific Ho Chi Minh City keywords and districts
    const specificKeywords = [
        "hồ chí minh", "ho chi minh", "tp.hcm", "tphcm", "sài gòn", "sai gon", "thủ đức",
        "quận 1", "quận 3", "quận 4", "quận 5", "quận 6", "quận 7", "quận 8", "quận 10", "quận 11", "quận 12",
        "tân bình", "tan binh", "bình tân", "binh tan", "tân phú", "tan phu", 
        "bình thạnh", "binh thanh", "phú nhuận", "phu nhuan", "gò vấp", "go vap",
        "bình chánh", "binh chanh", "hóc môn", "hoc mon", "củ chi", "cu chi", "nhà bè", "nha be", "cần giờ", "can gio",
        "thủ thiêm", "thu thiem", "phú mỹ hưng", "phu my hung", "thanh đa", "thanh da", 
        "cát lái", "cat lai", "an phú", "an phu", "thảo điền", "thao dien", 
        "hiệp phước", "hiep phuoc", "bến nghé", "ben nghe"
    ];
    
    if (specificKeywords.some(kw => text.includes(kw))) {
        // Exclude common non-geographic/organizational phrases containing "Hồ Chí Minh"
        const excludes = [
            "đường hồ chí minh",
            "lăng hồ chí minh", "lăng chủ tịch",
            "đoàn thanh niên", "đoàn tncs", "đoàn hcm",
            "huân chương hồ chí minh", "giải thưởng hồ chí minh",
            "học viện chính trị quốc gia", "học viện hành chính quốc gia",
            "đại học quốc gia tp", "đại học sư phạm kỹ thuật",
            "hồ chí minh học", "tượng đài hồ chí minh"
        ];
        if (!excludes.some(ex => text.includes(ex))) {
            return true;
        }
    }
    
    return false;
}

function isRealEstateOrInfrastructure(title, desc) {
    const text = `${title} ${desc}`.toLowerCase();
    const reKeywords = [
        "bất động sản", "bds", "đất", "nhà ở", "nhà phố", "căn hộ", "chung cư", 
        "quy hoạch", "dự án", "hạ tầng", "cao tốc", "thu hồi", "đền bù", 
        "giải phóng mặt bằng", "đấu giá", "đô thị", "tái định cư", "khu công nghiệp", 
        "vsip", "xây dựng", "giao thông", "đầu tư", "chủ đầu tư", "nhà thầu",
        "mở bán", "giao dịch", "thửa đất", "sổ đỏ", "sổ hồng", "đại lộ", "đường tránh",
        "cầu", "hầm", "cảng", "sân bay"
    ];
    return reKeywords.some(kw => text.includes(kw));
}

// Clean and repair JSON string returned by LLM
function cleanJsonString(str) {
    let cleaned = str.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    
    let inString = false;
    let escape = false;
    let result = '';
    
    for (let i = 0; i < cleaned.length; i++) {
        let char = cleaned[i];
        if (char === '"' && !escape) {
            inString = !inString;
            result += char;
        } else if (char === '\\' && inString) {
            escape = !escape;
            result += char;
        } else {
            if (inString) {
                if (char === '\n') {
                    result += '\\n';
                } else if (char === '\r') {
                    // ignore
                } else {
                    result += char;
                }
            } else {
                result += char;
            }
            escape = false;
        }
    }
    return result;
}

// Format date helper
function getFormattedDate(date, format) {
    const pad = (n) => n.toString().padStart(2, '0');
    const d = date.getDate();
    const m = date.getMonth() + 1;
    const y = date.getFullYear();
    const h = date.getHours();
    const min = date.getMinutes();

    if (format === 'sheetname') {
        return `${pad(h)}h${pad(min)} - ${pad(d)}/${pad(m)} - Tin tức BĐS TP.HCM`;
    }
    return `${pad(d)}/${pad(m)}/${y} ${pad(h)}:${pad(min)}`;
}

async function run() {
    console.log("=== BẮT ĐẦU QUY TRÌNH CÀO TIN TỨC BĐS TP. HỒ CHÍ MINH ===");
    
    let rootDir = path.resolve(__dirname, '..', '..', '..');
    if (process.env.GITHUB_WORKSPACE) {
        rootDir = process.env.GITHUB_WORKSPACE;
    }
    
    let tokenPath = path.join(rootDir, 'meta ads api', 'token.json');
    if (!fs.existsSync(tokenPath)) {
        tokenPath = path.join(rootDir, 'meta_ads_api', 'token.json');
    }
    if (!fs.existsSync(tokenPath)) {
        tokenPath = path.join('c:', 'Users', 'Admin', '.antigravity-ide', 'meta ads api', 'token.json');
    }

    let envPath = path.join(rootDir, 'meta ads api', '.env');
    if (!fs.existsSync(envPath)) {
        envPath = path.join(rootDir, 'meta_ads_api', '.env');
    }
    if (!fs.existsSync(envPath)) {
        envPath = path.join('c:', 'Users', 'Admin', '.antigravity-ide', 'meta ads api', '.env');
    }

    const historyPath = path.join(__dirname, 'reports', 'scraped_articles_history_hcm.json');

    if (!fs.existsSync(tokenPath)) {
        throw new Error(`Token file not found at ${tokenPath}`);
    }

    // Load scraping history
    let scrapedHistory = [];
    if (fs.existsSync(historyPath)) {
        try {
            scrapedHistory = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
            console.log(`Đã tải lịch sử cào bài TP.HCM: ${scrapedHistory.length} liên kết.`);
        } catch (e) {
            console.warn("Không thể đọc tệp lịch sử cào bài:", e.message);
        }
    }

    // 1. Load API Key (Check process.env first for GitHub Actions)
    let geminiApiKey = process.env.GEMINI_API_KEY || "";
    if (!geminiApiKey && fs.existsSync(envPath)) {
        const envText = fs.readFileSync(envPath, 'utf8');
        const lines = envText.split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const match = trimmed.match(/^GEMINI_API_KEY=(.*)$/);
                if (match) {
                    geminiApiKey = match[1].trim();
                }
            }
        }
    }

    if (!geminiApiKey) {
        throw new Error("GEMINI_API_KEY not found in environment or .env file");
    }

    // 2. Set up Time Range (24h/48h window up to current execution time)
    const now = new Date();
    let endTime = now;
    let startTime;

    if (now.getDay() === 1) { // Monday
        startTime = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    } else {
        startTime = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    }

    console.log(`Lọc bài viết từ: ${getFormattedDate(startTime)} đến: ${getFormattedDate(endTime)}`);

    // 3. Fetch RSS Feeds
    const articles = [];
    for (const url of rssFeeds) {
        try {
            console.log(`Đang cào nguồn: ${url}`);
            const response = await fetch(url);
            if (!response.ok) continue;
            const xmlText = await response.text();
            
            const itemRegex = /<item>([\s\S]*?)<\/item>/g;
            let match;
            while ((match = itemRegex.exec(xmlText)) !== null) {
                const itemContent = match[1];
                const title = (itemContent.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
                const link = (itemContent.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
                const description = (itemContent.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '';
                const pubDateStr = (itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
                
                const clean = (str) => {
                    return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
                };
                
                const cleanTitle = clean(title);
                const cleanDesc = clean(description);
                const pubDate = new Date(clean(pubDateStr));
                
                if (isNaN(pubDate.getTime())) continue;
                
                if (matchesHcm(cleanTitle, cleanDesc) && isRealEstateOrInfrastructure(cleanTitle, cleanDesc)) {
                    const trimmedLink = link.trim();
                    if (!articles.some(a => a.url === trimmedLink)) {
                        articles.push({
                            title: cleanTitle,
                            url: trimmedLink,
                            description: cleanDesc,
                            pubDate
                        });
                    }
                }
            }
        } catch (e) {
            console.warn(`Lỗi khi cào nguồn ${url}:`, e.message);
        }
    }

    console.log(`Tìm thấy tổng cộng ${articles.length} bài viết về TP.HCM.`);
    
    // Prioritize articles within recent 24-48h window not yet in history
    let filtered = articles.filter(a => a.pubDate >= startTime && !scrapedHistory.includes(a.url));
    console.log(`Tìm thấy ${filtered.length} bài viết mới trong khung thời gian chính.`);
    
    // Fallback: fill up to 10 from available articles even if previously seen or slightly older
    if (filtered.length < 10) {
        const remaining = articles.filter(a => !filtered.some(f => f.url === a.url));
        remaining.sort((a, b) => b.pubDate - a.pubDate);
        for (const art of remaining) {
            if (filtered.length >= 10) break;
            filtered.push(art);
        }
    }

    // Sort selected articles by pubDate descending
    filtered.sort((a, b) => b.pubDate - a.pubDate);
    const topArticles = filtered.slice(0, 10);
    console.log(`Quyết định lựa chọn ${topArticles.length} bài viết để gửi AI phân tích.`);

    if (topArticles.length === 0) {
        console.log("Không tìm thấy bất kỳ tin tức nào. Kết thúc quy trình.");
        return;
    }

    // 4. Call Gemini to Analyze and Write Detailed Scripts
    const results = [];
    const systemInstruction = `Bạn là một Biên kịch nội dung Video ngắn xuất sắc và là một Chuyên gia phân tích Bất động sản sắc bén tại TP.HCM. Nhiệm vụ của bạn là từ thông tin bài báo về thị trường BĐS TP.HCM được cung cấp, chuyển thể thành kịch bản video ngắn triệu view (TikTok/Reels/Shorts) và bài đăng Facebook thu hút.

Hãy trả về một đối tượng JSON hợp lệ có cấu trúc chính xác:
{
  "angle": "Tin tức / Chuyên gia chia sẻ",
  "visuals": "Mô tả chi tiết từng cảnh quay minh họa phù hợp, khớp với từng câu thoại (các tuyến đường huyết mạch, dự án cao tầng, bản đồ quy hoạch hạ tầng TP.HCM, vòng xoay giao thông...)",
  "script": "TIÊU ĐỀ: [Tiêu đề giật tít thu hút 10-15 từ]\\n\\n[HOOK]\\n[Lời thoại Hook cực ngắn, dưới 15 từ, 3-6s đầu]\\n\\n[BODY]\\n[Lời thoại phân tích sâu, đắt giá, kịch tính 180-220 từ]\\n\\n[CTA]\\n[Lời thoại kêu gọi thảo luận mở và bình luận 30-40 từ]",
  "fb_content": "Nội dung bài đăng Facebook ngắn từ 3-5 dòng, dòng 1 có emoji 🔥 hoặc ⁉️ giật tít in hoa, các dòng sau tóm tắt thông tin đắt giá nhất và câu hỏi khảo sát thảo luận."
}

[TƯ DUY PHÂN TÍCH & SÁNG TẠO KỊCH BẢN (ĐỔI MỚI & KHÔNG TRÙNG LẶP)]
1. Bám sát các cập nhật mới nhất về quy định BĐS TP.HCM, bảng giá đất mới, điều chỉnh quy hoạch, cấp phép dự án và tiến độ hạ tầng (vành đai 3, metro, sân bay...):
   - Nếu bài báo về thay đổi Luật/Bảng giá đất/Quy định mới: Phân tích ngay tác động tới người mua nhà và nhà đầu tư tại TP.HCM.
   - Nếu bài báo về xử lý sai phạm/dự án "trùm chăn": Cảnh báo rủi ro pháp lý, bài học xương máu cho nhà đầu tư.
   - Nếu bài báo về dự án/hạ tầng mới: Phân tích cơ hội đầu tư, tiềm năng tăng giá, thời điểm vàng xuống tiền.
2. Tuyệt đối không viết lặp lại rập khuôn hay tóm tắt bài báo một cách khô khan. Biến hóa thông tin thành câu chuyện có chiều sâu, kịch tính, nhịp điệu nhanh nhạy.

[YÊU CẦU CỰC KỲ QUAN TRỌNG CHO PHẦN "script"]
1. BẮT BUỘC: Độ dài lời thoại phần "script" (Tiêu đề, Hook, Body, CTA) phải NẰM TRONG KHOẢNG 230 ĐẾN 290 TỪ. 
2. Cấu trúc kịch bản:
   - TIÊU ĐỀ: 1 câu kích thích (10-15 từ).
   - [HOOK]: Đúng 1 câu cực ngắn gọn (dưới 15 từ, 3-6s đầu). Phải gây tò mò cực độ, dùng câu hỏi khiêu khích hoặc nhận định trái ngược. Tuyệt đối không dài dòng.
   - [BODY]: 2-3 đoạn phân tích logic, đưa ra góc nhìn chuyên môn đắt giá (180-220 từ).
   - [CTA]: 1-2 câu kêu gọi bình luận thảo luận mở (30-40 từ).
3. Văn phong tự nhiên, xưng hô gần gũi (mình, em, các bác, mọi người...). TUYỆT ĐỐI KHÔNG xưng tên cá nhân cụ thể. Không kêu gọi inbox riêng.
`;

    for (let i = 0; i < topArticles.length; i++) {
        const art = topArticles[i];
        console.log(`[${i+1}/${topArticles.length}] Đang phân tích bài: "${art.title}"...`);
        try {
            const apiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${geminiApiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "google/gemini-2.5-flash",
                    messages: [
                        { role: "system", content: systemInstruction },
                        { role: "user", content: `Tiêu đề: ${art.title}\nTóm tắt sơ bộ: ${art.description}` }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.2
                })
            });

            if (!apiResponse.ok) {
                const errText = await apiResponse.text();
                throw new Error(`API Error ${apiResponse.status}: ${errText}`);
            }

            const resData = await apiResponse.json();
            const rawContent = resData.choices[0].message.content;
            const cleanedContent = cleanJsonString(rawContent);
            const analysis = JSON.parse(cleanedContent);
            
            let fbText = "";
            if (analysis.fb_content) {
                fbText = analysis.fb_content.trim() + "\n\n------------------------------\n🏠 TongkhoBDS.com - Kho Bất động sản lớn nhất Việt Nam\n🏢 Địa chỉ: 51 Kim Mã, Phường Giảng Võ, Hà Nội\n☎️ Hotline: 1900.988.998\n#batdongsan #tongkhobatdongsan #tintuc #24h";
            }
            results.push({
                title: art.title,
                url: art.url,
                angle: analysis.angle || "Tin tức BĐS TP.HCM",
                visuals: analysis.visuals || "Hình ảnh bản đồ quy hoạch và hạ tầng giao thông TP.HCM",
                script: analysis.script || "",
                fb_content: fbText
            });
        } catch (e) {
            console.error(`Lỗi khi gọi API phân tích bài ${i+1}:`, e.message);
            results.push({
                title: art.title,
                url: art.url,
                angle: "Tin tức BĐS TP.HCM",
                visuals: "Hình ảnh hạ tầng và các dự án bất động sản tại TP.HCM",
                script: `TIÊU ĐỀ: ${art.title}\n\n[HOOK]\nBiến động mới nhất tại thị trường bất động sản TP.HCM bạn đã biết chưa?\n\n[BODY]\n${art.description}\n\n[CTA]\nBạn đánh giá sao về thông tin này? Bình luận chia sẻ bên dưới nhé!`,
                fb_content: `🔥 MỚI NHẤT VỀ BẤT ĐỘNG SẢN TP.HCM\n\n${art.title}\n\n👇 Xem chi tiết thông tin và thảo luận ngay bên dưới!` + "\n\n------------------------------\n🏠 TongkhoBDS.com - Kho Bất động sản lớn nhất Việt Nam\n🏢 Địa chỉ: 51 Kim Mã, Phường Giảng Võ, Hà Nội\n☎️ Hotline: 1900.988.998\n#batdongsan #tongkhobatdongsan #tintuc #24h"
            });
        }
    }

    // 5. Select top 6 scripts and clear script for remaining items
    for (let i = 0; i < results.length; i++) {
        results[i].stt = i + 1;
        if (i >= 6) {
            results[i].visuals = "";
            results[i].script = "";
            results[i].fb_content = "";
        }
    }

    // 6. Connect to Google Drive & Sheets
    console.log("Đang kết nối Google Drive...");
    let tokenText = fs.readFileSync(tokenPath, 'utf8');
    if (tokenText.charCodeAt(0) === 0xFEFF) {
        tokenText = tokenText.slice(1);
    }
    const tokenData = JSON.parse(tokenText);
    let accessToken = tokenData.token;

    // Refresh token
    try {
        const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                client_id: tokenData.client_id,
                client_secret: tokenData.client_secret,
                refresh_token: tokenData.refresh_token,
                grant_type: "refresh_token"
            })
        });

        if (refreshResponse.ok) {
            const refreshResData = await refreshResponse.json();
            accessToken = refreshResData.access_token;
            tokenData.token = accessToken;
            fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 4), 'utf8');
            console.log("Đã làm mới mã truy cập Google.");
        }
    } catch (e) {
        console.warn("Không thể làm mới token, dùng token hiện tại:", e.message);
    }

    const driveHeaders = { "Authorization": `Bearer ${accessToken}` };
    async function googleApiCall(url, method = "GET", body = null) {
        const options = { method, headers: { ...driveHeaders } };
        if (body) {
            options.body = body;
            options.headers["Content-Type"] = "application/json";
        }
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`Google API ${response.status}: ${await response.text()}`);
        }
        return await response.json();
    }

    // 7.1 Search for 'OANH'
    const oanhRes = await googleApiCall(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("mimeType='application/vnd.google-apps.folder' and (name='OANH' or name='Oanh') and trashed=false")}&fields=files(id)`);
    if (!oanhRes.files || oanhRes.files.length === 0) {
        throw new Error("Không tìm thấy thư mục OANH trên Drive.");
    }
    const oanhId = oanhRes.files[0].id;

    // 7.2 Search 'Antigravity AI lam viec'
    const antiRes = await googleApiCall(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='Antigravity AI lam viec' and '${oanhId}' in parents and trashed=false`)}&fields=files(id)`);
    let antiId = antiRes.files && antiRes.files.length > 0 ? antiRes.files[0].id : null;
    if (!antiId) {
        const createAnti = await googleApiCall("https://www.googleapis.com/drive/v3/files", "POST", JSON.stringify({
            name: "Antigravity AI lam viec",
            mimeType: "application/vnd.google-apps.folder",
            parents: [oanhId]
        }));
        antiId = createAnti.id;
    }

    // 7.3 Search 'Tin tức TP.HCM'
    const hcmFolderQuery = `mimeType='application/vnd.google-apps.folder' and (name='Tin tức TP.HCM' or name='Tin tuc TP.HCM' or name='Tin tức TPHCM') and '${antiId}' in parents and trashed=false`;
    const hcmFolderRes = await googleApiCall(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(hcmFolderQuery)}&fields=files(id)`);
    let hcmFolderId = hcmFolderRes.files && hcmFolderRes.files.length > 0 ? hcmFolderRes.files[0].id : null;
    if (!hcmFolderId) {
        const createHcmFolder = await googleApiCall("https://www.googleapis.com/drive/v3/files", "POST", JSON.stringify({
            name: "Tin tức TP.HCM",
            mimeType: "application/vnd.google-apps.folder",
            parents: [antiId]
        }));
        hcmFolderId = createHcmFolder.id;
    }

    // 7.4 Create Google Spreadsheet directly in Google Drive
    const sheetName = getFormattedDate(now, 'sheetname');
    console.log(`Đang tạo Google Spreadsheet: "${sheetName}"...`);
    
    const createSpreadsheetRes = await googleApiCall("https://www.googleapis.com/drive/v3/files", "POST", JSON.stringify({
        name: sheetName,
        mimeType: "application/vnd.google-apps.spreadsheet",
        parents: [hcmFolderId]
    }));
    
    const spreadsheetId = createSpreadsheetRes.id;
    
    // 7.5 Get default sheet properties
    const sheetMetadata = await googleApiCall(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`);
    const sheetId = sheetMetadata.sheets[0].properties.sheetId;
    const defaultSheetTitle = sheetMetadata.sheets[0].properties.title;

    // 7.6 Prepare values to write
    const headersRow = ['STT', 'Tiêu đề bài báo', 'Đường dẫn [URL]', 'Phong cách / Góc nhìn', 'Mô tả hình ảnh (Visuals)', 'Kịch bản Voice-off (Lời thoại)', 'Nội dung đăng Facebook (Content FB)'];
    const values = [headersRow];
    results.forEach(item => {
        values.push([
            item.stt,
            item.title,
            item.url,
            item.angle,
            item.visuals,
            item.script,
            item.fb_content
        ]);
    });

    // 7.7 Write values
    console.log("Đang ghi dữ liệu vào Google Sheet...");
    const rangeStr = `'${defaultSheetTitle}'!A1:G${values.length}`;
    const updateUri = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeStr)}?valueInputOption=USER_ENTERED`;
    
    const updateResponse = await fetch(updateUri, {
        method: "PUT",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            range: rangeStr,
            majorDimension: "ROWS",
            values: values
        })
    });
    
    if (!updateResponse.ok) {
        throw new Error(`Failed to write values: ${await updateResponse.text()}`);
    }

    // 7.8 Apply styling (Teal background, Wrap text, custom widths, Arial font)
    console.log("Đang định dạng Google Sheet...");
    const batchUpdateUri = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    const batchBody = {
        requests: [
            // Rename sheet to "10 Bài Báo Nổi Bật"
            {
                updateSheetProperties: {
                    properties: {
                        sheetId: sheetId,
                        title: "10 Bài Báo Nổi Bật"
                    },
                    fields: "title"
                }
            },
            // Format Header (Row 0)
            {
                repeatCell: {
                    range: {
                        sheetId: sheetId,
                        startRowIndex: 0,
                        endRowIndex: 1,
                        startColumnIndex: 0,
                        endColumnIndex: 7
                    },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: { red: 19/255, green: 78/255, blue: 74/255 }, // #134E4A (Dark Teal)
                            textFormat: {
                                foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
                                fontFamily: "Arial",
                                fontSize: 10,
                                bold: true
                            },
                            horizontalAlignment: "CENTER",
                            verticalAlignment: "MIDDLE"
                        }
                    },
                    fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
                }
            },
            // Format Data Rows (Row 1 to end)
            {
                repeatCell: {
                    range: {
                        sheetId: sheetId,
                        startRowIndex: 1,
                        endRowIndex: values.length,
                        startColumnIndex: 0,
                        endColumnIndex: 7
                    },
                    cell: {
                        userEnteredFormat: {
                            textFormat: {
                                fontFamily: "Arial",
                                fontSize: 10
                            },
                            horizontalAlignment: "LEFT",
                            verticalAlignment: "TOP",
                            wrapStrategy: "WRAP"
                        }
                    },
                    fields: "userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)"
                }
            },
            // Center align column A (STT)
            {
                repeatCell: {
                    range: {
                        sheetId: sheetId,
                        startRowIndex: 1,
                        endRowIndex: values.length,
                        startColumnIndex: 0,
                        endColumnIndex: 1
                    },
                    cell: {
                        userEnteredFormat: {
                            horizontalAlignment: "CENTER"
                        }
                    },
                    fields: "userEnteredFormat.horizontalAlignment"
                }
            },
            // Custom Column Widths
            { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 50 }, fields: "pixelSize" } },
            { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 350 }, fields: "pixelSize" } },
            { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 3 }, properties: { pixelSize: 200 }, fields: "pixelSize" } },
            { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 3, endIndex: 4 }, properties: { pixelSize: 400 }, fields: "pixelSize" } },
            { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 4, endIndex: 5 }, properties: { pixelSize: 350 }, fields: "pixelSize" } },
            { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 5, endIndex: 6 }, properties: { pixelSize: 450 }, fields: "pixelSize" } },
            { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 6, endIndex: 7 }, properties: { pixelSize: 450 }, fields: "pixelSize" } }
        ]
    };

    const batchResponse = await fetch(batchUpdateUri, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(batchBody)
    });

    if (!batchResponse.ok) {
        throw new Error(`Failed to batch update formatting: ${await batchResponse.text()}`);
    }

    // Save processed URLs to history
    const processedUrls = topArticles.map(a => a.url);
    const updatedHistory = [...new Set([...scrapedHistory, ...processedUrls])];
    
    if (updatedHistory.length > 1000) {
        updatedHistory.splice(0, updatedHistory.length - 1000);
    }
    
    const historyDir = path.dirname(historyPath);
    if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
    }
    fs.writeFileSync(historyPath, JSON.stringify(updatedHistory, null, 4), 'utf8');
    console.log("Đã cập nhật lịch sử cào bài tránh trùng lặp cho ngày hôm sau.");

    console.log("Đã tải tệp lên Drive thành công!");
    console.log(`Drive link: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
}

run().catch(err => {
    console.error("LỖI HỆ THỐNG:", err.message);
    process.exit(1);
});
