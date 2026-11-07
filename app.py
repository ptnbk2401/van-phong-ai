#!/usr/bin/env python3
"""Van phong AI — theo doi phien Claude Code (+ Codex, Antigravity), subagent, lenh nen; web app cuc bo, ban 2D + 3D.

    python3 app.py                       # http://127.0.0.1:8790, moi phien Claude Code tren may
    python3 app.py --goc ~/du-an-cua-toi # them pham vi "chi du an goc": moi thu muc con co CLAUDE.md = mot phong ban
    python3 app.py --ngay 7              # xem 7 ngay gan nhat
    python3 app.py --host 0.0.0.0        # cho may khac trong mang xem

Cau hinh rieng (khong nam trong repo): ~/.config/van-phong-ai/ (doi bang bien VAN_PHONG_CONF) — config.json, rieng.js, logo/.

Chi doc, khong ghi gi vao ~/.claude. Chi dung thu vien chuan cua Python.
Ghi duy nhat vao kho SQLite cua van phong (kho.py, --db): lich su lam viec, ho so da nop, ten goi.

Nguon du lieu (Claude Code 2.1.x):
  ~/.claude/projects/<du an>/<phien>.jsonl                      transcript phien chinh
  ~/.claude/projects/<du an>/<phien>/subagents/agent-<id>.jsonl  transcript subagent
  ~/.claude/projects/<du an>/<phien>/subagents/agent-<id>.meta.json   loai, mo ta, toolUseId
  ~/.claude/projects/<du an>/<phien>/subagents/workflows/<wf>/agent-*  subagent cua Workflow
  ~/.claude/projects/<du an>/<phien>/workflows/<wf>.json         ket qua Workflow
Trang thai lay tu <task-notification> (chay nen) hoac toolUseResult (chay truoc mat)
trong transcript cua noi da goi agent; con lai doan theo do "im lang" cua file.
"""
import argparse, base64, collections, glob, json, os, re, shlex, shutil, socket, subprocess, sys, threading, time
from datetime import datetime
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from kho import Kho, DB_MAC_DINH, KHOA_CAU_HINH
import codex, antigravity

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECTS = os.path.expanduser("~/.claude/projects")
# Cau hinh rieng cua tung nguoi dung — ngoai repo. config.json (tat ca truong deu tuy chon):
#   goc              thu muc du an goc (pham vi "chi du an goc"; thu muc con co CLAUDE.md = phong ban)
#   goc_them         [thu muc] tinh chung pham vi voi du an goc (vd thu muc cache cua mot skill)
#   phong_them       [ten thu muc con] tinh la phong ban du khong co CLAUDE.md
#   thu_muc_ky_thuat [ten] viec dung toi cac thu muc nay -> "Ky thuat"
#   may_xa           {"ten": "...", "ssh": "<host ssh>"} phien Claude mo qua SSH (~/.claude/projects/ssh-*)
# rieng.js: phong ban that, mat danh, ten goi (chen vao /chung.js); logo/: logo xuong + logo phong ban.
CONF_DIR = os.path.expanduser(os.environ.get("VAN_PHONG_CONF", "~/.config/van-phong-ai"))
try:
    with open(os.path.join(CONF_DIR, "config.json"), encoding="utf-8") as _f:
        CONF = json.load(_f)
except (OSError, ValueError):
    CONF = {}
_goc = next((sys.argv[i + 1] for i, a in enumerate(sys.argv[:-1]) if a == "--goc"), None) or os.environ.get("VAN_PHONG_GOC") or CONF.get("goc") or ""
ROOT = os.path.abspath(os.path.expanduser(_goc)) if _goc else ""
GOC_THEM = [os.path.abspath(os.path.expanduser(g)) for g in CONF.get("goc_them", []) if g]
LOGO_RIENG = os.path.join(CONF_DIR, "logo")          # logo xuong + logo phong ban cua nguoi dung
LOGO_MAC_DINH = os.path.join(HERE, "logo", "mac_dinh")  # logo xuong mac dinh trong repo


def trong_goc(cwd):
    """cwd thuoc du an goc (hoac thu muc goc_them)?"""
    return bool(cwd) and any(cwd == g or cwd.startswith(g + "/") for g in ([ROOT] if ROOT else []) + GOC_THEM)
# Ten thu muc du an = duong dan voi moi ky tu khong phai chu/so doi thanh "-";
# worktree cua du an goc co dang <prefix>--claude-worktrees-<ten>.
PREFIX = re.sub(r"[^A-Za-z0-9]", "-", ROOT) if ROOT else "\0"   # khong co du an goc -> khong khop thu muc nao

ACTIVE_S = 90          # file vua ghi trong 90 s -> dang chay
QUIET_S = 30 * 60      # im lang < 30 phut va chua xong -> co the dang cho lenh dai
BG_MAX_S = 12 * 3600   # lenh nen chua bao xong qua 12 gio -> coi nhu mat dau (phien da tat)
MINI = (CONF.get("may_xa") or {}).get("ten") or "Máy từ xa"   # phien Code tab chay qua SSH (~/.claude/projects/ssh-<id>/)
SSH_HOST = os.environ.get("THEO_DOI_SSH", (CONF.get("may_xa") or {}).get("ssh", ""))  # host SSH de doc file ket qua lenh nen ("" = tat)
PROBE_AFTER_S = 10 * 60   # lenh nen cho qua 10 phut ma chua thay thong bao ket thuc -> doc duoi file ket qua
PROBE_EVERY_S = 60
END_RE = re.compile(r"\[(killed|exited with code (-?\d+))\]\s*$")
BIG_LINE = 256 * 1024  # dong lon hon (anh base64, ket qua dai) -> doc bang regex
MAX_EVENTS = 600       # su kien giu lai moi agent cho khung chi tiet
# Truong phien dung lai hoi y user (cho duyet): hoi bang cong cu, trinh ke hoach, hoi o khung buoc tiep, de nghi mo phien
ASK_TOOLS = ("AskUserQuestion", "ExitPlanMode")

NOTIF_RE = re.compile(rb"<task-id>([A-Za-z0-9_-]+)</task-id>.{0,400}?<status>([a-z_]+)</status>(?:(?:\\n)?<summary>(.{0,300}?)</summary>)?")
TS_RE = re.compile(rb'"timestamp":"([^"]+)"')
# Monitor khong gui <status> khi xong ma gui mot su kien "[Monitor expired after 30m ...]" (hoac ended/exited...)
MON_END_RE = re.compile(rb"<task-id>([A-Za-z0-9_-]+)</task-id>.{0,600}?<event>\[Monitor (?:has )?"
                        rb"(expired|ended|exited|stopped|finished|completed|killed|timed out)")


def host_name():
    """Ten may de nhin (ComputerName cua macOS); gethostname() co khi tra ve IP."""
    try:
        import subprocess
        n = subprocess.run(["scutil", "--get", "ComputerName"], capture_output=True,
                           text=True, timeout=3).stdout.strip()
        if n:
            return n
    except (OSError, subprocess.SubprocessError):
        pass
    return socket.gethostname()


HOST = host_name()

# Phong ban = thu muc con cua du an goc co CLAUDE.md; viec dung toi thu muc ky thuat (tools/, skill...) -> Ky thuat.
TECH_RE = re.compile(r"(?:^|[\s/`'\"])(" + "|".join(re.escape(d) for d in CONF.get("thu_muc_ky_thuat", ["tools", "scripts", ".claude/skills", ".claude/agents"])) + r")/")


def list_depts():
    if not ROOT or not os.path.isdir(ROOT):
        return []
    out = [d for d in sorted(os.listdir(ROOT)) if not d.startswith((".", "_")) and os.path.isfile(os.path.join(ROOT, d, "CLAUDE.md"))]
    for extra in CONF.get("phong_them", []):
        if os.path.isdir(os.path.join(ROOT, extra)) and extra not in out:
            out.append(extra)
    return out


DEPTS = list_depts()
DEPT_RES = [(d, re.compile(r"(?<![A-Za-z])" + re.escape(d) + r"(?![A-Za-z])")) for d in DEPTS]


def guess_dept(*texts):
    """Kenh duoc nhac nhieu nhat trong mo ta + viec giao; khong co -> Ky thuat / Tong hop."""
    text = "\n".join(t for t in texts if t)
    best, n_best = "", 0
    for d, rx in DEPT_RES:
        n = len(rx.findall(text))
        if n > n_best:
            best, n_best = d, n
    if best:
        return best
    return "Kỹ thuật" if TECH_RE.search(text) else ""


# Phien trong app Claude (tab Code): moi phien mot file local_<id>.json — cliSessionId = ma transcript, isArchived, ten, ma mo link
APP_SESS = os.path.expanduser(os.environ.get("THEO_DOI_APP_SESS", "~/Library/Application Support/Claude/claude-code-sessions"))
APP_LINK = "claude://claude.ai/epitaxy/"   # link mo dung phien trong app (nhu nut "link" cua app)
_app_cache = {}


def phien_app():
    """cliSessionId -> {local, archived, title} doc tu app Claude (cache theo mtime tung file)."""
    out = {}
    for fp in glob.glob(os.path.join(APP_SESS, "**", "local_*.json"), recursive=True):
        try:
            m = os.path.getmtime(fp)
        except OSError:
            continue
        c = _app_cache.get(fp)
        if not c or c[0] != m:
            try:
                with open(fp, encoding="utf-8") as f:
                    d = json.load(f)
                c = _app_cache[fp] = (m, d.get("cliSessionId"), {"local": d.get("sessionId") or "", "archived": bool(d.get("isArchived")),
                                                                  "title": d.get("title") or ""})
            except (OSError, ValueError):
                continue
        if c[1]:
            out[c[1]] = c[2]
    return out


def noi_dung_hoi(name, inp):
    """Phien dang hoi user / xin duyet cai gi — chu doc duoc cho khung ho so."""
    if name == "AskUserQuestion":
        out = []
        for q in inp.get("questions") or []:
            if isinstance(q, dict):
                opts = " / ".join(o.get("label", "") for o in q.get("options") or [] if isinstance(o, dict))
                out.append("❓ " + (q.get("question") or "") + (("\n   Lựa chọn: " + opts) if opts else ""))
        return "\n".join(out) or "Hỏi lựa chọn"
    if name == "ExitPlanMode":
        return "📋 Trình kế hoạch, chờ duyệt:\n" + short(inp.get("plan") or "", 700)
    if name == "mcp__ccd_turn__wrap_up":
        acts = " / ".join(a.get("label", "") for a in inp.get("actions") or [] if isinstance(a, dict) and a.get("label"))
        return "❓ " + (inp.get("ask") or "") + (("\n   Nút: " + acts) if acts else "")
    if name == "mcp__ccd_session__start_session":
        return "🆕 Đề nghị mở phiên mới: " + (inp.get("title") or "")
    return name


