"""Bo doc phien Antigravity (ung dung + CLI `agy`) cho van phong.

Nguon: bang `conversation_summaries` trong ~/.gemini/antigravity/conversation_summaries.db va
~/.gemini/antigravity-cli/conversation_summaries.db (doi thu muc goc bang bien THEO_DOI_GEMINI). Mo CHI DOC.
Moi dong: conversation_id, title, preview, step_count, last_modified_time, last_user_input_time, workspace_uris (JSON file://...),
status (CASCADE_RUN_STATUS_*), source (CORTEX_TRAJECTORY_SOURCE_CLI = goi tu lenh agy), agent_name, parent_conversation_id,
nesting_depth, not_fully_idle, killed. Noi dung tung buoc nam trong blob protobuf o conversations/<id>.db — khong doc
(van phong chi can trang thai + thoi gian; ban 3D khong hien noi dung).
Ung dung chep ca phien CLI vao db cua no -> gop theo conversation_id.

Xep vai: hoi thoai mo trong ung dung Antigravity = truong phong (lead, cli "antigravity");
phien CLI va phien con (nesting_depth > 0) = tro ly (agent). Phien `agy` do mot phien Claude goi chay trong thu muc tam
/private/tmp/claude-<uid>/<du an>/<id phien Claude>/... -> gan lam tro ly cua dung truong phong Claude do.
"""
import collections, json, os, re, sqlite3
from datetime import datetime
from urllib.parse import unquote, urlparse

GEMINI_DIR = os.path.expanduser(os.environ.get("THEO_DOI_GEMINI", "~/.gemini"))
DBS = ("antigravity", "antigravity-cli", "antigravity-ide")
CLAUDE_TMP_RE = re.compile(r"^/private/tmp/claude-\d+/([^/]+)/([0-9a-f-]{36})(?:/|$)")


def ts(s):
    """Gio ISO co phan le bat ky so chu so (Python 3.9 fromisoformat chi nhan 3 hoac 6)."""
    if not s:
        return None
    s = str(s).replace("Z", "+00:00")
    s = re.sub(r"\.(\d+)", lambda m: "." + (m.group(1) + "000000")[:6], s, count=1)
    try:
        return datetime.fromisoformat(s).timestamp()
    except ValueError:
        return None


def _short(s, n):
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return s if len(s) <= n else s[: n - 1] + "…"


def cwd_cua(uris):
    try:
        lst = json.loads(uris or "[]")
    except ValueError:
        lst = []
    for u in lst if isinstance(lst, list) else []:
        p = urlparse(str(u))
        if p.scheme == "file" and p.path:
            return unquote(p.path).rstrip("/")
    return ""


def phien_claude_goi(cwd):
    """(thu muc du an Claude da ma hoa, id phien Claude) neu agy chay trong thu muc tam cua mot phien Claude."""
    m = CLAUDE_TMP_RE.match(cwd or "")
    return (m.group(1), m.group(2)) if m else (None, None)


_cache = {}   # duong dan db -> (dau thoi gian, danh sach dong)


