# Văn phòng AI

Xem các phiên **Claude Code** (và **Codex CLI**, **Antigravity**) đang làm gì, dựng thành một văn phòng:
mỗi dự án / thư mục là một **phòng ban**, mỗi phiên chính là **trưởng phòng**, mỗi subagent là **một nhân viên**.
Có bản 2D (bảng theo dõi) và bản 3D (văn phòng hoạt hình, nhân vật đi lại, báo cáo sếp, xếp hàng chờ việc).

*English: a local web dashboard that turns your Claude Code sessions, subagents and background tasks into a
2D board and a 3D animated office. Read-only, Python standard library only, no build step. UI is in Vietnamese.*

- **Chỉ đọc**: đọc transcript trong `~/.claude/projects`, không ghi gì vào đó.
- **Không cài gì thêm**: Python 3.9+ thư viện chuẩn; Three.js r187 chép sẵn trong `3d/lib/` (chạy không cần mạng).
- **Ẩn danh**: bật sẵn — tên phòng thành tên phòng ban kiểu tập đoàn, nội dung việc được che. Bản 3D luôn ẩn danh,
  không hiện log hay lệnh, hợp để chiếu màn hình.
- **Chỉ hiển thị**: không có ô ra lệnh; ra việc vẫn là nhắn phiên Claude như thường.

## Chạy

```bash
git clone https://github.com/ptnbk2401/van-phong-ai.git
cd van-phong-ai
python3 app.py
```

Mở `http://127.0.0.1:8790` (2D), `/3d` (3D), `/lichsu` (lịch sử), `/cauhinh` (cấu hình).

| Tham số | Ý nghĩa |
|---|---|
| `--port 8790` | cổng |
| `--host 0.0.0.0` | cho máy khác trong mạng xem (chỉ máy trong mạng riêng mới sửa được cấu hình) |
| `--ngay 2` | xem phiên hoạt động trong N ngày gần nhất |
| `--goc ~/du-an` | dự án gốc (xem dưới) |
| `--db <file>` | kho SQLite (mặc định `~/Library/Application Support/theo_doi_subagent/van_phong.db`) |

## Phạm vi

- **Mọi phiên Claude** (mặc định khi chưa đặt dự án gốc): mỗi dự án Claude Code trên máy là một phòng.
- **Chỉ dự án gốc**: đặt `goc` (một thư mục lớn chứa nhiều thư mục con) — mỗi thư mục con có `CLAUDE.md` là một phòng ban,
  phòng được đoán theo thư mục được nhắc nhiều nhất trong việc giao. Đổi qua lại ở trang ⚙️ Cấu hình.

## Cấu hình riêng (ngoài repo)

Mọi thứ của riêng bạn để ở `~/.config/van-phong-ai/` (đổi bằng biến `VAN_PHONG_CONF`), không nằm trong repo:

```
~/.config/van-phong-ai/
  config.json   # tuỳ chọn, xem dưới
  rieng.js      # tuỳ chọn: tên thật / mật danh phòng ban, tên xưởng, tên sếp
  logo/         # logo phòng (<thư mục>.png 128 px), logo xưởng xuong.png / xuong_tron.png / xuong_64.png
```

`config.json` (mọi trường đều tuỳ chọn):

```json
{
  "goc": "~/Projects/cong-ty",
  "goc_them": ["~/.cache/mot-skill-nao-do"],
  "phong_them": ["ThuMucKhongCoClaudeMd"],
  "thu_muc_ky_thuat": ["tools", "scripts", ".claude/skills", ".claude/agents"],
  "may_xa": {"ten": "Máy chủ", "ssh": "may-chu"}
}
```

- `goc_them`: phiên chạy trong các thư mục này cũng tính vào dự án gốc (vào phòng Kỹ thuật).
- `thu_muc_ky_thuat`: việc đụng tới các thư mục này xếp vào phòng Kỹ thuật.
- `may_xa`: phiên mở qua SSH tới máy khác (Claude app → remote) — đọc kết quả lệnh nền qua `ssh <host>` chỉ đọc.

`rieng.js` chạy ngay sau bảng mặc định trong `chung.js`, ví dụ:

```js
Object.assign(DEPT, { "Marketing": ["Phòng Marketing", "bán hàng bằng chữ", "📣", ["mkt"]] });
Object.assign(ANON, { "Marketing": ["Ban Truyền Thông", "nói ít hiểu nhiều", "📡"] });
XUONG = "Văn phòng của tôi"; GIAM_DOC = "Sếp"; BIEN_SANH.dong1 = "MY OFFICE";
```

`DEPT[thư mục] = [tên thật, khẩu hiệu, biểu tượng, [bí danh cần che]]`, `ANON[thư mục] = [mật danh, khẩu hiệu, biểu tượng]`.
Tên phòng, tên nhân viên, tên xưởng, logo cũng sửa được ngay trên trang ⚙️ Cấu hình (lưu vào kho SQLite của máy).

Logo phòng từ ảnh có sẵn: viết `logo/nguon.json` (`{"<thư mục>": "<đường dẫn ảnh, tương đối theo goc>"}`) rồi
`python3 logo/lam_logo.py` (dùng `sips` của macOS).

## Nguồn khác ngoài Claude Code

- **Codex CLI / Codex Desktop**: `~/.codex/sessions/**/rollout-*.jsonl` (biến `THEO_DOI_CODEX`).
- **Antigravity** (ứng dụng + CLI `agy`): `~/.gemini/antigravity*/conversation_summaries.db`, mở chỉ đọc
  (biến `THEO_DOI_GEMINI`). Lệnh `agy` do một phiên Claude gọi được tính là trợ lý của phiên đó.
- Bật / tắt từng nguồn ở trang Cấu hình. Grok CLI… chưa có.

Phiên đã lưu trữ (archived) trong Claude app không được theo dõi
(`~/Library/Application Support/Claude/claude-code-sessions`, biến `THEO_DOI_APP_SESS`).

## Bản 3D

- Phòng ban có bàn, máy, kệ hồ sơ; nhân viên đi vào làm, nộp hồ sơ lên kệ, mang kết quả lên Phòng Giám Đốc báo cáo
  hoặc chờ duyệt; người rảnh xếp hàng chờ việc (giới hạn số người / số phút rồi về).
- Sếp tự đi kiểm tra: ghé mỗi phòng có người một lần, chào nhân viên, bỏ qua phòng trống, xong tự về bàn.
- Trang Cấu hình: cỡ phòng (hẹp / vừa / rộng), hàng chờ, mức nói, tốc độ nhân vật, giới hạn FPS, đóng / mở phòng ban.
- Đỡ nóng máy: giới hạn FPS, bóng đổ cập nhật thưa; `window.__vpChanDoan()` trong console để xem số liệu.

## Nền tảng

Viết và chạy trên macOS (đường dẫn Claude app, `sips`). Linux chạy được phần chính (đọc transcript, 2D, 3D);
phần đọc trạng thái lưu trữ của Claude app và `lam_logo.py` chỉ có trên macOS.

## Giấy phép

MIT — xem `LICENSE`. Three.js: MIT, `3d/lib/LICENSE_three.txt`.