def du_an(cwd):
    """Ten du an cua mot phien ngoai du an goc (phong ban "@<ten>"), lay tu thu muc lam viec."""
    if not cwd:
        return "Khác"
    base = cwd.split("/.claude/worktrees/")[0].rstrip("/")
    if "/.cache/" in base:                       # cong cu chay trong ~/.cache/<ten>/... (vd thu muc cache cua mot skill)
        return base.split("/.cache/", 1)[1].split("/")[0] or "Khác"
    if "/Library/Application Support/Claude/" in base:
        return "Scratch"
    if base == os.path.expanduser("~"):
        return "Home"
    return os.path.basename(base) or "Khác"


def parse_ts(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def short(s, n):
    s = " ".join(str(s).split())
    return s if len(s) <= n else s[: n - 1] + "…"


def tool_brief(name, inp):
    """Mot dong mo ta lenh goi cong cu."""
    if not isinstance(inp, dict):
        return short(inp, 200)
    for k in ("command", "file_path", "path", "pattern", "query", "url", "description",
              "skill", "prompt", "action", "notebook_path"):
        if inp.get(k):
            v = inp[k]
            if k in ("file_path", "path", "notebook_path") and isinstance(v, str):
                v = v.replace(ROOT + "/", "") if ROOT else v
            return short(v, 240)
    return short(json.dumps(inp, ensure_ascii=False), 200)


def result_text(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        out = []
        for c in content:
            if isinstance(c, dict):
                if c.get("type") == "text":
                    out.append(c.get("text", ""))
                elif c.get("type") == "image":
                    out.append("[ảnh]")
        return " ".join(out)
    return ""


# Quy doi token ve "don vi input" de so sanh muc dot (uoc tinh theo ti le gia Anthropic:
# doc cache 0,1x; ghi cache 5 phut 1,25x, 1 gio 2x; output 5x so voi input moi). Doi o day neu bang gia khac.
W_IN, W_CW5, W_CW1H, W_CR, W_OUT = 1.0, 1.25, 2.0, 0.1, 5.0
RECENT_S = 15 * 60     # "dang dot" = trong 15 phut gan nhat


def weigh(u):
    return u[1] * W_IN + u[2] * W_CW5 + u[3] * W_CW1H + u[4] * W_CR + u[5] * W_OUT


def k(n):
    return "%.1f tr" % (n / 1e6) if n >= 1e6 else "%d k" % round(n / 1e3) if n >= 1e3 else str(int(n))


def insights(tx, ctx, calls, tin, tcw, tcr, tout, wp, rec):
    """Vi sao tien trinh nay ton token — cau ngan, xep theo muc nang."""
    out = []
    tot = sum(wp) or 1
    if ctx >= 150_000:
        out.append(("ngu_canh", "Ngữ cảnh đang ~%s token: mỗi lượt gọi đọc lại cả khối đó. Nên giao phần việc "
                    "tiếp cho subagent / phiên mới, hoặc /compact." % k(ctx)))
    if wp[2] / tot >= 0.4 and calls >= 80:
        out.append(("goi_nhieu", "%d lượt gọi API trên ngữ cảnh to — đọc cache chiếm %d%% mức đốt. "
                    "Gom lệnh (một Bash làm nhiều việc), bớt vòng thử–sửa." % (calls, round(wp[2] * 100 / tot))))
    if wp[1] / tot >= 0.3 and tcw >= 200_000:
        out.append(("ghi_cache", "Ghi cache %s token (%d%% mức đốt): cache nguội sau lúc nghỉ/chờ lệnh dài, hoặc "
                    "ngữ cảnh đổi liên tục. Chờ lệnh nền bằng thông báo thay vì gọi kiểm tra lặp." %
                    (k(tcw), round(wp[1] * 100 / tot))))
    rc = sum(tx.res_chars.values())
    if rc >= 200_000:
        name, n = tx.res_chars.most_common(1)[0]
        if n / rc >= 0.4:
            out.append(("ket_qua", "Kết quả %s đổ vào ngữ cảnh %s ký tự (%d%% kết quả công cụ). Cắt output "
                        "(head/tail/grep), đọc file theo đoạn." % (name, k(n), round(n * 100 / rc))))
    if tx.n_images >= 10:
        out.append(("anh", "Đã đọc %d ảnh vào ngữ cảnh — ảnh tốn nhiều token; dùng tờ xem thử thu nhỏ / ghép lưới." %
                    tx.n_images))
    if tx.big_results and tx.big_results[0][0] >= 100_000:
        n, name, brief = tx.big_results[0]
        out.append(("lon", "Một kết quả %s dài %s ký tự: %s" % (name, k(n), brief)))
    if wp[3] / tot >= 0.35 and tout >= 50_000:
        out.append(("viet", "Viết ra %s token output (%d%% mức đốt) — file/kịch bản dài, hoặc viết lại nhiều lần." %
                    (k(tout), round(wp[3] * 100 / tot))))
    return [{"code": c, "text": t} for c, t in out[:4]]


IMG_EXT = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic")


def bash_gist(cmd):
    """'cd a && python3 tools/x.py --y' -> 'python3 x.py'."""
    parts = [p.strip() for p in re.split(r"&&|;|\|\|", cmd or "") if p.strip()]
    parts = [p for p in parts if not re.match(r"^(cd|export|set|source|[A-Z_]+=\S*)\b", p)] or parts
    words = (parts[0] if parts else "").split()
    out = []
    for w in words[:3]:
        out.append(os.path.basename(w) if "/" in w and not w.startswith("-") else w)
    return " ".join(out)


def activity(name, inp):
    """Mot dong tieng nguoi: nhan vien dang lam gi voi cong cu nay."""
    inp = inp if isinstance(inp, dict) else {}
    fp = inp.get("file_path") or inp.get("path") or inp.get("notebook_path") or ""
    base = os.path.basename(str(fp).rstrip("/")) if fp else ""
    if name == "Read":
        if base.lower().endswith(IMG_EXT):
            return "🖼️ Ngắm ảnh " + base
        return ("📄 Đọc PDF " if base.lower().endswith(".pdf") else "📖 Đọc ") + base
    if name == "Write":
        return "✍️ Viết " + base
    if name in ("Edit", "MultiEdit", "NotebookEdit"):
        return "✏️ Sửa " + base
    if name == "Bash":
        d = inp.get("description")
        return "⌨️ " + (short(d, 70) if d else "Chạy " + short(bash_gist(inp.get("command")), 50))
    if name in ("Grep", "Glob"):
        return "🔎 Lục tìm “%s”" % short(inp.get("pattern") or "", 40)
    if name == "WebSearch":
        return "🌐 Tra web: " + short(inp.get("query") or "", 60)
    if name == "WebFetch":
        return "🌐 Đọc trang " + (urlparse(inp.get("url") or "").netloc or "web")
    if name in ("Agent", "Task"):
        return "👥 Nhờ trợ lý: " + short(inp.get("description") or "", 60)
    if name == "Skill":
        return "📚 Mở cẩm nang " + str(inp.get("skill") or "")
    if name == "Monitor":
        return "👀 Canh chừng: " + short(inp.get("description") or bash_gist(inp.get("command")), 60)
    if name in ("TodoWrite", "mcp__ccd_turn__update_plan"):
        return "🗒️ Ghi sổ việc cần làm"
    if name == "mcp__ccd_turn__wrap_up":
        return "🎀 Gói ghém, báo cáo sếp"
    if name in ("ToolSearch",):
        return "🧰 Lục hộp đồ nghề"
    if name in ("SendMessage",):
        return "📨 Nhắn đồng nghiệp"
    if name in ("AskUserQuestion",):
        return "🙋 Hỏi ý sếp"
    if name in ("EnterPlanMode", "ExitPlanMode"):
        return "🗺️ Lên kế hoạch"
    if "Browser" in name or "chrome" in name:
        return "🧭 Lướt trình duyệt"
    if name.startswith("mcp__"):
        return "🔌 Gọi " + name.split("__")[-1].replace("_", " ")
    return "🔧 " + name


def first_sentence(text, n=90):
    t = re.sub(r"[*#`>]+", "", (text or "").replace(ROOT + "/", "") if ROOT else (text or "")).strip()
    t = re.split(r"(?<=[.!?。])\s|\n", t, maxsplit=1)[0] if t else ""
    return short(t, n)


class Transcript:
    """Doc dan mot file .jsonl: moi lan chi doc phan moi ghi them."""

    def __init__(self, path):
        self.path = path
        self.reset()

    def reset(self):
        self.off = 0
        self.tail = b""
        self.mtime = 0
        self.first_ts = self.last_ts = None
        self.prompt = ""
        self.title = ""
        self.cwd = ""
        self.model = ""
        self.n_tools = 0
        self.tool_counts = collections.Counter()
        self.n_errors = 0
        self.usage = {}                 # message id -> (ts, input moi, ghi cache 5m, ghi cache 1h, doc cache, output)
        self.res_chars = collections.Counter()  # ten cong cu -> so ky tu ket qua dua vao ngu canh
        self.n_images = 0               # so anh doc vao ngu canh
        self.big_results = []           # [(ky tu, ten, lenh)] ket qua lon nhat (giu 5)
        self.pending = {}               # tool_use_id -> (ten, mo ta) chua co ket qua
        self.acts = {}                  # tool_use_id -> dong "dang lam gi" (tieng nguoi)
        self.last = None                # su kien cuoi
        self.final = ""                 # cau tra loi cuoi (text)
        self.ended = False              # luot cuoi la assistant end_turn khong goi cong cu
        self.events = collections.deque(maxlen=MAX_EVENTS)
        self.notifs = {}                # task-id -> (status, ts)
        self.results = {}               # tool_use_id -> status cua ket qua Agent
        self.dept = None                # phong ban, doan mot lan khi da co viec giao
        self.agent_calls = {}           # tool_use_id -> {desc, type, bg} cua lenh goi Agent
        self.bg_calls = {}              # tool_use_id -> (ten, lenh) cua lenh chay nen
        self.bg = {}                    # task id -> {name, cmd, ts} lenh nen da khoi dong
        self.task_more = False
        self.giao_ts = 0                # luc user giao viec (tin nhan that) gan nhat
        self.hoi_ts = 0                 # luc assistant hoi y user / xin duyet gan nhat
        self.xong_ts = 0                # luc assistant ket thuc luot gan nhat (bao cao)
        self.ask_ids = set()            # tool_use_id cua cong cu hoi y dang cho tra loi
        self.hoi_text = ""              # dang hoi / xin duyet cai gi (chi tra ve o /api/agent, khong dua len man hinh chung)

    def update(self):
        try:
            st = os.stat(self.path)
        except OSError:
            return False
        if st.st_size < self.off:
            self.reset()
        if st.st_size == self.off and st.st_mtime == self.mtime:
            return False
        self.mtime = st.st_mtime
        # Doc tung khuc 8 MB: co transcript subagent nang ~1 GB (anh base64).
        with open(self.path, "rb") as f:
            f.seek(self.off)
            while True:
                data = f.read(8 << 20)
                if not data:
                    break
                self.off += len(data)
                lines = (self.tail + data).split(b"\n")
                self.tail = lines.pop()
                for line in lines:
                    if line:
                        self._line(line)
        return True

    # ------------------------------------------------------------- tung dong
    def _line(self, line):
        if line.startswith(b'{"type":"api-request'):
            return
        if b"<task-notification>" in line:
            ts = TS_RE.search(line)
            for m in NOTIF_RE.finditer(line):
                st = m.group(2).decode()
                # "completed" nhung agent chi tam dung cho viec nen cua chinh no
                if st == "completed" and m.group(3) and b"waiting on its own background" in m.group(3):
                    st = "waiting"
                self.notifs[m.group(1).decode()] = (st, parse_ts(ts.group(1).decode()) if ts else None)
            for m in MON_END_RE.finditer(line):
                self.notifs[m.group(1).decode()] = ("completed", parse_ts(ts.group(1).decode()) if ts else None)
        if len(line) > BIG_LINE:
            self._big_line(line)
            return
        try:
            d = json.loads(line)
        except ValueError:
            return
        t = d.get("type")
        if t == "custom-title":
            self.title = d.get("customTitle") or self.title
            return
        if t not in ("user", "assistant"):
            return
        ts = parse_ts(d.get("timestamp"))
        if ts:
            self.first_ts = self.first_ts or ts
            self.last_ts = ts
        self.cwd = d.get("cwd") or self.cwd
        msg = d.get("message") or {}
        content = msg.get("content")
        if t == "user":
            self._user(d, ts, content)
        else:
            self._assistant(msg, ts, content)

    def _big_line(self, line):
        ts = TS_RE.search(line)
        ts = parse_ts(ts.group(1).decode()) if ts else None
        if ts:
            self.first_ts = self.first_ts or ts
            self.last_ts = ts
        for m in re.finditer(rb'"tool_use_id":"([^"]+)"', line[:4096] + line[-4096:]):
            tid = m.group(1).decode()
            name, brief = self.pending.pop(tid, ("?", ""))
            self.acts.pop(tid, None)
            imgs = line.count(b'"type":"image"')
            self.n_images += imgs
            if not imgs:  # anh base64 khong tinh la "chu" — da dem rieng o n_images
                self._result_size(name, brief, len(line))
            self._event(ts, "ket_qua", name, "[kết quả lớn %d KB]" % (len(line) // 1024))
        self.ended = False

    def _user(self, d, ts, content):
        if isinstance(content, str):
            if content.startswith(("<", "[SYSTEM NOTIFICATION")):
                if "<task-notification>" in content:
                    self._event(ts, "bao", "", short(re.sub(r"<[^>]+>", " ", content), 300))
                return
            self._task(content)
            self._event(ts, "giao", "", short(content, 600))
            self.giao_ts = ts or self.giao_ts
            self.ended = False
            return
        if not isinstance(content, list):
            return
        tur = d.get("toolUseResult")
        for c in content:
            if not isinstance(c, dict):
                continue
            if c.get("type") == "text" and "<task-notification>" in c.get("text", ""):
                self._event(ts, "bao", "", short(re.sub(r"<[^>]+>", " ", c["text"]), 300))
            elif c.get("type") == "text" and not c.get("text", "").startswith(("<", "[SYSTEM NOTIFICATION")):
                self._task(c["text"])
                self._event(ts, "giao", "", short(c["text"], 600))
                self.giao_ts = ts or self.giao_ts
            elif c.get("type") == "tool_result":
                tid = c.get("tool_use_id")
                name, brief = self.pending.pop(tid, ("?", ""))
                self.acts.pop(tid, None)
                if tid in self.ask_ids:          # user da tra loi cau hoi / duyet ke hoach
                    self.ask_ids.discard(tid)
                    self.giao_ts = ts or self.giao_ts
                rc = c.get("content")
                if isinstance(rc, list):
                    self.n_images += sum(1 for x in rc if isinstance(x, dict) and x.get("type") == "image")
                self._result_size(name, brief, len(result_text(rc)))
                err = bool(c.get("is_error"))
                if err:
                    self.n_errors += 1
                if tid in self.bg_calls:
                    self._bg_started(tid, tur, result_text(c.get("content")), ts)
                if isinstance(tur, dict) and tur.get("status"):
                    self.results[tid] = tur["status"]
                elif err and name in ("Agent", "Task"):
                    self.results[tid] = "failed"
                self._event(ts, "loi" if err else "ket_qua", name,
                            short(re.sub(r"</?tool_use_error>", "", result_text(c.get("content"))), 300))
        self.ended = False

    def _result_size(self, name, brief, n):
        self.res_chars[name] += n
        if n >= 20000:
            self.big_results.append((n, name, short(brief, 120)))
            self.big_results = sorted(self.big_results, reverse=True)[:5]

    def _bg_started(self, tid, tur, text, ts):
        name, cmd, desc = self.bg_calls.pop(tid)
        task = None
        if isinstance(tur, dict):
            task = tur.get("backgroundTaskId") or tur.get("taskId")
        if not task:
            m = re.search(r"(?:background with ID: |\(task )([A-Za-z0-9_-]+)", text)
            task = m.group(1) if m else None
        if task:
            m = re.search(r"Output is being written to: (\S+?\.output)", text)
            self.bg[task] = {"name": name, "cmd": cmd, "desc": desc, "ts": ts, "out": m.group(1) if m else ""}

    def pending_bg(self, now):
        """Lenh nen da khoi dong ma chua co <task-notification> ket thuc (va file ket qua chua bao xong/bi dung)."""
        return [dict(v, id=k) for k, v in self.bg.items()
                if k not in self.notifs and v["ts"] and now - v["ts"] < BG_MAX_S and not v.get("probe")]

    def _task(self, text):
        """Viec duoc giao. Subagent cua Workflow: tin dau la loi dan cua harness,
        viec that nam o tin user ke tiep."""
        if not self.prompt:
            self.prompt = text
        elif self.prompt.startswith("[Workflow harness") and not self.task_more:
            self.task_more = True
            self.prompt = text + "\n\n— — —\n" + self.prompt

    def _assistant(self, msg, ts, content):
        self.model = msg.get("model") or self.model
        u = msg.get("usage")
        if isinstance(u, dict) and msg.get("id"):
            cw = u.get("cache_creation_input_tokens") or 0
            cc = u.get("cache_creation") if isinstance(u.get("cache_creation"), dict) else {}
            cw1h = cc.get("ephemeral_1h_input_tokens") or 0
            self.usage[msg["id"]] = (ts, u.get("input_tokens") or 0, max(0, cw - cw1h), cw1h,
                                     u.get("cache_read_input_tokens") or 0, u.get("output_tokens") or 0)
        used_tool = False
        for c in content if isinstance(content, list) else []:
            if not isinstance(c, dict):
                continue
            if c.get("type") == "text" and c.get("text", "").strip():
                self.final = c["text"]
                self._event(ts, "noi", "", short(c["text"], 600))
            elif c.get("type") == "tool_use":
                used_tool = True
                name = c.get("name", "?")
                brief = tool_brief(name, c.get("input"))
                self.n_tools += 1
                self.tool_counts[name] += 1
                self.pending[c.get("id")] = (name, brief)
                inp = c.get("input") if isinstance(c.get("input"), dict) else {}
                act = self.acts[c.get("id")] = activity(name, inp)
                if name in ASK_TOOLS:
                    self.ask_ids.add(c.get("id"))
                    self.hoi_ts = ts or self.hoi_ts
                    self.hoi_text = noi_dung_hoi(name, inp)
                elif (name == "mcp__ccd_turn__wrap_up" and inp.get("ask")) or \
                        (name == "mcp__ccd_session__start_session" and inp.get("initiation") == "offer"):
                    self.hoi_ts = ts or self.hoi_ts
                    self.hoi_text = noi_dung_hoi(name, inp)
                if name in ("Agent", "Task"):
                    self.agent_calls[c.get("id")] = {
                        "description": inp.get("description") or "",
                        "agentType": inp.get("subagent_type") or "general-purpose",
                        "requestShape": "background" if inp.get("run_in_background", True) else "foreground"}
                elif (name == "Bash" and inp.get("run_in_background")) or name == "Monitor":
                    self.bg_calls[c.get("id")] = (name, short(inp.get("command") or "", 200),
                                                  short(inp.get("description") or "", 120))
                self._event(ts, "goi", name, brief, act)
        if used_tool:
            self.ended = False
        elif msg.get("stop_reason") == "end_turn":
            self.ended = True
            self.xong_ts = ts or self.xong_ts

    def _event(self, ts, kind, name, text, act=""):
        ev = {"ts": ts, "kind": kind, "name": name, "text": text}
        if act:
            ev["act"] = act
        self.events.append(ev)
        if kind != "bao":
            self.last = ev

    # ---------------------------------------------------------------- so lieu
    def tokens(self):
        """(ngu canh luot cuoi, tong output)."""
        out = sum(u[5] for u in self.usage.values())
        ctx = 0
        if self.usage:
            u = list(self.usage.values())[-1]
            ctx = u[1] + u[2] + u[3] + u[4]
        return ctx, out


class Store:
    def __init__(self, days):
        self.days = days
        self.lock = threading.Lock()
        self.tx = {}          # duong dan -> Transcript
        self.meta = {}        # duong dan meta -> (mtime, dict)
        self.wf = {}          # duong dan wf json -> (mtime, dict)
        self.snapshot = {"agents": [], "leads": [], "sessions": [], "workflows": [], "scanned": 0}
        self.tx_machine = {}  # duong dan transcript -> may (de biet doc file ket qua lenh nen o dau)
        self.row_tx = {}
        self.scan_ms = 0
        self.kho = None       # Kho SQLite (gan o main)
        self.app = {}         # phien trong app Claude: cliSessionId -> {local, archived, title}
        self.pham_vi = "ytb" if ROOT else "tat_ca"  # "ytb" = chi du an goc (khoa cu giu nguyen); "tat_ca" = moi phien tren may
        self.nguon = {"codex": True, "antigravity": True}   # nguon ngoai Claude bat/tat (trang Cau hinh)
        self.cx = {}          # duong dan rollout Codex -> CodexTx
        self.ag = {}          # id hoi thoai Antigravity -> AgTx

    def get_tx(self, path):
        t = self.tx.get(path)
        if t is None:
            t = self.tx[path] = Transcript(path)
        t.update()
        return t

    def read_json(self, cache, path):
        try:
            m = os.path.getmtime(path)
        except OSError:
            return {}
        c = cache.get(path)
        if c and c[0] == m:
            return c[1]
        try:
            with open(path, encoding="utf-8") as f:
                d = json.load(f)
        except (OSError, ValueError):
            d = {}
        cache[path] = (m, d)
        return d

    def scan(self):
        if self.kho:
            try:
                ch = self.kho.cau_hinh()
                self.pham_vi = (ch.get("pham_vi") or "ytb") if ROOT else "tat_ca"   # khong co du an goc -> moi phien
                self.nguon = {"codex": True, "antigravity": True, **(ch.get("nguon") or {})}
            except Exception:
                pass
        with self.lock:
            self._scan()

    def _discover(self, cutoff):
        """Tim phien + subagent tren may nay va phien mo qua SSH (may_xa).
        Tra ve (sessions, agents): sessions[sid] = {machine, worktree, path, proj, adir};
        agents = [(sid, wf_id, jsonl, meta)]."""
        sessions, agents = {}, []

        def recent(p):
            try:
                return os.path.getmtime(p) >= cutoff
            except OSError:
                return False

        def agent_files(base):
            out = []
            for pat, wf in (("agent-*.jsonl", False), (os.path.join("subagents", "agent-*.jsonl"), False),
                            (os.path.join("subagents", "workflows", "*", "agent-*.jsonl"), True)):
                for jp in glob.glob(os.path.join(base, pat)):
                    if recent(jp):
                        out.append((os.path.basename(os.path.dirname(jp)) if wf else "", jp))
            return out

        tat_ca = self.pham_vi == "tat_ca"
        ask_proj = re.sub(r"[^A-Za-z0-9]", "-", ASK_CWD)   # phien cua Tro ly phan tich: khong dua vao van phong
        for proj in glob.glob(os.path.join(PROJECTS, "*")):
            pname = os.path.basename(proj)
            ytb = pname == PREFIX or pname.startswith(PREFIX + "--claude-worktrees-")
            if pname == ask_proj:
                continue
            if ytb or (tat_ca and not pname.startswith("ssh-")):
                worktree = pname[len(PREFIX + "--claude-worktrees-"):] if ytb and pname != PREFIX else ""
                sids = {os.path.basename(p)[:-6] for p in glob.glob(os.path.join(proj, "*.jsonl")) if recent(p)}
                found = {}
                for sd in glob.glob(os.path.join(proj, "*", "subagents")):
                    sid = os.path.basename(os.path.dirname(sd))
                    fs = agent_files(os.path.dirname(sd))
                    if fs:
                        found[sid] = fs
                        sids.add(sid)
                for sid in sids:
                    for wf, jp in found.get(sid, []):
                        self.tx_machine[jp] = HOST
                    self.tx_machine[os.path.join(proj, sid + ".jsonl")] = HOST
                    sessions[sid] = {"machine": HOST, "worktree": worktree, "proj": proj, "ytb": ytb,
                                     "path": os.path.join(proj, sid + ".jsonl")}
                    for wf, jp in found.get(sid, []):
                        agents.append((sid, wf, jp))
            elif pname.startswith("ssh-"):
                sid = pname[4:]
                sp = os.path.join(proj, sid + ".jsonl")
                fs = agent_files(proj) + agent_files(os.path.join(proj, sid))
                if not fs and not recent(sp):
                    continue
                cwd = self.get_tx(sp).cwd if os.path.exists(sp) else ""
                if not cwd:  # phien chi con agent: lay cwd tu agent dau tien
                    cwd = self.get_tx(fs[0][1]).cwd if fs else ""
                ytb = trong_goc(cwd)
                if not ytb and not tat_ca:
                    continue  # phien SSH cua du an khac
                m = re.search(r"/\.claude/worktrees/([^/]+)", cwd)
                sessions[sid] = {"machine": MINI, "worktree": m.group(1) if m else "", "proj": proj, "path": sp, "ytb": ytb}
                self.tx_machine[sp] = MINI
                for wf, jp in fs:
                    self.tx_machine[jp] = MINI
                for wf, jp in fs:
                    agents.append((sid, wf, jp))
        return sessions, agents

    def _scan(self):
        t0 = time.time()
        now = time.time()
        sessions, found = self._discover(now - self.days * 86400)
        # phien da luu tru (archived) trong app Claude: khong theo doi nua (ca tro ly cua no)
        app = self.app = phien_app()
        luu_tru = {sid for sid in sessions if app.get(sid, {}).get("archived")}
        if luu_tru:
            sessions = {k: v for k, v in sessions.items() if k not in luu_tru}
            found = [x for x in found if x[0] not in luu_tru]

        # phien chinh (truong phien)
        for sid, sv in sessions.items():
            sv["tx"] = self.get_tx(sv["path"]) if os.path.exists(sv["path"]) else None

        wfs = []
        for sid, sv in sessions.items():
            for wp in glob.glob(os.path.join(sv["proj"], sid, "workflows", "wf_*.json")):
                d = self.read_json(self.wf, wp)
                if not d:
                    continue
                st = d.get("startTime")
                wfs.append({
                    "id": d.get("runId") or os.path.basename(wp)[:-5], "sid": sid,
                    "name": d.get("workflowName") or "", "status": d.get("status") or "",
                    "agentCount": d.get("agentCount"),
                    "start": parse_ts(st) if isinstance(st, str) else (st or 0) / 1000 or None,
                    "durationMs": d.get("durationMs"), "tokens": d.get("totalTokens"),
                    "phases": [p.get("title") for p in d.get("phases") or [] if isinstance(p, dict)],
                })
        wf_status = {w["id"]: w["status"] for w in wfs}

        by_id, rows = {}, []
        for sid, wf_id, jp in found:
            meta = dict(self.read_json(self.meta, jp[:-6] + ".meta.json"))
            tx = self.get_tx(jp)
            aid = os.path.basename(jp)[len("agent-"):-len(".jsonl")]
            by_id[aid] = tx
            rows.append([aid, sid, wf_id, meta, tx])
        # Phien SSH: meta chi co toolUseId -> lay loai + mo ta tu lenh goi Agent o noi goi
        for row in rows:
            aid, sid, wf_id, meta, tx = row
            if meta.get("agentType"):
                continue
            tu = meta.get("toolUseId")
            for cand in (by_id.get(meta.get("parentAgentId")), (sessions.get(sid) or {}).get("tx"), *by_id.values()):
                if cand is not None and tu in cand.agent_calls:
                    meta.update(cand.agent_calls[tu])
                    if cand is not (sessions.get(sid) or {}).get("tx") and cand in by_id.values():
                        meta.setdefault("parentAgentId", next(k for k, v in by_id.items() if v is cand))
                    break

        sess_dept = {}
        for sid, sv in sessions.items():
            t = sv.get("tx")
            if t is not None and not sv.get("ytb", True):
                t.dept = "@" + du_an(t.cwd)          # phien ngoai xuong: moi du an mot phong
            elif t is not None and t.dept is None and t.prompt:
                t.dept = guess_dept(t.title, t.prompt[:4000])
            sess_dept[sid] = (t.dept if t is not None else "") or ""

        self.row_tx = {}
        out, feed = [], []
        for aid, sid, wf_id, meta, tx in rows:
            sess = sessions.get(sid) or {}
            if not sess.get("ytb", True):
                tx.dept = sess_dept.get(sid) or "@" + du_an(tx.cwd)
            elif tx.dept is None and tx.prompt and (tx.task_more or not tx.prompt.startswith("[Workflow")):
                tx.dept = guess_dept(meta.get("description"), tx.prompt[:4000])
            parent_tx = by_id.get(meta.get("parentAgentId")) or sess.get("tx")
            status, detail = self.status(aid, meta, tx, parent_tx, wf_status.get(wf_id), now)
            row = self.row(aid, tx, status, detail, now)
            row.update({
                "kind": "agent", "sid": sid, "machine": sess.get("machine", HOST),
                "worktree": sess.get("worktree", ""), "workflow": wf_id,
                "phase": meta.get("workflowPhase") or "",
                "type": meta.get("agentType") or "?", "desc": meta.get("description") or "",
                "parent": meta.get("parentAgentId") or "", "depth": meta.get("spawnDepth") or 1,
                "background": meta.get("requestShape") == "background", "fork": bool(meta.get("isFork")),
                "model": tx.model or meta.get("model") or "",
                "dept": tx.dept or sess_dept.get(sid) or "Tổng hợp", "cli": "claude",
            })
            out.append(row)
            self.row_tx[aid] = tx
            for ev in list(tx.events)[-12:]:
                if ev["kind"] in ("giao", "goi", "noi", "loi"):
                    feed.append(dict(ev, aid=aid))

        # truong phien: chinh phien Claude Code, dang lam hoac dang cho lenh nen / tro ly
        active_by_sid = collections.Counter(a["sid"] for a in out if a["status"] in ("chay", "cho"))
        # phien khong ro kenh (hoac chi thay pipeline/TTS) -> lay phong ban so dong cua tro ly
        for sid in sessions:
            if sess_dept.get(sid) in ("", "Kỹ thuật"):
                c = collections.Counter(a["dept"] for a in out if a["sid"] == sid
                                        and a["dept"] not in ("Tổng hợp", "Kỹ thuật"))
                if c:
                    sess_dept[sid] = c.most_common(1)[0][0]
        leads = []
        for sid, sv in sessions.items():
            t = sv.get("tx")
            if t is None:
                continue
            status, detail = self.lead_status(t, active_by_sid[sid], now)
            row = self.row(sid, t, status, detail, now, active_by_sid[sid])
            row.update({
                "kind": "lead", "sid": sid, "machine": sv["machine"], "worktree": sv["worktree"],
                "workflow": "", "phase": "", "type": "lead", "parent": "", "depth": 0,
                "background": False, "fork": False, "model": t.model,
                "desc": app.get(sid, {}).get("title") or t.title or short(t.prompt, 90) or sid[:8],
                "dept": sess_dept.get(sid) or "Tổng hợp", "helpers": active_by_sid[sid], "cli": "claude",
                # phong giam doc: dang cho user duyet / tra loi? moc giao viec, moc bao cao
                "duyet": bool(t.ask_ids) or (status == "nghi" and t.hoi_ts > t.giao_ts),
                "giaoTs": t.giao_ts, "xongTs": t.xong_ts,
            })
            leads.append(row)
            self.row_tx[sid] = t
            if status in ("chay", "cho"):
                evs = list(t.events)
                for ev in evs[-8:]:
                    if ev["kind"] in ("goi", "noi", "loi"):
                        feed.append(dict(ev, aid=sid))
                # lenh cua sep (tin user giao viec) gan nhat — bang tin 3D hien "Sep giao viec cho ..."
                for ev in [e for e in evs[-60:] if e["kind"] == "giao"][-2:]:
                    feed.append(dict(ev, aid=sid))
        # phien Codex: moi phien la mot truong phong (cli "codex"), cung luat pham vi voi phien Claude
        if self.nguon.get("codex"):
            names, nhap = codex.ten_luong(), codex.phien_nhap()
            for path in codex.tim_phien(now - self.days * 86400):
                t = self.cx.get(path) or self.cx.setdefault(path, codex.CodexTx(path))
                t.update()
                if t.sid in nhap or not t.first_ts:
                    continue                              # phien nhap tu Claude: da dem o phia Claude
                ytb = trong_goc(t.cwd)
                if not ytb and self.pham_vi != "tat_ca":
                    continue
                status, detail = codex.trang_thai(t, now, ACTIVE_S, QUIET_S)
                rid = "cx-" + t.sid
                title = codex.tieu_de(t, names)
                if ytb:
                    t.dept = t.dept or ("Kỹ thuật" if any(t.cwd.startswith(g) for g in GOC_THEM) else guess_dept(title, t.prompt[:4000]) or "Tổng hợp")
                else:
                    t.dept = "@" + du_an(t.cwd)
                row = self.row(rid, t, status, detail, now)
                row.update({
                    "kind": "lead", "sid": rid, "machine": HOST, "worktree": "", "workflow": "", "phase": "", "type": "codex",
                    "parent": "", "depth": 0, "background": False, "fork": False, "model": t.model, "desc": title, "dept": t.dept,
                    "helpers": 0, "cli": "codex", "duyet": bool(t.ask_ids) or (status == "nghi" and t.hoi_ts > t.giao_ts),
                    "giaoTs": t.giao_ts, "xongTs": t.xong_ts,
                })
                leads.append(row)
                self.row_tx[rid] = t
                evs = list(t.events)
                for ev in [e for e in evs[-60:] if e["kind"] == "giao"][-2:] + ([e for e in evs[-8:] if e["kind"] in ("goi", "noi", "loi")] if status in ("chay", "cho") else []):
                    feed.append(dict(ev, aid=rid))
        # Antigravity: hoi thoai trong ung dung = truong phong; lenh agy + phien con = tro ly (gan vao phien Claude da goi neu co)
        if self.nguon.get("antigravity"):
            lead_ids = {l["id"] for l in leads}
            for r in antigravity.doc_tom_tat(now - self.days * 86400):
                cid = r["conversation_id"]
                t = self.ag.get(cid)
                if t:
                    t.cap_nhat(r)
                else:
                    t = self.ag[cid] = antigravity.AgTx(r)
                enc, csid = antigravity.phien_claude_goi(t.cwd)
                if csid in luu_tru:
                    continue                              # lenh agy cua phien Claude da luu tru
                ytb = trong_goc(t.cwd) or bool(enc and enc.startswith(PREFIX))
                if not ytb and self.pham_vi != "tat_ca":
                    continue
                tro_ly = antigravity.la_tro_ly(r)
                status, detail = antigravity.trang_thai(t, now, ACTIVE_S, QUIET_S, tro_ly)
                rid = "ag-" + cid
                cha = csid if csid in lead_ids else ("ag-" + r["parent_conversation_id"] if r.get("parent_conversation_id") else "")
                if ytb:
                    t.dept = sess_dept.get(csid) or t.dept or guess_dept(t.title, t.prompt[:2000]) or "Kỹ thuật"
                else:
                    t.dept = sess_dept.get(csid) or "@" + (du_an(t.cwd) if not enc else "Antigravity")
                row = self.row(rid, t, status, detail, now)
                row.update({
                    "kind": "agent" if tro_ly else "lead", "sid": cha or rid, "machine": HOST, "worktree": "", "workflow": "",
                    "phase": "", "type": "antigravity" if tro_ly else "antigravity_lead", "parent": cha, "depth": 1 if tro_ly else 0,
                    "background": tro_ly, "fork": False, "model": "gemini", "desc": t.title or "Antigravity", "dept": t.dept,
                    "cli": "antigravity", "helpers": 0, "duyet": False, "giaoTs": t.giao_ts, "xongTs": t.xong_ts,
                })
                (out if tro_ly else leads).append(row)
                self.row_tx[rid] = t
                for ev in list(t.events)[-2:]:
                    feed.append(dict(ev, aid=rid))
        feed.sort(key=lambda e: e["ts"] or 0, reverse=True)

        sess_out = [{"sid": l["sid"], "worktree": l["worktree"], "machine": l["machine"], "title": l["desc"],
                     "last": l["last"], "mtime": l["mtime"], "live": now - l["mtime"] < ACTIVE_S}
                    for l in leads]
        # lenh nen dang chay: moi lenh mot "may chay nen" rieng trong phong cua chu no
        tasks = [{"id": b["id"], "owner": r["id"], "ownerDesc": r["desc"], "ownerKind": r["kind"],
                  "dept": r["dept"], "machine": r["machine"], "sid": r["sid"], **b}
                 for r in out + leads for b in r["bg"]]
        snap = {"phamVi": self.pham_vi, "agents": out, "leads": leads, "tasks": tasks, "sessions": sess_out, "workflows": wfs, "scanned": now,
                "feed": [dict(e, text=short(e["text"], 160)) for e in feed[:80]],
                "avatars": sorted(f[:-4] for f in os.listdir(os.path.join(HERE, "avatar")) if re.fullmatch(r"nv_\d+\.png", f))
                if os.path.isdir(os.path.join(HERE, "avatar")) else [],
                "logos": sorted(f[:-4] for f in os.listdir(LOGO_RIENG) if f.endswith(".png") and not f.startswith("xuong"))
                if os.path.isdir(LOGO_RIENG) else [],
                "host": HOST, "machines": sorted({s["machine"] for s in sessions.values()}),
                "days": self.days, "root": ROOT}
        if self.kho:
            try:
                self.kho.ghi(snap)
                snap["shelves"] = self.kho.ke_ho_so()
                snap["giamdoc"] = self.kho.giam_doc()
            except Exception as e:  # DB loi khong duoc lam chet van phong
                print("! loi ghi kho:", repr(e), file=sys.stderr)
        # don bo dem: transcript / phien Codex / hoi thoai Antigravity cu hon khung theo doi (app chay nhieu ngay khong phinh)
        han = now - self.days * 86400
        for kho_dem in (self.tx, self.cx, self.ag):
            for k in [k for k, t in kho_dem.items() if t.mtime and t.mtime < han]:
                del kho_dem[k]
        self.scan_ms = int((time.time() - t0) * 1000)
        snap["scanMs"] = self.scan_ms
        self.snapshot = snap

    @staticmethod
    def act_line(tx, status, detail, now, helpers=0):
        """Dong "dang lam gi" de doc, khong phai cau lenh tho."""
        bg = tx.pending_bg(now)
        if status == "chay":
            if tx.acts:
                return list(tx.acts.values())[-1]
            return "💬 Đang soạn câu trả lời" if (tx.last or {}).get("kind") == "noi" else "🤔 Đang vắt óc suy nghĩ…"
        if status == "cho":
            if bg:
                b = bg[-1]
                return "☕ Đợi máy chạy: " + short(b.get("desc") or bash_gist(b["cmd"]), 60)
            if helpers:
                return "🍵 Đợi %d trợ lý nộp bài" % helpers
            if tx.acts:
                return "⏳ " + list(tx.acts.values())[-1].split(" ", 1)[-1] + " (hơi lâu…)"
            return "😶 Ngồi im, chưa thấy động tĩnh"
        if status == "xong":
            return "✅ " + (first_sentence(tx.final) or "Đã nộp bài")
        if status == "loi":
            return "🤕 Vấp cỏ: " + (first_sentence(tx.final, 70) or "agent báo lỗi")
        if status == "dung":
            return "🛑 Bị gọi về giữa chừng"
        if status == "bo_do":
            return "👻 Lặn mất tăm — " + detail
        return "😴 Chờ sếp giao việc"

    @classmethod
    def row(cls, rid, tx, status, detail, now, helpers=0):
        ctx, outtok = tx.tokens()
        last = tx.last or {}
        return {
            "id": rid, "status": status, "detail": detail,
            "act": cls.act_line(tx, status, detail, now, helpers),
            "start": tx.first_ts, "last": tx.last_ts, "mtime": tx.mtime,
            "tools": tx.n_tools, "errors": tx.n_errors, "ctx": ctx, "out": outtok,
            "lastKind": last.get("kind"), "lastName": last.get("name"),
            "lastText": short(last.get("text", ""), 220),
            "pending": [n for n, _ in tx.pending.values()][-3:],
            "bg": [{"id": b["id"], "name": b["name"], "cmd": b["cmd"], "desc": b.get("desc", ""), "ts": b["ts"],
                    "gist": b.get("desc") or bash_gist(b["cmd"])}
                   for b in tx.pending_bg(now)],
            "topTools": tx.tool_counts.most_common(4),
        }

    @staticmethod
    def bg_note(bg):
        b = bg[-1]
        more = " (+%d lệnh nữa)" % (len(bg) - 1) if len(bg) > 1 else ""
        return "chờ lệnh nền %s — %s%s" % (b["name"], short(b.get("desc") or b["cmd"], 70), more)

    @classmethod
    def lead_status(cls, tx, n_helpers, now):
        """Truong phien: chay | cho | nghi."""
        age = now - tx.mtime
        bg = tx.pending_bg(now)
        if age < ACTIVE_S and not tx.ended:
            if tx.pending:
                return "chay", "đang chạy " + ", ".join(n for n, _ in list(tx.pending.values())[-2:])
            return "chay", "đang nghĩ / trao đổi"
        if bg or n_helpers:
            parts = []
            if bg:
                parts.append(cls.bg_note(bg))
            if n_helpers:
                parts.append("chờ %d trợ lý (subagent)" % n_helpers)
            return "cho", " · ".join(parts)
        if not tx.ended and age < QUIET_S:
            # luot chua xong ma im: dang nghi lau, hoac lenh chay truoc mat (TTS, render) dai
            if tx.pending:
                return "cho", "chờ %s (im %d phút)" % (", ".join(n for n, _ in list(tx.pending.values())[-2:]), age // 60)
            return "chay", "đang nghĩ (im %d phút)" % (age // 60)
        return "nghi", "nghỉ — chờ user"

    @classmethod
    def status(cls, aid, meta, tx, parent_tx, wf_st, now):
        """(trang thai, ghi chu). Trang thai: chay | cho | xong | loi | dung | bo_do."""
        age = now - tx.mtime
        bg = tx.pending_bg(now)
        if age < ACTIVE_S and not tx.ended:
            if tx.pending:
                return "chay", "đang chạy " + ", ".join(n for n, _ in list(tx.pending.values())[-2:])
            return "chay", "đang nghĩ / ghi"
        st = None
        if parent_tx is not None:
            n = parent_tx.notifs.get(aid)
            if n:
                st = n[0]
            elif meta.get("toolUseId") in parent_tx.results:
                st = parent_tx.results[meta["toolUseId"]]
                if st == "async_launched":
                    st = None
        if not st and meta.get("finished"):
            st = "completed"
        if not st and wf_st and wf_st != "running":
            st = "completed" if tx.ended else wf_st
        if st == "completed":
            return "xong", ""
        if st == "waiting" or (bg and st is None):
            return "cho", (cls.bg_note(bg) if bg else "chờ lệnh nền của chính nó") + " (im %d phút)" % (age // 60)
        if st == "failed":
            return "loi", "agent báo lỗi"
        if st in ("killed", "stopped", "cancelled"):
            return "dung", "bị dừng (" + st + ")"
        if tx.ended:
            return "xong", "đã trả lời xong, nơi gọi chưa ghi nhận"
        if age < QUIET_S:
            if tx.pending:
                return "cho", "chờ " + ", ".join(n for n, _ in list(tx.pending.values())[-2:]) + \
                    " (im %d phút)" % (age // 60)
            return "cho", "im %d phút" % (age // 60)
        return "bo_do", "không ghi gì %s, không thấy kết thúc" % (
            "%d phút" % (age // 60) if age < 7200 else "%d giờ" % (age // 3600))

    def detail(self, rid):
        row = next((a for a in self.snapshot["agents"] + self.snapshot.get("leads", []) if a["id"] == rid), None)
        tx = getattr(self, "row_tx", {}).get(rid)
        if not row or not tx:
            return None
        return {"agent": row, "prompt": tx.prompt, "final": tx.final if row["status"] != "chay" else "",
                "events": list(tx.events), "toolCounts": tx.tool_counts.most_common(),
                "path": tx.path, "cwd": getattr(tx, "cwd", ""), "title": getattr(tx, "title", ""),
                # link mo dung phien trong app Claude (phien chinh cua truong phong / phien cua tro ly)
                "appLink": (APP_LINK + self.app[row["sid"]]["local"]) if self.app.get(row.get("sid"), {}).get("local") else "",
                # dang cho duyet cai gi (rieng tu: chi khi bam xem ho so)
                "hoi": (getattr(tx, "hoi_text", "") or (tx.final if row.get("duyet") else "")) if row.get("duyet") else ""}

    # ------------------------------------------------------------ phan tich token
    def token_report(self):
        """Tien trinh (subagent + truong phien) dot token nhieu nhat, kem chan doan."""
        now = time.time()
        since = now - self.days * 86400
        rows = self.snapshot["agents"] + self.snapshot.get("leads", [])
        procs, hourly = [], collections.Counter()
        T = {"in": 0, "cw": 0, "cr": 0, "out": 0, "w": 0.0, "recent": 0.0, "calls": 0, "recentCalls": 0}
        for r in rows:
            tx = self.row_tx.get(r["id"])
            if tx is None or not tx.usage:
                continue
            tin = tcw = tcr = tout = 0
            wp = [0.0, 0.0, 0.0, 0.0]          # quy doi: input moi, ghi cache, doc cache, output
            rec = 0.0
            rec_calls = calls = 0
            spark = [0.0] * 18                 # 3 gio gan nhat, 10 phut mot cot
            for u in tx.usage.values():
                ts = u[0] or 0
                if ts < since:
                    continue
                calls += 1
                w = weigh(u)
                tin += u[1]; tcw += u[2] + u[3]; tcr += u[4]; tout += u[5]
                wp[0] += u[1] * W_IN; wp[1] += u[2] * W_CW5 + u[3] * W_CW1H
                wp[2] += u[4] * W_CR; wp[3] += u[5] * W_OUT
                if now - ts <= RECENT_S:
                    rec += w
                    rec_calls += 1
                b = int((now - ts) // 600)
                if 0 <= b < 18:
                    spark[17 - b] += w
                if now - ts < 86400:
                    hourly[int(ts // 3600) * 3600] += w
            if not calls:
                continue
            ctx, _ = tx.tokens()
            weighted = sum(wp)
            for k, v in (("in", tin), ("cw", tcw), ("cr", tcr), ("out", tout), ("w", weighted),
                         ("recent", rec), ("calls", calls), ("recentCalls", rec_calls)):
                T[k] += v
            procs.append({
                "id": r["id"], "kind": r["kind"], "desc": r["desc"], "type": r["type"], "dept": r["dept"],
                "machine": r["machine"], "status": r["status"], "sid": r["sid"], "model": r.get("model", ""),
                "in": tin, "cw": tcw, "cr": tcr, "out": tout, "parts": [round(x) for x in wp],
                "weighted": round(weighted), "recent": round(rec), "recentCalls": rec_calls, "calls": calls,
                "ctx": ctx, "spark": [round(x) for x in spark], "last": r["last"],
                "insights": insights(tx, ctx, calls, tin, tcw, tcr, tout, wp, rec),
            })
        procs.sort(key=lambda p: p["weighted"], reverse=True)

        def group(key):
            g = collections.defaultdict(lambda: {"w": 0, "recent": 0, "n": 0})
            for p in procs:
                k = key(p)
                g[k]["w"] += p["weighted"]; g[k]["recent"] += p["recent"]; g[k]["n"] += 1
            return sorted(({"key": k, **v} for k, v in g.items()), key=lambda x: x["w"], reverse=True)

        h0 = int(now // 3600) * 3600
        return {
            "now": now, "days": self.days, "recentMin": RECENT_S // 60,
            "weights": {"in": W_IN, "cw5": W_CW5, "cw1h": W_CW1H, "cr": W_CR, "out": W_OUT},
            "total": {k: round(v) for k, v in T.items()},
            "hourly": [{"t": h0 - i * 3600, "w": round(hourly.get(h0 - i * 3600, 0))} for i in range(23, -1, -1)],
            "procs": procs[:60],
            "byDept": group(lambda p: p["dept"]),
            "byType": group(lambda p: "lead" if p["kind"] == "lead" else p["type"]),
            "byMachine": group(lambda p: p["machine"]),
        }


def read_tails(machine, paths):
    """Duoi (300 byte) cac file ket qua lenh nen: may nay doc thang, may xa doc qua mot lenh SSH (chi doc).
    Tra ve {duong dan: chuoi | "MISSING"}; khong ket noi duoc thi {}."""
    out = {}
    if machine == HOST:
        for p in paths:
            try:
                with open(p, "rb") as f:
                    f.seek(max(0, os.path.getsize(p) - 300))
                    out[p] = f.read().decode(errors="replace")
            except OSError:
                out[p] = "MISSING"
        return out
    if machine != MINI or not SSH_HOST:
        return out
    script = "".join("printf '\\n@@%%s\\n' %s; tail -c 300 %s 2>/dev/null || printf MISSING; " % (shlex.quote(p), shlex.quote(p))
                     for p in paths)
    try:
        r = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=6", SSH_HOST, script],
                           capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return out
    if r.returncode not in (0, 1):
        return out
    for chunk in r.stdout.split("\n@@")[1:]:
        p, _, body = chunk.partition("\n")
        out[p] = body
    return out


def probe_bg(store):
    """Lenh nen nghi treo: transcript khong ghi thong bao ket thuc (vd. bi dung tu giao dien, phien da tat).
    Doc duoi file .output — '[exited with code N]' = xong, '[killed]' = bi dung, mat file = mat dau."""
    now = time.time()
    want = collections.defaultdict(list)
    with store.lock:
        for path, tx in store.tx.items():
            m = store.tx_machine.get(path)
            for tid, b in tx.bg.items():
                if (m and b.get("out") and not b.get("probe") and tid not in tx.notifs and b.get("ts")
                        and PROBE_AFTER_S < now - b["ts"] < BG_MAX_S):
                    want[m].append(b)
    for m, items in want.items():
        tails = read_tails(m, sorted({b["out"] for b in items}))
        with store.lock:
            for b in items:
                t = tails.get(b["out"])
                if t is None:
                    continue
                if t.strip() == "MISSING":
                    b["probe"] = "mat_dau"
                    continue
                e = END_RE.search(t.strip())
                if e:
                    b["probe"] = "bi_dung" if e.group(1) == "killed" else "xong"
                    b["code"] = int(e.group(2)) if e.group(2) else None


def scanner(store, every):
    last_probe = 0
    while True:
        try:
            store.scan()
        except Exception as e:  # khong de luong quet chet vi mot file la
            print("! loi quet:", repr(e), file=sys.stderr)
        if time.time() - last_probe > PROBE_EVERY_S:
            last_probe = time.time()
            try:
                probe_bg(store)
            except Exception as e:
                print("! loi kiem lenh nen:", repr(e), file=sys.stderr)
        time.sleep(every)


# ------------------------------------------------------------------ tro ly (Claude CLI)
# Tro ly phan tich: goi `claude -p` (CLI da dang nhap tren may nay), chi cho Read/Grep/Glob,
# chay o thu muc rieng de phien cua tro ly khong lot vao van phong.
CLAUDE_BIN = os.environ.get("THEO_DOI_CLAUDE") or shutil.which("claude") or os.path.expanduser("~/.local/bin/claude")
ASK_CWD = os.path.expanduser("~/.cache/theo_doi_subagent")
ASK_MODELS = ("haiku", "sonnet", "opus")
ASK_TIMEOUT_S = 300
ASK_BUDGET_USD = 1.0
ASK_SLOTS = threading.Semaphore(2)
ASK_SYSTEM = (
    "Bạn là Trợ lý phân tích của trang 'Văn phòng AI' — trang theo dõi các phiên Claude Code (và Codex, Antigravity), subagent và "
    "lệnh nền của người dùng (mỗi dự án / thư mục con là một phòng ban). Bạn CHỈ ĐỌC: không sửa "
    "file, không chạy lệnh, không đề nghị tự làm thay. Trả lời bằng tiếng Việt, ngắn, đi thẳng vào kết luận, dùng gạch "
    "đầu dòng, gọi đúng tên tiến trình và nêu con số. 'Token quy đổi' là số ước tính để so sánh (đọc cache ×0,1, ghi "
    "cache ×1,25–2, output ×5 so với input mới), không phải tiền. Đề xuất phải làm được ngay (giao phần việc cho "
    "subagent, mở phiên mới hoặc /compact khi ngữ cảnh to, cắt output Bash, đọc file theo đoạn, giảm/ghép ảnh, chờ lệnh "
    "nền bằng thông báo thay vì gọi kiểm tra lặp). Cần chi tiết hơn thì được Read/Grep file transcript .jsonl theo "
    "đường dẫn có trong dữ liệu — file rất lớn: luôn Grep có giới hạn kết quả hoặc Read theo offset/limit, không đọc cả file."
)


def clean_env():
    """Moi truong cho CLI: bo bien cua phien Claude Code/app Claude (khi app nay duoc mo tu mot phien
    Claude, cac bien do lam CLI bo qua dang nhap trong Keychain va bao 'OAuth session expired')."""
    return {k: v for k, v in os.environ.items()
            if not (k.startswith(("CLAUDE", "ANTHROPIC_")) or (k.startswith("USE_") and k.endswith("_OAUTH")))}


def ask_context(store, scope):
    """Du lieu gon dua cho tro ly (JSON). scope: 'tong' hoac id tien trinh."""
    snap = store.snapshot
    rep = store.token_report()
    rows = snap["agents"] + snap.get("leads", [])

    def brief(r):
        return {k: r.get(k) for k in ("id", "kind", "desc", "type", "dept", "machine", "status", "detail",
                                       "tools", "errors", "ctx", "out") if r.get(k) not in (None, "", [])}

    def tp(p):
        return {k: p[k] for k in ("id", "desc", "kind", "type", "dept", "machine", "status", "weighted", "recent",
                                  "calls", "ctx", "in", "cw", "cr", "out")} | {
            "insights": [i["text"] for i in p["insights"]]}

    if scope != "tong":
        r = next((x for x in rows if x["id"] == scope), None)
        tx = store.row_tx.get(scope)
        if not r or tx is None:
            return None
        p = next((x for x in rep["procs"] if x["id"] == scope), None)
        return {
            "pham_vi": "mot_tien_trinh", "luc": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "tien_trinh": brief(r) | {"bat_dau": r.get("start"), "cuoi": r.get("last"),
                                      "lenh_nen_dang_cho": r.get("bg")},
            "token": tp(p) if p else None,
            "viec_duoc_giao": short(tx.prompt, 3000),
            "bao_cao_cuoi": short(tx.final, 1500),
            "cong_cu_da_goi": tx.tool_counts.most_common(12),
            "ky_tu_ket_qua_theo_cong_cu": tx.res_chars.most_common(6),
            "so_anh_da_doc": tx.n_images,
            "ket_qua_lon_nhat": [{"ky_tu": n, "cong_cu": nm, "lenh": b} for n, nm, b in tx.big_results],
            "nhat_ky_gan_nhat": [{"luc": datetime.fromtimestamp(e["ts"]).strftime("%H:%M:%S") if e["ts"] else "",
                                  "loai": e["kind"], "cong_cu": e["name"], "noi_dung": short(e["text"], 220)}
                                 for e in list(tx.events)[-60:]],
            "transcript": tx.path,
        }
    active = [brief(r) for r in rows if r["status"] in ("chay", "cho", "bo_do", "loi", "dung")]
    return {
        "pham_vi": "toan_xuong", "luc": datetime.now().strftime("%Y-%m-%d %H:%M"), "so_ngay": store.days,
        "may": snap.get("machines"),
        "dang_hoat_dong_hoac_su_co": active[:40],
        "lenh_nen_dang_chay": [{k: t.get(k) for k in ("desc", "cmd", "ownerDesc", "dept", "machine", "ts")}
                               for t in snap.get("tasks", [])],
        "token_tong": rep["total"], "token_theo_gio_24h": [h["w"] for h in rep["hourly"]],
        "dot_nhieu_nhat": [tp(p) for p in rep["procs"][:15]],
        "theo_phong_ban": rep["byDept"][:10], "theo_vai_tro": rep["byType"][:8], "theo_may": rep["byMachine"],
        "thu_muc_transcript": PROJECTS,
    }


def run_ask(handler, body):
    """Goi claude -p, tra ve tung dong JSON: text / tool / done."""
    def emit(obj):
        handler.wfile.write((json.dumps(obj, ensure_ascii=False) + "\n").encode())
        handler.wfile.flush()

    q = (body.get("q") or "").strip()
    scope = body.get("scope") or "tong"
    model = body.get("model") if body.get("model") in ASK_MODELS else "sonnet"
    session = body.get("session") or ""
    if not q:
        return handler.send(400, {"error": "chưa có câu hỏi"})
    if session and not re.fullmatch(r"[0-9a-f-]{36}", session):
        return handler.send(400, {"error": "phiên không hợp lệ"})
    if not os.path.exists(CLAUDE_BIN):
        return handler.send(500, {"error": "Không thấy Claude CLI (%s). Cài Claude Code CLI hoặc đặt THEO_DOI_CLAUDE." % CLAUDE_BIN})
    if not ASK_SLOTS.acquire(blocking=False):
        return handler.send(429, {"error": "Trợ lý đang trả lời 2 câu khác, chờ chút rồi hỏi lại."})
    proc = None
    try:
        if session:
            prompt = q  # hoi tiep: tro ly da co du lieu o luot truoc
        else:
            with handler.store.lock:
                ctx = ask_context(handler.store, scope)
            if ctx is None:
                return handler.send(404, {"error": "không thấy tiến trình này"})
            prompt = "Dữ liệu văn phòng (JSON):\n```json\n%s\n```\n\nCâu hỏi: %s" % (
                json.dumps(ctx, ensure_ascii=False, default=str), q)
        os.makedirs(ASK_CWD, exist_ok=True)
        cmd = [CLAUDE_BIN, "-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
               "--model", model, "--strict-mcp-config", "--append-system-prompt", ASK_SYSTEM,
               "--max-budget-usd", str(ASK_BUDGET_USD), "--add-dir", PROJECTS] + (["--add-dir", ROOT] if ROOT else [])
        if session:
            cmd += ["--resume", session]
        cmd += ["--tools", "Read", "Grep", "Glob"]
        proc = subprocess.Popen(cmd, cwd=ASK_CWD, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, env=clean_env())
        threading.Timer(ASK_TIMEOUT_S, lambda: proc.poll() is None and proc.kill()).start()
        proc.stdin.write(prompt.encode())
        proc.stdin.close()
        handler.send_response(200)
        handler.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        handler.send_header("Cache-Control", "no-store")
        handler.end_headers()
        emit({"t": "start", "model": model, "chars": len(prompt)})
        done = False
        for line in proc.stdout:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            t = d.get("type")
            if t == "stream_event":
                ev = d.get("event") or {}
                dl = ev.get("delta") or {}
                if ev.get("type") == "content_block_delta" and dl.get("type") == "text_delta":
                    emit({"t": "text", "d": dl.get("text", "")})
            elif t == "assistant":
                for c in (d.get("message") or {}).get("content") or []:
                    if isinstance(c, dict) and c.get("type") == "tool_use":
                        emit({"t": "tool", "name": c.get("name"), "input": tool_brief(c.get("name"), c.get("input"))})
            elif t == "result":
                u = d.get("usage") or {}
                emit({"t": "done", "session": d.get("session_id"), "text": d.get("result") or "",
                      "error": bool(d.get("is_error")), "cost": d.get("total_cost_usd"),
                      "usage": {"in": u.get("input_tokens"), "cw": u.get("cache_creation_input_tokens"),
                                "cr": u.get("cache_read_input_tokens"), "out": u.get("output_tokens")},
                      "ms": d.get("duration_ms")})
                done = True
        proc.wait(timeout=10)
        if not done:
            err = proc.stderr.read().decode(errors="replace")[-600:]
            emit({"t": "done", "error": True, "text": err or ("CLI dừng, mã %s" % proc.returncode)})
    except (BrokenPipeError, ConnectionResetError):
        pass  # trinh duyet dong khung tro ly
    finally:
        if proc and proc.poll() is None:
            proc.kill()
        ASK_SLOTS.release()


class Handler(BaseHTTPRequestHandler):
    store = None

    def log_message(self, *a):
        pass

    def send(self, code, body, ctype="application/json; charset=utf-8"):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        u = urlparse(self.path)
        if u.path == "/api/cauhinh":
            return self.post_cau_hinh()
        if u.path == "/api/logo":
            return self.post_logo()
        if u.path != "/api/ask":
            return self.send(404, {"error": "không có"})
        # chi nhan tu chinh trang (chan trang la goi tro ly ton token)
        origin = self.headers.get("Origin") or ""
        if origin and urlparse(origin).netloc != self.headers.get("Host"):
            return self.send(403, {"error": "sai nguồn"})
        try:
            n = min(int(self.headers.get("Content-Length") or 0), 20000)
            body = json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return self.send(400, {"error": "JSON hỏng"})
        run_ask(self, body)

    def post_cau_hinh(self):
        # chi chinh trang + may trong nha / Tailscale moi duoc sua ten
        origin = self.headers.get("Origin") or ""
        if origin and urlparse(origin).netloc != self.headers.get("Host"):
            return self.send(403, {"error": "sai nguồn"})
        ip = self.client_address[0]
        if not (ip.startswith(("127.", "::1", "10.", "192.168.", "100.")) or re.match(r"172\.(1[6-9]|2\d|3[01])\.", ip)):
            return self.send(403, {"error": "chỉ sửa từ máy trong nhà"})
        try:
            n = min(int(self.headers.get("Content-Length") or 0), 60000)
            body = json.loads(self.rfile.read(n) or b"{}")
            khoa, v = body.get("khoa"), body.get("gia_tri")
            if khoa not in KHOA_CAU_HINH:
                raise ValueError("khoá không hợp lệ")
            v = sach_cau_hinh(khoa, v)
        except (ValueError, TypeError) as e:
            return self.send(400, {"error": str(e)})
        self.store.kho.luu_cau_hinh(khoa, v)
        return self.send(200, {"ok": True, "cau_hinh": self.store.kho.cau_hinh()})

    def post_logo(self):
        """Doi logo xuong: 3 anh PNG (vuong 512, tron 512, nho 64) da cat san tren trinh duyet; {"goc": true} = ve logo mac dinh.
        Logo luu o thu muc cau hinh rieng (LOGO_RIENG); ban dang dung duoc cat vao _cu/ truoc khi thay (khong xoa)."""
        origin = self.headers.get("Origin") or ""
        if origin and urlparse(origin).netloc != self.headers.get("Host"):
            return self.send(403, {"error": "sai nguồn"})
        ip = self.client_address[0]
        if not (ip.startswith(("127.", "::1", "10.", "192.168.", "100.")) or re.match(r"172\.(1[6-9]|2\d|3[01])\.", ip)):
            return self.send(403, {"error": "chỉ đổi từ máy trong nhà"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n > 12_000_000:
                raise ValueError("ảnh quá lớn")
            body = json.loads(self.rfile.read(n) or b"{}")
        except ValueError as e:
            return self.send(400, {"error": str(e)})
        ten = {"xuong": "xuong.png", "tron": "xuong_tron.png", "nho": "xuong_64.png"}
        ldir = LOGO_RIENG
        os.makedirs(ldir, exist_ok=True)
        if body.get("goc"):   # ve mac dinh: cat logo rieng vao _cu, trang tu dung logo mac dinh cua repo
            moc = datetime.now().strftime("%Y%m%d-%H%M%S")
            os.makedirs(os.path.join(ldir, "_cu"), exist_ok=True)
            for v in ten.values():
                if os.path.isfile(os.path.join(ldir, v)):
                    shutil.move(os.path.join(ldir, v), os.path.join(ldir, "_cu", moc + "_" + v))
            return self.send(200, {"ok": True})
        else:
            moi = {}
            for k in ten:
                v = body.get(k) or ""
                if not v.startswith("data:image/png;base64,"):
                    return self.send(400, {"error": "thiếu ảnh " + k})
                data = base64.b64decode(v.split(",", 1)[1])
                if not data.startswith(b"\x89PNG\r\n\x1a\n") or len(data) > 4_000_000:
                    return self.send(400, {"error": "ảnh " + k + " không phải PNG hợp lệ"})
                moi[k] = data
        if len(moi) != len(ten):
            return self.send(400, {"error": "thiếu ảnh"})
        os.makedirs(os.path.join(ldir, "_cu"), exist_ok=True)
        moc = datetime.now().strftime("%Y%m%d-%H%M%S")
        for k, v in ten.items():
            fp = os.path.join(ldir, v)
            if os.path.isfile(fp):
                shutil.move(fp, os.path.join(ldir, "_cu", moc + "_" + v))
            with open(fp, "wb") as f:
                f.write(moi[k])
        return self.send(200, {"ok": True})

    def send_page(self, name):
        with open(os.path.join(HERE, name), "rb") as f:
            return self.send(200, f.read(), "text/html; charset=utf-8")

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/chung.js":   # bang dung chung + ten goi da luu trong kho (ap ngay khi nap, khong nhap nhay)
            with open(os.path.join(HERE, "chung.js"), "rb") as f:
                body = f.read()
            rieng = os.path.join(CONF_DIR, "rieng.js")   # phong ban that, mat danh, ten goi cua nguoi dung (ngoai repo)
            if os.path.isfile(rieng):
                with open(rieng, "rb") as f:
                    body = body.replace(b"/*RIENG*/", f.read(), 1)
            body += b"\napDungCauHinh(" + json.dumps(self.store.kho.cau_hinh(), ensure_ascii=False).encode() + b");\n"
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(body)
            return
        if u.path in ("/cauhinh", "/cauhinh/"):
            return self.send_page("cau_hinh.html")
        if u.path in ("/lichsu", "/lichsu/"):
            return self.send_page("lich_su.html")
        if u.path == "/api/cauhinh":
            return self.send(200, self.store.kho.cau_hinh())
        if u.path == "/api/lichsu":
            try:
                ngay = max(1, min(365, int((parse_qs(u.query).get("ngay") or ["14"])[0])))
            except ValueError:
                ngay = 14
            return self.send(200, self.store.kho.lich_su(ngay))
        if u.path in ("/", "/index.html"):
            with open(os.path.join(HERE, "index.html"), "rb") as f:
                return self.send(200, f.read(), "text/html; charset=utf-8")
        if u.path in ("/3d", "/3d/"):
            with open(os.path.join(HERE, "3d", "index.html"), "rb") as f:
                return self.send(200, f.read(), "text/html; charset=utf-8")
        # ma 3D, three.js trong 3d/
        m = re.fullmatch(r"/(3d/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+\.(?:js|png|jpg))", u.path)
        if m and ".." not in u.path:
            fp = os.path.join(HERE, *m.group(1).split("/"))
            if os.path.isfile(fp):
                with open(fp, "rb") as f:
                    body = f.read()
                ext = fp.rsplit(".", 1)[1]
                self.send_response(200)
                self.send_header("Content-Type", {"js": "text/javascript; charset=utf-8", "png": "image/png",
                                                  "jpg": "image/jpeg"}[ext])
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                self.wfile.write(body)
                return
            return self.send(404, {"error": "không có"})
        m = re.fullmatch(r"/(logo|avatar)/([A-Za-z0-9_-]+)\.png", u.path)
        if m:
            # avatar: trong repo; logo: thu muc rieng truoc, logo xuong mac dinh cua repo sau
            cho = [os.path.join(HERE, "avatar")] if m.group(1) == "avatar" else [LOGO_RIENG, LOGO_MAC_DINH]
            fp = next((os.path.join(d, m.group(2) + ".png") for d in cho if os.path.isfile(os.path.join(d, m.group(2) + ".png"))), "")
            if fp:
                with open(fp, "rb") as f:
                    body = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(body)))
                # logo xuong doi duoc o trang Cau hinh -> khong de trinh duyet giu ban cu
                self.send_header("Cache-Control", "no-cache" if m.group(2).startswith("xuong") else "max-age=3600")
                self.end_headers()
                self.wfile.write(body)
                return
            return self.send(404, {"error": "không có logo"})
        if u.path == "/api/state":
            with self.store.lock:
                return self.send(200, self.store.snapshot)
        if u.path == "/api/token":
            with self.store.lock:
                return self.send(200, self.store.token_report())
        if u.path == "/api/agent":
            aid = (parse_qs(u.query).get("id") or [""])[0]
            with self.store.lock:
                d = self.store.detail(aid) if re.fullmatch(r"[A-Za-z0-9_-]+", aid) else None
            return self.send(200 if d else 404, d or {"error": "không thấy agent"})
        self.send(404, {"error": "không có"})


def sach_cau_hinh(khoa, v):
    """Kiem kieu + do dai ten goi user gui len (None = ve mac dinh)."""
    if v is None:
        return None
    s = lambda x, n: str(x if x is not None else "").strip()[:n]
    if khoa in ("xuong", "giam_doc"):
        v = s(v, 80 if khoa == "xuong" else 40)
        return v or None
    if khoa == "tu_may":
        if not isinstance(v, list):
            raise ValueError("tu_may phải là danh sách")
        v = [s(x, 40) for x in v if s(x, 40)][:40]
        return v or None
    if khoa == "phong":
        if not isinstance(v, dict):
            raise ValueError("phong phải là bảng")
        return {s(k, 60): [s(x[0], 40), s(x[1], 80), s(x[2], 8)] for k, x in list(v.items())[:80]
                if isinstance(x, list) and len(x) == 3 and s(x[0], 40)} or None
    if khoa == "nhan_vien":
        if not isinstance(v, dict):
            raise ValueError("nhan_vien phải là bảng")
        return {k: [s(x[0], 30), s(x[1], 60)] for k, x in list(v.items())[:200]
                if re.fullmatch(r"nv_\d+", k) and isinstance(x, list) and len(x) == 2 and s(x[0], 30)} or None
    if khoa == "nguon":
        if not isinstance(v, dict):
            raise ValueError("nguon phải là bảng")
        v = {k: bool(v[k]) for k in ("codex", "antigravity") if k in v}
        return v or None
    if khoa == "bien_sanh":
        if not isinstance(v, dict):
            raise ValueError("bien_sanh phải là bảng")
        v = {"dong1": s(v.get("dong1"), 30), "dong2": s(v.get("dong2"), 80)}
        return v if v["dong1"] or v["dong2"] else None
    if khoa == "phong_dong":
        if not isinstance(v, list):
            raise ValueError("phong_dong phải là danh sách")
        v = list(dict.fromkeys(s(x, 80) for x in v if s(x, 80)))[:100]
        return v or None
    if khoa == "pham_vi":
        return v if v in ("ytb", "tat_ca") else None
    if khoa == "bo_cuc":
        if not isinstance(v, dict):
            raise ValueError("bo_cuc phải là bảng")
        out = {}
        if v.get("phong") in ("hep", "vua", "rong"):
            out["phong"] = v["phong"]
        if v.get("thoai") in ("tat", "it", "vua", "nhieu"):
            out["thoai"] = v["thoai"]
        if v.get("toc_do") in ("cham", "vua", "nhanh", "rat_nhanh"):
            out["toc_do"] = v["toc_do"]
        if v.get("fps") in (20, 30, 60):
            out["fps"] = v["fps"]
        if isinstance(v.get("tu_dong"), bool):
            out["tu_dong"] = v["tu_dong"]
        for k, lo, hi in (("hang_phut", 1, 60), ("hang_max", 1, 16)):
            if isinstance(v.get(k), (int, float)) and lo <= v[k] <= hi:
                out[k] = int(v[k])
        return out or None
    raise ValueError("khoá không hợp lệ")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--port", type=int, default=8790)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--ngay", type=float, default=2, help="xem subagent hoat dong trong N ngay (mac dinh 2)")
    ap.add_argument("--quet", type=float, default=3, help="quet lai moi N giay (mac dinh 3)")
    ap.add_argument("--db", default=DB_MAC_DINH, help="kho SQLite cua van phong (mac dinh %(default)s)")
    ap.add_argument("--goc", help="thu muc du an goc (ghi de \"goc\" trong config.json)")   # da doc o dau file
    a = ap.parse_args()
    store = Store(a.ngay)
    store.kho = Kho(a.db)
    print("Kho van phong:", a.db)
    Handler.store = store
    print("Dang doc transcript %d ngay gan nhat trong %s ..." % (a.ngay, PROJECTS))
    store.scan()
    print("Xong lan dau: %d subagent, %d ms" % (len(store.snapshot["agents"]), store.scan_ms))
    threading.Thread(target=scanner, args=(store, a.quet), daemon=True).start()
    srv = ThreadingHTTPServer((a.host, a.port), Handler)
    print("Theo doi subagent: http://%s:%d" % ("127.0.0.1" if a.host == "0.0.0.0" else a.host, a.port))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
