# ✊✋✌️ OẲN TÙ TÌ SINH TỬ

Game oẳn tù tì cho tối đa **500 người** cùng chơi bằng điện thoại, có 2 chế độ: **Đấu Tay Đôi** (sơ đồ loại trực tiếp, bán kết BO3, chung kết BO5) và **Đại Chiến Boss**. Mọi người quét mã QR trên màn hình lớn là vào được, không cần cài app hay tạo tài khoản.

- **Màn hình lớn (MC / máy chiếu):** `http://<máy-chủ>:3000/host`
- **Người chơi:** quét mã QR hiện trên màn hình lớn

---

## 1. Cài đặt & chạy (5 phút)

Cần có **Node.js 18 trở lên** (tải tại nodejs.org).

```bash
cd oan-tu-ti-sinh-tu
npm install
npm start
```

Màn hình sẽ in ra:

```
• Người chơi vào:   http://192.168.1.25:3000/
• Màn hình MC:      http://localhost:3000/host   (mật khẩu: admin)
```

Mở trang MC trên laptop nối máy chiếu, nhập mật khẩu, bấm ⛶ để toàn màn hình.

### Cách cho người chơi kết nối

| Cách | Khi nào dùng | Làm thế nào |
|---|---|---|
| **Wi-Fi nội bộ** | Mọi người chung một mạng Wi-Fi | Chạy như trên, mã QR tự lấy IP mạng LAN |
| **Đưa lên Internet** | Wi-Fi yếu, nhiều người dùng 4G, chơi online | Deploy lên Render / Railway / VPS, rồi đặt `PUBLIC_URL=https://ten-mien-cua-ban` |
| **Đường hầm tạm** | Cần nhanh, không muốn deploy | `ngrok http 3000`, rồi chạy `PUBLIC_URL=https://xxxx.ngrok.app npm start` |

> ⚠️ Wi-Fi văn phòng thông thường hay nghẽn khi 300–500 điện thoại vào cùng lúc. Với sự kiện lớn, nên đưa lên Internet để mọi người dùng 4G thoải mái. Game rất nhẹ (vài KB mỗi lượt), 4G chơi mượt.

---

### Chạy trên Render miễn phí

Tệp `render.yaml` đã cấu hình sẵn. Render tự tạo mật khẩu `HOST_KEY` trong mục Environment của dịch vụ và tự dùng địa chỉ HTTPS của dịch vụ cho mã QR.

Gói miễn phí tự ngủ sau 15 phút không có truy cập, lần mở sau mất khoảng một phút. Khi dịch vụ ngủ hoặc khởi động lại, người chơi và ván đang chơi sẽ mất. Render khuyên không dùng gói này cho production, nên hãy thử tải trước khi tổ chức sự kiện đông người.

---

## 2. Luật chơi

Mở trang đăng ký, mọi người quét QR để ghi tên, BU và linh vật. Khi đủ người, MC **chốt danh sách** và chọn 1 trong 2 chế độ. Sau khi chốt thì không nhận thêm người (người đến muộn sẽ thấy thông báo "chờ ván sau").

Luật chung cho cả 2 chế độ:
- Mỗi lượt chọn ✊ Búa, ✋ Bao hoặc ✌️ Kéo trên điện thoại trước khi hết giờ. Hết giờ chưa chọn thì máy chọn bừa giùm.
- Màn hình lớn xếp hạng **BU** còn nhiều người nhất để thi đua tập thể.

### ⚔️ Chế độ Đấu Tay Đôi (loại trực tiếp)

1. Chốt danh sách xong, hệ thống **bốc thăm chia cặp ngẫu nhiên** thành sơ đồ thi đấu.
2. Nếu số người không chẵn theo sơ đồ (VD 500 người, sơ đồ cần 512 chỗ), một số người được bốc thăm nhận **🎟️ vé vớt**, tức đi thẳng vào vòng 2.
3. Người thắng vào vòng tiếp theo, người thua bị loại.
4. Thể thức theo vòng:
   - Các vòng đầu và tứ kết: **BO1**, thắng 1 ván.
   - **Bán kết: BO3**, ai thắng 2 ván trước thì vào chung kết.
   - **Chung kết: BO5**, ai thắng 3 ván trước là nhà vô địch.
