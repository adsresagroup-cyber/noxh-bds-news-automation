const fs = require('fs');
const path = require('path');

// Helper to clean JSON strings from Gemini response
function cleanJsonString(str) {
    let result = '';
    let inString = false;
    let escape = false;

    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char === '"' && !escape) {
            inString = !inString;
            result += char;
        } else if (char === '\\' && !escape) {
            escape = true;
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

// Format date helper (Force Vietnam Timezone UTC+7)
function getFormattedDate(date, format) {
    const dObj = date || new Date();
    const options = { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false };
    const formatter = new Intl.DateTimeFormat('en-GB', options);
    const parts = formatter.formatToParts(dObj);
    const map = {};
    parts.forEach(p => map[p.type] = p.value);
    
    const d = map.day;
    const m = map.month;
    const y = map.year;
    let h = map.hour;
    if (h === '24') h = '00';
    const min = map.minute;

    if (format === 'sheetname') {
        return `${h}h${min} - ${d}/${m} - Tin tuc BDS Toan Quoc`;
    }
    return `${d}/${m}/${y} ${h}:${min}`;
}

async function run() {
    console.log("=== QUY TRÌNH TIN TỨC BẤT ĐỘNG SẢN TOÀN QUỐC ===");
    
    let rootDir = path.resolve(__dirname, '..', '..', '..');
    if (process.env.GITHUB_WORKSPACE) {
        rootDir = process.env.GITHUB_WORKSPACE;
    }
    
    let tokenPath = path.join(rootDir, 'meta ads api', 'token.json');
    if (!fs.existsSync(tokenPath)) {
        tokenPath = path.join(rootDir, 'meta_ads_api', 'token.json');
    }
    if (!fs.existsSync(tokenPath)) {
        tokenPath = path.join(rootDir, 'token.json');
    }

    let envPath = path.join(rootDir, 'meta ads api', '.env');
    if (!fs.existsSync(envPath)) {
        envPath = path.join(rootDir, 'meta_ads_api', '.env');
    }
    if (!fs.existsSync(envPath)) {
        envPath = path.join(rootDir, '.env');
    }

    if (!fs.existsSync(tokenPath)) {
        throw new Error(`Token file not found at ${tokenPath}`);
    }

    // 1. Load API Key
    let geminiApiKey = (process.env.GEMINI_API_KEY || "").trim().replace(/^["']|["']$/g, '');
    if (!geminiApiKey && fs.existsSync(envPath)) {
        const envText = fs.readFileSync(envPath, 'utf8');
        const lines = envText.split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const match = trimmed.match(/^GEMINI_API_KEY=(.*)$/);
                if (match) {
                    geminiApiKey = match[1].trim().replace(/^["']|["']$/g, '');
                    break;
                }
            }
        }
    }

    if (!geminiApiKey) {
        console.warn("⚠️ KHÔNG TÌM THẤY GEMINI_API_KEY!");
    } else {
        console.log(`Đã kết nối GEMINI_API_KEY thành công (Độ dài: ${geminiApiKey.length} ký tự).`);
    }

    // 2. Set up Time Range (24h window or 72h on Monday)
    const now = new Date();
    let endTime = now;
    let startTime;

    if (now.getDay() === 1) { // Monday
        startTime = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    } else {
        startTime = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    }

    console.log(`Lọc bài viết từ: ${getFormattedDate(startTime)} đến: ${getFormattedDate(endTime)}`);

    // 3. Fetch RSS Feeds
    const rssSources = [
        "https://baomoi.com/rss/bat-dong-san.rss",
        "https://vnexpress.net/rss/bat-dong-san.rss",
        "https://vietnamnet.vn/rss/bat-dong-san.rss",
        "https://cafef.vn/bat-dong-san.rss",
        "https://dantri.com.vn/rss/bat-dong-san.rss",
        "https://thanhnien.vn/rss/kinh-te/bat-dong-san.rss",
        "https://tuoitre.vn/rss/kinh-doanh.rss",
        "https://laodong.vn/rss/bat-dong-san.rss",
        "https://baoxaydung.vn/rss/bat-dong-san.rss"
    ];

    const reKeywords = ["bất động sản", "nhà đất", "chung cư", "đất nền", "quy hoạch", "bđs", "dự án", "căn hộ", "biệt thự", "shophouse", "nhà ở", "đô thị", "đầu tư bđs"];

    const articles = [];
    for (const url of rssSources) {
        try {
            console.log(`Đang cào nguồn: ${url}`);
            const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
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
                
                const clean = (str) => str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
                
                const cleanTitle = clean(title);
                const cleanDesc = clean(description);
                const pubDate = new Date(clean(pubDateStr));
                
                if (cleanTitle && cleanDesc) {
                    const text = `${cleanTitle} ${cleanDesc}`.toLowerCase();
                    if (reKeywords.some(k => text.includes(k))) {
                        const trimmedLink = clean(link).split('?')[0].trim();
                        if (!articles.some(a => a.url === trimmedLink)) {
                            articles.push({
                                title: cleanTitle,
                                url: trimmedLink,
                                description: cleanDesc,
                                pubDate: isNaN(pubDate.getTime()) ? now : pubDate
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.warn(`Lỗi khi cào nguồn ${url}:`, e.message);
        }
    }

    console.log(`Tìm thấy tổng cộng ${articles.length} bài viết về BĐS Toàn Quốc.`);
    articles.sort((a, b) => b.pubDate - a.pubDate);
    const topArticles = articles.slice(0, 6);
    console.log(`Quyết định lựa chọn ${topArticles.length} bài viết để gửi AI phân tích.`);

    if (topArticles.length === 0) {
        console.log("Không tìm thấy bài viết nào. Kết thúc quy trình.");
        return;
    }

    // 4. Call AI to Analyze and Write Detailed Scripts
    const results = [];
    const systemInstruction = `Bạn là một Biên kịch nội dung Video ngắn xuất sắc và là một Chuyên gia phân tích Bất động sản sắc bén tại Việt Nam. Nhiệm vụ của bạn là từ thông tin bài báo được cung cấp, chuyển thể thành kịch bản video ngắn triệu view (TikTok/Reels/Shorts) và bài đăng Facebook thu hút.

Hãy trả về một đối tượng JSON hợp lệ có cấu trúc chính xác:
{
  "angle": "Tin tức / Chuyên gia chia sẻ",
  "script": "CÂU TIÊU ĐỀ VIẾT HOA TOÀN BỘ VỚI DẤU CHẤM CẢM!\\n\\n[Phần lời thoại đọc voice-off liền mạch hoàn toàn, NÓI THẲNG VÀO NỘI DUNG, PHẢI DÀI TỪ 230 ĐẾN 290 TỪ TIẾNG VIỆT. TUYỆT ĐỐI KHÔNG GHI CÁC CHỮ TIỀN TỐ NHƯ 'TIÊU ĐỀ:', '[HOOK]', '[BODY]', '[CTA]' Ở PHÍA TRƯỚC]",
  "fb_content": "Nội dung bài đăng Facebook ngắn từ 3-5 dòng, dòng 1 có emoji 🔥 hoặc ⁉️ giật tít in hoa, các dòng sau tóm tắt thông tin đắt giá nhất và câu hỏi khảo sát thảo luận."
}

[TƯ DUY PHÂN TÍCH & SÁNG TẠO KỊCH BẢN (ĐỔI MỚI & KHÔNG TRÙNG LẶP)]
1. Bám sát các cập nhật mới nhất về Luật Đất đai, Luật Nhà ở, Luật Kinh doanh BĐS, chính sách tín dụng ngân hàng, quy hoạch vĩ mô và xu hướng thị trường toàn quốc:
   - Nếu bài báo về thay đổi Luật/Bảng giá đất/Thuế BĐS: Phân tích ngay tác động trực tiếp tới túi tiền người mua và nhà đầu tư.
   - Nếu bài báo về dự án hạ tầng lớn/cao tốc/sân bay: Phân tích tiềm năng tăng giá, thời điểm vàng xuống tiền.
2. TUYỆT ĐỐI KHÔNG DÀI DÒNG, LAN MAN, KHÔNG DÙNG CÁC CÂU DẪN DẮT SÁO RỖNG CẤM DÙNG NHƯ: "Hãy tưởng tượng...", "Trong thời gian gần đây...", "Tất cả chúng ta đều biết...", "Hãy cùng tìm hiểu ngay...", "Tương lai đang mở ra...".
3. Đi thẳng trực tiếp vào vấn đề cốt lõi ngay ở 5 giây đầu tiên!

[YÊU CỰC KỲ QUAN TRỌNG CHO PHẦN "script"]
1. Dòng 1: CÂU TIÊU ĐỀ HOOK CỰC KỲ GIẬT GÂN GÂY TÒ MÒ (SCROLL STOPPER), VIẾT IN HOA TOÀN BỘ KÈM DẤU CHẤM CẢM (!). TUYỆT ĐỐI KHÔNG COPY NGUYÊN VĂN HOẶC LẶP LẠI TIÊU ĐỀ BÀI BÁO GỐC KHÔ KHAN!
2. 5 GIÂY ĐẦU TIÊN: ĐI THẲNG TRỰC TIẾP VÀO VẤN ĐỀ CỐT LÕI! Đánh ngay vào tác động lớn nhất, cơ hội bắt đáy hoặc rủi ro mất tiền.
3. Xuống dòng 2 lần, viết phần LỜI THOẠI ĐỌC VOICE-OFF LIỀN MẠCH từ đầu đến cuối.
4. TUYỆT ĐỐI KHÔNG GHI CÁC TỪ 'TIÊU ĐỀ:', '[HOOK]', '[BODY]', '[CTA]' TRONG NỘI DUNG KỊCH BẢN.
5. ĐỘ DÀI BẮT BUỘC: Tổng số từ phần "script" (Tiêu đề + Lời thoại) PHẢI NẰM TRONG KHOẢNG 230 ĐẾN 290 TỪ TIẾNG VIỆT. AI cần mở rộng phân tích chuyên sâu số liệu thực tế, pháp lý, bài học kinh nghiệm và góc nhìn đa chiều để đảm bảo đủ từ 230-290 từ mà KHÔNG LAN MAN.
6. Văn phong tự nhiên, xưng hô gần gũi (mình, em, các bác, mọi người...). TUYỆT ĐỐI KHÔNG xưng tên cá nhân cụ thể. Không kêu gọi inbox riêng.
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
                    model: "openai/gpt-4o-mini",
                    messages: [
                        { role: "system", content: systemInstruction },
                        { role: "user", content: `Tiêu đề bài báo gốc: ${art.title}\nTóm tắt sơ bộ: ${art.description}\n\nYÊU CẦU BẮT BUỘC:\n1. Dòng 1 phải là CÂU HOOK GIẬT TÍT SÁNG TẠO GÂY TÒ MÒ IN HOA TOÀN BỘ (TUYỆT ĐỐI KHÔNG lặp lại tiêu đề bài báo gốc khô khan!).\n2. Viết kịch bản voice-off phân tích sâu sắc, đa chiều, đạt ĐỘ DÀI TỪ 230 ĐẾN 290 TỪ TIẾNG VIỆT.` }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.5
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
            
            let finalScript = analysis.script || "";
            const countWords = (str) => (!str ? 0 : str.trim().split(/\s+/).filter(w => w.length > 0).length);
            let wc = countWords(finalScript);
            
            let attempts = 0;
            while ((wc < 230 || wc > 290) && attempts < 2) {
                attempts++;
                console.log(`   -> Kịch bản bài ${i+1} có ${wc} từ (chưa đạt mốc 230-290 từ). Đang gửi AI điều chỉnh lần ${attempts}...`);
                const hint = wc < 230 
                    ? `Kịch bản trước bạn viết chỉ có ${wc} từ (dưới 230 từ). Hãy mở rộng thêm các đoạn phân tích chuyên sâu số liệu thực tế, pháp lý, cơ hội đầu tư để tổng số từ NẰM CHÍNH XÁC TRONG KHOẢNG TỪ 230 ĐẾN 290 TỪ TIẾNG VIỆT!`
                    : `Kịch bản trước bạn viết có ${wc} từ (vượt quá 290 từ). Hãy cô đọng lại lời thoại để tổng số từ NẰM CHÍNH XÁC TRONG KHOẢNG TỪ 230 ĐẾN 290 TỪ TIẾNG VIỆT!`;
                
                try {
                    const retryRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${geminiApiKey}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            model: "openai/gpt-4o-mini",
                            messages: [
                                { role: "system", content: systemInstruction },
                                { role: "user", content: `Tiêu đề bài báo gốc: ${art.title}\nTóm tắt sơ bộ: ${art.description}` },
                                { role: "assistant", content: rawContent },
                                { role: "user", content: hint }
                            ],
                            response_format: { type: "json_object" },
                            temperature: 0.5
                        })
                    });
                    if (retryRes.ok) {
                        const retryData = await retryRes.json();
                        const retryRaw = retryData.choices[0].message.content;
                        const retryClean = cleanJsonString(retryRaw);
                        const retryAnalysis = JSON.parse(retryClean);
                        if (retryAnalysis.script) {
                            finalScript = retryAnalysis.script;
                            wc = countWords(finalScript);
                            analysis.script = finalScript;
                            if (retryAnalysis.fb_content) analysis.fb_content = retryAnalysis.fb_content;
                            console.log(`   -> Kết quả sau lần điều chỉnh ${attempts}: ${wc} từ.`);
                        }
                    }
                } catch (retryErr) {
                    console.warn(`   -> Lỗi khi gửi AI điều chỉnh lần ${attempts}:`, retryErr.message);
                }
            }

            results.push({
                stt: i + 1,
                title: art.title,
                url: art.url,
                angle: analysis.angle || "Tin tức",
                script: finalScript,
                fb_content: analysis.fb_content || ""
            });
        } catch (e) {
            console.error(`   -> Lỗi phân tích bài "${art.title}":`, e.message);
        }
    }

    // 5. Connect to Google Drive & Sheets
    console.log("Đang kết nối Google Drive...");
    let tokenText = fs.readFileSync(tokenPath, 'utf8');
    if (tokenText.charCodeAt(0) === 0xFEFF) {
        tokenText = tokenText.slice(1);
    }
    const tokenData = JSON.parse(tokenText);
    let accessToken = tokenData.token;

    // Refresh token if available
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

    // 6. Search for 'OANH' -> 'Antigravity AI lam viec' -> 'Tin tuc bat dong san toan quoc'
    const oanhRes = await googleApiCall(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("mimeType='application/vnd.google-apps.folder' and (name='OANH' or name='Oanh') and trashed=false")}&fields=files(id)`);
    if (!oanhRes.files || oanhRes.files.length === 0) {
        throw new Error("Không tìm thấy thư mục OANH trên Drive.");
    }
    const oanhId = oanhRes.files[0].id;

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

    const nationalFolderQuery = `mimeType='application/vnd.google-apps.folder' and (name='Tin tuc bat dong san toan quoc' or name='Tin tức bất động sản toàn quốc') and '${antiId}' in parents and trashed=false`;
    const nationalFolderRes = await googleApiCall(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(nationalFolderQuery)}&fields=files(id)`);
    let nationalFolderId = nationalFolderRes.files && nationalFolderRes.files.length > 0 ? nationalFolderRes.files[0].id : null;
    if (!nationalFolderId) {
        const createNationalFolder = await googleApiCall("https://www.googleapis.com/drive/v3/files", "POST", JSON.stringify({
            name: "Tin tuc bat dong san toan quoc",
            mimeType: "application/vnd.google-apps.folder",
            parents: [antiId]
        }));
        nationalFolderId = createNationalFolder.id;
    }

    // 7. Create Google Spreadsheet directly in Google Drive
    const sheetName = getFormattedDate(now, 'sheetname');
    console.log(`Đang tạo Google Spreadsheet: "${sheetName}"...`);
    
    const createSpreadsheetRes = await googleApiCall("https://www.googleapis.com/drive/v3/files", "POST", JSON.stringify({
        name: sheetName,
        mimeType: "application/vnd.google-apps.spreadsheet",
        parents: [nationalFolderId]
    }));
    
    const spreadsheetId = createSpreadsheetRes.id;
    
    const sheetMetadata = await googleApiCall(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`);
    const defaultSheetTitle = sheetMetadata.sheets[0].properties.title;

    const headersRow = ['STT', 'Tiêu đề bài báo', 'Đường dẫn [URL]', 'Phong cách / Góc nhìn', 'Kịch bản Voice-off (Lời thoại)', 'Nội dung đăng Facebook (Content FB)'];
    const values = [headersRow];
    results.forEach(item => {
        values.push([item.stt, item.title, item.url, item.angle, item.script, item.fb_content]);
    });

    console.log("Đang ghi dữ liệu vào Google Sheet...");
    const rangeStr = `'${defaultSheetTitle}'!A1:F${values.length}`;
    const updateUri = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeStr)}?valueInputOption=USER_ENTERED`;
    
    await googleApiCall(updateUri, "PUT", JSON.stringify({
        range: rangeStr,
        majorDimension: "ROWS",
        values: values
    }));

    console.log("Đã tải tệp lên Drive thành công!");
    console.log(`Drive link: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
}

run().catch(e => {
    console.error("LỖI HỆ THỐNG:", e.message);
    process.exit(1);
});
