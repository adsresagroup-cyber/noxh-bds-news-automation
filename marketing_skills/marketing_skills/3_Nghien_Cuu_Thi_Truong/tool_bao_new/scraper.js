const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { URL } = require('url');

async function scrapeArticle(url, outputDir) {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log('Launching Puppeteer to fetch page:', url);
    let browser;
    let html = '';
    let cookieStr = '';

    try {
        browser = await puppeteer.launch({
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            headless: true
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        html = await page.content();
        
        const cookies = await page.cookies();
        cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        console.log('Cookies extracted successfully.');
    } catch (err) {
        console.error('Puppeteer fetch error:', err.message);
        throw err;
    } finally {
        if (browser) {
            await browser.close();
        }
    }

    const $ = cheerio.load(html);

    // Extract title
    let title = $('title').text().trim() || $('h1').first().text().trim() || 'Không có tiêu đề';
    title = title.split(/\s+[-|]\s+/)[0].trim();

    // Extract text content
    const paragraphs = [];
    $('p, h2, h3, h4').each((i, el) => {
        const text = $(el).text().trim();
        if (text.length > 25 && !text.includes('http') && !text.includes('www.')) {
            paragraphs.push(text);
        }
    });
    const textContent = paragraphs.join('\n');

    // Extract images
    const rawImages = [];
    const ogImg = $('meta[property="og:image"]').attr('content');
    if (ogImg) {
        rawImages.push(ogImg);
    }

    $('img').each((i, el) => {
        const src = $(el).attr('data-original') || $(el).attr('data-src') || $(el).attr('src');
        if (src && !src.startsWith('data:')) {
            rawImages.push(src);
        }
    });

    const downloadedImages = [];
    const seenUrls = new Set();
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': url
    };
    if (cookieStr) {
        headers['Cookie'] = cookieStr;
    }

    for (let imgUrl of rawImages) {
        try {
            const absoluteUrl = new URL(imgUrl, url).href;
            if (seenUrls.has(absoluteUrl)) continue;
            seenUrls.add(absoluteUrl);

            const lowerUrl = absoluteUrl.toLowerCase();
            if (lowerUrl.includes('icon') || lowerUrl.includes('logo') || lowerUrl.includes('avatar') || lowerUrl.includes('button') || lowerUrl.includes('banner')) {
                continue;
            }

            console.log('Downloading image:', absoluteUrl);
            const imgRes = await axios.get(absoluteUrl, {
                headers,
                responseType: 'arraybuffer',
                timeout: 5000
            });

            if (imgRes.status === 200) {
                const contentType = imgRes.headers['content-type'] || '';
                if (!contentType.includes('image')) continue;

                if (imgRes.data.length < 15000) continue;

                const ext = contentType.split('/')[1] || 'jpg';
                let cleanExt = ext.split(';')[0].split('?')[0].trim();
                if (cleanExt === 'jpeg') cleanExt = 'jpg';
                
                const filename = `image_${downloadedImages.length}.${cleanExt}`;
                const filepath = path.join(outputDir, filename);

                fs.writeFileSync(filepath, imgRes.data);
                downloadedImages.push(filepath);

                if (downloadedImages.length >= 10) {
                    break;
                }
            }
        } catch (e) {
            console.warn(`Failed to download image ${imgUrl}: ${e.message}`);
        }
    }

    return {
        title,
        text: textContent,
        images: downloadedImages
    };
}

module.exports = { scrapeArticle };
