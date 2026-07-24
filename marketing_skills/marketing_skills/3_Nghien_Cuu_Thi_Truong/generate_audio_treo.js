const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FFMPEG_PATH = 'c:\\Users\\Admin\\.antigravity-ide\\node_modules\\ffmpeg-static\\ffmpeg.exe';
const BGM_URL = 'https://raw.githubusercontent.com/rafaelreis-hotmart/Audio-Sample-files/refs/heads/master/sample.mp3';
const BGM_FALLBACK_URL = 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Bach_-_Goldberg_Variations_1.mp3';

const chunks = [
    "DỰ ÁN TREO HÀNG CHỤC NĂM: KHÁCH HÀNG KÊU CỨU! Sốc! Hàng loạt dự án bất động sản tại Thành phố Hồ Chí Minh bị 'treo' hàng chục năm, khiến hàng nghìn khách hàng rơi vào cảnh 'tiến thoái lưỡng nan'.",
    "Tiền đã đóng, nhà thì không thấy đâu, tương lai mịt mờ. Đây có phải là cơn ác mộng tồi tệ nhất của người mua nhà?",
    "Theo thông tin mới nhất, nhiều dự án đình trệ do chủ đầu tư không còn đủ năng lực tài chính để tiếp tục triển khai.",
    "Khách hàng, những người đã đặt trọn niềm tin và tài sản vào đó, giờ đây phải tự mình đứng lên kiến nghị, gõ cửa khắp nơi để tìm lối thoát.",
    "Tình trạng này không chỉ gây thiệt hại nặng nề về kinh tế mà còn ảnh hưởng nghiêm trọng đến cuộc sống, tâm lý của hàng nghìn gia đình. Liệu có giải pháp nào cho những dự án này, hay khách hàng sẽ phải chờ đợi trong vô vọng? Các chuyên gia nhận định, việc giải quyết dứt điểm các dự án treo đòi hỏi sự vào cuộc quyết liệt từ các cơ quan chức năng.",
    "Vậy theo bạn, đâu là giải pháp tối ưu nhất để 'gỡ vướng' cho những dự án này và bảo vệ quyền lợi chính đáng của người mua nhà? Hãy để lại bình luận và chia sẻ quan điểm của bạn ngay bên dưới nhé!"
];

// Helper to download a file
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        };
        https.get(url, options, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Handle redirect
                downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to get '${url}' (Status Code: ${response.statusCode})`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

// Function to split text into safe Google Translate TTS sub-chunks (< 160 characters)
function splitTextIntoSubChunks(text, maxLength = 160) {
    const parts = text.split(/([.,!?;]+)/);
    const subChunks = [];
    let currentChunk = '';
    
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;
        
        if ((currentChunk + part).length > maxLength) {
            if (currentChunk.trim()) {
                subChunks.push(currentChunk.trim());
            }
            currentChunk = part;
        } else {
            currentChunk += part;
        }
    }
    if (currentChunk.trim()) {
        subChunks.push(currentChunk.trim());
    }
    return subChunks.filter(s => s.length > 0);
}

async function main() {
    const tempDir = path.join(__dirname, 'temp_audio_treo');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    console.log('--- Bắt đầu tải giọng thuyết minh (TTS) ---');
    const partPaths = [];
    let subPartIndex = 0;
    
    for (let i = 0; i < chunks.length; i++) {
        const text = chunks[i];
        const subChunks = splitTextIntoSubChunks(text);
        console.log(`Phần ${i + 1} được chia thành ${subChunks.length} câu nhỏ.`);
        
        for (let j = 0; j < subChunks.length; j++) {
            const subText = subChunks[j];
            const dest = path.join(tempDir, `part_${subPartIndex}.mp3`);
            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(subText)}`;
            console.log(`Đang tải câu nhỏ ${subPartIndex + 1}: "${subText.substring(0, 40)}..."`);
            await downloadFile(ttsUrl, dest);
            partPaths.push(dest);
            subPartIndex++;
            // Small delay to prevent rate limiting
            await new Promise(r => setTimeout(r, 600));
        }
    }

    console.log('--- Ghép các file lồng tiếng thành một file voice_raw.mp3 ---');
    const voiceRawPath = path.join(__dirname, 'voice_raw.mp3');
    // Using ffmpeg concat demuxer
    const listPath = path.join(tempDir, 'list.txt');
    const listContent = partPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(listPath, listContent, 'utf8');
    
    execSync(`"${FFMPEG_PATH}" -f concat -safe 0 -i "${listPath}" -c copy -y "${voiceRawPath}"`);
    console.log('Ghép thành công voice_raw.mp3');

    console.log('--- Tải nhạc nền (BGM) ---');
    const bgmPath = path.join(__dirname, 'bgm_treo.mp3');
    try {
        await downloadFile(BGM_URL, bgmPath);
        console.log('Tải thành công nhạc nền chính.');
    } catch (err) {
        console.warn('Không tải được nhạc nền chính, đang thử nhạc nền dự phòng...', err.message);
        await downloadFile(BGM_FALLBACK_URL, bgmPath);
        console.log('Tải thành công nhạc nền dự phòng.');
    }

    console.log('--- Trộn giọng thuyết minh với nhạc nền (Mix Audio) ---');
    const audioFinalPath = path.join(__dirname, 'audio_treo_final.mp3');
    // Mix filter: voice volume 2.0, BGM volume 0.08, cut output when voice ends, add fade out 1.5s
    const cmd = `"${FFMPEG_PATH}" -i "${voiceRawPath}" -i "${bgmPath}" -filter_complex "[0:a]volume=2.0[a0];[1:a]volume=0.08[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2,afade=t=out:st=65:d=2" -y "${audioFinalPath}"`;
    // Note: We need to adapt the fade out start time dynamically, but let's check voice duration first
    // We can just run mixing first
    const cmdSimple = `"${FFMPEG_PATH}" -i "${voiceRawPath}" -i "${bgmPath}" -filter_complex "[0:a]volume=2.0[a0];[1:a]volume=0.08[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2" -y "${audioFinalPath}"`;
    
    execSync(cmdSimple);
    console.log('Tạo thành công file audio_treo_final.mp3 hoàn chỉnh!');

    // Cleanup temp directory
    fs.readdirSync(tempDir).forEach(f => fs.unlinkSync(path.join(tempDir, f)));
    fs.rmdirSync(tempDir);
    console.log('Dọn dẹp thư mục tạm thành công.');
}

main().catch(err => {
    console.error('Lỗi trong quá trình xử lý:', err);
    process.exit(1);
});