5. Hòa thì đấu lại; hòa 3 lần liên tiếp thì **Thần May Mắn 🍀** tung đồng xu quyết định ván đó.
6. **Sơ đồ thi đấu kiểu giải bóng đá:**
   - **Màn hình lớn:** từ vòng 1/8 trở đi hiện sơ đồ hai nhánh đối xứng (trái và phải) hội tụ về Chung Kết ở giữa, có đường nối giữa các trận. Đường nối và ô tỉ số sáng vàng theo người thắng. Các vòng đông người hơn (vòng 1, 2, 1/16…) hiện dạng bảng tất cả các cặp. MC bấm **🗺️ Sơ đồ nhánh** (hoặc phím **S**) để mở sơ đồ bất kỳ lúc nào.
   - **Điện thoại:** người chơi thấy nhánh của mình (tối đa 4 vòng, có cột Vô địch ở cuối), vuốt ngang để xem các vòng sau. Thanh lộ trình phía trên đánh dấu vòng đã qua ✓ và vòng bị loại ✗. Người đã bị loại tự động theo dõi nhánh của thần tượng mình.
7. **Fan club:** bị loại thì bạn thành fan của người đã hạ mình. Thần tượng thua thì cả fan club chuyển sang người thắng. Cuối cùng, toàn bộ người bị loại sẽ thuộc fan club của nhà vô địch.

Với 500 người, giải có 9 vòng: Vòng 1 → Vòng 2 → Vòng 3 → Vòng 4 → Vòng 1/16 → Vòng 1/8 → Tứ kết → Bán kết (BO3) → Chung kết (BO5). Mỗi vòng đầu mất khoảng 15–30 giây cộng thời gian MC dẫn.

### 🤖 Chế độ Đại Chiến Boss

1. Mỗi vòng, **tất cả người còn lại cùng đấu với Boss** (Boss ra tay ngẫu nhiên).
2. Thắng Boss hoặc hòa Boss thì sống, thua Boss thì bị loại. Nếu muốn hòa cũng bị loại, đặt `BOSS_TIE_SURVIVES=false`.
3. Nếu **tất cả** cùng thua, Boss "tha mạng" và vòng đó đấu lại, nên không bao giờ hết người.
4. Sau mỗi vòng, cả màn hình lớn lẫn điện thoại hiển thị **danh sách người còn lại**. Màn lớn tự cuộn nếu danh sách dài, kèm diễn biến số người qua từng vòng.
5. Vòng tiếp theo tự chạy sau 10 giây. MC có thể tắt tự chạy để bấm tay.
6. Đấu liên tục đến khi chỉ còn **1 người**. Với 500 người thường mất khoảng 14–16 vòng.

---

## 3. Bảng điều khiển MC

Thanh dưới cùng màn hình lớn (bấm phím **H** để ẩn/hiện khi chiếu):

- **Phòng chờ:**
  - **⚔️ Đấu Tay Đôi** hoặc **🤖 Đại Chiến Boss**: chốt danh sách, chọn chế độ và bốc thăm.
  - **🤖 +50 bot thử** / **Xóa bot**: thêm hoặc xóa người chơi ảo để tập dượt.
- **Sau khi chốt:**
  - **▶️ Bắt đầu Vòng…**: chạy vòng tiếp theo.
  - **↩️ Hủy, mở lại đăng ký**: quay lại phòng chờ khi lỡ chốt sớm.
- **Trong lượt:**
  - **⏩ Lật bài ngay**: kết thúc lượt sớm khi gần hết mọi người đã chọn.
