const { scrapeArticle } = require('./scraper');
const path = require('path');
const fs = require('fs');

async function test() {
    const url = 'https://laodong.vn/bat-dong-san/khach-hang-kien-nghi-go-vuong-vi-du-an-treo-qua-lau-1178177.html';
    const outputDir = path.join(__dirname, 'test_output_images');
    
    // Clean old output images
    if (fs.existsSync(outputDir)) {
        fs.readdirSync(outputDir).forEach(f => fs.unlinkSync(path.join(outputDir, f)));
    }
    
    console.log('Testing scrapeArticle with:', url);
    try {
        const result = await scrapeArticle(url, outputDir);
        console.log('Test Scrape Result:', {
            title: result.title,
            textLength: result.text.length,
            imagesCount: result.images.length,
            images: result.images
        });
    } catch (e) {
        console.error('Test Scrape Failed:', e);
    }
}

test();
