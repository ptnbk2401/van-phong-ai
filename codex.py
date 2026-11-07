"""Bo doc phien Codex (CLI `codex`, `codex exec`, Codex Desktop) cho van phong.

Nguon: ~/.codex/sessions/<nam>/<thang>/<ngay>/rollout-*.jsonl (doi bang bien THEO_DOI_CODEX), ten luong o ~/.codex/session_index.jsonl.
Doc theo dinh dang Codex 0.165 (11/2026), moi dong {timestamp, type, payload}:
  session_meta              id, cwd, originator (codex_exec / Codex Desktop), timestamp
  turn_context              model, cwd
  event_msg/user_message    user giao viec (prompt) -> "dau viec"
  event_msg/task_started    bat dau mot luot      event_msg/task_complete   xong luot (last_agent_message)
  event_msg/agent_message   cau tra loi           event_msg/token_count     token (last_token_usage)
  event_msg/*approval*      Codex xin duyet lenh  -> cho duyet
  response_item/function_call|custom_tool_call (+ _output)   cong cu dang chay
CodexTx bat chuoc cac truong cua app.Transcript ma Store.row / act_line / detail can, nen phien Codex di chung duong voi phien Claude.
Codex doi dinh dang thi sua o CodexTx._line.
"""
import collections, glob, json, os, re
from datetime import datetime

CODEX_DIR = os.path.expanduser(os.environ.get("THEO_DOI_CODEX", "~/.codex"))
MAX_EVENTS = 600


def _ts(s):
    """Gio ISO; chuan phan le ve 6 chu so (Python 3.9 fromisoformat chi nhan 3 hoac 6)."""
    if not s:
        return None
    s = re.sub(r"\.(\d+)", lambda m: "." + (m.group(1) + "000000")[:6], str(s).replace("Z", "+00:00"), count=1)
    try:
        return datetime.fromisoformat(s).timestamp()
    except ValueError:
        return None


def _short(s, n):
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return s if len(s) <= n else s[: n - 1] + "…"


def _args(p):
    """Tham so cong cu: function_call co 'arguments' (JSON), custom_tool_call co 'input' (chu)."""
    a = p.get("arguments")
    if isinstance(a, str):
        try:
            a = json.loads(a)
        except ValueError:
            a = {"input": a}
    return a if isinstance(a, dict) else {"input": p.get("input") or ""}


def hoat_dong(name, a):
    """Dong "dang lam gi" cung kieu app.activity (bieu tuong dau dong de 3D doi ra cau chung)."""
    n = (name or "").lower()
    cmd = a.get("command") or a.get("cmd") or a.get("input") or ""
    if isinstance(cmd, list):
        cmd = " ".join(map(str, cmd))
    if n in ("exec", "shell", "local_shell", "exec_command", "container.exec", "unified_exec"):
        return "⌨️ " + (_short(cmd, 60) or "Chạy lệnh")
    if n in ("js", "python", "node_repl"):
        return "⌨️ Chạy mã " + n
    if n in ("wait", "write_stdin", "read_stdin"):
        return "⏳ Chờ lệnh chạy"
    if "patch" in n or n in ("edit", "write_file"):
        return "✍️ Sửa file"
    if "search" in n:
        return "🔎 Tra cứu " + _short(a.get("query") or "", 40)
    if "image" in n:
        return "🖼️ Xem / tạo ảnh"
    if n in ("update_plan", "plan"):
        return "🗺️ Lên kế hoạch"
    if "spawn" in n or "agent" in n:
        return "👥 Nhờ trợ lý"
    return "🔧 " + (name or "công cụ")


