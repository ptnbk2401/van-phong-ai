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
- **Góc giải trí** ở phòng Sếp: sofa, loa, mâm đĩa than, máy hát. Bật / tắt nhạc bằng nút 🎵, phím `M` hoặc bấm máy hát.
  Dán danh sách link YouTube (video, playlist) ở trang Cấu hình để phát lần lượt; để trống thì phát nhạc lofi tự sinh
  trên máy (WebAudio, không cần mạng, không bản quyền).
- Giao diện kính mờ: viên số liệu trên thanh trên, danh sách phòng thu gọn thành cột biểu tượng (rê chuột / 📌 để mở),
  bảng tin có nhãn màu, phím `H` ẩn toàn bộ giao diện để chỉ xem 3D. Phông nền chọn ở Cấu hình: sân cỏ hoặc studio tối.
- **Ban đêm ấm cúng** (theo giờ thật): ngoài trời tối xanh lạnh, trong nhà bật đèn vàng và vầng sáng dưới đèn; màn hình
  hắt sáng xanh ngọc lên người đang gõ phím. Thêm `?gio=22` vào địa chỉ để xem thử ban đêm.
- **Hạt vi mô**: khói cà phê bốc lên ở bàn có người làm, bụi nắng ban ngày, đom đóm quanh hàng cây ban đêm; máy in ở sảnh
  quét laser và in một tờ mỗi lần có người nộp báo cáo.
- **Biểu cảm**: gặp trục trặc thì có mây xám ⚡ trên đầu, xong việc thì bung pháo giấy, chờ việc thì xoay ghế lắc lư.
- **Tour điện ảnh** (phím `C`, nút 🎥 Tour, tự bật sau 90 giây không đụng chuột): máy quay tự đi qua 3 góc — lướt ngang
  ngoài vách kính, góc sofa phòng Sếp, sau vai người đang chạy lệnh; bấm chuột hoặc phím bất kỳ để về chỗ cũ.

## Nền tảng

Viết và chạy trên macOS (đường dẫn Claude app, `sips`). Linux chạy được phần chính (đọc transcript, 2D, 3D);
phần đọc trạng thái lưu trữ của Claude app và `lam_logo.py` chỉ có trên macOS.

## Dành cho AI agent: cài đặt theo máy người dùng

*For AI coding agents (Claude Code, Codex…): when a user asks you to install this project, follow these steps in order.
Talk to the user in their language. Ask only the questions marked **Hỏi**; everything else you can check yourself.*

**Luật khi cài:** app chỉ đọc `~/.claude`, `~/.codex`, `~/.gemini` — không ghi, không xoá, không sửa gì trong đó.
Không cài thêm gói Python (app chỉ dùng thư viện chuẩn). Không đưa tên riêng của người dùng vào repo:
mọi thứ riêng ghi vào `~/.config/van-phong-ai/`. Ghi đè file nào thì xem nội dung cũ trước và hỏi người dùng.

### 1. Kiểm máy

```bash
uname -s                                   # Darwin = macOS, Linux = Linux
python3 -c 'import sys; print(sys.version); assert sys.version_info >= (3, 9)'
python3 -c 'import sqlite3; print(sqlite3.sqlite_version)'
ls -d ~/.claude/projects ~/.codex/sessions ~/.gemini/antigravity* 2>/dev/null
lsof -nP -iTCP:8790 -sTCP:LISTEN            # có dòng nào = cổng 8790 đang bận, dùng --port khác
```

- Không có `~/.claude/projects` → người dùng chưa dùng Claude Code trên máy này. Trang vẫn chạy nhưng trống; báo cho họ.
- Có `~/.codex/sessions` / `~/.gemini/antigravity*` → nguồn Codex / Antigravity tự bật; không có thì bỏ qua, không lỗi.
- Windows: chưa hỗ trợ chính thức. Dùng WSL nếu Claude Code chạy trong WSL.

### 2. Lấy mã nguồn

```bash
git clone https://github.com/ptnbk2401/van-phong-ai.git ~/van-phong-ai
```

Trên macOS nên để repo **ngoài** `~/Desktop`, `~/Documents`, `~/Downloads`: các thư mục này được macOS bảo vệ,
tiến trình chạy nền (bước 6) sẽ bị chặn đọc nếu chưa cấp quyền.

### 3. Hỏi người dùng rồi viết `~/.config/van-phong-ai/config.json`

**Hỏi** (mọi câu đều có thể bỏ qua — bỏ hết thì không cần tạo file):

1. Có một thư mục lớn chứa nhiều dự án con muốn xem như "công ty" không? → `goc`. Kiểm thư mục tồn tại và liệt kê
   các thư mục con có `CLAUDE.md` (đó sẽ là phòng ban) cho người dùng xem:
   `find <goc> -mindepth 2 -maxdepth 2 -name CLAUDE.md`
