const fs = require('fs');
const path = require('path');

const rssFeeds = [
    "https://baonghean.vn/rss/kinh-te/bat-dong-san",
    "https://baonghean.vn/rss/kinh-te",
    "https://baonghean.vn/rss/thoi-su",
    "https://vnexpress.net/rss/bat-dong-san.rss",
    "https://vietnamnet.vn/rss/bat-dong-san.rss",
    "https://cafef.vn/bat-dong-san.rss",
    "https://dantri.com.vn/rss/bat-dong-san.rss",
    "https://tuoitre.vn/rss/kinh-doanh.rss",
    "https://laodong.vn/rss/bat-dong-san.rss",
    "https://baoxaydung.vn/rss/bat-dong-san.rss"
];

function matchesNgheAn(title, desc) {
    const text = `${title} ${desc}`.toLowerCase();
    
    // 1. Direct match for specific Nghe An & Ha Tinh places
    const specificKeywords = [
        "nghệ an", "nghe an",
        "hà tĩnh", "ha tinh",
        "diễn châu", "dien chau",
        "cửa lò", "cua lo",
        "quỳnh lưu", "quynh luu",
        "thanh chương", "thanh chuong",
        "đô lương", "do luong",
        "yên thành", "yen thanh",
        "nghĩa đàn", "nghia dan",
        "thị xã thái hòa", "thai hoa",
        "hoàng mai", "hoang mai",
        "hồng lĩnh", "hong linh",
        "kỳ anh", "ky anh",
        "nghi xuân", "nghi xuan",
        "đức thọ", "duc tho",
        "hương sơn", "huong son",
        "vũ quang", "vu quang",
        "hương khê", "huong khe",
        "can lộc", "can loc",
        "thạch hà", "thach ha",
        "cẩm xuyên", "cam xuyen",
        "lộc hà", "loc ha",
        "vũng áng", "vung ang"
    ];
    
    if (specificKeywords.some(kw => text.includes(kw))) {
        return true;
    }
    
    // 2. Precise word boundary check for "vinh"
    const vinhRegex = /\bvinh\b/i;
    if (vinhRegex.test(text)) {
        // Exclude common non-geographic phrases containing "vinh"
        const excludes = [
            "vinh danh",
            "vinh dự",
            "vinh quang",
            "vinh hạnh",
            "vinh hiển",
            "vinh hoa",
            "vinhomes",
            "vingroup",
            "tôn vinh"
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
        return `${pad(h)}h${pad(min)} - ${pad(d)}/${pad(m)} - Tin tức BĐS Nghệ An - Hà Tĩnh`;
    }
    return `${pad(d)}/${pad(m)}/${y} ${pad(h)}:${pad(min)}`;
}

async function run() {
    console.log("=== BẮT ĐẦU QUY TRÌNH CÀO TIN TỨC BĐS NGHỆ AN - HÀ TĨNH ===");
    
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

    const historyPath = path.join(__dirname, 'reports', 'scraped_articles_history.json');

    if (!fs.existsSync(tokenPath)) {
        throw new Error(`Token file not found at ${tokenPath}`);
    }

    // Load scraping history
    let scrapedHistory = [];
    if (fs.existsSync(historyPath)) {
        try {
            scrapedHistory = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
            console.log(`Đã tải lịch sử cào bài: ${scrapedHistory.length} liên kết.`);
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
                
                if (matchesNgheAn(cleanTitle, cleanDesc) && isRealEstateOrInfrastructure(cleanTitle, cleanDesc)) {
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

    console.log(`Tìm thấy tổng cộng ${articles.length} bài viết về Nghệ An.`);
    
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
    const systemInstruction = `Bạn là một biên tập viên tin tức và biên kịch video bất động sản chuyên nghiệp tại Việt Nam, am hiểu chuyên sâu về thị trường Nghệ An và Hà Tĩnh.
Hãy phân tích bài viết và trả về một đối tượng JSON chuẩn:
{
  "angle": "Tin tức / Chuyên gia chia sẻ",
  "visuals": "Mô tả chi tiết cảnh quay video minh họa phù hợp từng câu thoại (hạ tầng giao thông, khu công nghiệp, quy hoạch Nghệ An - Hà Tĩnh).",
  "script": "TIÊU ĐỀ: [Tiêu đề thu hút]\\n\\n[HOOK]\\n[Lời thoại hook giật gân, gây tò mò dưới 15 từ, nói 3-6s đầu]\\n\\n[BODY]\\n[Lời thoại phân tích sâu, mạch lạc]\\n\\n[CTA]\\n[Lời thoại kêu gọi thảo luận mở và đăng ký kênh]",
  "fb_content": "Nội dung bài đăng Facebook ngắn từ 3-5 dòng, dòng 1 có emoji 🔥 hoặc ⁉️ giật tít in hoa, các dòng sau tóm tắt và kêu gọi thảo luận."
}

Yêu cầu cực kỳ quan trọng cho phần "script":
1. Độ dài lời thoại phần "script" (chỉ tính phần Tiêu đề, Hook, Body, CTA) phải NẰM TRONG KHOẢNG 230 ĐẾN 290 TỪ. 
2. Cấu trúc kịch bản:
   - TIÊU ĐỀ: 1 câu kích thích (10-15 từ).
   - [HOOK]: Đúng 1 câu cực ngắn gọn (dưới 15 từ, thời lượng nói 3-6s đầu). Tuyệt đối không dài dòng.
   - [BODY]: 2-3 đoạn phân tích logic, kịch tính, nhịp điệu nhanh (180-220 từ).
   - [CTA]: 1-2 câu kêu gọi bình luận thảo luận mở (30-40 từ).
3. Văn phong tự nhiên, xưng hô gần gũi (mình, em, các bác, mọi người...). Không xưng tên cá nhân cụ thể.
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
                angle: analysis.angle || "Tin tức BĐS Nghệ An",
                visuals: analysis.visuals || "Hình ảnh bản đồ quy hoạch và hạ tầng Nghệ An - Hà Tĩnh",
                script: analysis.script || "",
                fb_content: fbText
            });
        } catch (e) {
            console.error(`Lỗi khi gọi API phân tích bài ${i+1}:`, e.message);
            results.push({
                title: art.title,
                url: art.url,
                angle: "Tin tức BĐS Nghệ An",
                visuals: "Hình ảnh hạ tầng giao thông và dự án bất động sản tại Nghệ An",
                script: `TIÊU ĐỀ: ${art.title}\n\n[HOOK]\nBiến động mới nhất tại thị trường bất động sản Nghệ An bạn đã biết chưa?\n\n[BODY]\n${art.description}\n\n[CTA]\nBạn đánh giá sao về thông tin này? Bình luận chia sẻ bên dưới nhé!`,
                fb_content: `🔥 MỚI NHẤT VỀ BẤT ĐỘNG SẢN NGHỆ AN\n\n${art.title}\n\n👇 Xem chi tiết thông tin và thảo luận ngay bên dưới!` + "\n\n------------------------------\n🏠 TongkhoBDS.com - Kho Bất động sản lớn nhất Việt Nam\n🏢 Địa chỉ: 51 Kim Mã, Phường Giảng Võ, Hà Nội\n☎️ Hotline: 1900.988.998\n#batdongsan #tongkhobatdongsan #tintuc #24h"
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

    // 6.1 Search for 'OANH'
    const oanhRes = await googleApiCall(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("mimeType='application/vnd.google-apps.folder' and (name='OANH' or name='Oanh') and trashed=false")}&fields=files(id)`);
    if (!oanhRes.files || oanhRes.files.length === 0) {
        throw new Error("Không tìm thấy thư mục OANH trên Drive.");
    }
    const oanhId = oanhRes.files[0].id;

    // 6.2 Search 'Antigravity AI lam viec'
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

    // 6.3 Search 'Tin tức Nghệ An'
    const naRes = await googleApiCall(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='Tin tức Nghệ An' and '${antiId}' in parents and trashed=false`)}&fields=files(id)`);
    let naId = naRes.files && naRes.files.length > 0 ? naRes.files[0].id : null;
    if (!naId) {
        const createNa = await googleApiCall("https://www.googleapis.com/drive/v3/files", "POST", JSON.stringify({
            name: "Tin tức Nghệ An",
            mimeType: "application/vnd.google-apps.folder",
            parents: [antiId]
        }));
        naId = createNa.id;
    }

    // 6.4 Create Google Spreadsheet directly in Google Drive
    const sheetName = getFormattedDate(now, 'sheetname');
    console.log(`Đang tạo Google Spreadsheet: "${sheetName}"...`);
    
    const createSpreadsheetRes = await googleApiCall("https://www.googleapis.com/drive/v3/files", "POST", JSON.stringify({
        name: sheetName,
        mimeType: "application/vnd.google-apps.spreadsheet",
        parents: [naId]
    }));
    
    const spreadsheetId = createSpreadsheetRes.id;
    
    // 6.5 Get default sheet properties
    const sheetMetadata = await googleApiCall(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`);
    const sheetId = sheetMetadata.sheets[0].properties.sheetId;
    const defaultSheetTitle = sheetMetadata.sheets[0].properties.title;

    // 6.6 Prepare values to write
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

    // 6.7 Write values
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

    // 6.8 Apply styling (Teal background, Wrap text, custom widths, Arial font)
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