class CodexTx:
    """Doc dan mot rollout-*.jsonl: moi lan chi doc phan moi ghi them."""

    def __init__(self, path):
        self.path = path
        self.reset()

    def reset(self):
        self.off = 0
        self.tail = b""
        self.mtime = 0
        self.sid = os.path.basename(self.path)[:-6].split("-", 6)[-1] if self.path.endswith(".jsonl") else ""
        self.first_ts = self.last_ts = None
        self.prompt = self.title = self.cwd = self.model = self.final = self.originator = ""
        self.n_tools = self.n_errors = 0
        self.tool_counts = collections.Counter()
        self.usage = {}                 # dem -> (ts, input moi, ghi cache 5m, ghi cache 1h, doc cache, output) — nhu Transcript
        self.res_chars = collections.Counter()
        self.n_images = 0
        self.big_results = []
        self.pending = {}               # call_id -> (ten, mo ta)
        self.acts = {}                  # call_id -> dong dang lam gi
        self.last = None
        self.ended = False
        self.turn_open = False          # task_started chua co task_complete
        self.events = collections.deque(maxlen=MAX_EVENTS)
        self.giao_ts = self.hoi_ts = self.xong_ts = 0
        self.ask_ids = set()
        self.hoi_text = ""
        self.dept = None
        self.bg = {}
        self.agent_calls, self.notifs, self.results = {}, {}, {}
        self.task_more = False

    def pending_bg(self, now):
        return []                       # Codex khong co lenh nen kieu Claude

    def tokens(self):
        out = sum(u[5] for u in self.usage.values())
        ctx = 0
        if self.usage:
            u = list(self.usage.values())[-1]
            ctx = u[1] + u[2] + u[3] + u[4]
        return ctx, out

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
        with open(self.path, "rb") as f:
            f.seek(self.off)
            data = f.read()
        self.off += len(data)
        lines = (self.tail + data).split(b"\n")
        self.tail = lines.pop()
        for line in lines:
            try:
                self._line(json.loads(line))
            except (ValueError, TypeError, AttributeError):
                continue
        return True

    def _event(self, ts, kind, name, text, act=""):
        ev = {"ts": ts, "kind": kind, "name": name, "text": text}
        if act:
            ev["act"] = act
        self.events.append(ev)
        self.last = ev

    def _line(self, d):
        ts = _ts(d.get("timestamp"))
        if ts:
            self.first_ts = self.first_ts or ts
            self.last_ts = ts
        t, p = d.get("type"), d.get("payload") if isinstance(d.get("payload"), dict) else {}
        pt = p.get("type")
        if t == "session_meta":
            self.sid = p.get("id") or p.get("session_id") or self.sid
            self.cwd = p.get("cwd") or self.cwd
            self.originator = p.get("originator") or ""
            self.first_ts = _ts(p.get("timestamp")) or self.first_ts
        elif t == "turn_context":
            self.model = p.get("model") or self.model
            self.cwd = p.get("cwd") or self.cwd
        elif t == "event_msg":
            if pt == "user_message":
                msg = p.get("message") if isinstance(p.get("message"), str) else ""
                if msg.strip():
                    self.prompt = msg if not self.prompt else msg + "\n\n— — —\n" + self.prompt
                    self.title = self.title or _short(msg, 90)
                    self.giao_ts = ts or self.giao_ts
                    self.ask_ids.clear()
                    self._event(ts, "giao", "", _short(msg, 600))
            elif pt == "task_started":
                self.turn_open, self.ended = True, False
                if self.originator == "codex_exec":   # codex exec: viec giao nam san trong lenh, khong co user_message
                    self.giao_ts = ts or self.giao_ts
            elif pt in ("task_complete", "turn_aborted"):
                self.turn_open, self.ended = False, True
                self.pending.clear()
                self.acts.clear()
                self.xong_ts = ts or self.xong_ts
                msg = p.get("last_agent_message") or ""
                if msg:
                    self.final = msg
                    if msg.rstrip().endswith("?"):   # ket luot bang mot cau hoi -> cho sep tra loi
                        self.hoi_ts = ts or self.hoi_ts
                        self.hoi_text = "❓ " + _short(msg, 600)
                if pt == "turn_aborted":
                    self._event(ts, "loi", "", "Lượt bị dừng")
            elif pt == "agent_message":
                msg = p.get("message") if isinstance(p.get("message"), str) else ""
                if msg.strip():
                    self.final = msg
                    self._event(ts, "noi", "", _short(msg, 600))
            elif pt == "token_count" and isinstance(p.get("info"), dict):
                u = p["info"].get("last_token_usage") or {}
                cached = u.get("cached_input_tokens") or 0
                self.usage[len(self.usage)] = (ts, max(0, (u.get("input_tokens") or 0) - cached), u.get("cache_write_input_tokens") or 0, 0,
                                               cached, u.get("output_tokens") or 0)
            elif pt and "approval" in pt:     # Codex xin duyet lenh / ban va
                self.ask_ids.add(p.get("call_id") or pt)
                self.hoi_ts = ts or self.hoi_ts
                cmd = p.get("command") or p.get("changes") or ""
                self.hoi_text = "🔐 Codex xin duyệt: " + _short(cmd if isinstance(cmd, str) else json.dumps(cmd, ensure_ascii=False), 400)
        elif t == "response_item":
            if pt in ("function_call", "custom_tool_call", "local_shell_call"):
                name = p.get("name") or ("shell" if pt == "local_shell_call" else "?")
                a = _args(p)
                cid = p.get("call_id") or p.get("id")
                act = hoat_dong(name, a)
                self.n_tools += 1
                self.tool_counts[name] += 1
                self.pending[cid] = (name, _short(a.get("command") or a.get("input") or "", 120))
                self.acts[cid] = act
                self._event(ts, "goi", name, self.pending[cid][1], act)
            elif pt in ("function_call_output", "custom_tool_call_output", "local_shell_call_output"):
                cid = p.get("call_id")
                name, _ = self.pending.pop(cid, ("?", ""))
                self.acts.pop(cid, None)
                out = p.get("output")
                out = out if isinstance(out, str) else json.dumps(out, ensure_ascii=False)[:2000]
                self.res_chars[name] += len(out)
                err = bool(re.search(r"(exit code|exited with code)[: ]+[1-9]|^error", out[:400], re.I))
                if err:
                    self.n_errors += 1
                self._event(ts, "loi" if err else "ket_qua", name, _short(out, 300))


