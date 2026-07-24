const ExcelJS = require('exceljs');
const path = require('path');

async function updateExcelReport() {
    const filePath = path.join('c:', 'Users', 'Admin', '.antigravity-ide', 'tin_tuc_bat_dong_san_nghe_an.xlsx');
    const outputPath = path.join('c:', 'Users', 'Admin', '.antigravity-ide', 'tin_tuc_bat_dong_san_nghe_an_kich_ban.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    // Get the sheet '2. 10 Bài Báo Nổi Bật'
    const sheet2 = workbook.getWorksheet('2. 10 Bài Báo Nổi Bật');

    // Add Column I header and properties
    // Column I is index 9
    sheet2.getColumn(9).width = 85;
    sheet2.getCell('I1').value = 'Kịch bản video';
    
    const headerStyle = sheet2.getCell('H1').style;
    sheet2.getCell('I1').style = headerStyle;

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

    // Scripts to update
    const scripts = {
        2: `Tiêu đề: NGHỆ AN ĐIỀU CHỈNH QUY HOẠCH VĨ MÔ: BẤT ĐỘNG SẢN SẮP ĐÓN SÓNG LỚN?

[HOOK]
Các nhà đầu tư đất nền Nghệ An chú ý! Hội đồng nhân dân tỉnh vừa chính thức thông qua Nghị quyết điều chỉnh Quy hoạch tỉnh thời kỳ 2021-2030. Đây không chỉ là một văn bản hành chính thông thường, mà là bước ngoặt thay đổi toàn bộ bản đồ bất động sản Nghệ An trong những năm tới!

[BODY]
Tại sao lại như vậy? Việc điều chỉnh lần này nhằm đồng bộ hóa không gian phát triển mới sau khi sáp nhập 130 đơn vị hành chính cấp xã. Nghệ An đang dồn toàn lực hướng tới mục tiêu trở thành cực tăng trưởng kinh tế của toàn vùng Bắc Trung Bộ.
Nhìn từ góc độ đầu tư, việc định hình lại các khu chức năng, phân khu đô thị và hành lang giao thông sẽ mở đường cho hàng loạt siêu dự án hạ tầng. Bản quy hoạch mới này chính là "kim chỉ nam" cho dòng tiền thông minh. Những khu vực trước đây là đất nông nghiệp hoặc vùng ven, nay được quy hoạch thành đất đô thị, đất công nghiệp sẽ có tiềm năng tăng giá vượt trội. Nếu các bác vẫn đang đầu tư theo kiểu "nghe ngóng tin đồn" mà không bám sát bản đồ quy hoạch mới này, nguy cơ mua phải đất dính quy hoạch treo hoặc vùng không phát triển là cực kỳ cao. Ngược lại, đây là thời cơ vàng để gom đất ở những khu vực đón đầu hạ tầng dịch vụ trọng điểm.

[CTA]
Quy hoạch mới sẽ thay đổi giá đất khu vực nào nhiều nhất? Các bác muốn check quy hoạch khu vực nào tại Nghệ An? Hãy bình luận ngay bên dưới và đừng quên nhấn follow kênh để cập nhật sớm nhất bản đồ quy hoạch chi tiết nhé!`,

        3: `Tiêu đề: ĐẠI LỘ VINH - CỬA LÒ ĐIỀU CHỈNH QUY HOẠCH: ĐẤT VÀNG TRỖI DẬY!

[HOOK]
Trục đường đắt giá nhất Nghệ An - Đại lộ Vinh - Cửa Lò vừa được phê duyệt điều chỉnh quy hoạch phân khu hai bên đường! Đây có phải là phát súng kích hoạt cho một chu kỳ tăng giá bất động sản mới tại khu vực này? Hãy cùng phân tích ngay!

[BODY]
UBND tỉnh Nghệ An vừa ban hành quyết định điều chỉnh cục bộ quy hoạch phân khu hai bên Đại lộ Vinh - Cửa Lò. Mục tiêu là định hình lại không gian đô thị dọc trục giao thông xương sống này, tập trung thu hút các tổ hợp thương mại, siêu thị, trung tâm tài chính và du lịch nghỉ dưỡng cao cấp quốc tế. 
Với tổng chiều dài gần 11 km và lộ giới lên tới 95m, đại lộ này kết nối trung tâm thành phố Vinh và thị xã biển Cửa Lò. Dưới góc nhìn đầu tư, đây là trục giao thông mang tính quyết định cho toàn bộ định hướng sáp nhập Cửa Lò vào Vinh. Việc điều chỉnh quy hoạch lần này cho thấy chính quyền đang dọn đường để đón các "ông lớn" bất động sản về triển khai các siêu dự án thương mại dịch vụ quy mô lớn. Giá đất hai bên mặt đường đại lộ và các khu vực lân cận chắc chắn sẽ có biến động mạnh. Tuy nhiên, các bác cần lưu ý, không phải khu đất nào sát đường cũng được xây dựng tự do. Hãy kiểm tra kỹ quy hoạch chi tiết từng phân khu trước khi xuống tiền gom đất ven lộ nhé!

[CTA]
Theo các bác, đất dọc Đại lộ Vinh - Cửa Lò có xứng đáng để đầu tư dài hạn vào lúc này? Hãy để lại ý kiến dưới phần bình luận và bấm follow kênh để nhận thông tin quy hoạch mới nhất!`,

        5: `Tiêu đề: NÓNG: CÔNG BỐ DANH SÁCH DỰ ÁN ĐỦ ĐIỀU KIỆN MỞ BÁN TẠI NGHỆ AN!

[HOOK]
Mất trắng tiền tỷ nếu mua đất dự án hoặc chung cư tại Nghệ An mà bỏ qua danh sách này! Sở Xây dựng vừa chính thức công bố danh sách các dự án nhà ở hình thành trong tương lai đủ điều kiện kinh doanh. Xem ngay kẻo trễ!

[BODY]
Để tránh tình trạng người dân mua phải các dự án "bán lúa non", huy động vốn trái phép khi chưa hoàn thiện móng hoặc thiếu giấy tờ pháp lý, Sở Xây dựng Nghệ An đã công bố danh sách 15 dự án đủ điều kiện giao dịch năm 2026.
Đây là động thái cực kỳ cần thiết nhằm minh bạch hóa thị trường bất động sản địa phương. Dưới góc nhìn pháp lý, việc một dự án nằm trong danh sách này chứng minh chủ đầu tư đã hoàn thành đầy đủ nghĩa vụ đóng thuế đất, có quy hoạch chi tiết một phần năm trăm, giấy phép xây dựng và được ngân hàng bảo lãnh. Mua những dự án này, dòng tiền của các bác sẽ được an toàn tuyệt đối. Ngược lại, nếu dự án nào không nằm trong danh sách nhưng vẫn rao bán rầm rộ dưới dạng "hợp đồng đặt cọc" hay "hợp đồng góp vốn", các bác phải cực kỳ cảnh giác. Rủi ro tranh chấp hoặc dự án bị đình chỉ thi công là rất lớn. Hãy bảo vệ túi tiền của mình bằng cách kiểm chứng thông tin chính thống từ Sở Xây dựng trước khi ký hợp đồng.

[CTA]
Các bác muốn kiểm tra pháp lý của dự án cụ thể nào tại Nghệ An? Hãy comment tên dự án dưới đây để em hỗ trợ check trực tiếp từ Sở Xây dựng nhé! Đừng quên follow kênh để cập nhật tin pháp lý hữu ích!`,

        7: `Tiêu đề: NGHỆ AN QUYẾT LIỆT THU HỒI DỰ ÁN TREO: LÀM SẠCH QUỸ ĐẤT SẠCH!

[HOOK]
Hàng chục dự án đô thị và khu dân cư tại Nghệ An đang đối mặt với án thu hồi đất cực kỳ khẩn cấp! UBND tỉnh vừa phát đi văn bản yêu cầu xử lý triệt để các dự án chậm tiến độ và có dấu hiệu "khoanh nuôi đất". Chi tiết ra sao?

[BODY]
Thực trạng các dự án bất động sản được giao đất nhưng hàng chục năm không triển khai, cỏ mọc um tùm đã gây lãng phí nghiêm trọng nguồn lực tài nguyên của Nghệ An. Do đó, tỉnh đã thành lập đoàn liên ngành rà soát quyết liệt để bãi bỏ các dự án không khả thi.
Động thái cứng rắn này của chính quyền là hồi chuông cảnh báo cho các chủ đầu tư ôm đất chờ thời, nhưng lại là tin cực kỳ vui cho thị trường bất động sản thực chất. Dưới góc nhìn kinh tế, thu hồi đất của các đơn vị yếu kém sẽ mở ra cơ hội giải phóng quỹ đất sạch để giao cho những chủ đầu tư uy tín, có năng lực tài chính mạnh hơn. Điều này giúp đẩy nhanh tiến độ đô thị hóa thực tế, tránh các đô thị ma. Đối với các bác đang đi gom đất, hãy tránh xa vùng phụ cận của các dự án đang nằm trong danh sách thanh tra thu hồi này để tránh rủi ro đất đai bị đóng băng, không thể giao dịch hoặc tranh chấp kéo dài.

[CTA]
Quyết định thu hồi dự án treo này của tỉnh Nghệ An có giúp thị trường bất động sản minh bạch hơn không? Các bác nghĩ sao? Để lại ý kiến của mình bên dưới và follow kênh để không bỏ lỡ tin nóng!`,

        8: `Tiêu đề: NGHỆ AN TĂNG TỐC XÂY DỰNG NHÀ Ở XÃ HỘI: GIẢI PHÁP CHO NHU CẦU THỰC!

[HOOK]
Tin vui cho hàng nghìn công nhân và người lao động thu nhập thấp tại Nghệ An! Dự án nhà ở xã hội quy mô lớn đang được đẩy nhanh tiến độ xây dựng với mục tiêu hoàn thành 2.000 căn hộ ngay trong năm nay.

[BODY]
Tỉnh Nghệ An đang dồn lực thúc đẩy phân khúc nhà ở xã hội tại các khu công nghiệp trọng điểm như VSIP và WHA. Đây là giải pháp chiến lược nhằm đáp ứng nhu cầu ở thực rất lớn của người lao động phổ thông, giúp họ yên tâm an cư lạc nghiệp.
Dưới góc nhìn phát triển bền vững, việc phát triển nhà ở xã hội giá rẻ là yếu tố then chốt giúp nâng cao sức cạnh tranh thu hút vốn đầu tư FDI của Nghệ An. Khi người lao động có chỗ ở ổn định, doanh nghiệp FDI sẽ giữ chân được nguồn nhân lực chất lượng cao. Đối với thị trường bất động sản, việc bổ sung nguồn cung nhà giá rẻ sẽ giúp cân bằng cán cân cung cầu vốn đang bị lệch pha về phân khúc trung cao cấp. Nếu các bác đang có ý định mua nhà ở xã hội, hãy đặc biệt lưu ý kiểm tra các quy định về đối tượng được mua, điều kiện cư trú và quy trình xét duyệt hồ sơ từ Sở Xây dựng để chuẩn bị chu đáo nhất, tránh các dịch vụ cò mồi lừa đảo phí làm hồ sơ nhanh.

[CTA]
Các bác có nhu cầu tìm hiểu về quy trình nộp hồ sơ nhà ở xã hội tại Nghệ An không? Hãy để lại bình luận để nhận hướng dẫn chi tiết và nhấn đăng ký theo dõi kênh để nhận thông tin mới nhất nhé!`,

        9: `Tiêu đề: BẤT ĐỘNG SẢN NGHỆ AN 2026: THỜI KỲ CỦA GIÁ TRỊ THỰC LÊN NGÔI!

[HOOK]
"Cơn sốt ảo" phân lô bán nền tại Nghệ An đã chính thức hạ nhiệt hoàn toàn! Thị trường bất động sản năm nay đang chứng kiến một cuộc chuyển dịch ngoạn mục sang xu hướng mua để ở thực và đầu tư dài hạn. Điều này ảnh hưởng thế nào đến dòng tiền của các bác?

[BODY]
Theo báo cáo thị trường mới nhất, lượng giao dịch đất nền tự do giảm mạnh so với giai đoạn trước. Thay vào đó, dòng tiền thông minh của khách hàng đang dịch chuyển rõ nét sang căn hộ chung cư cao cấp và các khu đô thị được quy hoạch đồng bộ, bài bản có không gian xanh và tiện ích đầy đủ như Ecopark Vinh hay VSIP.
Sự thay đổi này cho thấy nhà đầu tư đã khôn ngoan và khắt khe hơn rất nhiều. Họ không còn mặn mà với các bánh vẽ dự án hay các lô đất đồng không mông quạnh không có hạ tầng. Dưới góc nhìn đầu tư, đây là xu hướng tất yếu giúp thanh lọc thị trường, đưa bất động sản trở lại với giá trị cốt lõi là phục vụ nhu cầu sống thực sự của con người. Đối với các bác đang tìm mua đất ở thời điểm này, hãy ưu tiên các dự án đã hoàn thiện hạ tầng kỹ thuật, có pháp lý sổ đỏ sẵn sàng và nằm trong khu dân cư đông đúc để đảm bảo tính thanh khoản tốt nhất.

[CTA]
Các bác nghĩ sao về xu hướng chuyển dịch dòng tiền này? Liệu phân khúc đất nền vùng ven Nghệ An còn có cơ hội tăng giá không? Hãy bình luận góc nhìn của các bác bên dưới và ấn theo dõi follow kênh nhé!`
    };

    // Update cell values and apply style
    for (let r = 2; r <= 11; r++) {
        const cell = sheet2.getCell(r, 9);
        if (scripts[r]) {
            cell.value = scripts[r];
        } else {
            cell.value = ''; // Empty for non-selected rows
        }
        Object.assign(cell, cellStyle);
        // Increase row height dynamically if needed
        sheet2.getRow(r).height = 160;
    }

    await workbook.xlsx.writeFile(outputPath);
    console.log('Sheet 2 successfully updated with the 6 video scripts in Column I and saved to tin_tuc_bat_dong_san_nghe_an_kich_ban.xlsx!');
}

updateExcelReport().catch(console.error);
