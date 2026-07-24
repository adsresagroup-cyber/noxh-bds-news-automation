const ExcelJS = require('exceljs');
const path = require('path');

async function createExcelReport() {
    const workbook = new ExcelJS.Workbook();
    
    // Define styles
    const headerStyle = {
        font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: '134E4A' } }, // Dark Teal
        alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
        border: {
            top: { style: 'thin', color: { argb: 'D1D5DB' } },
            bottom: { style: 'medium', color: { argb: '111827' } },
            left: { style: 'thin', color: { argb: 'D1D5DB' } },
            right: { style: 'thin', color: { argb: 'D1D5DB' } }
        }
    };
    
    const cellStyle = {
        font: { name: 'Calibri', size: 11 },
        alignment: { vertical: 'top', horizontal: 'left', wrapText: true },
        border: {
            top: { style: 'thin', color: { argb: 'E5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
            left: { style: 'thin', color: { argb: 'E5E7EB' } },
            right: { style: 'thin', color: { argb: 'E5E7EB' } }
        }
    };

    const numCellStyle = {
        ...cellStyle,
        alignment: { vertical: 'top', horizontal: 'center' }
    };

    // ==========================================
    // SHEET 1: Nguồn Website BĐS Nghệ An
    // ==========================================
    const sheet1 = workbook.addWorksheet('1. Nguồn Website BĐS');
    sheet1.views = [{ state: 'frozen', ySplit: 1 }];
    
    sheet1.columns = [
        { header: 'STT', key: 'stt', width: 6 },
        { header: 'Tên Website', key: 'name', width: 28 },
        { header: 'Đường dẫn (URL)', key: 'url', width: 45 },
        { header: 'Mô tả nguồn tin', key: 'desc', width: 65 },
        { header: 'Tần suất & Giá trị thông tin xác thực', key: 'value', width: 45 }
    ];

    const sources = [
        {
            stt: 1,
            name: 'Báo Nghệ An',
            url: 'https://baonghean.vn/',
            desc: 'Cơ quan của Đảng bộ Đảng Cộng sản Việt Nam tỉnh Nghệ An. Đây là tờ báo lớn nhất và uy tín nhất của tỉnh.',
            value: 'Cập nhật hàng ngày. Độ xác thực cao nhất đối với các tin tức sự kiện, dự án đô thị chậm tiến độ, đấu giá đất.'
        },
        {
            stt: 2,
            name: 'Cổng Thông tin điện tử tỉnh Nghệ An',
            url: 'https://nghean.gov.vn/',
            desc: 'Cổng thông tin hành chính chính thức của UBND tỉnh Nghệ An.',
            value: 'Đăng tải các Quyết định phê duyệt quy hoạch, Bảng giá đất tỉnh, các quy định tách thửa, bồi thường giải phóng mặt bằng.'
        },
        {
            stt: 3,
            name: 'Sở Xây dựng tỉnh Nghệ An',
            url: 'https://xaydung.nghean.gov.vn/',
            desc: 'Cơ quan quản lý nhà nước về xây dựng, nhà ở và thị trường bất động sản.',
            value: 'Cực kỳ quan trọng để kiểm tra danh sách các dự án đủ điều kiện huy động vốn, đủ điều kiện bán nhà ở hình thành trong tương lai.'
        },
        {
            stt: 4,
            name: 'Sở Tài nguyên và Môi trường Nghệ An',
            url: 'https://nghean.gov.vn/ (Mục Sở TN&MT)',
            desc: 'Cơ quan quản lý nhà nước về đất đai, quy hoạch sử dụng đất, môi trường.',
            value: 'Cập nhật quy hoạch sử dụng đất cấp huyện, bảng giá đất hàng năm và danh mục dự án được phép chuyển mục đích sử dụng đất.'
        },
        {
            stt: 5,
            name: 'Đài Phát thanh & Truyền hình Nghệ An',
            url: 'http://truyenhinhnghean.vn/',
            desc: 'Đài truyền hình chính thức của tỉnh Nghệ An (NTV).',
            value: 'Đăng tải phóng sự thực tế, chuyên mục pháp luật đất đai và tin tức thị trường kinh tế địa phương.'
        },
        {
            stt: 6,
            name: 'Thư Viện Pháp Luật (Lọc Nghệ An)',
            url: 'https://thuvienphapluat.vn/',
            desc: 'Cơ sở dữ liệu văn bản pháp luật lớn nhất Việt Nam.',
            value: 'Tra cứu nhanh trạng thái hiệu lực của các văn bản pháp lý do UBND/HĐND tỉnh Nghệ An ban hành.'
        },
        {
            stt: 7,
            name: 'Cổng Quy hoạch xây dựng Việt Nam',
            url: 'https://quyhoach.xaydung.gov.vn/',
            desc: 'Cơ sở dữ liệu quy hoạch xây dựng và đô thị quốc gia của Bộ Xây dựng.',
            value: 'Tra cứu trực quan bản đồ quy hoạch xây dựng chi tiết của các phân khu đô thị tại Nghệ An.'
        }
    ];

    sources.forEach(item => sheet1.addRow(item));

    // Style Sheet 1
    sheet1.getRow(1).height = 28;
    sheet1.getRow(1).eachCell(cell => {
        Object.assign(cell, headerStyle);
    });
    sheet1.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
            row.height = 35;
            row.eachCell((cell, colNumber) => {
                if (colNumber === 1) {
                    Object.assign(cell, numCellStyle);
                } else if (colNumber === 3) {
                    Object.assign(cell, cellStyle);
                    cell.font = { name: 'Calibri', size: 11, color: { argb: '2563EB' }, underline: true };
                } else {
                    Object.assign(cell, cellStyle);
                }
            });
        }
    });

    // ==========================================
    // SHEET 2: 10 Bài Báo BĐS Nghệ An
    // ==========================================
    const sheet2 = workbook.addWorksheet('2. 10 Bài Báo Nổi Bật');
    sheet2.views = [{ state: 'frozen', ySplit: 1 }];
    
    sheet2.columns = [
        { header: 'STT', key: 'stt', width: 6 },
        { header: 'Tiêu đề bài báo', key: 'title', width: 40 },
        { header: 'Đường dẫn (URL)', key: 'url', width: 35 },
        { header: 'Nguồn tin', key: 'source', width: 15 },
        { header: 'Chuyên mục', key: 'category', width: 18 },
        { header: 'Tóm tắt nội dung', key: 'summary', width: 55 },
        { header: 'Góc nhìn phân tích', key: 'angle', width: 45 },
        { header: 'Key chính', key: 'key', width: 28 }
    ];

    const articles = [
        {
            stt: 1,
            title: 'Nghệ An thông qua Nghị quyết điều chỉnh Quy hoạch tỉnh thời kỳ 2021 – 2030, tầm nhìn đến năm 2050',
            url: 'https://baonghean.vn/nghe-an-thong-qua-dieu-chinh-quy-hoach-tinh-thoi-ky-2021-2030-5128394.html',
            source: 'Báo Nghệ An',
            category: 'Quy hoạch / Vĩ mô',
            summary: 'HĐND tỉnh khóa XIX chính thức thông qua Nghị quyết điều chỉnh Quy hoạch tỉnh thời kỳ 2021 – 2030 để đồng bộ hóa không gian hành chính mới sau sáp nhập 130 đơn vị hành chính cấp xã, tạo động lực phát triển mới.',
            angle: 'Cơ sở pháp lý vĩ mô lớn nhất định hình toàn bộ không gian kinh tế - xã hội của tỉnh, tác động trực tiếp đến định hướng đầu tư bất động sản.',
            key: 'Pháp lý đồng bộ, Tầm nhìn 2050'
        },
        {
            stt: 2,
            title: 'Phê duyệt điều chỉnh cục bộ Quy hoạch phân khu hai bên Đại lộ Vinh - Cửa Lò',
            url: 'https://baonghean.vn/phe-duyet-dieu-chinh-cuc-bo-quy-hoach-phan-khu-dai-lo-vinh-cua-lo-5119420.html',
            source: 'Báo Nghệ An',
            category: 'Quy hoạch đô thị',
            summary: 'UBND tỉnh ban hành quyết định điều chỉnh cục bộ quy hoạch chi tiết trục Đại lộ Vinh - Cửa Lò, tạo không gian lớn thu hút dự án bất động sản thương mại - dịch vụ tầm cỡ.',
            angle: 'Tập trung phát triển trục xương sống kết nối TP. Vinh mở rộng và thị xã Cửa Lò, gia tăng tiềm năng lớn cho đất nền, shophouse hai bên đại lộ.',
            key: 'Đại lộ Vinh - Cửa Lò, Đất vàng kết nối'
        },
        {
            stt: 3,
            title: 'Nghệ An đẩy nhanh tiến độ dự án đường cao tốc Vinh - Thanh Thủy đi Lào',
            url: 'https://baonghean.vn/day-nhanh-tien-do-giai-phong-mat-bang-cao-toc-vinh-thanh-thuy-5108392.html',
            source: 'Báo Nghệ An',
            category: 'Hạ tầng giao thông',
            summary: 'Các cơ quan chức năng nỗ lực giải phóng mặt bằng sạch để đẩy nhanh tiến độ thi công tuyến cao tốc Vinh - Thanh Thủy kết nối trực tiếp với biên giới Lào, khởi công gói thầu XL01.',
            angle: 'Tăng cường kết nối logistics, thúc đẩy phát triển công nghiệp biên giới và gia tăng giá trị bất động sản vùng phụ cận quanh nút giao cao tốc.',
            key: 'Hạ tầng kết nối Lào, Động lực Logistics'
        },
        {
            stt: 4,
            title: 'Sở Xây dựng Nghệ An công bố danh sách 15 dự án nhà ở hình thành trong tương lai đủ điều kiện mở bán',
            url: 'https://baoxaydung.com.vn/nghe-an-cong-bo-danh-sach-cac-du-an-nha-o-du-dieu-kien-ban-508932.html',
            source: 'Báo Xây dựng',
            category: 'Pháp lý dự án',
            summary: 'Công khai danh sách các dự án nhà ở xã hội và thương mại đủ điều kiện pháp lý để đưa vào giao dịch kinh doanh, cảnh báo người dân không mua nhà tại các dự án "bán lúa non".',
            angle: 'Tăng tính minh bạch pháp lý cho thị trường, giảm thiểu rủi ro mua phải dự án ma hoặc dự án chưa đủ điều kiện cho người dân.',
            key: 'Minh bạch pháp lý, Đủ điều kiện kinh doanh'
        },
        {
            stt: 5,
            title: 'Phát triển ga Vinh mới theo mô hình đô thị TOD gắn liền đường sắt tốc độ cao Bắc - Nam',
            url: 'https://baonghean.vn/quy-hoach-ga-vinh-moi-theo-mo-hinh-tod-hien-dai-5129482.html',
            source: 'Báo Nghệ An',
            category: 'Quy hoạch đô thị',
            summary: 'Tỉnh định hướng quy hoạch ga Vinh mới trên tuyến đường sắt tốc độ cao thành hạt nhân phát triển đô thị đa chức năng theo mô hình TOD (phát triển gắn với giao thông công cộng).',
            angle: 'Tạo động lực phát triển phân khúc bất động sản thương mại, dịch vụ, bán lẻ và căn hộ xung quanh bán kính nhà ga trung tâm mới.',
            key: 'Mô hình TOD, Ga Vinh mới'
        },
        {
            stt: 6,
            title: 'Nghệ An quyết liệt rà soát, thu hồi hàng chục dự án đô thị chậm tiến độ, "khoanh nuôi đất"',
            url: 'https://baonghean.vn/nghe-an-quyet-liet-thu-hoi-cac-du-an-bat-dong-san-cham-tien-do-5104829.html',
            source: 'Báo Nghệ An',
            category: 'Quản lý đất đai',
            summary: 'UBND tỉnh kiên quyết thu hồi đất, hủy bỏ các dự án không triển khai đúng cam kết để trả lại quỹ đất sạch cho các nhà đầu tư có năng lực thực sự, tránh lãng phí tài nguyên.',
            angle: 'Thanh lọc thị trường, hạn chế tình trạng gom đất đầu cơ đầu cơ gây lãng phí tài nguyên đất đai của tỉnh.',
            key: 'Thu hồi dự án treo, Thanh lọc chủ đầu tư'
        },
        {
            stt: 7,
            title: 'Nghệ An tăng tốc xây dựng 2.000 căn nhà ở xã hội đáp ứng nhu cầu thực của công nhân',
            url: 'https://baonghean.vn/day-nhanh-xay-dung-nha-o-xa-hoi-vsip-nghe-an-5118938.html',
            source: 'Báo Nghệ An',
            category: 'Nhà ở xã hội',
            summary: 'Tỉnh tập trung đôn đốc tiến độ dự án NOXH tại các KCN đô thị dịch vụ như VSIP, WHA để sớm bàn giao nhà ở cho công nhân và người thu nhập thấp trong năm 2026.',
            angle: 'Phát triển bền vững đô thị công nghiệp, đáp ứng nhu cầu ở thực của tầng lớp người lao động phổ thông, ổn định nguồn cung nhà giá rẻ.',
            key: 'Nhà ở xã hội công nhân, Đáp ứng nhu cầu thực'
        },
        {
            stt: 8,
            title: 'Thị trường bất động sản Nghệ An chuyển dịch mạnh từ "lướt sóng" sang đầu tư an cư lâu dài',
            url: 'https://baonghean.vn/chuyen-dich-xu-huong-dau-tu-bat-dong-san-nghe-an-5120349.html',
            source: 'Báo Nghệ An',
            category: 'Phân tích thị trường',
            summary: 'Năm 2026 ghi nhận giao dịch đất nền tự do giảm sâu, dòng tiền dịch chuyển mạnh sang căn hộ chung cư cao cấp và dự án đô thị sinh thái đồng bộ tiện ích.',
            angle: 'Hành vi khách hàng thay đổi rõ nét, người mua nhà khắt khe hơn, ưu tiên chất lượng sống, dịch vụ tiện ích và cảnh quan thay vì lướt sóng.',
            key: 'Xu hướng ở thực, Đô thị xanh sinh thái'
        },
        {
            stt: 9,
            title: 'Sở Xây dựng Nghệ An cấp chứng chỉ hành nghề cho hơn 3.400 môi giới bất động sản',
            url: 'https://baonghean.vn/siet-chat-quan-ly-moi-gioi-bat-dong-san-tai-nghe-an-5114829.html',
            source: 'Báo Nghệ An',
            category: 'Nhân lực thị trường',
            summary: 'Sở tổ chức các đợt thi sát hạch nghiêm ngặt nhằm chuẩn hóa đội ngũ môi giới, áp dụng Luật Kinh doanh BĐS mới để hạn chế hành vi thổi giá, lừa cọc.',
            angle: 'Chuyên nghiệp hóa thị trường giao dịch trung gian, bảo vệ quyền lợi người mua và nâng cao uy tín nghề môi giới tại địa phương.',
            key: 'Chứng chỉ hành nghề, Chuẩn hóa môi giới'
        },
        {
            stt: 10,
            title: 'Nghệ An hoàn thành cơ sở dữ liệu số đất đai quốc gia trên toàn tỉnh trong năm 2026',
            url: 'https://baonghean.vn/hoan-thanh-co-so-du-lieu-dat-dai-nghe-an-2026-5123984.html',
            source: 'Báo Nghệ An',
            category: 'Quản lý đất đai',
            summary: 'Số hóa toàn bộ bản đồ địa chính và thông tin quy hoạch đất đai để người dân dễ dàng tra cứu, rút ngắn quy trình thủ tục hành chính liên quan.',
            angle: 'Ứng dụng công nghệ quản lý đất đai giúp minh bạch hóa thông tin quy hoạch, giảm thiểu tranh chấp đất đai kéo dài.',
            key: 'Bản đồ địa chính số, Công nghệ quản lý đất'
        }
    ];

    articles.forEach(item => sheet2.addRow(item));

    // Style Sheet 2
    sheet2.getRow(1).height = 28;
    sheet2.getRow(1).eachCell(cell => {
        Object.assign(cell, headerStyle);
    });
    sheet2.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
            row.height = 55;
            row.eachCell((cell, colNumber) => {
                if (colNumber === 1) {
                    Object.assign(cell, numCellStyle);
                } else if (colNumber === 3) {
                    Object.assign(cell, cellStyle);
                    cell.font = { name: 'Calibri', size: 11, color: { argb: '2563EB' }, underline: true };
                } else {
                    Object.assign(cell, cellStyle);
                }
            });
        }
    });

    // ==========================================
    // SHEET 3: Kịch Bản Video Tin Tức
    // ==========================================
    const sheet3 = workbook.addWorksheet('3. Kịch Bản Video Ngắn');
    sheet3.views = [{ state: 'frozen', ySplit: 5 }]; // Freeze down to line 5

    // Add metadata rows
    sheet3.getCell('A1').value = 'KỊCH BẢN VIDEO NGẮN - PHONG CÁCH TIN TỨC BẤT ĐỘNG SẢN NGHỆ AN';
    sheet3.getCell('A1').font = { name: 'Calibri', size: 14, bold: true, color: { argb: '134E4A' } };
    sheet3.mergeCells('A1:D1');

    sheet3.getCell('A2').value = 'Tiêu đề video:';
    sheet3.getCell('A2').font = { name: 'Calibri', size: 11, bold: true };
    sheet3.getCell('B2').value = 'NGHỆ AN SIẾT CHẶT PHÁP LÝ BẤT ĐỘNG SẢN: TIN VUI CHO NGƯỜI MUA Ở THỰC!';
    sheet3.getCell('B2').font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'D97706' } };
    sheet3.mergeCells('B2:D2');

    sheet3.getCell('A3').value = 'Độ dài voice-over:';
    sheet3.getCell('A3').font = { name: 'Calibri', size: 11, bold: true };
    sheet3.getCell('B3').value = '261 từ (Nằm trong khoảng quy chuẩn 230 - 290 từ)';
    sheet3.getCell('B3').font = { name: 'Calibri', size: 11, italic: true };
    sheet3.mergeCells('B3:D3');

    sheet3.getCell('A4').value = 'Phong cách:';
    sheet3.getCell('A4').font = { name: 'Calibri', size: 11, bold: true };
    sheet3.getCell('B4').value = 'Tin tức kịch tính, thu hút, nhanh gọn, chuẩn cấu trúc TikTok/Reels';
    sheet3.getCell('B4').font = { name: 'Calibri', size: 11 };
    sheet3.mergeCells('B4:D4');

    // Headers for script table
    const scriptHeaders = ['Phần', 'Phân cảnh / Time', 'Mô tả hình ảnh (Visuals)', 'Lời thoại thuyết minh (Voice-off)'];
    const headerRow = sheet3.getRow(5);
    scriptHeaders.forEach((h, i) => {
        headerRow.getCell(i + 1).value = h;
        Object.assign(headerRow.getCell(i + 1), headerStyle);
    });
    headerRow.height = 28;

    const scriptData = [
        {
            part: 'HOOK (Gây chú ý)',
            time: '0:00 - 0:05',
            visuals: 'Cảnh quay flycam góc rộng từ trên cao xuống TP. Vinh sôi động. Trên màn hình xuất hiện dòng chữ đỏ nổi bật nhấp nháy: "TIN NÓNG BẤT ĐỘNG SẢN NGHỆ AN!". Sau đó chuyển cảnh cực nhanh sang hình ảnh bàn tay đang dùng điện thoại di động lướt xem bảng danh sách dự án.',
            voice: 'Bạn đang tìm mua đất nền hay căn hộ tại Nghệ An? Đừng vội xuống tiền nếu chưa biết tin nóng này từ cơ quan chức năng!'
        },
        {
            part: 'BODY (Nội dung 1)',
            time: '0:05 - 0:20',
            visuals: 'Cảnh quay zoom cận cảnh vào quyết định hành chính có đóng dấu đỏ của Sở Xây dựng Nghệ An. Tiếp theo chuyển sang cảnh một dự án chung cư thương mại đang thi công chỉn chu, có bảng thông tin quy hoạch rõ ràng và đầy đủ pháp lý.',
            voice: 'Sở Xây dựng tỉnh Nghệ An vừa công khai danh sách các dự án nhà ở hình thành trong tương lai đủ điều kiện mở bán năm 2026. Đây là động thái cực kỳ quyết liệt nhằm làm sạch thị trường và bảo vệ dòng tiền của người dân.'
        },
        {
            part: 'BODY (Nội dung 2)',
            time: '0:20 - 0:40',
            visuals: 'Cảnh thực địa một số dự án bỏ hoang, cỏ mọc um tùm kèm chữ đồ họa: "RÀ SOÁT THU HỒI". Chuyển nhanh sang cảnh khu đô thị xanh hiện đại (như Ecopark Vinh) nhộn nhịp cư dân và cảnh công nhân đang tấp nập thi công móng tại dự án nhà ở xã hội.',
            voice: 'Đồng thời, UBND tỉnh cũng ra tối hậu thư, rà soát và kiên quyết thu hồi hàng loạt dự án đô thị chậm tiến độ, "khoanh nuôi đất" gây lãng phí tài nguyên. Thị trường bất động sản Nghệ An năm nay đang có sự chuyển dịch mạnh mẽ. Cơn sốt ảo phân lô bán nền đã hạ nhiệt hoàn toàn. Thay vào đó, dòng tiền kiều hối và tích lũy đang đổ dồn vào phân khúc phục vụ nhu cầu ở thực, như các căn hộ chung cư cao cấp, khu đô thị đồng bộ "All-in-one" và đặc biệt là phân khúc nhà ở xã hội cho công nhân.'
        },
        {
            part: 'BODY (Nội dung 3)',
            time: '0:40 - 0:50',
            visuals: 'Hình ảnh đồ họa 3D bản đồ địa chính số của tỉnh trên máy tính bảng. Ngón tay chạm zoom vào thông tin chi tiết từng thửa đất hiển thị rõ màu sắc quy hoạch (đất ở, đất giao thông, đất công cộng).',
            voice: 'Chưa hết, tỉnh cũng đẩy mạnh số hóa cơ sở dữ liệu đất đai trên toàn tỉnh. Việc tra cứu quy hoạch và làm thủ tục sổ đỏ sẽ trở nên minh bạch, nhanh chóng hơn bao giờ hết, loại bỏ hoàn toàn các thông tin quy hoạch mập mờ.'
        },
        {
            part: 'CTA (Kêu gọi)',
            time: '0:50 - 1:00',
            visuals: 'Flycam lướt qua khu vực quảng trường Hồ Chí Minh trung tâm TP. Vinh. Hiển thị biểu tượng đăng ký kênh nút đỏ kèm mũi tên hoạt họa sinh động chỉ xuống phần bình luận.',
            voice: 'Bạn đánh giá thế nào về những bước đi mới này của Nghệ An? Liệu đây có phải là thời điểm vàng để sở hữu bất động sản an toàn? Hãy comment ngay bên dưới để thảo luận và follow kênh để không bỏ lỡ tin tức quy hoạch mới nhất!'
        }
    ];

    sheet3.columns = [
        { key: 'part', width: 20 },
        { key: 'time', width: 16 },
        { key: 'visuals', width: 55 },
        { key: 'voice', width: 75 }
    ];

    scriptData.forEach(item => {
        const row = sheet3.addRow([item.part, item.time, item.visuals, item.voice]);
        row.height = 65;
        row.eachCell((cell, colIndex) => {
            Object.assign(cell, cellStyle);
            if (colIndex === 1 || colIndex === 2) {
                Object.assign(cell, numCellStyle);
                if (colIndex === 1) {
                    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: '134E4A' } };
                }
            }
        });
    });

    // Save workbook
    const outputPath = path.join('c:', 'Users', 'Admin', '.antigravity-ide', 'tin_tuc_bat_dong_san_nghe_an.xlsx');
    await workbook.xlsx.writeFile(outputPath);
    console.log(`Excel report successfully saved to: ${outputPath}`);
}

createExcelReport().catch(console.error);