def tim_phien(cutoff):
    """Duong dan rollout-*.jsonl ghi trong khoang theo doi (moi nhat truoc)."""
    out = []
    for p in glob.glob(os.path.join(CODEX_DIR, "sessions", "*", "*", "*", "rollout-*.jsonl")):
        try:
            if os.path.getmtime(p) >= cutoff:
                out.append(p)
        except OSError:
            pass
    return out


def ten_luong():
    """id -> ten luong Codex Desktop dat (session_index.jsonl)."""
    out = {}
    try:
        with open(os.path.join(CODEX_DIR, "session_index.jsonl"), encoding="utf-8") as f:
            for line in f:
                try:
                    d = json.loads(line)
                    if d.get("id") and d.get("thread_name"):
                        out[d["id"]] = d["thread_name"]
                except ValueError:
                    pass
    except OSError:
        pass
    return out


_imp = [0, set()]


def phien_nhap():
    """id luong ma Codex Desktop NHAP tu phien Claude (external_agent_session_imports.json) — bo qua de khong dem hai lan."""
    fp = os.path.join(CODEX_DIR, "external_agent_session_imports.json")
    try:
        m = os.path.getmtime(fp)
    except OSError:
        return set()
    if m != _imp[0]:
        try:
            d = json.load(open(fp, encoding="utf-8"))
            _imp[1] = {r.get("imported_thread_id") for r in d.get("records", []) if isinstance(r, dict)} - {None}
        except (OSError, ValueError, AttributeError):
            _imp[1] = set()
        _imp[0] = m
    return _imp[1]


def tieu_de(tx, names):
    """Ten hien thi: ten luong Codex Desktop > viec giao dau tien (bo the <...>) > loai phien."""
    t = names.get(tx.sid) or re.sub(r"<[^>]{1,40}>", " ", tx.title or "").strip()
    return _short(t, 90) or ("Codex exec" if tx.originator == "codex_exec" else "Phiên Codex")


def trang_thai(tx, now, active_s, quiet_s):
    """Phien Codex -> (chay | cho | nghi, ghi chu), cung nghia voi truong phien Claude."""
    age = now - tx.mtime
    if tx.turn_open:
        if age < active_s:
            names = [n for n, _ in tx.pending.values()]
            if names and all(n in ("wait", "write_stdin") for n in names):
                return "cho", "chờ lệnh chạy"
            return "chay", "đang chạy " + ", ".join(names[-2:]) if names else "đang nghĩ / trả lời"
        if age < quiet_s:
            return ("cho" if tx.pending else "chay"), "im %d phút" % (age // 60)
    return "nghi", "nghỉ — chờ user"