def doc_tom_tat(cutoff):
    """Cac hoi thoai co hoat dong tu cutoff, gop qua cac db, moi id lay ban moi nhat."""
    gop = {}
    for d in DBS:
        fp = os.path.join(GEMINI_DIR, d, "conversation_summaries.db")
        try:
            stamp = (os.path.getmtime(fp), os.path.getmtime(fp + "-wal") if os.path.exists(fp + "-wal") else 0)
        except OSError:
            continue
        c = _cache.get(fp)
        if not c or c[0] != stamp:
            rows = []
            for uri in ("file:%s?mode=ro" % fp, "file:%s?mode=ro&immutable=1" % fp):
                try:
                    con = sqlite3.connect(uri, uri=True, timeout=2)
                    con.row_factory = sqlite3.Row
                    rows = [dict(r) for r in con.execute(
                        "SELECT conversation_id, title, preview, step_count, last_modified_time, last_user_input_time, workspace_uris, "
                        "status, source, agent_name, parent_conversation_id, nesting_depth, not_fully_idle, killed "
                        "FROM conversation_summaries")]
                    con.close()
                    break
                except sqlite3.Error:
                    continue
            for r in rows:
                r["_mod"], r["_in"] = ts(r["last_modified_time"]), ts(r["last_user_input_time"])
                r["_cli"] = d == "antigravity-cli" or (r.get("source") or "").endswith("_CLI")   # db CLI de trong cot source
            c = _cache[fp] = (stamp, rows)
        for r in c[1]:
            if (r["_mod"] or 0) < cutoff:
                continue
            o = gop.get(r["conversation_id"])
            cli = r["_cli"] or bool(o and o["_cli"])
            if not o or (r["_mod"] or 0) > (o["_mod"] or 0) or (r["_mod"] == o["_mod"] and r.get("title") and not o.get("title")):
                gop[r["conversation_id"]] = r     # moi nhat; bang nhau thi lay ban co tieu de (db CLI dat ten, db ung dung de trong)
            gop[r["conversation_id"]]["_cli"] = cli
    return list(gop.values())


class AgTx:
    """Mot hoi thoai Antigravity, mang cac truong Store.row / act_line / detail can (nhu app.Transcript)."""

    def __init__(self, r):
        self.path = os.path.join(GEMINI_DIR, "…", r["conversation_id"])
        self.sid = r["conversation_id"]
        self.events = collections.deque(maxlen=50)
        self.tool_counts = collections.Counter()
        self.usage, self.res_chars, self.pending, self.acts, self.bg = {}, collections.Counter(), {}, {}, {}
        self.agent_calls, self.notifs, self.results = {}, {}, {}
        self.big_results, self.n_images, self.n_errors, self.task_more = [], 0, 0, False
        self.ask_ids, self.hoi_ts, self.dept, self.model = set(), 0, None, "gemini"
        self.cap_nhat(r)

    def cap_nhat(self, r):
        self.r = r
        self.cwd = cwd_cua(r.get("workspace_uris"))
        self.title = _short(r.get("title") or r.get("preview") or "", 90)
        self.prompt = r.get("title") or ""
        self.final = r.get("preview") or ""
        self.n_tools = int(r.get("step_count") or 0)
        self.mtime = self.last_ts = r["_mod"] or 0
        self.giao_ts = r["_in"] or 0
        self.first_ts = self.giao_ts or self.mtime
        st = (r.get("status") or "").upper()
        self.running = ("RUNNING" in st or bool(r.get("not_fully_idle"))) and not r.get("killed")
        self.killed = bool(r.get("killed"))
        self.ended = not self.running
        self.xong_ts = self.mtime if self.ended else 0
        self.events.clear()
        if self.giao_ts:
            self.events.append({"ts": self.giao_ts, "kind": "giao", "name": "", "text": _short(self.prompt, 300)})
        if self.ended and self.final:
            self.events.append({"ts": self.mtime, "kind": "noi", "name": "", "text": _short(self.final, 300)})
        self.last = self.events[-1] if self.events else None
        if self.running:
            self.acts = {"ag": "🤔 Đang suy nghĩ"}
        else:
            self.acts = {}

    def pending_bg(self, now):
        return []

    def tokens(self):
        return 0, 0                      # Antigravity khong ghi token trong bang tom tat


def la_tro_ly(r):
    return bool(r.get("_cli")) or int(r.get("nesting_depth") or 0) > 0


def trang_thai(tx, now, active_s, quiet_s, tro_ly):
    """Truong phong: chay | nghi; tro ly: chay | xong | dung | bo_do — cung nghia voi phien Claude."""
    age = now - tx.mtime
    if tx.killed:
        return "dung", "bị dừng"
    if tx.running:
        if age < quiet_s:
            return "chay", "đang chạy (%d bước)" % tx.n_tools
        return ("bo_do", "im %d phút" % (age // 60)) if tro_ly else ("nghi", "im lâu")
    return ("xong", "xong (%d bước)" % tx.n_tools) if tro_ly else ("nghi", "nghỉ — chờ user")
