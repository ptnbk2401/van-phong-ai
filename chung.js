// Bang dung chung cho trang 2D (index.html) va 3D (3d/index.html): phong ban, mat danh, nhan vien, vai tro.
// Script thuong (khong module): khai bao o pham vi toan cuc, trang nap truoc script chinh.
const DEPT = {
  "Kỹ thuật":["Phòng Kỹ thuật","pipeline · TTS · thợ sửa ống nước số","KT"],
  "Tổng hợp":["Phòng Tổng hợp","việc chưa biết bỏ ngăn nào","TH"],
};

// ---- An danh: mat danh phong kieu tap doan lon (khong goi y noi dung kenh) + bieu tuong, va moi bi danh cua kenh can che (ten thu muc, ten kenh, ten tieng Nhat...)
const ANON = {
  "Kỹ thuật":["Khối Công Nghệ","server không ngủ, kỹ sư thì có","💻",[]],
  "Tổng hợp":["Phòng Hành Chính Tổng Hợp","việc gì cũng nhận, việc nào cũng xong","🗂️",[]],
};

function buildMask() {
  const pairs = [];
  for (const [k, v] of Object.entries(ANON)) for (const a of v[3]) pairs.push([a, v[0].replace(/^Phòng /, "")]);
  pairs.sort((x, y) => y[0].length - x[0].length);
  const rx = new RegExp(pairs.map(([a]) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
  const to = Object.fromEntries(pairs.map(([a, b]) => [a.toLowerCase(), b]));
  return {rx, to};
}


const HUES = ["#2f6fed","#12945c","#c2410c","#7c3aed","#0e7490","#b45309","#be185d","#4d7c0f","#1d4ed8","#a21caf","#0f766e","#9a3412","#0369a1"];
const ROLE = t =>
  t === "lead" ? "Trưởng phiên (sếp nhỏ)" : t === "codex" ? "Trưởng phiên Codex" : t === "antigravity_lead" ? "Trưởng phiên Antigravity" : t === "antigravity" ? "Trợ lý Antigravity" : t === "general-purpose" ? "Chuyên viên đa zi năng" : t === "workflow-subagent" ? "Công nhân dây chuyền" :
  t === "fork" ? "Bản sao của sếp" : t === "Explore" ? "Thám tử tra cứu" : t === "Plan" ? "Kiến trúc sư" :
  t === "claude-code-guide" ? "Cố vấn Claude" : t.startsWith("duyet-") ? "Biên tập khó tính" :
  t.startsWith("cham-") ? "Giám khảo mắt diều hâu" : t.startsWith("phan-bien") ? "Thánh soi lỗi" : t;
const ROLE_COLOR = t =>
  t === "lead" ? "#b45309" : t === "codex" ? "#0f766e" : t.startsWith("antigravity") ? "#4285f4" : t === "general-purpose" ? "#2f6fed" : t === "workflow-subagent" ? "#0e7490" : t.startsWith("duyet-") ? "#7c3aed" :
  t.startsWith("cham-") ? "#c2410c" : t.startsWith("phan-bien") ? "#be185d" : t === "fork" ? "#475569" : "#4d7c0f";
const ST = {chay:"Đang cày", cho:"Ngồi đợi", xong:"Đã nộp bài", loi:"Vấp cỏ", dung:"Bị gọi về", bo_do:"Mất tích?", nghi:"Nghỉ giải lao"};

const hash = s => { let h = 0; for (const c of s) h = (h*31 + c.charCodeAt(0)) >>> 0; return h; };

// ten + biet danh tung avatar (theo thu tu nv_01..nv_18 trong avatar/): toan ten Viet (user 07/11/2026)
const NV = {
  nv_01:["Minh Thư","Chữ V thần tốc"], nv_02:["Hồng Nhung","nháy mắt là xong deadline"], nv_03:["Thu Hà","kính tròn soi lỗi chính tả"],
  nv_04:["Khánh Linh","tổng đài 24/7"], nv_05:["Lan Anh","bím tóc chưa từng rối"], nv_06:["Ngọc Trâm","sống bằng cà phê"],
  nv_07:["Phương Anh","iPad không rời tay"], nv_08:["Mai Chi","hoa khôi phòng ban"], nv_09:["Thanh Tâm","bút chì giắt tai"],
  nv_10:["Hải Yến","nghiêm túc nhất xưởng"], nv_11:["Quỳnh Như","selfie trước, làm sau"], nv_12:["Bảo Ngọc","đẩy kính là ra ý tưởng"],
  nv_13:["Gia Hân","alo, em nghe đây"], nv_14:["Thùy Dương","chống cằm nghĩ kế"], nv_15:["Thảo My","tóc tết dài như deadline"],
  nv_16:["Kim Ngân","ly cà phê thứ năm"], nv_17:["Cẩm Tú","tóc hồng chạy deadline"], nv_18:["Tuyết Nhi","ký duyệt bằng bút cảm ứng"],
};

// Ten xuong hien tren trang (2D + 3D)
let XUONG = "Văn phòng AI";
// Ten giam doc (phong giam doc ban 3D)
let GIAM_DOC = "Sếp";
// Bang logo o sanh ban 3D: dong chu lon + dong nho (de trong dong 2 = ten xuong)
let BIEN_SANH = { dong1: "VĂN PHÒNG AI", dong2: "" };
// Bo cuc ban 3D: co phong ban (hep/vua/rong), hang cho viec (phut, so nguoi), muc noi cua nhan vat
let BO_CUC = { phong: "rong", hang_phut: 5, hang_max: 5, thoai: "vua", toc_do: "vua", fps: 30, tu_dong: false, nen: "co" };
// Phong ban dong tay (nut khoa o danh sach phong ban 3D): danh sach khoa phong
let PHONG_DONG = [];
// Pham vi theo doi: "ytb" = chi du an goc (ten khoa cu giu nguyen), "tat_ca" = moi phien Claude Code tren may (moi du an mot phong)
let PHAM_VI = "ytb";
// Nguon ngoai Claude Code duoc theo doi (Codex CLI / Desktop); Antigravity, Grok... them sau
let NGUON = { codex: true, antigravity: true };
// Goc giai tri phong Sep (ban 3D): danh sach YouTube phat lan luot (id video 11 ky tu / "list:<id playlist>"); trong = nhac tu sinh
let NHAC = { ds: [], tron: false };
// Phong chua co trong ANON: mat danh trung tinh theo bam ten (khong lo ten thu muc)
const ANON_POOL = [["Ban Thư Ký","giấy tờ gọn, sếp yên tâm","📝"],["Phòng Mua Sắm","mua đúng, mua đủ","🛒"],["Phòng Đối Ngoại","bắt tay chắc, nói chuyện khéo","🕊️"],
  ["Trung Tâm Điều Phối","mọi việc về đúng chỗ","🛰️"],["Phòng Kiểm Toán","từng con số đều có lý do","🧾"],["Ban Cố Vấn","nghĩ kỹ trước khi nói","🧭"],
  ["Phòng Pháp Chế","đúng luật, đúng hẹn","⚖️"],["Trung Tâm Dữ Liệu","dữ liệu sạch, ngủ ngon","🗃️"],["Phòng Hạ Tầng","nền vững nhà cao","🏗️"],
  ["Ban Dự Án Đặc Biệt","việc khó mới đến tay","🎖️"],["Phòng Sản Phẩm","người dùng là trên hết","📦"],["Phòng Vận Tải","đi nhanh, giao đúng","🚚"],
  ["Trung Tâm Hỗ Trợ","gọi là có mặt","🛟"],["Phòng Bảo Mật","khoá kỹ, ngủ yên","🔐"],["Ban Đổi Mới Số","số hoá mọi thứ","🔢"],
  ["Phòng Nghiên Cứu Thị Trường","nghe khách nói trước","🔭"],["Phòng Đào Tạo","học hôm nay, giỏi ngày mai","🎓"],["Ban Kiểm Định","kiểm ba lần, chạy một lần","🧪"],
  ["Phòng Thương Hiệu","đẹp từ cái tên","🏷️"],["Trung Tâm Sáng Kiến","ý tưởng không giới hạn","💡"]];
// ten that (khi tat an danh): thu muc trong du an goc theo DEPT; du an khac co khoa "@<ten thu muc>"
const tenThat = d => DEPT[d] ? [DEPT[d][0], DEPT[d][1], DEPT[d][2]] : String(d).startsWith("@") ? [String(d).slice(1), "dự án ngoài xưởng", String(d).slice(1, 3).toUpperCase()] : [d, "", String(d).slice(0, 2).toUpperCase()];
const anonDept = d => ANON[d] ? [ANON[d][0], ANON[d][1], ANON[d][2]] : ANON_POOL[hash(String(d)) % ANON_POOL.length];

// ten thiet bi van phong cho tu may chay nen (co dinh theo id lenh) — khong lo lenh gi dang chay
const RACK_TEN = ["🖨️ Máy in tầng ba", "📠 Máy fax đời cũ", "📄 Máy photocopy", "🗂️ Máy hủy tài liệu", "☕ Máy pha cà phê",
  "📽️ Máy chiếu phòng họp", "🖥️ Máy chủ nội bộ", "📞 Tổng đài lễ tân", "🧾 Máy tính lương", "🔐 Két sắt điện tử", "📬 Máy chia thư", "⏱️ Máy chấm công"];

// Phan rieng cua nguoi dung (~/.config/van-phong-ai/rieng.js) duoc may chu chen vao day: phong ban that, mat danh, ten goi.
/*RIENG*/
let MASK = buildMask();

// Mac dinh trong code (trang /cauhinh hien de so va "Về mặc định")
const MAC_DINH = JSON.parse(JSON.stringify({ xuong: XUONG, giam_doc: GIAM_DOC, bien_sanh: BIEN_SANH, bo_cuc: BO_CUC, pham_vi: PHAM_VI, nguon: NGUON, nhac: NHAC,
  phong: Object.fromEntries(Object.entries(ANON).map(([k, v]) => [k, v.slice(0, 3)])), nhan_vien: NV, tu_may: RACK_TEN }));
// Ten goi + bo cuc user da sua (luu trong kho SQLite) — app.py goi ham nay o cuoi /chung.js
function apDungCauHinh(c) {
  if (!c) return;
  if (typeof c.xuong === "string" && c.xuong.trim()) XUONG = c.xuong.trim();
  if (typeof c.giam_doc === "string" && c.giam_doc.trim()) GIAM_DOC = c.giam_doc.trim();
  if (c.bien_sanh && typeof c.bien_sanh === "object") BIEN_SANH = { ...BIEN_SANH, ...c.bien_sanh };
  if (c.bo_cuc && typeof c.bo_cuc === "object") BO_CUC = { ...BO_CUC, ...c.bo_cuc };
  if (c.pham_vi === "ytb" || c.pham_vi === "tat_ca") PHAM_VI = c.pham_vi;
  if (Array.isArray(c.phong_dong)) PHONG_DONG = c.phong_dong.filter(x => typeof x === "string");
  if (c.nguon && typeof c.nguon === "object") NGUON = { ...NGUON, ...c.nguon };
  if (c.nhac && typeof c.nhac === "object") NHAC = { ds: Array.isArray(c.nhac.ds) ? c.nhac.ds.filter(x => typeof x === "string") : [], tron: !!c.nhac.tron };
  for (const [d, v] of Object.entries(c.phong || {})) {
    if (!Array.isArray(v) || !v[0]) continue;
    if (ANON[d]) { ANON[d][0] = v[0]; ANON[d][1] = v[1] || ""; ANON[d][2] = v[2] || ANON[d][2]; }
    else ANON[d] = [v[0], v[1] || "", v[2] || "🏢", []];
  }
  for (const [k, v] of Object.entries(c.nhan_vien || {})) if (Array.isArray(v) && v[0]) NV[k] = [v[0], v[1] || ""];
  if (Array.isArray(c.tu_may) && c.tu_may.length) RACK_TEN.splice(0, RACK_TEN.length, ...c.tu_may);
  MASK = buildMask();
}
