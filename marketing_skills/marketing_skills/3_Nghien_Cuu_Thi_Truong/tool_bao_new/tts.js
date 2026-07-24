const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { execSync } = require('child_process');
const { MsEdgeTTS } = require('msedge-tts');

// Dynamic FFmpeg resolver
function getFFmpegPath() {
    const localPath = path.join(__dirname, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
    if (fs.existsSync(localPath)) return localPath;
    
    const parentPath = path.join(__dirname, '..', '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
    if (fs.existsSync(parentPath)) return parentPath;
    
    return 'C:\\Users\\Admin\\.antigravity-ide\\node_modules\\ffmpeg-static\\ffmpeg.exe';
}

// Helper to split text into sub-chunks (< 160 characters) for gTTS
function splitTextIntoSubChunks(text, maxLength = 160) {
    const parts = text.split(/([.,!?;]+)/);
    const subChunks = [];
    let currentChunk = '';
    
    for (let part of parts) {
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

// Download helper
async function downloadFile(url, dest) {
    const writer = fs.createWriteStream(dest);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

// Main audio generator
async function generateAudio(text, voice, outputFile) {
    const voiceLower = voice.toLowerCase();

    // 1. FPT AI (Voice starts with 'fpt_')
    if (voiceLower.startsWith('fpt_')) {
        const apiKey = process.env.FPT_API_KEY;
        if (!apiKey) {
            throw new Error("Missing FPT_API_KEY in .env");
        }
        const fptVoice = voice.replace('fpt_', '');
        const url = "https://api.fpt.ai/hmi/tts/v5";
        
        console.log(`Sending FPT AI TTS request with voice ${fptVoice}...`);
        const response = await axios.post(url, text, {
            headers: {
                'api-key': apiKey,
                'voice': fptVoice,
                'Content-Type': 'text/plain; charset=utf-8'
            }
        });

        if (response.status === 200 && response.data.async) {
            const audioUrl = response.data.async;
            console.log(`FPT Audio queued: ${audioUrl}. Polling for completion...`);
            
            // Poll for up to 60 seconds
            for (let i = 0; i < 30; i++) {
                await new Promise(r => setTimeout(r, 2000));
                try {
                    const checkRes = await axios.get(audioUrl, { responseType: 'arraybuffer' });
                    const contentType = checkRes.headers['content-type'] || '';
                    if (checkRes.status === 200 && !contentType.includes('application/json')) {
                        fs.writeFileSync(outputFile, checkRes.data);
                        console.log("FPT Audio successfully downloaded.");
                        return outputFile;
                    }
                } catch (e) {
                    // Ignore and wait
                }
            }
            throw new Error("FPT API timeout while polling.");
        } else {
            throw new Error(`FPT API Error: ${JSON.stringify(response.data)}`);
        }
    }

    // 2. ElevenLabs (Voice starts with 'eleven_')
    else if (voiceLower.startsWith('eleven_')) {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
            throw new Error("Missing ELEVENLABS_API_KEY in .env");
        }
        const voiceId = voice.replace('eleven_', '');
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

        console.log(`Sending ElevenLabs TTS request for voice ID ${voiceId}...`);
        const response = await axios.post(url, {
            text: text,
            model_id: "eleven_turbo_v2_5",
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75
            }
        }, {
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': apiKey
            },
            responseType: 'arraybuffer'
        });

        if (response.status === 200) {
            fs.writeFileSync(outputFile, response.data);
            console.log("ElevenLabs Audio successfully downloaded.");
            return outputFile;
        } else {
            throw new Error(`ElevenLabs API returned status ${response.status}`);
        }
    }

    // 3. Microsoft Edge TTS (Voice starts with 'vi-vn-')
    else if (voiceLower.startsWith('vi-vn-')) {
        try {
            console.log(`Synthesizing via Edge TTS with voice ${voice}...`);
            const tts = new MsEdgeTTS();
            await tts.setMetadata(voice, "audio-24khz-48kbitrate-mono-mp3");
            
            const tempDir = path.dirname(outputFile);
            const res = await tts.toFile(tempDir, text);
            
            if (fs.existsSync(res.audioFilePath)) {
                // toFile creates "audio.mp3" in output directory, we need to rename it
                if (res.audioFilePath !== outputFile) {
                    if (fs.existsSync(outputFile)) {
                        fs.unlinkSync(outputFile);
                    }
                    fs.renameSync(res.audioFilePath, outputFile);
                }
                console.log("Edge TTS synthesis completed successfully.");
                return outputFile;
            }
            throw new Error("Edge TTS did not generate audioFilePath.");
        } catch (e) {
            console.error(`Edge TTS Error: ${e.message}. Falling back to gTTS.`);
        }
    }

    // 4. Fallback: Google Translate TTS (gTTS)
    console.log("Generating audio using Google Translate TTS fallback...");
    const tempDir = path.join(path.dirname(outputFile), `temp_gtts_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const chunks = splitTextIntoSubChunks(text);
    const chunkPaths = [];

    try {
        for (let i = 0; i < chunks.length; i++) {
            const chunkText = chunks[i];
            const dest = path.join(tempDir, `chunk_${i}.mp3`);
            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(chunkText)}`;
            await downloadFile(ttsUrl, dest);
            chunkPaths.push(dest);
            // Delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 600));
        }

        // Concatenate using FFmpeg
        const listPath = path.join(tempDir, 'list.txt');
        const listContent = chunkPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
        fs.writeFileSync(listPath, listContent, 'utf8');

        const ffmpeg = getFFmpegPath();
        const cmd = `"${ffmpeg}" -f concat -safe 0 -i "${listPath}" -c copy -y "${outputFile}"`;
        execSync(cmd, { stdio: 'ignore' });
        console.log("gTTS audio files concatenated successfully.");
    } finally {
        // Cleanup temp folder
        if (fs.existsSync(tempDir)) {
            fs.readdirSync(tempDir).forEach(f => fs.unlinkSync(path.join(tempDir, f)));
            fs.rmdirSync(tempDir);
        }
    }

    return outputFile;
}

module.exports = { generateAudio, getFFmpegPath };
