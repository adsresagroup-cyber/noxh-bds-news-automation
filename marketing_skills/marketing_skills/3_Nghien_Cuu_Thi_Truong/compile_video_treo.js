const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RECORDINGS_DIR = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\browser_recordings\\6119b7ce-3d33-4391-a14d-48f6599ef32e';
const OUTPUT_MP4 = path.join(__dirname, 'video_du_an_treo_final.mp4');
const FFMPEG_PATH = 'c:\\Users\\Admin\\.antigravity-ide\\node_modules\\ffmpeg-static\\ffmpeg.exe';
const AUDIO_INPUT = path.join(__dirname, 'audio_treo_final.mp3');

console.log('--- Bắt đầu quét các frame ảnh chụp màn hình ---');
console.log('Thư mục lưu trữ recordings:', RECORDINGS_DIR);

if (!fs.existsSync(RECORDINGS_DIR)) {
    console.error('Không tìm thấy thư mục recordings!');
    process.exit(1);
}

const files = fs.readdirSync(RECORDINGS_DIR)
    .filter(f => f.endsWith('.jpg'))
    .map(f => {
        const msStr = f.substring(0, 13);
        return {
            name: f,
            path: path.join(RECORDINGS_DIR, f).replace(/\\/g, '/'),
            time: parseInt(msStr, 10)
        };
    })
    .sort((a, b) => a.time - b.time);

console.log(`Tìm thấy tổng cộng ${files.length} frame ảnh.`);

if (files.length === 0) {
    console.error('Không tìm thấy ảnh frame nào!');
    process.exit(1);
}

// Lấy các frame thuộc về phiên ghi hình mới nhất (trong vòng 120 giây tính từ file cuối cùng)
const maxTime = Math.max(...files.map(f => f.time));
const sessionFiles = files.filter(f => maxTime - f.time <= 120000);
console.log(`Lọc ra ${sessionFiles.length} frame ảnh thuộc phiên ghi hình mới nhất.`);

if (sessionFiles.length === 0) {
    console.error('Không tìm thấy frame ảnh nào hợp lệ!');
    process.exit(1);
}

// Tạo danh sách file cho FFmpeg concat demuxer
let concatContent = '';
for (let i = 0; i < sessionFiles.length; i++) {
    const file = sessionFiles[i];
    concatContent += `file '${file.path}'\n`;
    
    let duration = 0.04; // 25fps làm dự phòng
    if (i < sessionFiles.length - 1) {
        const diff = sessionFiles[i+1].time - file.time;
        // Nếu chênh lệch hợp lệ (0 < diff < 5 giây)
        if (diff > 0 && diff < 5000) {
            duration = diff / 1000;
        }
    }
    concatContent += `duration ${duration}\n`;
}

// Ghi file_list.txt
const fileListPath = path.join(__dirname, 'file_list_treo.txt');
fs.writeFileSync(fileListPath, concatContent, 'utf8');
console.log('Đã tạo file_list_treo.txt thành công.');

console.log('--- Tiến hành biên dịch video và ghép âm thanh bằng FFmpeg ---');
try {
    // Cắt (crop) chính giữa màn hình tỉ lệ 360x640 (9:16) và chuyển về định dạng màu yuv420p
    const cmd = `"${FFMPEG_PATH}" -f concat -safe 0 -i "${fileListPath}" -i "${AUDIO_INPUT}" -vf "crop=360:640:(in_w-360)/2:(in_h-640)/2,format=yuv420p" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest -y "${OUTPUT_MP4}"`;
    console.log('Đang thực thi lệnh:', cmd);
    execSync(cmd, { stdio: 'inherit' });
    console.log('--- BIÊN DỊCH VIDEO THÀNH CÔNG! ---');
    console.log('File video đầu ra:', OUTPUT_MP4);
    
    // Xoá file_list_treo.txt sau khi hoàn tất
    fs.unlinkSync(fileListPath);
    console.log('Đã dọn dẹp file list tạm.');
} catch (err) {
    console.error('Lỗi khi biên dịch video bằng FFmpeg:', err.message);
    process.exit(1);
}
