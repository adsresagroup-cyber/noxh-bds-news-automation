const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
        return `${h}h${min} - ${d}/${m} - Báo cáo bài viết FB Group BĐS`;
    }
    return `${d}/${m}/${y} ${h}:${min}`;
}

async function run() {
    console.log("=== QUY TRÌNH CÀO BÀI VIẾT FACEBOOK GROUP THƯỜNG NIÊN TỰ ĐỘNG ===");

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

    if (!fs.existsSync(tokenPath)) {
        throw new Error(`Chưa tìm thấy tệp token.json tại ${tokenPath}`);
    }

    // 1. Run Node.js Scraper
    const tempJsonPath = path.join(__dirname, 'fb_scraped_temp.json');
    if (fs.existsSync(tempJsonPath)) {
        fs.unlinkSync(tempJsonPath);
    }

    console.log("Đang chạy script cào bài viết Facebook Group...");
    const scraperScript = path.join(__dirname, 'scrape_fb_groups.js');
    execSync(`node "${scraperScript}" "${tempJsonPath}"`, { stdio: 'inherit' });

    if (!fs.existsSync(tempJsonPath)) {
        throw new Error("Cào bài viết thất bại: Không tìm thấy file kết quả fb_scraped_temp.json");
    }

    const scrapedData = JSON.parse(fs.readFileSync(tempJsonPath, 'utf8'));

    // 2. Refresh Google OAuth Token
    console.log("Đang kết nối Google Drive...");
    let tokenText = fs.readFileSync(tokenPath, 'utf8');
    if (tokenText.charCodeAt(0) === 0xFEFF) {
        tokenText = tokenText.slice(1);
    }
    const tokenData = JSON.parse(tokenText);
    let accessToken = tokenData.token;

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
        console.warn("Không thể làm mới token, sử dụng token hiện tại:", e.message);
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

    // 3. Search Drive Folders: 'OANH' -> 'Antigravity AI lam viec' -> 'Báo cáo Facebook Group BĐS'
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

    const fbFolderQuery = `mimeType='application/vnd.google-apps.folder' and (name='Báo cáo Facebook Group BĐS' or name='Bao cao Facebook Group BDS') and '${antiId}' in parents and trashed=false`;
    const fbFolderRes = await googleApiCall(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(fbFolderQuery)}&fields=files(id)`);
    let fbFolderId = fbFolderRes.files && fbFolderRes.files.length > 0 ? fbFolderRes.files[0].id : null;
    if (!fbFolderId) {
        const createFbFolder = await googleApiCall("https://www.googleapis.com/drive/v3/files", "POST", JSON.stringify({
            name: "Báo cáo Facebook Group BĐS",
            mimeType: "application/vnd.google-apps.folder",
            parents: [antiId]
        }));
        fbFolderId = createFbFolder.id;
    }

    // 4. Create Google Spreadsheet
    const now = new Date();
    const sheetName = getFormattedDate(now, 'sheetname');
    console.log(`Đang tạo Google Spreadsheet: "${sheetName}"...`);

    const createSpreadsheetRes = await googleApiCall("https://www.googleapis.com/drive/v3/files", "POST", JSON.stringify({
        name: sheetName,
        mimeType: "application/vnd.google-apps.spreadsheet",
        parents: [fbFolderId]
    }));

    const spreadsheetId = createSpreadsheetRes.id;
    const sheetMetadata = await googleApiCall(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`);
    const defaultSheetTitle = sheetMetadata.sheets[0].properties.title;

    // Flatten scraped data into rows
    const headersRow = ['STT', 'Tên Nhóm Facebook', 'Tác giả bài viết', 'Thời gian đăng', 'Nội dung bài viết', 'Đường dẫn [URL]'];
    const values = [headersRow];
    let stt = 1;

    for (const groupUrl in scrapedData) {
        const groupObj = scrapedData[groupUrl];
        const gName = groupObj.groupName || 'Nhóm Facebook';
        const posts = groupObj.posts || [];
        for (const post of posts) {
            values.push([
                stt++,
                gName,
                post.author || 'Thành viên nhóm',
                post.time || 'Vừa xong',
                post.content || '(Không có nội dung)',
                post.url || groupUrl
            ]);
        }
    }

    console.log(`Đang ghi ${values.length - 1} bài viết vào Google Sheet...`);
    const rangeStr = `'${defaultSheetTitle}'!A1:F${values.length}`;
    const updateUri = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeStr)}?valueInputOption=USER_ENTERED`;

    await googleApiCall(updateUri, "PUT", JSON.stringify({
        range: rangeStr,
        majorDimension: "ROWS",
        values: values
    }));

    console.log("🎉 Đã hoàn thành cào bài viết và tạo Google Sheet thành công!");
    console.log(`Drive Link: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
}

run().catch(e => {
    console.error("LỖI HỆ THỐNG:", e.message);
    process.exit(1);
});
