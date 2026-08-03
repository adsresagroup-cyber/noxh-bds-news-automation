const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

function getChromePath() {
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
        return process.env.CHROME_PATH;
    }
    const winPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    if (fs.existsSync(winPath)) return winPath;
    
    const linuxPaths = [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium'
    ];
    for (const p of linuxPaths) {
        if (fs.existsSync(p)) return p;
    }
    return winPath;
}

const CHROME_PATH = getChromePath();
const DEFAULT_GROUPS = [
    { url: 'https://www.facebook.com/groups/656952939567390', id: '656952939567390' },
    { url: 'https://www.facebook.com/groups/1690642521915386', id: '1690642521915386' },
    { url: 'https://www.facebook.com/groups/646402147493446', id: '646402147493446' }
];

// Helper to shuffle and pick N random elements
function getRandomElements(arr, num) {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, num);
}

// Delay helper
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Helper to check if a relative or absolute date is within the last 7 days
function isWithinLast7Days(timeStr) {
    if (!timeStr) return true; // Default fallback
    
    const str = timeStr.toLowerCase().trim();
    
    // 1. Check relative minutes, hours, seconds, yesterday
    if (str.includes('hôm qua') || str.includes('yesterday') || str.includes('vừa xong') || str.includes('just now')) {
        return true;
    }
    if (str.match(/^\d+[mhs]$/) || str.includes('phút') || str.includes('giờ') || str.includes('giây') || str.includes('minute') || str.includes('hour') || str.includes('second')) {
        return true;
    }
    
    // 2. Check relative days like "5d" or "5 ngày"
    const dayMatch = str.match(/^(\d+)d$/) || str.match(/^(\d+)\s+ngày/) || str.match(/^(\d+)\s+day/);
    if (dayMatch) {
        const days = parseInt(dayMatch[1], 10);
        return days <= 7;
    }
    
    // 3. Check days of week
    const daysOfWeek = ['thứ hai', 'thứ ba', 'thứ tư', 'thứ năm', 'thứ sáu', 'thứ bảy', 'chủ nhật', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const d of daysOfWeek) {
        if (str.includes(d)) return true;
    }
    
    // 4. Check absolute date formats (e.g., "16 tháng 6", "16 june", "june 16", etc.)
    const monthsMap = {
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11,
        'tháng 1': 0, 'tháng 2': 1, 'tháng 3': 2, 'tháng 4': 3, 'tháng 5': 4, 'tháng 6': 5, 'tháng 7': 6, 'tháng 8': 7, 'tháng 9': 8, 'tháng 10': 9, 'tháng 11': 10, 'tháng 12': 11,
        'tháng một': 0, 'tháng hai': 1, 'tháng ba': 2, 'tháng tư': 3, 'tháng năm': 4, 'tháng sáu': 5, 'tháng bảy': 6, 'tháng tám': 7, 'tháng chín': 8, 'tháng mười': 9, 'tháng mười một': 10, 'tháng mười hai': 11
    };
    
    let month = -1;
    let day = -1;
    let year = new Date().getFullYear();
    
    const yearMatch = str.match(/\b(20\d{2})\b/);
    if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
    }
    
    for (const [mName, mIdx] of Object.entries(monthsMap)) {
        if (str.includes(mName)) {
            month = mIdx;
            break;
        }
    }
    
    const numbers = str.match(/\b\d+\b/g);
    if (numbers) {
        const candidates = numbers.map(Number).filter(n => n > 0 && n <= 31 && n !== year);
        if (candidates.length > 0) {
            day = candidates[0];
        }
    }
    
    if (month !== -1 && day !== -1) {
        const postDate = new Date(year, month, day);
        const now = new Date();
        postDate.setHours(0, 0, 0, 0);
        now.setHours(0, 0, 0, 0);
        
        const diffTime = now - postDate;
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        return diffDays >= -1 && diffDays <= 7;
    }
    
    return true; // Default fallback to keep post if parse fails
}

