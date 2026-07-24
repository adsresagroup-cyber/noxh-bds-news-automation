const fs = require('fs');
const path = require('path');

async function uploadToDrive() {
    const tokenPath = path.join('c:', 'Users', 'Admin', '.antigravity-ide', 'meta ads api', 'token.json');
    const localFilePath = path.join('c:', 'Users', 'Admin', '.antigravity-ide', 'tin_tuc_bat_dong_san_nghe_an_final.xlsx');

    if (!fs.existsSync(tokenPath)) {
        throw new Error(`Token file not found at ${tokenPath}`);
    }

    if (!fs.existsSync(localFilePath)) {
        throw new Error(`Excel report file not found at ${localFilePath}`);
    }

    // Read and refresh token
    let tokenText = fs.readFileSync(tokenPath, 'utf8');
    if (tokenText.charCodeAt(0) === 0xFEFF) {
        tokenText = tokenText.slice(1);
    }
    const tokenData = JSON.parse(tokenText);
    let accessToken = tokenData.token;

    console.log("Refreshing access token...");
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
            console.log("Access token refreshed successfully.");
        } else {
            console.warn("Failed to refresh token, attempting with existing token...", await refreshResponse.text());
        }
    } catch (e) {
        console.warn("Error refreshing token, using current token:", e);
    }

    const headers = {
        "Authorization": `Bearer ${accessToken}`
    };

    // Helper: fetch Google API
    async function googleApiCall(url, method = "GET", body = null, contentType = "application/json") {
        const options = {
            method,
            headers: { ...headers }
        };
        if (body) {
            options.body = body;
            options.headers["Content-Type"] = contentType;
        }
        const response = await fetch(url, options);
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Google API error (${response.status} - ${response.statusText}): ${errText}`);
        }
        return await response.json();
    }

    // 1. Search for 'OANH' folder
    console.log("Searching for 'OANH' folder...");
    const oanhQuery = "mimeType='application/vnd.google-apps.folder' and (name='OANH' or name='Oanh') and trashed=false";
    const oanhRes = await googleApiCall(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(oanhQuery)}&fields=files(id,name)`);
    
    let oanhFolderId = null;
    if (oanhRes.files && oanhRes.files.length > 0) {
        oanhFolderId = oanhRes.files[0].id;
        console.log(`Found 'OANH' folder, ID: ${oanhFolderId}`);
    } else {
        throw new Error("Could not find 'OANH' folder on Google Drive. Please make sure the folder exists.");
    }

    // 2. Search for 'Antigravity AI lam viec' inside 'OANH'
    console.log("Searching for 'Antigravity AI lam viec' folder inside 'OANH'...");
    const antiQuery = `mimeType='application/vnd.google-apps.folder' and (name='Antigravity AI lam viec' or name='Antigravity Ai làm việc') and '${oanhFolderId}' in parents and trashed=false`;
    const antiRes = await googleApiCall(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(antiQuery)}&fields=files(id,name)`);
    
    let antiFolderId = null;
    if (antiRes.files && antiRes.files.length > 0) {
        antiFolderId = antiRes.files[0].id;
        console.log(`Found 'Antigravity AI lam viec' folder, ID: ${antiFolderId}`);
    } else {
        // Create it
        console.log("Creating 'Antigravity AI lam viec' folder...");
        const createAntiBody = JSON.stringify({
            name: "Antigravity AI lam viec",
            mimeType: "application/vnd.google-apps.folder",
            parents: [oanhFolderId]
        });
        const createAntiRes = await googleApiCall("https://www.googleapis.com/drive/v3/files", "POST", createAntiBody);
        antiFolderId = createAntiRes.id;
        console.log(`Created 'Antigravity AI lam viec' folder, ID: ${antiFolderId}`);
    }

    // 3. Search or create 'Tin tức Nghệ An' folder inside 'Antigravity AI lam viec'
    console.log("Searching for 'Tin tức Nghệ An' folder...");
    const naQuery = `mimeType='application/vnd.google-apps.folder' and (name='Tin tức Nghệ An' or name='Tin tuc Nghe An') and '${antiFolderId}' in parents and trashed=false`;
    const naRes = await googleApiCall(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(naQuery)}&fields=files(id,name)`);
    
    let naFolderId = null;
    if (naRes.files && naRes.files.length > 0) {
        naFolderId = naRes.files[0].id;
        console.log(`Found 'Tin tức Nghệ An' folder, ID: ${naFolderId}`);
    } else {
        // Create it
        console.log("Creating 'Tin tức Nghệ An' folder...");
        const createNaBody = JSON.stringify({
            name: "Tin tức Nghệ An",
            mimeType: "application/vnd.google-apps.folder",
            parents: [antiFolderId]
        });
        const createNaRes = await googleApiCall("https://www.googleapis.com/drive/v3/files", "POST", createNaBody);
        naFolderId = createNaRes.id;
        console.log(`Created 'Tin tức Nghệ An' folder, ID: ${naFolderId}`);
    }

    // 4. Upload file to 'Tin tức Nghệ An' folder
    const todayStr = new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');
    const destFileName = `Tin tức bất động sản Nghệ An - ${todayStr}.xlsx`;
    console.log(`Uploading file as '${destFileName}'...`);

    const metadata = {
        name: destFileName,
        parents: [naFolderId]
    };
    
    const mediaData = fs.readFileSync(localFilePath);
    const boundary = 'foo_bar_baz';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;
    
    const requestBody = Buffer.concat([
        Buffer.from(delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + delimiter),
        Buffer.from('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\nContent-Transfer-Encoding: base64\r\n\r\n'),
        Buffer.from(mediaData.toString('base64')),
        Buffer.from(closeDelimiter)
    ]);

    const uploadOptions = {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
            "Content-Length": requestBody.length
        },
        body: requestBody
    };

    const uploadResponse = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", uploadOptions);
    if (!uploadResponse.ok) {
        const errText = await uploadResponse.text();
        throw new Error(`Upload failed (${uploadResponse.status}): ${errText}`);
    }

    const uploadResData = await uploadResponse.json();
    console.log("File uploaded successfully!");
    console.log(`File ID: ${uploadResData.id}`);
    console.log(`File Name: ${uploadResData.name}`);
    console.log(`WebViewLink: ${uploadResData.webViewLink}`);
}

uploadToDrive().catch(err => {
    console.error("FATAL ERROR:", err);
    process.exit(1);
});
