const fs = require('fs');
const path = require('path');

// 1. Calculate Vietnam Time & Window
const now = new Date();
const vnOffset = 7 * 60 * 60 * 1000;
const vnNow = new Date(now.getTime() + vnOffset);

let startTime;
const endTime = vnNow;
if (vnNow.getUTCDay() === 1) { // Monday -> 72h window
    startTime = new Date(vnNow.getTime() - 72 * 60 * 60 * 1000);
} else { // 24h window
    startTime = new Date(vnNow.getTime() - 24 * 60 * 60 * 1000);
}

function formatDateStr(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

console.log("=== QUY TRÌNH TIN TỨC NHÀ Ở XÃ HỘI (NOXH) ===");
console.log(`Lọc bài viết từ: ${formatDateStr(startTime)} đến: ${formatDateStr(endTime)}`);

// 2. Load Tokens & API Keys
function findMetaAdsDir() {
    const root = path.resolve(__dirname, '../../..');
    const p1 = path.join(root, 'meta ads api');
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(root, 'meta_ads_api');
    if (fs.existsSync(p2)) return p2;
    return path.join(__dirname, 'meta ads api');
}

const metaAdsDir = findMetaAdsDir();
const tokenPath = path.join(metaAdsDir, 'token.json');

if (!fs.existsSync(tokenPath)) {
    console.error(`X Lỗi: Chưa tìm thấy file token.json tại ${tokenPath}`);
    process.exit(1);
}

const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
let accessToken = tokenData.token;

let geminiApiKey = process.env.GEMINI_API_KEY || '';
if (!geminiApiKey) {
    const envPath = path.join(metaAdsDir, '.env');
    if (fs.existsSync(envPath)) {
        const text = fs.readFileSync(envPath, 'utf8');
        const match = text.match(/^GEMINI_API_KEY=(.*)$/m);
        if (match) geminiApiKey = match[1].trim().replace(/^["']|["']$/g, '');
    }
}
geminiApiKey = geminiApiKey.replace(/[\r\n"'\s]/g, '').trim();

if (!geminiApiKey) {
    console.warn("X CẢNH BÁO: GEMINI_API_KEY rỗng! Không thể gọi AI!");
} else {
    console.log(`Đã kết nối GEMINI_API_KEY (Độ dài: ${geminiApiKey.length} ký tự).`);
}

// 3. RSS Feeds for NOXH
const rssSources = [
    { url: "https://baomoi.com/rss/bat-dong-san.rss", source: "BaoMoi" },
    { url: "https://vnexpress.net/rss/bat-dong-san.rss", source: "VnExpress" },
    { url: "https://vietnamnet.vn/rss/bat-dong-san.rss", source: "VietnamNet" },
    { url: "https://cafef.vn/bat-dong-san.rss", source: "CafeF" },
    { url: "https://dantri.com.vn/rss/bat-dong-san.rss", source: "DanTri" },
    { url: "https://thanhnien.vn/rss/kinh-te/bat-dong-san.rss", source: "ThanhNien" },
    { url: "https://tuoitre.vn/rss/kinh-doanh.rss", source: "TuoiTre" },
    { url: "https://laodong.vn/rss/bat-dong-san.rss", source: "LaoDong" },
    { url: "https://baoxaydung.vn/rss/bat-dong-san.rss", source: "BaoXayDung" }
];

const noxhKeywords = ["nhà ở xã hội", "noxh", "nhà thu nhập thấp", "gói 120", "gói 120.000 tỷ", "bốc thăm noxh", "mua nhà ở xã hội", "tiêu chuẩn noxh", "hồ sơ noxh", "định mức noxh"];

function isNOXHArticle(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return noxhKeywords.some(k => lower.includes(k));
}

function clean(str) {
    if (!str) return '';
    return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
              .replace(/<[^>]+>/g, '')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .trim();
}

function parsePubDate(pubDateStr) {
    if (!pubDateStr) return null;
    const d = new Date(pubDateStr);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getTime() + vnOffset);
}

function cleanJsonString(jsonStr) {
    let cleaned = jsonStr.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
    cleaned = cleaned.replace(/"script"\s*:\s*"([\s\S]*?)"\s*,\s*"fb_content"/gi, (match, scriptVal) => {
        const escapedScript = scriptVal.replace(/\r?\n/g, '\\n').replace(/\t/g, '\\t');
        return `"script": "${escapedScript}", "fb_content"`;
    });
    return cleaned;
}

async function main() {
    const articles = [];
    for (const src of rssSources) {
        try {
            console.log(`Đang tải tin tức từ ${src.source}...`);
            const res = await fetch(src.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!res.ok) continue;
            const xml = await res.text();
            
            const items = xml.split(/<item>/i).slice(1);
            for (const itemXml of items) {
                const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/i);
                const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/i);
                const descMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/i);
                const dateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
                
                const title = titleMatch ? clean(titleMatch[1]) : '';
                const link = linkMatch ? clean(linkMatch[1]) : '';
                const desc = descMatch ? clean(descMatch[1]) : '';
                const pubDate = dateMatch ? parsePubDate(clean(dateMatch[1])) : null;
                
                if (title && link) {
                    if (pubDate && (pubDate < startTime || pubDate > endTime)) continue;
                    if (isNOXHArticle(title) || isNOXHArticle(desc)) {
                        const trimmedLink = link.split('?')[0].trim();
                        if (!articles.some(a => a.url === trimmedLink)) {
                            articles.push({
                                title,
                                url: trimmedLink,
                                description: desc,
                                source: src.source,
                                pubDate: pubDate || vnNow
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.warn(`Lỗi khi tải từ ${src.source}:`, e.message);
        }
    }

    console.log(`Tìm thấy tổng cộng ${articles.length} bài viết về NOXH.`);
    
    // Select top 6 distinct articles
    articles.sort((a, b) => b.pubDate - a.pubDate);
    const topArticles = articles.slice(0, 6);
    console.log(`Quyết định lựa chọn ${topArticles.length} bài viết để gửi AI phân tích.`);

    if (topArticles.length === 0) {
        console.log("Không tìm thấy bài viết nào. Kết thúc.");
        return;
    }

    const systemInstruction = `Bạn là một Biên kịch nội dung Video ngắn xuất sắc và là một Chuyên gia tư vấn Nhà ở xã hội (NOXH) hàng đầu tại Việt Nam. Nhiệm vụ của bạn là từ thông tin bài báo được cung cấp, chuyển thể thành kịch bản video ngắn triệu view (TikTok/Reels/Shorts) và bài đăng Facebook thu hút.

Hãy trả về một đối tượng JSON hợp lệ có cấu trúc chính xác:
{
  "angle": "Tin tức / Chuyên gia chia sẻ",
  "script": "CÂU TIÊU ĐỀ VIẾT HOA TOÀN BỘ VỚI DẤU CHẤM CẢM!\\n\\n[Phần lời thoại đọc voice-off liền mạch hoàn toàn, NÓI THẲNG VÀO NỘI DUNG, PHẢI DÀI TỪ 230 ĐẾN 290 TỪ TIẾNG VIỆT. TUYỆT ĐỐI KHÔNG GHI CÁC CHỮ TIỀN TỐ NHƯ 'TIÊU ĐỀ:', '[HOOK]', '[BODY]', '[CTA]' Ở PHÍA TRƯỚC]",
  "fb_content": "Nội dung bài đăng Facebook ngắn từ 3-5 dòng, dòng 1 có emoji 🔥 hoặc ⁉️ giật tít in hoa, các dòng sau tóm tắt thông tin đắt giá nhất và câu hỏi khảo sát thảo luận."
}

[TƯ DUY PHÂN TÍCH & SÁNG TẠO KỊCH BẢN (ĐỔI MỚI & KHÔNG TRÙNG LẶP)]
1. Bám sát các cập nhật mới nhất về quy định điều kiện mua NOXH, mức thu nhập tối đa được phép đăng ký, lãi suất gói vay ưu đãi 120k tỷ, thủ tục xét duyệt và tiến độ mở bán dự án:
   - Nếu bài báo về quy định/điều kiện/mức thu nhập mới: Phân tích ngay xem ai đủ điều kiện, hồ sơ cần chuẩn bị những gì để tránh bị loại vô lý.
   - Nếu bài báo về tiến độ/mở bán dự án NOXH mới: Đánh giá vị trí, mức giá bán, thời điểm nhận hồ sơ và tiềm năng an cư.
   - Nếu bài báo về sai phạm/trục lợi/bốc thăm NOXH: Nhấn mạnh cảnh báo cạm bẫy, rủi ro mua bán suất ngoại giao trái phép.
2. Không viết lặp lại rập khuôn hay tóm tắt bài báo một cách khô khan. Hãy biến hóa thông tin thành một câu chuyện thực tế, hữu ích, chạm đúng tâm lý người thu nhập thấp và công nhân đang tìm nhà ở.

[YÊU CỰC KỲ QUAN TRỌNG CHO PHẦN "script"]
1. Dòng 1: CÂU TIÊU ĐỀ HOOK CỰC KỲ GIẬT GÂN GÂY TÒ MÒ (SCROLL STOPPER), VIẾT IN HOA TOÀN BỘ KÈM DẤU CHẤM CẢM (!). TUYỆT ĐỐI KHÔNG COPY NGUYÊN VĂN HOẶC LẶP LẠI TIÊU ĐỀ BÀI BÁO GỐC KHÔ KHAN! Hãy biến hóa thành câu giật tít kích thích tò mò, cảnh báo rủi ro hoặc cơ hội an cư.
2. Xuống dòng 2 lần, viết phần LỜI THOẠI ĐỌC VOICE-OFF LIỀN MẠCH từ đầu đến cuối.
3. TUYỆT ĐỐI KHÔNG GHI CÁC TỪ 'TIÊU ĐỀ:', '[HOOK]', '[BODY]', '[CTA]' TRONG NỘI DUNG KỊCH BẢN.
4. ĐỘ DÀI BẮT BUỘC: Tổng số từ phần "script" (Tiêu đề + Lời thoại) PHẢI NẰM TRONG KHOẢNG 230 ĐẾN 290 TỪ TIẾNG VIỆT. TUYỆT ĐỐI KHÔNG VIẾT NGẮN DƯỚI 230 TỪ. AI cần mở rộng phân tích chuyên sâu các yếu tố điều kiện thu nhập, quy trình xét duyệt, kinh nghiệm nộp hồ sơ thực tế để đảm bảo đủ từ 230-290 từ.
5. Văn phong tự nhiên, xưng hô gần gũi (mình, em, các bác, mọi người...). TUYỆT ĐỐI KHÔNG xưng tên cá nhân cụ thể. Không kêu gọi inbox riêng.`;

    const results = [];
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
                    ? `Kịch bản trước bạn viết chỉ có ${wc} từ (dưới 230 từ). Hãy mở rộng thêm các đoạn phân tích chuyên sâu quy trình xét duyệt, điều kiện thu nhập, kinh nghiệm nộp hồ sơ thực tế để tổng số từ NẰM CHÍNH XÁC TRONG KHOẢNG TỪ 230 ĐẾN 290 TỪ TIẾNG VIỆT!`
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

    // Google Sheets Upload
    console.log("Đang kết nối Google Drive...");
    const driveFolderId = "1kYdy7EU24MqFa7ww4VXD2quJsyYuni9E"; // Folder Tin tuc nha o xa hoi
    const hh = String(vnNow.getUTCHours()).padStart(2, '0');
    const mm = String(vnNow.getUTCMinutes()).padStart(2, '0');
    const dd = String(vnNow.getUTCDate()).padStart(2, '0');
    const MM = String(vnNow.getUTCMonth() + 1).padStart(2, '0');
    
    const spreadsheetTitle = `${hh}h${mm} - ${dd}/${MM} - Tin tuc NOXH`;
    console.log(`Đang tạo Google Spreadsheet: "${spreadsheetTitle}"...`);
    
    const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            properties: { title: spreadsheetTitle }
        })
    });
    
    if (!createRes.ok) {
        throw new Error(`Failed to create spreadsheet: ${await createRes.text()}`);
    }
    const createData = await createRes.json();
    const spreadsheetId = createData.spreadsheetId;
    
    // Move to Drive folder
    const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}?fields=parents`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
    });
    const fileData = await fileRes.json();
    const previousParents = (fileData.parents || []).join(',');
    
    await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${driveFolderId}&removeParents=${previousParents}&fields=id,parents`, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${accessToken}` }
    });

    // Write Values
    const headersRow = ['STT', 'Tiêu đề bài báo', 'Đường dẫn [URL]', 'Phong cách / Góc nhìn', 'Kịch bản Voice-off (Lời thoại)', 'Nội dung đăng Facebook (Content FB)'];
    const values = [headersRow];
    results.forEach(item => {
        values.push([item.stt, item.title, item.url, item.angle, item.script, item.fb_content]);
    });

    const defaultSheetTitle = createData.sheets[0].properties.title;
    const rangeStr = `'${defaultSheetTitle}'!A1:F${values.length}`;
    
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeStr)}?valueInputOption=USER_ENTERED`, {
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

    console.log("Đã tải tệp lên Drive thành công!");
    console.log(`Drive link: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
}

main().catch(console.error);