- **Chế độ Boss:**
  - **⏸ Tắt / ⏯ Bật tự chạy**: chuyển giữa tự sang vòng tiếp và MC bấm tay.
- **Bất kỳ lúc nào:**
  - **🔁 Ván mới (giữ người chơi)**: về phòng chờ, giữ nguyên danh sách để chơi tiếp chế độ khác.
  - **🗑️ Xóa hết người chơi**: xóa toàn bộ, mọi người phải đăng ký lại.
  - **🔊**: bật/tắt âm thanh đếm ngược.

Phím tắt: **H** ẩn/hiện thanh điều khiển, **S** mở/đóng sơ đồ nhánh. MC cũng có thể mở trang `/host` trên điện thoại để điều khiển; giao diện tự xếp dọc.

Người chơi lỡ tắt trình duyệt hoặc mất mạng chỉ cần mở lại trang là tự vào lại đúng vị trí.

---

## 4. Cấu hình

Sửa file `config.js` hoặc đặt biến môi trường khi chạy, ví dụ:
`MAX_PLAYERS=300 HOST_KEY=tatnien2026 npm start`

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `MAX_PLAYERS` | 500 | Số người đăng ký tối đa |
| `HOST_KEY` | admin | Mật khẩu màn hình MC. **Nên đổi!** |
| `PUBLIC_URL` | (tự lấy IP LAN) | Địa chỉ in lên mã QR |
| `PORT` | 3000 | Cổng chạy |
| `CHOICE_SECONDS` | 10 | Thời gian ra tay mỗi lượt |
| `NEXT_GAME_SECONDS` | 7 | Thời gian ra tay khi hòa hoặc ở ván tiếp theo của trận BO3/BO5 |
| `REVEAL_SECONDS` | 4 | Thời gian hiện kết quả mỗi lần lật bài |
| `TIE_LIMIT` | 3 | Số lần hòa liên tiếp trước khi tung đồng xu |
| `EARLY_WINS` | 1 | Số ván cần thắng ở các vòng đầu và tứ kết (1 = BO1) |
| `SEMI_WINS` | 2 | Số ván cần thắng ở bán kết (2 = BO3) |
| `FINAL_WINS` | 3 | Số ván cần thắng ở chung kết (3 = BO5) |
| `BOSS_TIE_SURVIVES` | true | Hòa Boss có được sống không |
| `BOSS_NEXT_SECONDS` | 10 | Giây chờ trước khi tự sang vòng Boss tiếp theo (0 = MC bấm tay) |
| `DEPARTMENTS` | Kinh doanh,Marketing,… | Danh sách BU, cách nhau bởi dấu phẩy |

---

## 5. Kiểm tra trước sự kiện

```bash
npm start                 # cửa sổ 1
node test/simulate.js http://localhost:3000 500 duel   # cửa sổ 2: giả lập 500 điện thoại chơi Đấu Tay Đôi
node test/simulate.js http://localhost:3000 500 boss   # hoặc Đại Chiến Boss
```

Bài test sẽ xóa người chơi hiện có trên server rồi tự chạy đến khi có nhà vô địch. Kết quả đã thử nghiệm:
- 500 người đăng ký trong khoảng 2 giây.
- Người thứ 501 bị từ chối, người đến sau khi chốt danh sách cũng bị từ chối.
- Cả 2 chế độ đều chạy đến nhà vô địch và cả 500 máy đều nhận được kết quả.

**Checklist ngày tổ chức:**
- [ ] Đổi `HOST_KEY`, sửa `DEPARTMENTS` đúng tên BU công ty
- [ ] Thử quét QR bằng 2–3 điện thoại khác mạng
- [ ] Xóa bot trước khi chơi thật
- [ ] Laptop MC cắm sạc, tắt chế độ ngủ
- [ ] Chuẩn bị quà cho: Nhà vô địch, Á quân, BU trụ lâu nhất
- [ ] Đấu Tay Đôi: mời 4 người vào bán kết lên sân khấu cho không khí
