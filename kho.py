"""Kho SQLite cua van phong: lich su lam viec, ho so da nop, ten goi/cau hinh.

Moi may mot file (mac dinh ~/Library/Application Support/theo_doi_subagent/van_phong.db), ngoai thu muc ma nguon. app.py goi Kho.ghi(snapshot) sau moi lan quet;
transcript van chi doc — chi ghi vao file DB nay.

Bang:
  nhan_vien(id, ...)        moi subagent / truong phien da thay: trang thai cuoi, thoi gian, token, mo ta viec
  doi_trang_thai(...)       moi lan doi trang thai (vao ca, cho, xong, loi...) — dong thoi gian
  ho_so(aid, dept, ngay)    moi viec da nop (status xong) — ke ho so cong don theo phong
  cau_hinh(khoa, gia_tri)   ten goi do user sua tren trang /cauhinh (JSON); khong co = dung mac dinh trong code
  phong_gd(sid, ts, loai)   phong giam doc: user giao viec (giao), truong phien bao cao xong (bao_cao) / cho duyet (cho_duyet)
"""
import json, os, sqlite3, threading, time
from datetime import datetime

DB_MAC_DINH = os.path.expanduser("~/Library/Application Support/theo_doi_subagent/van_phong.db")
KHOA_CAU_HINH = ("xuong", "giam_doc", "phong", "nhan_vien", "tu_may", "bo_cuc", "pham_vi", "nguon", "bien_sanh", "phong_dong", "nhac")

SCHEMA = """
CREATE TABLE IF NOT EXISTS nhan_vien (
  id TEXT PRIMARY KEY, kind TEXT, sid TEXT, dept TEXT, type TEXT, machine TEXT, model TEXT, mo_ta TEXT,
  start REAL, last REAL, status TEXT, tools INTEGER, errors INTEGER, out_tok INTEGER, ctx INTEGER,
  thay_dau REAL, thay_cuoi REAL, xong_luc REAL
);
CREATE INDEX IF NOT EXISTS nv_start ON nhan_vien(start);
CREATE TABLE IF NOT EXISTS doi_trang_thai (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, aid TEXT, tu TEXT, sang TEXT
);
CREATE INDEX IF NOT EXISTS dtt_ts ON doi_trang_thai(ts);
CREATE TABLE IF NOT EXISTS ho_so (
  aid TEXT PRIMARY KEY, dept TEXT, ngay TEXT, ts REAL
);
CREATE INDEX IF NOT EXISTS hs_dept ON ho_so(dept, ngay);
CREATE TABLE IF NOT EXISTS phong_gd (
  sid TEXT, ts REAL, loai TEXT, dept TEXT, ngay TEXT, PRIMARY KEY (sid, ts, loai)
);
CREATE INDEX IF NOT EXISTS gd_ngay ON phong_gd(ngay);
CREATE TABLE IF NOT EXISTS cau_hinh (
  khoa TEXT PRIMARY KEY, gia_tri TEXT, sua_luc REAL
);
"""


def ngay_cua(ts):
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d")


