const fs = require('fs');
const envPath = './meta ads api/.env';
let apiKey = '';
if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, 'utf8');
    const match = text.match(/^GEMINI_API_KEY=(.*)$/m);
    if (match) apiKey = match[1].trim().replace(/^["']|["']$/g, '');
}

const systemInstruction = `Bạn là một Biên kịch nội dung Video ngắn xuất sắc và là một Chuyên gia tư vấn Nhà ở xã hội (NOXH) hàng đầu tại Việt Nam. Nhiệm vụ của bạn là từ thông tin bài báo được cung cấp, chuyển thể thành kịch bản video ngắn triệu view (TikTok/Reels/Shorts).

[YÊU CẦU ĐẶC BIỆT VỀ CÂU HOOK TIÊU ĐỀ (DÒNG 1)]
1. Dòng 1: CÂU TIÊU ĐỀ HOOK CỰC KỲ GIẬT GÂN, GÂY TÒ MÒ KÍCH THÍCH (SCROLL STOPPER), VIẾT IN HOA TOÀN BỘ KÈM DẤU CHẤM CẢM (!).
2. TUYỆT ĐỐI KHÔNG COPY NGUYÊN VĂN HOẶC LẶP LẠI TIÊU ĐỀ BÀI BÁO GỐC KHÔ KHAN!

[YÊU CẦU BẮT BUỘC VỀ ĐỘ DÀI & ĐỊNH DẠNG KỊCH BẢN VOICE-OFF]
1. Dòng 1: CÂU TIÊU ĐỀ HOOK SÁNG TẠO GIẬT TÍT IN HOA TOÀN BỘ KÈM DẤU CHẤM CẢM (!).
2. Xuống dòng 2 lần, viết phần LỜI THOẠI ĐỌC VOICE-OFF LIỀN MẠCH từ đầu đến cuối.
3. TUYỆT ĐỐI KHÔNG GHI CÁC TỪ 'TIÊU ĐỀ:', '[HOOK]', '[BODY]', '[CTA]' TRONG NỘI DUNG KỊCH BẢN.
4. ĐỘ DÀI BẮT BUỘC: Tổng số từ (Tiêu đề + Lời thoại) PHẢI NẰM CHÍNH XÁC TRONG KHOẢNG 230 ĐẾN 290 TỪ TIẾNG VIỆT (đếm theo khoảng trắng). TUYỆT ĐỐI KHÔNG VIẾT NGẮN DƯỚI 230 TỪ VÀ KHÔNG DÀI QUÁ 290 TỪ.
5. Văn phong tự nhiên, xưng hô gần gũi (mình, em, các bác, mọi người...). TUYỆT ĐỐI KHÔNG xưng tên cá nhân cụ thể. Không kêu gọi inbox riêng.`;

const userPrompt = `Tiêu đề bài báo gốc: Hà Tĩnh lần đầu cho bốc thăm trực tuyến quyền mua nhà ở xã hội
Tóm tắt sơ bộ: Lần đầu tiên, Hà Tĩnh sẽ tổ chức bốc thăm trực tuyến quyền mua nhà ở xã hội đối với 509 căn hộ tại dự án thí điểm nhà ở xã hội giai đoạn II. Việc ứng dụng công nghệ số được kỳ vọng bảo đảm công khai, minh bạch và thuận lợi cho người dân.

YÊU CẦU BẮT BUỘC:
1. Dòng 1 phải là CÂU HOOK GIẬT TÍT SÁNG TẠO GÂY TÒ MÒ IN HOA TOÀN BỘ (TUYỆT ĐỐI KHÔNG lặp lại tiêu đề bài báo gốc khô khan!).
2. Viết kịch bản voice-off phân tích sâu sắc, đa chiều, đạt ĐỘ DÀI CHÍNH XÁC TỪ 230 ĐẾN 290 TỪ TIẾNG VIỆT.`;

async function main() {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'openai/gpt-4o-mini',
            messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.5
        })
    });
    const data = await response.json();
    const text = data.choices[0].message.content;
    console.log('--- GENERATED SCRIPT ---');
    console.log(text);
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    console.log('\n--- TOTAL WORD COUNT ---:', words.length);
}

main().catch(console.error);
