// ===== CẤU HÌNH OẲN TÙ TÌ SINH TỬ =====
// Có thể đổi trực tiếp ở đây hoặc qua biến môi trường (VD: MAX_PLAYERS=300 npm start)
const env = process.env;
const num = (v, d) => (v !== undefined && v !== '' && !isNaN(+v) ? +v : d);

module.exports = {
  PORT: num(env.PORT, 3000),

  // Số người chơi tối đa được đăng ký
  MAX_PLAYERS: num(env.MAX_PLAYERS, 500),

  // Mật khẩu màn hình MC (trang /host)
  // Trên Render, nếu chưa đặt thì tự tạo mật khẩu ngẫu nhiên và in vào Logs.
  HOST_KEY: env.HOST_KEY || (env.RENDER ? require('crypto').randomBytes(9).toString('base64url') : 'admin'),

  // Địa chỉ người chơi dùng để vào game (in lên mã QR).
  // Để trống: tự lấy IP mạng LAN của máy chạy server.
  // Nếu dùng tên miền/ngrok: PUBLIC_URL=https://abc.ngrok.app
  PUBLIC_URL: env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || '',

  // Thời gian ra tay mỗi lượt (giây)
  CHOICE_SECONDS: num(env.CHOICE_SECONDS, 10),
  // Thời gian ra tay khi hòa / ván tiếp theo trong trận BO3, BO5 (giây)
  NEXT_GAME_SECONDS: num(env.NEXT_GAME_SECONDS, 7),
  // Thời gian hiển thị kết quả mỗi lần lật bài (giây)
  REVEAL_SECONDS: num(env.REVEAL_SECONDS, 4),

  // Hòa quá số lần này liên tiếp thì "Thần May Mắn" tung đồng xu quyết định ván đó
  TIE_LIMIT: num(env.TIE_LIMIT, 3),

  // ---- Đấu Tay Đôi (nhánh loại trực tiếp) ----
  // Số ván cần thắng: các vòng đầu (1 = BO1), bán kết (2 = BO3), chung kết (3 = BO5)
  EARLY_WINS: num(env.EARLY_WINS, 1),
  SEMI_WINS: num(env.SEMI_WINS, 2),
  FINAL_WINS: num(env.FINAL_WINS, 3),

  // ---- Đại Chiến Boss ----
  // Hòa với Boss thì vẫn sống (true) hay bị loại (false)
  BOSS_TIE_SURVIVES: (env.BOSS_TIE_SURVIVES || 'true') !== 'false',
  // Tự sang vòng tiếp sau bao nhiêu giây xem danh sách người còn lại (0 = MC bấm tay)
  BOSS_NEXT_SECONDS: num(env.BOSS_NEXT_SECONDS, 10),

  // Danh sách BU hiển thị khi đăng ký
  DEPARTMENTS: (env.DEPARTMENTS || 'IMF, AFS, AI-S, GFS, GSC, IFA, PMO, DIF, NTG')
    .split(',').map(s => s.trim()).filter(Boolean),
};