2. Thư mục con nào không có `CLAUDE.md` mà vẫn muốn là một phòng? → `phong_them`.
3. Thư mục nào là công cụ / hạ tầng (việc đụng tới thì xếp vào phòng Kỹ thuật)? → `thu_muc_ky_thuat`
   (mặc định `tools`, `scripts`, `.claude/skills`, `.claude/agents`).
4. Có mở phiên Claude Code qua SSH tới máy khác không? → `may_xa` = tên hiển thị + host trong `~/.ssh/config`.
   Kiểm bằng `ssh -o BatchMode=yes -o ConnectTimeout=5 <host> true`; không được thì bỏ trường này.

```bash
mkdir -p ~/.config/van-phong-ai
cat > ~/.config/van-phong-ai/config.json <<'JSON'
{
  "goc": "~/Projects/cong-ty",
  "phong_them": [],
  "thu_muc_ky_thuat": ["tools", "scripts", ".claude/skills", ".claude/agents"]
}
JSON
python3 -m json.tool ~/.config/van-phong-ai/config.json >/dev/null && echo "config.json hợp lệ"
```

Chỉ ghi trường người dùng đã trả lời. Đường dẫn dùng được `~`.

### 4. (Tuỳ chọn) Tên riêng — `~/.config/van-phong-ai/rieng.js`

**Hỏi:** tên văn phòng, cách gọi sếp, và với mỗi phòng ban: tên thật + mật danh hiện khi bật ẩn danh.
Mật danh không được gợi ý nội dung công việc (bản 3D dùng để chiếu màn hình). Mẫu ở mục "Cấu hình riêng" phía trên;
khoá của `DEPT` / `ANON` là **tên thư mục** phòng. Kiểm cú pháp: `node --check ~/.config/van-phong-ai/rieng.js` (nếu có node).
Có logo thì chép vào `~/.config/van-phong-ai/logo/` (`<tên thư mục>.png`, `xuong.png`) hoặc tải lên ở trang ⚙️ Cấu hình.

### 5. Chạy thử và nghiệm thu

```bash
cd ~/van-phong-ai && python3 app.py --port 8790
```

Ở terminal khác (hoặc chạy app ở nền):

```bash
curl -s http://127.0.0.1:8790/api/state | python3 -c 'import json,sys; d=json.load(sys.stdin); print("goc:", d.get("root") or "(không)", "| truong phong:", len(d["leads"]), "| tro ly:", len(d["agents"]))'
for u in / /3d /cauhinh /lichsu /logo/xuong.png; do printf '%s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8790$u)"; done
```

Đạt khi mọi trang trả `200` và số trưởng phòng > 0 (nếu người dùng đã có phiên Claude Code trong 2 ngày gần nhất).
Có trình duyệt thì mở `/3d` và xem console không có lỗi. Đưa người dùng link `http://127.0.0.1:8790` và `/3d`.

### 6. (Tuỳ chọn) Tự chạy khi đăng nhập

**Hỏi** trước khi cài. macOS — LaunchAgent:

```bash
REPO=~/van-phong-ai; PY=$(command -v python3)
cat > ~/Library/LaunchAgents/io.github.van-phong-ai.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>io.github.van-phong-ai</string>
  <key>ProgramArguments</key><array><string>$PY</string><string>$REPO/app.py</string><string>--port</string><string>8790</string></array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/van-phong-ai.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/van-phong-ai.log</string>
</dict></plist>
PLIST
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/io.github.van-phong-ai.plist
```

Gỡ: `launchctl bootout gui/$(id -u)/io.github.van-phong-ai`. Nếu `goc` nằm trong `~/Desktop` / `~/Documents` mà log báo
`Operation not permitted`, người dùng phải tự cấp quyền cho `python3` trong Cài đặt hệ thống → Quyền riêng tư & Bảo mật
(agent không tự đổi cài đặt bảo mật).

Linux — systemd user service:

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/van-phong-ai.service <<UNIT
[Unit]
Description=Van phong AI
[Service]
WorkingDirectory=%h/van-phong-ai
ExecStart=$(command -v python3) %h/van-phong-ai/app.py --port 8790
Restart=on-failure
[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload && systemctl --user enable --now van-phong-ai
```

### 7. Cập nhật về sau

```bash
cd ~/van-phong-ai && git pull
```

Rồi khởi động lại app (hoặc `launchctl kickstart -k gui/$(id -u)/io.github.van-phong-ai` /
`systemctl --user restart van-phong-ai`). Cấu hình riêng trong `~/.config/van-phong-ai/` không bị đụng tới.

## Giấy phép

MIT — xem `LICENSE`. Three.js: MIT, `3d/lib/LICENSE_three.txt`.