async function scrapeFacebookGroups(outputJsonPath) {
    console.log('=== KHỞI ĐỘNG BỘ CÀO BÀI VIẾT FACEBOOK GROUP ===');
    console.log('Đường dẫn Chrome:', CHROME_PATH);
    console.log('Đầu ra JSON:', outputJsonPath);

    const historyPath = path.join(__dirname, 'scraped_history.json');
    let scrapedHistory = [];
    if (fs.existsSync(historyPath)) {
        try {
            scrapedHistory = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
            console.log(`Đã tải lịch sử cào: ${scrapedHistory.length} bài viết.`);
        } catch (e) {
            console.warn('Không thể đọc file scraped_history.json:', e.message);
        }
    }
    const historySet = new Set(scrapedHistory.map(u => u.toLowerCase().trim()));

    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-notifications',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1920,1080'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        const results = {};

        for (const group of DEFAULT_GROUPS) {
            console.log(`\n--------------------------------------------------`);
            console.log(`Đang cào nhóm: ${group.url}`);
            
            try {
                // Navigate to the group page
                await page.goto(group.url, { waitUntil: 'networkidle2', timeout: 45000 });
                await delay(3000);

                // Try to dismiss the login pop-up by pressing Escape
                await page.keyboard.press('Escape');
                await delay(1000);

                // Fetch group name
                let groupName = await page.evaluate(() => {
                    const h1 = document.querySelector('h1');
                    return h1 ? h1.innerText.trim() : '';
                });

                if (!groupName) {
                    groupName = `Group_${group.id}`;
                }
                console.log(`Tên nhóm xác định được: "${groupName}"`);

                // Scroll down to load a larger pool of posts
                console.log('Đang cuộn trang để tải thêm bài viết...');
                for (let i = 0; i < 7; i++) {
                    await page.evaluate(() => {
                        window.scrollBy(0, 1000);
                    });
                    await delay(2000);
                    // Dismiss login wall that might trigger on scroll
                    await page.keyboard.press('Escape');
                }

                // Click all "See more" / "Xem thêm" buttons to expand post contents
                console.log('Đang tìm và click mở rộng nội dung bài viết ẩn (See more / Xem thêm)...');
                await page.evaluate(() => {
                    const selectors = [
                        'div[role="button"]',
                        'span[role="button"]',
                        'a[role="button"]',
                        'div.x1i10hfl',
                        'span.x1i10hfl',
                        'span'
                    ];
                    const elements = Array.from(document.querySelectorAll(selectors.join(',')));
                    for (const el of elements) {
                        const text = el.innerText ? el.innerText.trim() : '';
                        if (text === 'Xem thêm' || text === 'See more' || text === 'Xem thêm...' || text === 'See more...') {
                            try {
                                el.click();
                            } catch (e) {}
                        }
                    }
                });
                await delay(2000); // Wait 2 seconds for all expanded contents to load

                // Extract all posts from the page
                console.log('Đang trích xuất dữ liệu từ các bài viết...');
                const postsPool = await page.evaluate(() => {
                    const posts = [];
                    const articles = document.querySelectorAll('div[role="article"]');
                    
                    for (const art of articles) {
                        // 1. Text Content
                        const msgDiv = art.querySelector('div[data-ad-comet-preview="message"]');
                        let text = msgDiv ? msgDiv.innerText.trim() : '';
                        if (!text) {
                            // Fallback to div[dir="auto"]
                            const dirDivs = art.querySelectorAll('div[dir="auto"]');
                            for (const div of dirDivs) {
                                if (div.closest('h2') || div.closest('h3') || div.closest('h4') || div.closest('a') || div.closest('button')) continue;
                                const txt = div.innerText.trim();
                                if (txt.length > text.length) {
                                    text = txt;
                                }
                            }
                        }

                        // 2. Link to the post
                        const postLinks = Array.from(art.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"]'));
                        let postUrl = '';
                        let postTime = '';
                        for (const link of postLinks) {
                            const href = link.href;
                            if (href.includes('comment_id') || href.includes('reply_comment_id')) continue;
                            postUrl = href.split('?')[0].split('&')[0];
                            postTime = link.innerText.trim() || link.getAttribute('aria-label') || '';
                            break;
                        }

                        // 3. Author Name
                        let author = '';
                        const authorLink = art.querySelector('h2 a, h3 a, strong a');
                        if (authorLink) {
                            author = authorLink.innerText.trim();
                        } else {
                            const firstA = art.querySelector('a');
                            if (firstA) {
                                author = firstA.innerText.trim();
                            }
                        }

                        // 4. Media Image Link
                        let mediaUrl = '';
                        const imgs = Array.from(art.querySelectorAll('img'));
                        for (const img of imgs) {
                            const src = img.src;
                            if (!src || src.startsWith('data:')) continue;
                            const rect = img.getBoundingClientRect();
                            if (rect.width < 100 || rect.height < 100) continue; 
                            if (src.includes('/rsrc.php/') || src.includes('emoji') || src.includes('/images/emoji/')) continue;
                            mediaUrl = src;
                            break;
                        }

                        // Save only if there's either some content or post URL
                        if (text || postUrl) {
                            posts.push({
                                author: author || 'Thành viên nhóm',
                                time: postTime || 'N/A',
                                content: text || '(Không có văn bản)',
                                url: postUrl || window.location.href,
                                mediaUrl: mediaUrl || ''
                            });
                        }
                    }
                    return posts;
                });

                // Deduplicate posts based on URL or content snippet, and apply filters
                const uniquePosts = [];
                const seenUrls = new Set();
                const seenContents = new Set();

                for (const post of postsPool) {
                    const cleanUrl = post.url.toLowerCase().trim();
                    const snippet = post.content.substring(0, 50).toLowerCase().trim();
                    
                    // Filter 1: Check duplication with previous runs
                    if (historySet.has(cleanUrl)) {
                        continue;
                    }
                    
                    // Filter 2: Check date limit (within last 7 days)
                    if (!isWithinLast7Days(post.time)) {
                        console.log(`  -> Bỏ qua bài viết cũ (${post.time}): "${post.content.substring(0, 40)}..."`);
                        continue;
                    }
                    
                    if (!seenUrls.has(cleanUrl) && (snippet === '' || !seenContents.has(snippet))) {
                        seenUrls.add(cleanUrl);
                        if (snippet !== '') seenContents.add(snippet);
                        uniquePosts.push(post);
                    }
                }

                console.log(`Tìm thấy tổng cộng ${uniquePosts.length} bài viết duy nhất.`);

                // Pick 10 random posts
                const selectedPosts = getRandomElements(uniquePosts, 10);
                console.log(`Đã chọn ngẫu nhiên ${selectedPosts.length} bài viết.`);

                results[group.url] = {
                    groupName: groupName,
                    posts: selectedPosts
                };

            } catch (err) {
                console.error(`Lỗi khi cào nhóm ${group.url}:`, err.message);
                results[group.url] = {
                    groupName: `Group_${group.id}`,
                    posts: [],
                    error: err.message
                };
            }
        }

        // Save selected posts to history
        const newlyScrapedUrls = [];
        for (const url in results) {
            if (results[url] && results[url].posts) {
                for (const post of results[url].posts) {
                    if (post.url) {
                        newlyScrapedUrls.push(post.url);
                    }
                }
            }
        }
        
        if (newlyScrapedUrls.length > 0) {
            scrapedHistory = scrapedHistory.concat(newlyScrapedUrls);
            // Cap at 2000 URLs to avoid infinite file growth
            if (scrapedHistory.length > 2000) {
                scrapedHistory = scrapedHistory.slice(scrapedHistory.length - 2000);
            }
            try {
                fs.writeFileSync(historyPath, JSON.stringify(scrapedHistory, null, 2), 'utf8');
                console.log(`Đã cập nhật lịch sử cào thêm ${newlyScrapedUrls.length} bài viết mới. Tổng lịch sử: ${scrapedHistory.length} bài.`);
            } catch (e) {
                console.warn('Không thể lưu file scraped_history.json:', e.message);
            }
        }

        // Write results to JSON
        fs.writeFileSync(outputJsonPath, JSON.stringify(results, null, 2), 'utf8');
        console.log(`\n🎉 Đã lưu kết quả cào bài viết thành công vào: ${outputJsonPath}`);

    } catch (err) {
        console.error('Lỗi nghiêm trọng trong tiến trình cào bài viết:', err.message);
        throw err;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Run the script
const args = process.argv.slice(2);
const outputFilePath = args[0] || path.join(__dirname, 'fb_scraped_results.json');
scrapeFacebookGroups(outputFilePath).catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
});