class Kho:
    def __init__(self, path=DB_MAC_DINH):
        self.path = path
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False, timeout=10)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript(SCHEMA)
        self.lock = threading.Lock()
        self.da_ghi = {}      # id -> bo gia tri vua ghi (khong ghi lai neu khong doi)
        self.trang_thai = dict(self.db.execute("SELECT id, status FROM nhan_vien").fetchall())

    # ------------------------------------------------------------ ghi sau moi lan quet
    def ghi(self, snap):
        now = time.time()
        rows = snap.get("agents", []) + snap.get("leads", [])
        with self.lock, self.db:
            for a in rows:
                aid = a["id"]
                key = (a["status"], a.get("last"), a.get("tools"), a.get("out"), a.get("dept"), a.get("duyet"), a.get("giaoTs"), a.get("xongTs"))
                if self.da_ghi.get(aid) == key:
                    continue
                self.da_ghi[aid] = key
                cu = self.trang_thai.get(aid)
                if cu != a["status"]:
                    self.db.execute("INSERT INTO doi_trang_thai(ts, aid, tu, sang) VALUES (?,?,?,?)",
                                    (now if cu else (a.get("start") or now), aid, cu, a["status"]))
                    self.trang_thai[aid] = a["status"]
                xong = (a.get("last") or now) if a["status"] == "xong" else None
                self.db.execute("""
                  INSERT INTO nhan_vien(id, kind, sid, dept, type, machine, model, mo_ta, start, last, status, tools, errors,
                                        out_tok, ctx, thay_dau, thay_cuoi, xong_luc)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                  ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, sid=excluded.sid, dept=excluded.dept, type=excluded.type,
                    machine=excluded.machine, model=excluded.model, mo_ta=excluded.mo_ta, start=excluded.start,
                    last=excluded.last, status=excluded.status, tools=excluded.tools, errors=excluded.errors,
                    out_tok=excluded.out_tok, ctx=excluded.ctx, thay_cuoi=excluded.thay_cuoi,
                    xong_luc=COALESCE(nhan_vien.xong_luc, excluded.xong_luc)""",
                    (aid, a.get("kind"), a.get("sid"), a.get("dept"), a.get("type"), a.get("machine"), a.get("model"),
                     a.get("desc"), a.get("start"), a.get("last"), a["status"], a.get("tools"), a.get("errors"),
                     a.get("out"), a.get("ctx"), now, now, xong))
                # phong giam doc: moc giao viec + bao cao / cho duyet cua truong phien
                if a.get("kind") == "lead":
                    for loai, ts in (("giao", a.get("giaoTs")), ("cho_duyet" if a.get("duyet") else "bao_cao", a.get("xongTs"))):
                        if ts and (loai == "giao" or ts >= (a.get("giaoTs") or 0)):
                            self.db.execute("INSERT OR IGNORE INTO phong_gd(sid, ts, loai, dept, ngay) VALUES (?,?,?,?,?)",
                                            (aid, ts, loai, a.get("dept") or "Tổng hợp", ngay_cua(ts)))
                # ho so: chi viec cua subagent nop xong moi len ke
                if a.get("kind") == "agent" and a["status"] == "xong":
                    ts = a.get("last") or now
                    self.db.execute("INSERT OR IGNORE INTO ho_so(aid, dept, ngay, ts) VALUES (?,?,?,?)",
                                    (aid, a.get("dept") or "Tổng hợp", ngay_cua(ts), ts))

    # ------------------------------------------------------------ doc
    def ke_ho_so(self):
        """{dept: {"hom_nay": n, "tong": n}} cho ke ho so 3D va bang trang."""
        hom_nay = ngay_cua(time.time())
        out = {}
        with self.lock:
            for dept, ngay, n in self.db.execute("SELECT dept, ngay, COUNT(*) FROM ho_so GROUP BY dept, ngay"):
                d = out.setdefault(dept, {"hom_nay": 0, "tong": 0})
                d["tong"] += n
                if ngay == hom_nay:
                    d["hom_nay"] += n
        return out

    def giam_doc(self):
        """So lan giao viec / bao cao / cho duyet hom nay, tong va theo phong (khay ho so + bang theo doi phong giam doc)."""
        hom_nay = ngay_cua(time.time())
        tong, theo_phong = {"giao": 0, "bao_cao": 0, "cho_duyet": 0}, {}
        with self.lock:
            for loai, dept, n in self.db.execute("SELECT loai, dept, COUNT(*) FROM phong_gd WHERE ngay = ? GROUP BY loai, dept", (hom_nay,)):
                tong[loai] = tong.get(loai, 0) + n
                theo_phong.setdefault(dept, {"giao": 0, "bao_cao": 0, "cho_duyet": 0})[loai] = n
            # so lenh: 40 moc gan nhat hom nay (ai, phong, luc nao) — khong co noi dung
            nhat_ky = [{"sid": r[0], "ts": r[1], "loai": r[2], "dept": r[3]} for r in self.db.execute(
                "SELECT sid, ts, loai, dept FROM phong_gd WHERE ngay = ? ORDER BY ts DESC LIMIT 40", (hom_nay,))]
        return {"hom_nay": tong, "theo_phong": theo_phong, "nhat_ky": nhat_ky}

    def lich_su(self, ngay=14):
        """Tong hop theo ngay + theo phong + danh sach viec gan day (cho trang /lichsu)."""
        tu = time.time() - ngay * 86400
        with self.lock:
            cur = self.db.execute("""
              SELECT id, kind, dept, type, machine, model, mo_ta, start, last, status, tools, errors, out_tok, ctx
              FROM nhan_vien WHERE COALESCE(last, start, thay_cuoi) >= ? ORDER BY COALESCE(start, thay_dau) DESC""", (tu,))
            cols = [c[0] for c in cur.description]
            viec = [dict(zip(cols, r)) for r in cur.fetchall()]
            hs = self.db.execute("SELECT ngay, dept, COUNT(*) FROM ho_so WHERE ts >= ? GROUP BY ngay, dept", (tu,)).fetchall()
            tong_hs = self.db.execute("SELECT COUNT(*), MIN(ts) FROM ho_so").fetchone()
            tong_nv = self.db.execute("SELECT COUNT(*) FROM nhan_vien").fetchone()[0]
        theo_ngay = {}
        for v in viec:
            if not v["start"]:
                continue
            d = theo_ngay.setdefault(ngay_cua(v["start"]), {"giao": 0, "xong": 0, "loi": 0, "phien": 0, "gio_cong": 0.0, "token": 0, "ho_so": 0})
            if v["kind"] == "lead":
                d["phien"] += 1          # phien chinh mo nhieu ngay -> khong tinh gio cong
            else:
                d["giao"] += 1
                d["xong"] += v["status"] == "xong"
                d["loi"] += v["status"] in ("loi", "dung")
                d["gio_cong"] += max(0.0, ((v["last"] or v["start"]) - v["start"]) / 3600)
            d["token"] += v["out_tok"] or 0
        theo_phong = {}
        for ngay_, dept, n in hs:
            theo_ngay.setdefault(ngay_, {"giao": 0, "xong": 0, "loi": 0, "phien": 0, "gio_cong": 0.0, "token": 0, "ho_so": 0})["ho_so"] += n
            theo_phong[dept] = theo_phong.get(dept, 0) + n
        return {"ngay": ngay, "theo_ngay": dict(sorted(theo_ngay.items(), reverse=True)), "theo_phong": theo_phong,
                "viec": viec[:300], "tong_ho_so": tong_hs[0], "tu_luc": tong_hs[1], "tong_nhan_vien": tong_nv, "db": self.path}

    # ------------------------------------------------------------ cau hinh (ten goi)
    def cau_hinh(self):
        with self.lock:
            return {k: json.loads(v) for k, v in self.db.execute("SELECT khoa, gia_tri FROM cau_hinh")}

    def luu_cau_hinh(self, khoa, gia_tri):
        if khoa not in KHOA_CAU_HINH:
            raise ValueError("khoá không hợp lệ")
        with self.lock, self.db:
            if gia_tri is None:
                self.db.execute("DELETE FROM cau_hinh WHERE khoa = ?", (khoa,))
            else:
                self.db.execute("INSERT INTO cau_hinh(khoa, gia_tri, sua_luc) VALUES (?,?,?) "
                                "ON CONFLICT(khoa) DO UPDATE SET gia_tri=excluded.gia_tri, sua_luc=excluded.sua_luc",
                                (khoa, json.dumps(gia_tri, ensure_ascii=False), time.time()))
