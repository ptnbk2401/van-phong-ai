// Xuong lam viec 3D — moi kenh mot phong, moi subagent / truong phien mot nhan vien hoat hinh.
// Ban de chieu man hinh: LUON an danh (mat danh phong trung tinh), khong hien mo ta viec, lenh, ten file, bao cao, nhat ky —
// chi trang thai chung ("Đang gõ phím", "Đang đọc tài liệu"...). Can xem chi tiet thi dung ban 2D.
// Du lieu: /api/state (app.py) moi 3 s. Ky thuat dung canh theo PhongCanh3D: Three.js, PBR + anh sang moi truong,
// van go/tham/da sinh thu tuc bang canvas, gop hinh tinh theo vat lieu, GTAO + bong mem.
// Bang dung chung (DEPT, ANON, NV, ROLE, ROLE_COLOR, ST, hash, MASK) nap tu /chung.js.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const $ = s => document.querySelector(s);
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ---------- kich thuoc (met) ----------
// Co phong ban chon o trang Cau hinh (BO_CUC.phong): hep 4 ban, vua 6 ban sat, rong 6 ban thoang. Do dac tu xep theo co.
const BC = typeof BO_CUC !== "undefined" ? BO_CUC : {};
const KICH_PHONG = { hep: { RW: 6.4, RD: 5.8, cot: 2.2 }, vua: { RW: 8.0, RD: 5.9, cot: 1.9 }, rong: { RW: 9, RD: 6.6, cot: 2.25 } };
const KP = KICH_PHONG[BC.phong] || KICH_PHONG.rong;
const RW = KP.RW, RD = KP.RD, CW = 3.4, WH = 2.8;   // phong rong (doc hanh lang), sau, hanh lang rong, tuong cao
const LOBBY = 10;                              // sanh: x tu -LOBBY toi 0
const LANE_V = 0.9;                            // loi di sat vach kinh trong phong
const DOOR_U = -RW / 2 + 1.15;                 // cua phong (toa do u trong phong)
// ghe nhan vien: cot tu sau loi cua toi sat tuong phai, hang tu loi di truoc toi truoc loi di sau (ban dai 1,2 m)
const COLS = [], ROWS = [];
for (let u = -RW / 2 + 2.85; u <= RW / 2 - 1.3 + 1e-6; u += KP.cot) COLS.push(+u.toFixed(3));
for (let v = 2.1; v + .6 <= RD - 1.45 + 1e-6; v += 1.65) ROWS.push(+v.toFixed(3));
const LAST_LANE = COLS[COLS.length - 1] - .65;           // loi doc sau cot ghe cuoi (toi tu may)
const SHELF_R = RW / 2 - 1.6, SHELF_W = Math.min(2.6, SHELF_R - (-RW / 2 + 2.3)), SHELF_U = SHELF_R - SHELF_W / 2;
const SHELF_PER = Math.floor((SHELF_W - .2) / .102);     // bia moi tang ke
const SEAT_Y = 0.44;

// ---------- trang thai giao dien ----------
const anon = true;                      // ban 3D luon an danh
const escRaw = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const deptInfo = d => anonDept(d);   // ban 3D luon an danh (ca du an ngoai xuong)
// viec dang lam -> cau chung, khong lo noi dung (lay theo bieu tuong dau dong act cua app.py)
const ACT_CHUNG = [[/^(📖|📄|📚)/u, "📖 Đang đọc tài liệu", "doc"], [/^(✍️|✏️)/u, "✍️ Đang viết", "viet"], [/^⌨️/u, "⌨️ Đang chạy lệnh", "lenh"],
  [/^🔎/u, "🔎 Đang tra cứu", "tra_cuu"], [/^(🌐|🧭)/u, "🌐 Đang lướt web", "web"], [/^🖼/u, "🖼️ Đang xem hình", "hinh"], [/^👥/u, "👥 Giao việc cho trợ lý", "giao"],
  [/^(🤔|🗺️)/u, "🤔 Đang suy nghĩ", "nghi"], [/^(💬|🎀)/u, "💬 Đang soạn báo cáo", "bao"], [/^🙋/u, "🙋 Hỏi ý sếp", "hoi"], [/^👀/u, "👀 Canh máy chạy", "cho_may"],
  [/^(🗒️|📨)/u, "🗒️ Ghi chép", "viet"]];
const TOOL_CHUNG = n => /^(Read|NotebookRead)$/.test(n) ? "📖 đọc tài liệu" : /^(Edit|Write|NotebookEdit|MultiEdit)$/.test(n) ? "✍️ viết"
  : /^(Bash|Monitor)$/.test(n) ? "⌨️ chạy lệnh" : /^(Grep|Glob|WebSearch|ToolSearch)$/.test(n) ? "🔎 tra cứu" : /^WebFetch$|Browser|chrome/.test(n) ? "🌐 lướt web"
  : /^(Agent|Task|SendMessage)$/.test(n) ? "👥 giao việc cho trợ lý" : "🛠️ dùng công cụ";
const deptHue = d => HUES[hash(d) % HUES.length];
const actKey = a => { for (const [rx, , k] of ACT_CHUNG) if (rx.test(a.act || "")) return k; return "lam"; };
// Thoai vui theo tinh huong — cau dua chung, KHONG lo noi dung cong viec. Them/sua cau thi sua bang nay.
const THOAI = {
  doc: ["Đọc tới trang thứ 7749 rồi…", "Chữ nhiều quá, cho em xin cái kính lúp 🔍", "Tài liệu này dài hơn phim Hàn", "Đọc kỹ, không đọc lướt — lời sếp dặn", "Ủa đoạn này viết bằng tiếng gì vậy?"],
  viet: ["Gõ phím nhanh như gió 🌪️", "Viết xong câu này là đi ăn trưa", "Ctrl+S, Ctrl+S, Ctrl+S cho chắc", "Bàn phím bốc khói rồi nè 🔥", "Câu này hay, tự vỗ tay cái 👏"],
  lenh: ["Enter… và cầu nguyện 🙏", "Chạy đi em, đừng báo đỏ nha", "Terminal ơi, hôm nay hiền thôi nhé", "Chạy lần đầu là chuẩn luôn… chắc vậy", "Xanh hết! Ai chụp màn hình giùm cái 📸"],
  tra_cuu: ["Tìm hoài không thấy, như tìm người yêu", "Mò kim đáy bể cũng ra cho sếp", "Có rồi có rồi! À nhầm…", "Lục tung cả kho mới thấy 📦"],
  web: ["Mở 37 tab là chuyện bình thường", "Lướt web vì công việc thôi nha 😇", "Mạng chậm như rùa bò 🐢", "Trang này quảng cáo nhiều hơn chữ"],
  hinh: ["Phóng to… phóng to nữa… thấy rồi!", "Nhìn kỹ từng pixel luôn 🧐", "Màu này ổn chưa ta?", "Ảnh đẹp, cất vào bộ sưu tập"],
  nghi: ["Hmm… để em nghĩ thêm 3 giây", "Não đang tải… 87% ⏳", "Ý tưởng sắp tới rồi, đừng ai nói gì 🤫", "Nghĩ không ra, chắc phải uống trà sữa 🧋", "Eureka!… à chưa"],
  giao: ["Em ơi phụ chị việc này nha", "Chia việc đều, ai cũng có phần 🍰", "Gọi thêm viện binh!", "Một mình không xuể, gọi đồng đội thôi"],
  bao: ["Báo cáo phải gọn, sếp bận lắm", "Thêm gạch đầu dòng cho chuyên nghiệp", "Đọc lại lần cuối… lần cuối thật", "Viết xong là nộp liền"],
  hoi: ["Chỗ này phải hỏi sếp mới chắc", "Sếp ơi cho em hỏi xíu…"],
  lam: ["Đang làm, đang làm!", "Tập trung cao độ 🔥", "Hôm nay năng suất ghê", "Cho em 5 phút yên tĩnh nha"],
  cho_may: ["Máy ơi chạy nhanh lên 🐢", "Ngồi nhìn thanh tiến trình như xem phim", "Máy chạy, mình nghỉ, hợp lý", "Đếm cừu chờ máy: 1, 2, 3… 🐑"],
  cho_tro_ly: ["Các em làm nhanh lên chị đợi nè", "Chờ team nộp bài như chờ crush rep tin", "Giao việc xong thì… ngồi uống trà 🍵"],
  cho: ["Chờ chút xíu thôi…", "Ngồi im cũng là một loại công việc", "Ai gọi em không?"],
  loi: ["Ơ… sao lại đỏ thế này 😱", "Không phải lỗi em, là lỗi máy!", "Bình tĩnh… hít sâu… sửa thôi", "Cái lỗi này quen mặt quá", "Ai đụng vào code của em?!"],
  ma: ["Em chỉ… đi đâu đó một chút 👻", "Hồn ở đây, thân đi ăn trưa", "Đừng tìm em…"],
  cafe: ["Ly thứ năm trong ngày ☕", "Không có cà phê thì không có code", "Máy pha cà phê là đồng nghiệp tốt nhất", "Ai uống không, em pha luôn!"],
  di_cafe: ["Đi pha cà phê, ai uống không?", "Hết cà phê là hết ý tưởng", "Nghỉ giải lao 3 phút thôi nha"],
  xem_may: ["Máy ơi còn sống không?", "Đèn xanh là yên tâm 🟢", "Quạt kêu to thế, chắc đang cố gắng", "Ổn áp, chạy ngon lành"],
  kiem_tra: ["Làm tới đâu rồi em?", "Cần chị phụ gì không?", "Giỏi lắm, cố lên! 💪", "Nhớ uống nước nha mấy đứa"],
  vuon_vai: ["Vươn vai cái cho tỉnh 🙆", "Ngồi lâu đau lưng quá", "Tập thể dục giữa giờ nào!"],
  nop_ho_so: ["Thêm một hồ sơ lên kệ, tự hào ghê!", "Xong việc, nhẹ cả người", "Kệ sắp đầy, xin thêm kệ!"],
  di: ["Tránh đường, tránh đường!", "Đi nhanh cho kịp deadline 🏃‍♀️", "Hành lang hôm nay đông ghê"],
  di_bao_cao: ["Xong rồi, đi gặp sếp thôi!", "Hồi hộp quá, sếp có khen không ta?", "Ôm hồ sơ chạy như bay 🏃‍♀️"],
  di_nhan: ["Sếp gọi! Chạy ngay!", "Có việc mới rồi, phấn khởi ghê", "Đi nhận nhiệm vụ đây 🫡"],
  ve: ["Hết việc rồi, về thôi 👋", "Hẹn gặp lại cả nhà", "Tan ca! Đi trà sữa không ai? 🧋"],
  bao_cao: ["Dạ báo cáo sếp, xong rồi ạ!", "Sếp ơi em làm xong rồi nè 🎉", "Kết quả đây ạ, sếp xem giúp em", "Nhiệm vụ hoàn thành, chờ chỉ thị!"],
  xin_duyet: ["Sếp ơi chỗ này cần sếp duyệt ạ", "Em hỏi sếp chút xíu được không ạ?", "Phương án A hay B đây sếp? 🤔"],
  nhan_viec: ["Dạ rõ, sếp!", "Để em lo, sếp yên tâm 💪", "Nhận lệnh! Lên đường!", "Việc này dễ ợt… chắc vậy"],
  cho_duyet: ["Sếp ơi duyệt giúp em với 🥺", "Em ngồi đây mọc rễ luôn rồi", "Sếp đang bận, chờ thêm chút", "Không biết sếp có quên em không…", "Tranh thủ ôn lại bài báo cáo"],
  xep_hang: ["Xếp hàng chờ việc, ai chen là bị phạt!", "Sếp ơi còn việc không ạ? 🙋", "Đứng lâu mỏi chân quá 🦵", "Mình đứng thứ mấy rồi ta?",
    "Rảnh quá, cho em việc với!", "Hàng này dài hơn hàng mua trà sữa 🧋", "Ai xong trước được giao trước nha"],
  sep_xong_vong: ["Đi một vòng rồi, mọi người làm tốt lắm 👍", "Xong vòng kiểm tra, về bàn thôi", "Ổn cả, về uống ly cà phê ☕"],
  sep_vang: ["Các phòng vắng hết, về bàn thôi 😅", "Chưa ai vào ca, lát Sếp đi sau"],
  sep_di: ["Đi một vòng xem các em làm ăn thế nào 👀", "Sếp đi kiểm tra đây, ai đang lướt điện thoại thì cất đi nhé 😆", "Đi bộ cho khỏe, tiện xem xưởng luôn"],
  chao_sep: ["Chào sếp ạ! 👋", "Sếp đi kiểm tra à? Hồi hộp quá", "Em đang làm chăm chỉ lắm ạ!", "Sếp uống cà phê không, em pha cho?", "Dạ em chào sếp, mọi thứ ổn ạ!"],
  sep_hoi: ["Làm tới đâu rồi em?", "Có khó khăn gì không?", "Nhớ nghỉ giải lao nha", "Cố lên, cuối tháng có thưởng!", "Phòng mình hôm nay thế nào?"],
  tra_loi_sep: ["Dạ ổn hết ạ, sếp yên tâm!", "Sắp xong rồi sếp ơi!", "Dạ có chút khó, em đang gỡ ạ", "Em cảm ơn sếp, em cố ạ! 💪", "Thưởng nhiều nha sếp 😆"],
  nghi_ngoi: ["Báo cáo xong, lướt điện thoại tí 📱", "Rảnh rồi, sếp giao việc tiếp đi ạ", "Chờ việc mới như chờ mưa", "Trà sữa đặt rồi, 15 phút nữa tới 🧋"],
  xuat_hien: ["Chào cả nhà, em tới rồi!", "Ca mới, năng lượng mới ✨", "Bàn em ở đâu nhỉ?"],
  gd_ranh: ["Hôm nay ai báo cáo trước được thưởng 🏆", "Vibe code là phải vui!", "Cà phê nguội rồi mà chưa ai báo cáo ☕", "Cả xưởng chạy êm, sướng ghê", "Prompt hay thì code tự chạy", "Ai cần anh không? Anh rảnh nè"],
  gd_duyet: ["Để anh xem… ừm… ừm…", "Ai chờ lâu nhất vào trước nhé", "Duyệt nhanh thôi, đừng sốt ruột", "Ký… ký… ký… mỏi tay quá ✍️"],
  gd_khen: ["Tốt lắm! Thưởng ly trà sữa 🧋", "Làm tốt! Nghỉ tay chút đi", "Xuất sắc, đúng chất dân vibe code!", "Nhanh ghê, tăng lương… trong mơ nhé 😆", "Ok, để anh xem kỹ sau"],
  gd_hen: ["Được, ngồi chờ anh chút nhé", "Câu hỏi hay! Để anh nghĩ", "Ngồi ghế đợi nha, anh xem ngay"],
  gd_giao: ["Việc mới đây, làm gọn trong một nốt nhạc nhé 🎵", "Vụ này quan trọng, cẩn thận nha", "Tin em làm được, cố lên!", "Xong việc này anh bao cả phòng cà phê ☕"],
};
// toc do nhan vat (trang Cau hinh): nhan van toc di + nhip buoc chan; dong tac tai cho ngan lai theo
const TOC_DO = { cham: .7, vua: 1, nhanh: 1.4, rat_nhanh: 1.8 }[BC.toc_do || "vua"] || 1;
const THOAI_NHIP = { tat: 0, it: 2, vua: 1, nhieu: .5 }[BC.thoai || "vua"] ?? 1;   // he so khoang cach giua 2 cau
const thoai = k => { const a = THOAI[k] || THOAI.lam; return a[Math.floor(Math.random() * a.length)]; };
let tNow = 0;                     // dong ho canh (giay), cap nhat moi khung
function actChung(a) {
  if (a.status === "chay") { for (const [rx, t] of ACT_CHUNG) if (rx.test(a.act || "")) return t; return "🛠️ Đang làm việc"; }
  if (a.status === "cho") return a.bg && a.bg.length ? "☕ Chờ máy chạy" : a.helpers ? "🍵 Đợi trợ lý nộp bài" : "⏳ Đang chờ";
  return { xong: "✅ Đã nộp bài", loi: "⚠️ Gặp chút trục trặc", dung: "🛑 Được gọi về", bo_do: "👻 Vắng mặt", nghi: "📱 Nghỉ giải lao" }[a.status] || "";
}
const hms = ts => ts ? new Date(ts * 1000).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
const hm = ts => new Date(ts * 1000).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
const dur = s => { s = Math.max(0, Math.round(s)); return s < 60 ? s + " giây" : s < 3600 ? Math.round(s / 60) + " phút" : (s / 3600).toFixed(1).replace(".", ",") + " giờ"; };
const tok = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " tr" : n >= 1e3 ? Math.round(n / 1e3) + " k" : String(n || 0);
const ST_COLOR = { chay: "#22c55e", cho: "#f59e0b", xong: "#60a5fa", loi: "#ef4444", dung: "#94a3b8", bo_do: "#a78bfa", nghi: "#38bdf8" };
let S = null;
const avFile = id => S && S.avatars && S.avatars.length ? S.avatars[hash(id) % S.avatars.length] : "";
const staffOf = id => NV[avFile(id)] || ["", ""];

// ---------- may ve ----------
const canvas = $("#c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;   // r18x: PCF da mem san
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 600);
camera.position.set(14, 24, 30);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = 1.38; controls.minDistance = 2.5; controls.maxDistance = 110;
controls.target.set(6, 0, 0);
const labelR = new CSS2DRenderer({ element: $("#labels") });
labelR.domElement.style.pointerEvents = "none";

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

const hemi = new THREE.HemisphereLight(0xdfeaff, 0x8a7a66, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
sun.castShadow = true;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025; sun.shadow.radius = 3;
sun.shadow.autoUpdate = false;   // cap nhat thua trong vong lap (6 lan/giay)
scene.add(sun, sun.target);

let composer = null, gtao = null;
const QN = ["Thấp", "Vừa", "Cao"];
let quality = 1, qualityManual = false;
try { const q = localStorage.getItem("vp3d-q"); if (q !== null) { quality = +q; qualityManual = true; } } catch (e) {}
function applyQuality() {
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(quality === 0 ? 1 : quality === 1 ? Math.min(dpr, 1.5) : Math.min(dpr, 2));
  const ms = quality === 2 ? 4096 : 2048;   // Vua/Thap 2048 (du net o goc nhin van phong), Cao 4096
  if (sun.shadow.mapSize.x !== ms) { sun.shadow.mapSize.set(ms, ms); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  if (quality === 2 && !composer) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
    gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 1, scale: 1.1, samples: 12 });
    gtao.blendIntensity = 0.85;
    composer.addPass(gtao);
    composer.addPass(new OutputPass());
  }
  $("#btnQ").textContent = "Hình: " + QN[quality];
  resize();
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = w + "px"; canvas.style.height = h + "px";
  camera.aspect = w / h; camera.updateProjectionMatrix();
  labelR.setSize(w, h);
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
}
addEventListener("resize", resize);

// ---------- van sinh thu tuc (canvas) ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.userData = { c, g };
  return t;
}
function noise(g, W, H, n, a, r, light) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = (r() < .5) === !light ? `rgba(0,0,0,${a * r()})` : `rgba(255,255,255,${a * r()})`;
    g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
  }
}
function drawParquet(g, W, H) {
  // san go soi: 8 hang van dai, moi tam mot sac do, van go song + mau go, rong 0.3 m
  const r = rng(11), rows = 8, ph = H / rows;
  for (let i = 0; i < rows; i++) {
    let x = -Math.floor(r() * 5) * W / 10;
    while (x < W) {
      const len = W * (0.38 + r() * 0.34);
      const L = 0.9 + r() * 0.2;
      const base = [Math.round(196 * L), Math.round(150 * L), Math.round(104 * L)];
      g.fillStyle = `rgb(${base})`; g.fillRect(x, i * ph, len, ph);
      for (let k = 0; k < 16; k++) {
        g.strokeStyle = `rgba(${90 + r() * 40},${55 + r() * 25},${30},${0.05 + r() * .09})`;
        g.lineWidth = 0.6 + r() * 1.6; g.beginPath();
        const y0 = i * ph + r() * ph, amp = r() * 3, fr = 0.004 + r() * .01;
        for (let xx = 0; xx <= len; xx += 6) g.lineTo(x + xx, y0 + Math.sin((x + xx) * fr + k) * amp);
        g.stroke();
      }
      if (r() < .25) { g.fillStyle = "rgba(90,55,30,.25)"; g.beginPath(); g.ellipse(x + r() * len, i * ph + ph * (0.3 + r() * .4), 4 + r() * 5, 2 + r() * 2, 0, 0, TAU); g.fill(); }
      g.strokeStyle = "rgba(70,45,28,.55)"; g.lineWidth = 1.5; g.strokeRect(x + .75, i * ph + .75, len - 1.5, ph - 1.5);
      x += len;
    }
  }
}
function drawCarpet(hex) {
  return (g, W, H) => {
    const c = new THREE.Color(hex).lerp(new THREE.Color("#5b6068"), .62);
    g.fillStyle = "#" + c.getHexString(); g.fillRect(0, 0, W, H);
    const r = rng(hash(hex)); noise(g, W, H, 9000, .18, r);
    g.strokeStyle = "rgba(0,0,0,.12)"; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2);   // o tham 50 cm
  };
}
function drawTiles(g, W, H) {
  const r = rng(5), n = 4, s = W / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const L = 226 + r() * 14; g.fillStyle = `rgb(${L},${L - 4},${L - 10})`; g.fillRect(i * s, j * s, s, s);
    for (let k = 0; k < 3; k++) {       // van da
      g.strokeStyle = `rgba(150,140,130,${.12 + r() * .15})`; g.lineWidth = .5 + r(); g.beginPath();
      let x = i * s + r() * s, y = j * s; g.moveTo(x, y);
      for (let t = 0; t < 8; t++) { x += (r() - .5) * s * .3; y += s / 8; g.lineTo(x, y); }
      g.stroke();
    }
  }
  g.strokeStyle = "rgba(120,112,100,.55)"; g.lineWidth = 2;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, H); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(W, i * s); g.stroke(); }
}
function drawConcrete(g, W, H) {
  g.fillStyle = "#c4c1bb"; g.fillRect(0, 0, W, H);
  const r = rng(9);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${r() < .5 ? "255,255,255" : "80,78,74"},${r() * .05})`; g.beginPath(); g.arc(r() * W, r() * H, 10 + r() * 60, 0, TAU); g.fill(); }
  noise(g, W, H, 6000, .1, r);
}
function drawLaminate(g, W, H) {
  g.fillStyle = "#d9c3a2"; g.fillRect(0, 0, W, H);
  const r = rng(3);
  for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(140,100,60,${.04 + r() * .07})`; g.lineWidth = .5 + r() * 1.5; g.beginPath(); const y = r() * H; for (let x = 0; x <= W; x += 8) g.lineTo(x, y + Math.sin(x * .02 + k) * 2); g.stroke(); }
}
function drawWalnut(g, W, H) {
  g.fillStyle = "#6b4630"; g.fillRect(0, 0, W, H);
  const r = rng(4);
  for (let k = 0; k < 50; k++) { g.strokeStyle = `rgba(40,22,12,${.06 + r() * .12})`; g.lineWidth = .5 + r() * 2; g.beginPath(); const y = r() * H; for (let x = 0; x <= W; x += 8) g.lineTo(x, y + Math.sin(x * .015 + k) * 3); g.stroke(); }
}

const TEX = {
  parquet: canvasTex(1024, 1024, drawParquet, [RW / 2.4, RD / 2.4]),
  tiles: canvasTex(512, 512, drawTiles, [LOBBY / 2.4, (CW + 2 * RD) / 2.4]),
  concrete: canvasTex(512, 512, drawConcrete, [6, 1]),
  laminate: canvasTex(256, 256, drawLaminate),
  walnut: canvasTex(256, 256, drawWalnut),
};

// ---------- vat lieu dung chung ----------
const std = (color, rough = .8, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
const MAT = {
  wall: std("#efebe5", .92), wallWarm: std("#e6ddd0", .9), base: std("#5d5a56", .6),
  frame: std("#9aa0a8", .32, .75), frameDark: std("#3b3f45", .4, .6),
  glass: new THREE.MeshStandardMaterial({ color: "#d8edf5", roughness: .04, metalness: .1, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 }),
  frost: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: .6, transparent: true, opacity: .55, depthWrite: false, side: THREE.DoubleSide }),
  deskTop: std("#ffffff", .55, 0, { map: TEX.laminate }), walnut: std("#ffffff", .45, 0, { map: TEX.walnut }),
  white: std("#f4f4f2", .5), metal: std("#2f3237", .35, .8), chrome: std("#d0d4da", .18, 1),
  plastic: std("#1d1f23", .45), keys: std("#e8e8e6", .6), fabric: std("#3f4650", .95), fabric2: std("#6b5b4e", .95),
  leather: std("#2a2420", .5), pot: std("#ede8e0", .5), soil: std("#3b2b1f", 1), leaf: std("#3f7a3a", .62, 0, { side: THREE.DoubleSide }),
  leaf2: std("#5b8f3f", .6, 0, { side: THREE.DoubleSide }), trunk: std("#5a4433", .9), shelf: std("#f1ede6", .7),
  sofa: std("#5f7480", .95), sofa2: std("#c9b79c", .95), rack: std("#22252b", .45, .6), floorPlate: std("#bdb8b0", .3, .1),
  paper: std("#fbfbf8", .9, 0, { side: THREE.DoubleSide }), mug: std("#f7f5f0", .35), coffee: std("#3b2416", .3),
  steel: std("#b9bec4", .25, .9), elevator: std("#a9aeb4", .22, .95), slab: std("#9c978f", .9), ground: std("#76815f", 1),
  plaza: std("#b8b2a6", .95), road: std("#4a4d50", .95), screenOff: std("#0b0c0f", .25, .2),
};
const UNIT = {
  box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 20), cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  sph: new THREE.SphereGeometry(1, 18, 12), plane: new THREE.PlaneGeometry(1, 1), torus: new THREE.TorusGeometry(1, .18, 8, 20),
  cone: new THREE.ConeGeometry(1, 1, 16), ico: new THREE.IcosahedronGeometry(1, 1),
};
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const M4 = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new V3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, "YXZ")), new V3(sx, sy, sz));

// gop hinh tinh theo vat lieu: 1 luot ve cho moi vat lieu thay vi hang tram
class Batch {
  constructor() { this.m = new Map(); }
  add(geo, mat, matrix) {
    const g = geo.clone().applyMatrix4(matrix);
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    (this.m.get(mat) || this.m.set(mat, []).get(mat)).push(g);
  }
  box(mat, w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) { this.add(UNIT.box, mat, M4(x, y, z, w, h, d, rx, ry, rz)); }
  cyl(mat, r, h, x, y, z, rx = 0, rz = 0, geo = UNIT.cyl) { this.add(geo, mat, M4(x, y, z, r, h, r, rx, 0, rz)); }
  sph(mat, rx_, ry_, rz_, x, y, z) { this.add(UNIT.sph, mat, M4(x, y, z, rx_, ry_, rz_)); }
  build(parent, cast = true, receive = true) {
    for (const [mat, list] of this.m) {
      const mesh = new THREE.Mesh(mergeGeometries(list), mat);
      mesh.castShadow = cast && !mat.transparent; mesh.receiveShadow = receive;
      parent.add(mesh); list.forEach(g => g.dispose());
    }
    this.m.clear();
  }
}

// ---------- do dac ----------
function plant(B, x, z, s = 1, r = Math.random) {
  B.cyl(MAT.pot, .2 * s, .42 * s, x, .21 * s, z);
  B.cyl(MAT.soil, .18 * s, .02, x, .42 * s, z);
  for (let i = 0; i < 16; i++) {      // la dai, mong, xoe ra nhieu tang
    const a = i / 16 * TAU * 2.3 + r() * .5, t = .55 + r() * .45, h = (.45 + r() * .55) * s, tilt = .25 + r() * .6;
    B.add(UNIT.sph, i % 2 ? MAT.leaf : MAT.leaf2, M4(x + Math.sin(a) * (.08 + tilt * .2) * s, .42 * s + h * .5, z + Math.cos(a) * (.08 + tilt * .2) * s,
      .11 * s * t, h * .5, .018 * s, tilt, a, 0));
  }
}
function chair(B, x, z, yaw, exec = false) {
  const c = Math.cos(yaw), s = Math.sin(yaw), P = (f, side) => [x + s * f + c * side, z + c * f - s * side];
  // chan sao 5 canh + banh xe
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU;
    B.box(MAT.metal, .3, .03, .04, x + Math.cos(a) * .15, .07, z - Math.sin(a) * .15, a);
    B.sph(MAT.plastic, .028, .028, .028, x + Math.cos(a) * .29, .03, z - Math.sin(a) * .29);
  }
  B.cyl(MAT.chrome, .025, .32, x, .24, z);
  B.box(exec ? MAT.leather : MAT.fabric, .5, .08, .5, x, SEAT_Y - .02, z, yaw);
  const [bx, bz] = P(-.25, 0);
  B.box(exec ? MAT.leather : MAT.fabric, .46, exec ? .78 : .55, .07, bx, exec ? .9 : .78, bz, yaw, -.12);
  for (const sd of [-.24, .24]) {   // tay vin
    const [ax, az] = P(0, sd);
    B.box(MAT.plastic, .04, .03, .3, ax, .64, az, yaw);
    B.box(MAT.metal, .03, .2, .03, ax, .54, az, yaw);
  }
}

// man hinh may tinh: canvas rieng, ve lai khi nhan vien go phim
const SCREENS = [];
function makeScreen(seed, w = 256, h = 150) {
  const tex = canvasTex(w, h, () => {});
  const mat = new THREE.MeshStandardMaterial({ color: "#000", emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: .9, roughness: .3 });
  const sc = { tex, mat, seed, mode: "", off: 0, t: 0 };
  drawScreen(sc, "off"); SCREENS.push(sc);
  return sc;
}
const SYN = ["#c792ea", "#82aaff", "#c3e88d", "#f78c6c", "#89ddff", "#ffcb6b", "#a6accd", "#a6accd"];
function drawScreen(sc, mode) {
  const { c, g } = sc.tex.userData, W = c.width, H = c.height;
  sc.mode = mode;
  if (mode === "off") { g.fillStyle = "#050607"; g.fillRect(0, 0, W, H); sc.tex.needsUpdate = true; return; }
  if (mode === "saver") {
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, "#14233f"); gr.addColorStop(1, "#2a1846");
    g.fillStyle = gr; g.fillRect(0, 0, W, H); g.fillStyle = "rgba(255,255,255,.55)"; g.font = "600 15px -apple-system, sans-serif";
    g.fillText(BIEN_SANH.dong1 || "AI", 18 + (sc.seed % 120), 40 + (sc.seed % 60)); sc.tex.needsUpdate = true; return;
  }
  g.fillStyle = mode === "err" ? "#2a1214" : "#1e2030"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#16182a"; g.fillRect(0, 0, 34, H); g.fillRect(0, 0, W, 12);
  for (let i = 0; i < 3; i++) { g.fillStyle = ["#ff5f57", "#febc2e", "#28c840"][i]; g.beginPath(); g.arc(8 + i * 9, 6, 2.6, 0, TAU); g.fill(); }
  const r = rng(sc.seed + Math.floor(sc.off)), lh = 9;
  for (let row = 0; row * lh < H - 14; row++) {
    const y = 16 + row * lh - (sc.off % 1) * lh;
    let x = 40 + Math.floor(r() * 4) * 10;
    g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(8, y + 2, 14, 3);
    const n = 1 + Math.floor(r() * 5);
    for (let k = 0; k < n && x < W - 10; k++) {
      const w = 8 + r() * 40; g.fillStyle = SYN[Math.floor(r() * SYN.length)]; g.globalAlpha = .85;
      g.fillRect(x, y + 1, Math.min(w, W - 10 - x), 4); x += w + 5;
    }
    g.globalAlpha = 1;
  }
  if (mode === "err") { g.fillStyle = "#ef4444"; g.fillRect(34, H - 26, W - 34, 26); g.fillStyle = "#fff"; g.font = "700 12px sans-serif"; g.fillText("✖ Error — xem lại…", 44, H - 9); }
  if (mode === "wait") {
    g.fillStyle = "rgba(10,12,20,.75)"; g.fillRect(60, H / 2 - 18, W - 120, 36);
    g.fillStyle = "#f59e0b"; g.fillRect(70, H / 2 + 4, (W - 140) * ((sc.t * .08) % 1), 6);
    g.fillStyle = "#e2e8f0"; g.font = "600 11px sans-serif"; g.fillText("⏳ đang chạy…", 72, H / 2 - 3);
  }
  sc.tex.needsUpdate = true;
}

function textCanvas(tex, draw) { const { c, g } = tex.userData; g.clearRect(0, 0, c.width, c.height); draw(g, c.width, c.height); tex.needsUpdate = true; }
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
// chu vua o rong: thu co chu tu lon toi nho, het co thi cat "…"
function fitText(g, text, x, y, maxW, font, big, small) {
  let px = big;
  for (; px > small; px -= 2) { g.font = font.replace("{px}", px); if (g.measureText(text).width <= maxW) break; }
  let t = text;
  while (g.measureText(t).width > maxW && t.length > 2) t = t.slice(0, -2) + "…";
  g.fillText(t, x, y);
}
const logoCache = {};
function withLogo(dept, cb) {
  if (anon || !S || !S.logos || !S.logos.includes(dept)) return cb(null);
  if (logoCache[dept]) { if (logoCache[dept].complete) cb(logoCache[dept]); else logoCache[dept].addEventListener("load", () => cb(logoCache[dept])); return; }
  const im = new Image(); im.src = "/logo/" + encodeURIComponent(dept) + ".png"; logoCache[dept] = im;
  im.onload = () => cb(im);
}

// ---------- phong ----------
const rooms = [];           // phong theo thu tu o (slot)
const roomBy = {};          // dept -> room
const cutWalls = [];        // tuong ha duoc: {g, side, kind}
let shell = null, ncol = 0;

class Room {
  constructor(slot, dept) {
    this.slot = slot; this.dept = dept;
    this.col = Math.floor(slot / 2); this.side = slot % 2 === 0 ? -1 : 1;
    this.cx = this.col * RW + RW / 2;
    this.g = new THREE.Group();
    this.g.position.set(this.cx, 0, this.side * CW / 2);
    this.g.rotation.y = this.side > 0 ? 0 : Math.PI;
    this.g.updateMatrixWorld(true);
    scene.add(this.g);
    this.desks = []; this.stand = []; this.racks = []; this.binders = 0; this.today = 0;
    if (dept) this.build(); else this.buildMeeting();
  }
  w(u, v, y = 0) { return this.g.localToWorld(new V3(u, y, v)); }
  yaw(du, dv) { const s = this.side > 0 ? 1 : -1; return Math.atan2(du * s, dv * s); }
  spot(u, v, du, dv, via, extra = {}) { return { room: this, pos: [u, v], yaw: this.yaw(du, dv), via, ...extra }; }
  local(p) { const l = this.g.worldToLocal(p.clone()); return [l.x, l.z]; }
  exitPts() { return [this.w(DOOR_U, LANE_V), this.w(DOOR_U, .25), this.w(DOOR_U, -.75)]; }
  enterPts() { return this.exitPts().reverse(); }

  shellWalls(B, meeting) {
    const g = this.g;
    // san go + o chan tuong
    const floor = new THREE.Mesh(UNIT.plane, std("#ffffff", .42, 0, { map: TEX.parquet }));
    floor.scale.set(RW, RD, 1); floor.rotation.x = -Math.PI / 2; floor.position.set(0, .003, RD / 2); floor.receiveShadow = true;
    g.add(floor);
    this.hit = new THREE.Mesh(UNIT.plane, new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.scale.set(RW, RD, 1); this.hit.rotation.x = -Math.PI / 2; this.hit.position.set(0, .01, RD / 2); this.hit.userData.room = this;
    g.add(this.hit);
    // tuong ngoai co cua so (ha xuong khi may quay o phia ngoai)
    const back = new THREE.Group(), BB = new Batch();
    BB.box(MAT.wall, RW, .85, .14, 0, .425, RD - .07);
    BB.box(MAT.white, RW, .04, .3, 0, .87, RD - .14);
    BB.box(MAT.wall, RW, .3, .14, 0, WH - .15, RD - .07);
    for (let u = -RW / 2; u <= RW / 2 + .01; u += 1.5) BB.box(MAT.frameDark, .07, WH - 1.15, .1, clamp(u, -RW / 2 + .035, RW / 2 - .035), .85 + (WH - 1.15) / 2, RD - .07);
    BB.box(MAT.frameDark, RW, .06, .1, 0, .89, RD - .07);
    BB.box(MAT.glass, RW, WH - 1.15, .02, 0, .85 + (WH - 1.15) / 2, RD - .07);
    BB.build(back, true, true);
    g.add(back); cutWalls.push({ g: back, side: this.side, kind: "back", room: this });
    // vach ngan hai ben: chan dac 1,05 m + kinh
    for (const sd of [-1, 1]) {
      const sw = new THREE.Group(), SB = new Batch(), u = sd * (RW / 2 - .05);
      SB.box(MAT.wallWarm, .1, 1.05, RD, u, .525, RD / 2);
      SB.box(MAT.base, .11, .08, RD, u, .04, RD / 2);
      SB.box(MAT.frame, .12, .04, RD, u, 1.07, RD / 2);
      SB.box(MAT.glass, .02, WH - 1.09, RD, u, 1.09 + (WH - 1.09) / 2, RD / 2);
      SB.box(MAT.frame, .1, .05, RD, u, WH - .025, RD / 2);
      for (let v = 1.1; v < RD; v += 1.1) SB.box(MAT.frame, .08, WH - 1.09, .04, u, 1.09 + (WH - 1.09) / 2, v);
      SB.build(sw);
      g.add(sw); cutWalls.push({ g: sw, side: this.side, kind: "side", room: this });
    }
    // vach kinh phia hanh lang + cua
    const fw = new THREE.Group(), FB = new Batch();
    const d0 = DOOR_U - .55, d1 = DOOR_U + .55;
    const R = (u0, v0, u1, v1) => wallRect(this, this.w(u0, v0), this.w(u1, v1));
    R(-RW / 2, RD - .14, RW / 2, RD); R(-RW / 2, 0, -RW / 2 + .1, RD); R(RW / 2 - .1, 0, RW / 2, RD);
    R(-RW / 2, -.04, d0, .04); R(d1, -.04, RW / 2, .04);
    for (const [a, b] of [[-RW / 2, d0], [d1, RW / 2]]) {
      const L = b - a, m = (a + b) / 2;
      FB.box(MAT.glass, L, WH - .1, .02, m, (WH - .1) / 2 + .05, 0);
      FB.box(MAT.frost, L, .28, .025, m, 1.12, 0);
      FB.box(MAT.frame, L, .05, .07, m, .025, 0);
      for (let u = a; u <= b + .01; u += 1.2) FB.box(MAT.frame, .05, WH, .07, clamp(u, a + .025, b - .025), WH / 2, 0);
    }
    FB.box(MAT.frame, RW, .06, .08, 0, WH - .03, 0);
    FB.box(MAT.frame, 1.2, .06, .08, DOOR_U, 2.2, 0);
    FB.box(MAT.glass, 1.1, WH - 2.23, .02, DOOR_U, 2.2 + (WH - 2.2) / 2, 0);
    // canh cua kinh mo vao trong
    FB.box(MAT.glass, .02, 2.15, .78, d1 - .02, 1.1, .4);
    FB.box(MAT.frame, .04, 2.15, .04, d1 - .02, 1.1, .79);
    FB.box(MAT.chrome, .03, .03, .25, d1 - .06, 1.0, .62);
    FB.build(fw);
    g.add(fw); cutWalls.push({ g: fw, side: this.side, kind: "front", room: this });
    // bang ten tren cua
    this.plate = canvasTex(512, 128, () => {});
    const pm = new THREE.Mesh(UNIT.plane, new THREE.MeshStandardMaterial({ map: this.plate, roughness: .5, emissive: "#ffffff", emissiveMap: this.plate, emissiveIntensity: .25 }));
    pm.scale.set(1.0, .25, 1); pm.position.set(DOOR_U, 2.42, -.045); pm.rotation.y = Math.PI;
    g.add(pm);
    if (meeting) return;
    // nhan noi tren phong (bam de toi phong)
    const el = document.createElement("div"); el.className = "sign";
    el.onclick = () => focusRoom(this);
    this.signEl = el;
    const so = new CSS2DObject(el); so.position.set(0, WH + .2, RD - .1); g.add(so);   // tren mep tuong trong cung, khong che ban ghe
  }

  build() {
    this.trong = new THREE.Group(); this.g.add(this.trong);   // noi that: an khi phong dong cua
    const B = new Batch(), r = rng(hash(this.dept));
    this.shellWalls(B, false);
    // tham duoi cum ban
    const cA = COLS[0] - .45, cB = COLS[COLS.length - 1] + 1.35, rA = ROWS[0] - .85, rB = ROWS[ROWS.length - 1] + .85;
    const carpet = new THREE.Mesh(UNIT.plane, std("#ffffff", .98, 0, { map: canvasTex(128, 128, drawCarpet(deptHue(this.dept)), [(cB - cA) * 2, (rB - rA) * 2]) }));
    carpet.scale.set(cB - cA, rB - rA, 1); carpet.rotation.x = -Math.PI / 2; carpet.position.set((cA + cB) / 2, .006, (rA + rB) / 2); carpet.receiveShadow = true;
    this.trong.add(carpet);
    // ban nhan vien 2 hang x 3 cot (ngoi quay mat +u, man hinh phia +u)
    for (let ri = 0; ri < ROWS.length; ri++) for (let ci = 0; ci < COLS.length; ci++) {
      const cu = COLS[ci], rv = ROWS[ri], du = cu + .75;
      B.box(MAT.deskTop, .78, .04, 1.2, du, .73, rv);
      for (const s of [-.56, .56]) B.box(MAT.metal, .7, .71, .04, du, .355, rv + s);
      B.box(MAT.white, .03, .36, 1.1, du + .37, .52, rv);                 // tam che chan
      B.box(MAT.plastic, .2, .015, .26, du + .27, .755, rv);               // de man hinh
      B.box(MAT.plastic, .04, .26, .06, du + .3, .88, rv);
      B.box(MAT.plastic, .035, .37, .62, du + .3, 1.12, rv);              // vo man hinh
      B.box(MAT.keys, .15, .015, .42, du - .2, .755, rv);                 // ban phim
      B.box(MAT.plastic, .1, .02, .06, du - .2, .755, rv + .3);            // chuot
      if (r() < .7) { B.cyl(MAT.mug, .04, .1, du - .05, .8, rv - .42); B.cyl(MAT.coffee, .036, .005, du - .05, .85, rv - .42); }
      if (r() < .6) for (let k = 0; k < 3 + r() * 5; k++) B.box(MAT.paper, .2, .004, .26, du + .05 + r() * .04, .754 + k * .005, rv + .37, r() * .3);
      if (r() < .35) plant(B, du + .18, rv - .45, .26, r);
      chair(B, cu, rv, Math.PI / 2);
      wallRect(this, this.w(du - .39, rv - .6), this.w(du + .39, rv + .6));
      const sc = makeScreen(hash(this.dept) + ri * 7 + ci);
      const sm = new THREE.Mesh(UNIT.plane, sc.mat); sm.scale.set(.58, .33, 1);
      sm.position.set(du + .28, 1.12, rv); sm.rotation.y = -Math.PI / 2; this.trong.add(sm);
      const via = [[cu - .65, rv], [cu - .65, LANE_V]];
      this.desks.push({
        spot: this.spot(cu, rv, 1, 0, via, { chair: true }), screen: sc, owner: null, idx: ri * COLS.length + ci,
        check: this.spot(cu - .5, rv + .55, .7, -.5, [[cu - .65, rv + .55], [cu - .65, LANE_V]]),
      });
    }
    // ban truong phong (go oc cho) o goc trong
    const lu = -RW / 2 + 1.4, lv = RD - 1.5;
    B.box(MAT.walnut, 1.4, .05, .8, lu, .75, lv);
    B.box(MAT.walnut, 1.36, .6, .04, lu, .43, lv - .38);
    for (const s of [-.66, .66]) B.box(MAT.walnut, .05, .72, .76, lu + s, .36, lv);
    B.box(MAT.plastic, .7, .4, .035, lu, 1.15, lv - .2);
    B.box(MAT.plastic, .05, .22, .05, lu, .88, lv - .18); B.box(MAT.plastic, .26, .015, .18, lu, .78, lv - .18);
    B.box(MAT.keys, .42, .015, .14, lu, .78, lv + .12);
    B.box(MAT.chrome, .3, .07, .03, lu + .4, .79, lv - .3);
    B.cyl(MAT.mug, .04, .1, lu - .5, .82, lv + .15);
    chair(B, lu, RD - .75, Math.PI, true);
    const lsc = makeScreen(hash(this.dept) + 99, 320, 180);
    const lsm = new THREE.Mesh(UNIT.plane, lsc.mat); lsm.scale.set(.66, .36, 1); lsm.position.set(lu, 1.15, lv - .18); this.trong.add(lsm);
    wallRect(this, this.w(lu - .7, lv - .4), this.w(lu + .7, lv + .4));
    this.lead = { spot: this.spot(lu, RD - .75, 0, -1, [[-RW / 2 + .5, RD - .75], [-RW / 2 + .5, LANE_V]], { chair: true }), screen: lsc, owner: null,
      check: this.spot(lu + 1.0, RD - .75, -1, 0, [[lu + 1.0, LANE_V]]) };   // cho Sep dung canh khi di kiem tra
    // ke ho so (binder) sat tuong ngoai
    const su = SHELF_U, sv = RD - .34, sw = SHELF_W, nb = SHELF_PER * 3;
    B.box(MAT.shelf, sw, .03, .36, su, 1.98, sv);
    for (const s of [-sw / 2 + .01, sw / 2 - .01]) B.box(MAT.shelf, .03, 1.98, .36, su + s, .99, sv);
    for (let k = 0; k < 4; k++) B.box(MAT.shelf, sw - .04, .025, .34, su, .08 + k * .48, sv);
    B.box(MAT.shelf, sw, 1.98, .02, su, .99, sv + .17);
    plant(B, su - sw / 2 + .4, sv, .22, r);
    B.box(MAT.chrome, .12, .2, .12, su + sw / 2 - .3, 2.1, sv);          // cup thuong :)
    this.binderMax = nb;
    this.binderMesh = new THREE.InstancedMesh(UNIT.box, std("#ffffff", .55), nb);
    const mtx = new THREE.Matrix4(), col = new THREE.Color();
    for (let i = 0; i < nb; i++) {
      const sh = Math.floor(i / SHELF_PER), k = i % SHELF_PER;
      const h = .3 + r() * .04;
      mtx.compose(new V3(su - sw / 2 + .14 + k * .102, .1 + sh * .48 + h / 2, sv - .02), _q.setFromEuler(_e.set(0, 0, 0)), new V3(.075, h, .28));
      this.binderMesh.setMatrixAt(i, mtx);
      this.binderMesh.setColorAt(i, col.set(["#2f6fed", "#12945c", "#c2410c", "#7c3aed", "#0e7490", "#b45309", "#be185d", "#334155"][Math.floor(r() * 8)]));
    }
    this.binderMesh.count = 0; this.binderMesh.castShadow = true; this.binderMesh.receiveShadow = true;
    this.trong.add(this.binderMesh);
    const lane = COLS.map(c => c - .65).sort((a, b) => Math.abs(a - su) - Math.abs(b - su))[0];   // loi doc gan ke nhat
    this.shelf = this.spot(su, RD - .9, 0, 1, [[lane, RD - .9], [lane, LANE_V]]);
    wallRect(this, this.w(su - sw / 2, sv - .18), this.w(su + sw / 2, sv + .18));
    // bang trang tren vach trai
    this.board = canvasTex(512, 300, () => {});
    const bm = new THREE.Mesh(UNIT.plane, new THREE.MeshStandardMaterial({ map: this.board, roughness: .35 }));
    bm.scale.set(1.7, 1.0, 1); bm.position.set(-RW / 2 + .136, 1.65, 2.6); bm.rotation.y = Math.PI / 2; this.trong.add(bm);
    B.box(MAT.frame, .03, 1.06, 1.76, -RW / 2 + .115, 1.65, 2.6);
    B.box(MAT.frame, .08, .03, 1.5, -RW / 2 + .16, 1.13, 2.6);
    // cay goc + den dung
    plant(B, RW / 2 - .5, .55, 1.05, r);
    if (su - sw / 2 - .45 > -RW / 2 + 2.3) plant(B, su - sw / 2 - .4, RD - .4, .8, r);
    // cho dung (khi het ban) doc vach kinh
    for (let k = 0, u = -RW / 2 + 2.4; k < 6 && u < RW / 2 - .5; k++, u += .65) this.stand.push({ spot: this.spot(u, 1.35, 0, -1, [[u, LANE_V]]), owner: null });
    B.build(this.trong);
    this.refreshText();
  }

  buildMeeting() {
    const B = new Batch(), r = rng(this.slot + 3);
    this.shellWalls(B, true);
    B.add(UNIT.cyl, MAT.walnut, M4(.4, .74, RD / 2 + .2, 2.2, .05, .9));
    B.cyl(MAT.metal, .1, .7, -.5, .37, RD / 2 + .2); B.cyl(MAT.metal, .1, .7, 1.3, .37, RD / 2 + .2);
    for (let k = 0; k < 4; k++) {
      const u = -.9 + k * .9;
      chair(B, u, RD / 2 - .9, 0); chair(B, u, RD / 2 + 1.3, Math.PI);
    }
    B.box(MAT.plastic, .05, .9, 1.6, RW / 2 - .16, 1.5, RD / 2 + .2);
    plant(B, RW / 2 - .5, .55, 1, r); plant(B, -RW / 2 + .6, RD - .5, 1, r);
    B.build(this.g);
    textCanvas(this.plate, (g, W, H) => {
      roundRect(g, 0, 0, W, H, 18); g.fillStyle = "#2b3038"; g.fill();
      g.fillStyle = "#fff"; g.font = "600 46px -apple-system, sans-serif"; g.textBaseline = "middle"; g.fillText("🪑 Phòng họp", 30, H / 2);
    });
  }

  refreshText() {
    if (!this.dept) return;
    const [nm, motto, emo] = deptInfo(this.dept), hue = deptHue(this.dept);
    withLogo(this.dept, im => textCanvas(this.plate, (g, W, H) => {
      roundRect(g, 0, 0, W, H, 18); g.fillStyle = "#1f242c"; g.fill();
      g.fillStyle = hue; g.fillRect(0, H - 10, W, 10);
      let x = 24;
      if (im) { g.save(); roundRect(g, 18, 14, 96, 96, 14); g.clip(); g.drawImage(im, 18, 14, 96, 96); g.restore(); x = 130; }
      else { g.font = "64px sans-serif"; g.textBaseline = "middle"; g.fillText(emo, 22, H / 2); x = 108; }
      g.fillStyle = this.dong ? "#94a3b8" : "#fff"; g.textBaseline = "middle";
      fitText(g, (this.dong ? "🔒 " : "") + nm, x, H / 2 - 4, W - x - 18, "600 {px}px -apple-system, sans-serif", 40, 24);
    }));
    textCanvas(this.board, (g, W, H) => {
      g.fillStyle = "#fbfbf9"; g.fillRect(0, 0, W, H);
      g.fillStyle = hue; fitText(g, emo + " " + nm, 22, 52, W - 40, "700 {px}px 'Marker Felt', 'Chalkboard SE', sans-serif", 34, 22);
      g.fillStyle = "#334155"; g.font = "24px 'Marker Felt', 'Chalkboard SE', sans-serif"; g.fillText(motto.slice(0, 34), 22, 92);
      g.strokeStyle = "#ef4444"; g.lineWidth = 3; g.beginPath(); g.moveTo(22, 108); g.lineTo(300, 104); g.stroke();
      g.fillStyle = "#1e293b"; g.font = "26px 'Marker Felt', 'Chalkboard SE', sans-serif";
      g.fillText("✔ Hồ sơ hôm nay: " + (this.today || 0) + " · tổng: " + this.binders, 22, 160);
      g.fillText("☕ Deadline: hôm qua", 22, 200);
      g.strokeStyle = "#2563eb"; g.lineWidth = 3; g.beginPath(); for (let i = 0; i < 9; i++) g.lineTo(330 + i * 18, 250 - Math.sin(i * .9) * 22 - i * 9); g.stroke();
      g.strokeStyle = "rgba(0,0,0,.2)"; g.lineWidth = 2; g.strokeRect(330, 160, 160, 100);
    });
  }
  // dong cua phong khong ai lam: an noi that (ban ghe, man hinh, ke, tu may), bien cua "Tam dong"
  setDong(dong) {
    if (!!this.dong === !!dong) return;
    this.dong = !!dong; this.trong.visible = !dong;
    if (this.signEl) this.signEl.classList.toggle("dong", this.dong);
    this.refreshText();
  }
  setBinders(n, today = this.today || 0) {
    this.binders = n; this.today = today;
    this.binderMesh.count = Math.min(this.binderMax, n);
    this.binderMesh.instanceMatrix.needsUpdate = true;
    this.refreshText();
  }
  // tu may chay nen
  ensureRack(t) {
    let rk = this.racks.find(x => x.id === t.id);
    if (rk) { rk.data = t; return rk; }
    const used = new Set(this.racks.map(x => x.k));
    let k = 0; while (used.has(k)) k++;
    if (k > 1) return null;
    const v = RD - .42, u = RW / 2 - .45 - k * .72;
    const g = new THREE.Group(), B = new Batch();
    B.box(MAT.rack, .6, 1.9, .7, 0, .95, 0);
    B.box(MAT.frameDark, .62, .04, .72, 0, 1.92, 0);
    for (let i = 0; i < 10; i++) B.box(MAT.plastic, .02, .12, .62, -.305, .3 + i * .15, 0);
    B.build(g);
    const ledGeo = new THREE.BoxGeometry(.01, .018, .03);
    const leds = new THREE.InstancedMesh(ledGeo, new THREE.MeshBasicMaterial({ color: "#ffffff" }), 40);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < 40; i++) { mtx.makeTranslation(-.32, .3 + Math.floor(i / 4) * .15, -.2 + (i % 4) * .1); leds.setMatrixAt(i, mtx); leds.setColorAt(i, new THREE.Color("#22c55e")); }
    g.add(leds);
    g.position.copy(new V3(u, 0, v)); g.rotation.y = -Math.PI / 2;   // mat den quay vao phong
    this.trong.add(g);
    const el = document.createElement("div"); el.className = "mach";
    const lo = new CSS2DObject(el); lo.position.set(0, 2.2, 0); g.add(lo);
    el.onclick = () => openPf(t.owner);
    rk = { id: t.id, k, g, leds, el, lo, data: t, spot: this.spot(u, RD - 1.15, 0, 1, [[LAST_LANE, RD - 1.15], [LAST_LANE, LANE_V]]) };
    this.racks.push(rk);
    return rk;
  }
  dropRack(rk) { rk.g.remove(rk.lo); this.trong.remove(rk.g); this.racks.splice(this.racks.indexOf(rk), 1); }
}

// ---------- sanh, hanh lang, vo nha ----------
const LOB = {
  w: (x, z) => new V3(x, 0, z), exitPts: () => [new V3(-1.2, 0, 0)], enterPts: () => [new V3(-1.2, 0, 0)], side: 0,
};
const lobSpot = (x, z, yaw, via, extra = {}) => ({ room: LOB, pos: [x, z], yaw, via, ...extra });
const ZB = CW / 2 + RD;   // mep ngoai nha (z)
const LZ = ZB - 8.3;      // phong khach sanh dich theo do sau nha (mau ve cho ZB 8,3)
const ELEV = lobSpot(-LOBBY + .7, 0, Math.PI / 2, [[-LOBBY + 2.2, 0]]);
const COFFEE = [lobSpot(-5.0, -ZB + 1.05, Math.PI, [[-5.0, -ZB + 1.6], [-3, -ZB + 1.6], [-3, -1.1]]),
  lobSpot(-5.9, -ZB + 1.05, Math.PI, [[-5.9, -ZB + 1.6], [-3, -ZB + 1.6], [-3, -1.1]]),
  lobSpot(-2.2, -ZB + 1.0, Math.PI, [[-2.2, -ZB + 1.6], [-2.2, -1.1]])].map(s => ({ spot: s, owner: null }));
const SOFA = [];
for (let k = 0; k < 3; k++) {
  const x = -7.2 + k * .75;
  SOFA.push({ spot: lobSpot(x, 3.66 + LZ, 0, [[x, 4.45 + LZ], [-2.6, 4.45 + LZ], [-2.6, 1.0]], { sofa: true }), owner: null });
  SOFA.push({ spot: lobSpot(x, 7.09 + LZ, Math.PI, [[x, 6.25 + LZ], [-2.6, 6.25 + LZ], [-2.6, 1.0]], { sofa: true }), owner: null });
}
const LOUNGE_STAND = [0, 1, 2, 3].map(k => ({ spot: lobSpot(-3.6 + k * .5, 2.7, Math.PI * .8, [[-3.6 + k * .5, 2.2], [-2.6, 1.0]]), owner: null }));
let elevDoors = null, elevOpen = 0, clockTex = null;

// ---------- phong giam doc: phong goc cuoi hanh lang, 3 mat kinh ----------
// Truong phong (truong phien) xong luot -> mang ho so toi bao cao; dang hoi y user -> ngoi ghe cho duyet;
// user giao viec moi -> toi nhan viec roi ve phong.
const GW = 7;   // rong phong giam doc (truc x), sau = ca nha
const GD = { x0: RW, side: 0, w: (x, z) => new V3(x, 0, z),
  exitPts() { return [new V3(this.x0 + 1.2, 0, 0), new V3(this.x0 - .8, 0, 0)]; },
  enterPts() { return this.exitPts().reverse(); } };
// toa do tinh tu mep phong (x0): nha dai them thi phong doi cho, cho ngoi doi theo
function gdSpot(dx, z, yaw, via, extra = {}) {
  return { room: GD, yaw, ...extra, get pos() { return [GD.x0 + dx, z]; }, get via() { return via.map(([vx, vz]) => [GD.x0 + vx, vz]); } };
}
const GD_DESK = GW - 2.0;
const REPORT = [-.75, 0, .75].map(z => ({ spot: gdSpot(GD_DESK - 1.05, z, Math.PI / 2, [[1.6, z]]) }));
const SEATS = [];
for (let k = 0; k < 6; k++) {
  const dx = 1.2 + k * .85;
  SEATS.push({ spot: gdSpot(dx, -ZB + .8, 0, [[dx, -ZB + 1.55], [1.6, -ZB + 1.55]], { chair: true, look: 1 }), owner: null });
  SEATS.push({ spot: gdSpot(dx, ZB - .8, Math.PI, [[dx, ZB - 1.55], [1.6, ZB - 1.55]], { chair: true, look: -1 }), owner: null });
}
let gdTray = null, gdTV = null, gdHit = null, gdScreens = [], gdInbox = 0, director = null, gdTvKey = "";
const pickReport = w => REPORT[hash(w.id) % REPORT.length];
// hang cho viec: truong phong ranh that (da bao cao, chua co viec moi) dung xep hang, ai xong som dung dau
const QUEUE = [];
const Q_N = Math.max(4, Math.min(8, Math.floor((ZB - 1.55 - .7 - 1.5) / .62) + 1));   // cho moi cot, khong lan loi di ghe cho duyet
for (const qx of [3.3, 2.55]) for (let k = 0; k < Q_N; k++) { const z = 1.5 + k * .62; QUEUE.push(gdSpot(qx, z, Math.PI, [[1.6, z]])); }
let hangCho = [];
const HANG_MAX = BC.hang_max || 5, HANG_PHUT = BC.hang_phut || 5;   // hang cho viec: so nguoi + so phut (trang Cau hinh)
function xepHang(instant = false) {
  hangCho = hangCho.filter(w => workers.has(w.id) && w.mode === "baocao" && w.inQueue);
  hangCho.sort((a, b) => (a.a.xongTs || 0) - (b.a.xongTs || 0));
  if (hangCho.length > HANG_MAX) {   // dong qua: nguoi cho lau nhat ve truoc
    const w = hangCho[0]; w.forceLeave = true; w.setMode("leave"); return;   // setMode goi lai xepHang
  }
  hangCho.forEach((w, i) => {
    const sp = QUEUE[Math.min(i, QUEUE.length - 1)];
    if (w.queueSpot === sp && !instant) return;
    w.queueSpot = sp;
    if (instant) w.place(sp);
    w.plan = [{ k: "walk", spot: sp }, { k: "act", anim: "xephang", dur: Infinity }]; w.step = null;   // dich len cho moi
  });
}

function buildShell() {
  if (shell) { scene.remove(shell); shell.traverse(o => { if (o.isMesh && !SHARED.has(o.geometry)) o.geometry.dispose(); }); }
  for (let i = cutWalls.length - 1; i >= 0; i--) if (cutWalls[i].room && !cutWalls[i].room.dept) cutWalls.splice(i, 1);
  for (let i = cutWalls.length - 1; i >= 0; i--) if (cutWalls[i].shell) cutWalls.splice(i, 1);
  WALLS = WALLS.filter(w => w.own !== "shell" && w.own.dept);   // dung lai: bo tuong vo nha + phong hop tam
  shell = new THREE.Group(); scene.add(shell);
  const B = new Batch(), r = rng(21);
  const xE = ncol * RW, xG = xE + GW;
  GD.x0 = xE;
  // be san + san hanh lang + san sanh
  B.box(MAT.slab, xG + LOBBY + .4, .3, 2 * ZB + .4, (xG - LOBBY) / 2, -.15, 0);
  const corr = new THREE.Mesh(UNIT.plane, std("#ffffff", .28, 0, { map: TEX.concrete }));
  TEX.concrete.repeat.set(Math.max(1, xE / 6), 1);
  corr.scale.set(xE, CW, 1); corr.rotation.x = -Math.PI / 2; corr.position.set(xE / 2, .002, 0); corr.receiveShadow = true; shell.add(corr);
  const lob = new THREE.Mesh(UNIT.plane, std("#ffffff", .22, 0, { map: TEX.tiles }));
  lob.scale.set(LOBBY, 2 * ZB, 1); lob.rotation.x = -Math.PI / 2; lob.position.set(-LOBBY / 2, .002, 0); lob.receiveShadow = true; shell.add(lob);
  // cuoi hanh lang: cua kinh doi vao phong giam doc
  plant(B, xE - .5, -CW / 2 + .5, 1.1, r); plant(B, xE - .5, CW / 2 - .5, 1.1, r);
  buildGD(B, xE, r);
  // tuong tay sanh: thang may + bang logo
  B.box(MAT.wall, .16, WH, 2 * ZB, -LOBBY - .08, WH / 2, 0);
  B.box(MAT.steel, .05, 2.4, 2.0, -LOBBY + .01, 1.2, 0);
  B.box(MAT.frameDark, .03, .12, .5, -LOBBY + .04, 2.55, 0);
  const DM = MAT.elevator;
  elevDoors = [new THREE.Mesh(UNIT.box, DM), new THREE.Mesh(UNIT.box, DM)];
  elevDoors.forEach((d, i) => { d.scale.set(.04, 2.2, .78); d.position.set(-LOBBY + .05, 1.1, i ? .39 : -.39); d.castShadow = true; shell.add(d); });
  B.box(MAT.walnut, .04, 1.4, 3.4, -LOBBY + .02, 1.6, -3.6);
  const logoTex = lobbyLogo = canvasTex(1024, 420, veLogoSanh);
  const lm = new THREE.Mesh(UNIT.plane, new THREE.MeshStandardMaterial({ map: logoTex, transparent: true, roughness: .4, emissive: "#ffffff", emissiveMap: logoTex, emissiveIntensity: .35 }));
  lm.scale.set(3.0, 1.23, 1); lm.position.set(-LOBBY + .05, 1.6, -3.6); lm.rotation.y = Math.PI / 2; shell.add(lm);
  clockTex = canvasTex(256, 256, () => {});
  const cm = new THREE.Mesh(new THREE.CircleGeometry(.35, 40), new THREE.MeshStandardMaterial({ map: clockTex, roughness: .4 }));
  cm.position.set(-LOBBY + .05, 2.3, 3.0); cm.rotation.y = Math.PI / 2; shell.add(cm); drawClock();
  // tuong ngoai bac/nam cua sanh (co cua so)
  for (const sd of [-1, 1]) {
    const wg = new THREE.Group(), WB = new Batch(), z = sd * (ZB - .07);
    WB.box(MAT.wall, LOBBY, .85, .14, -LOBBY / 2, .425, z);
    WB.box(MAT.wall, LOBBY, .3, .14, -LOBBY / 2, WH - .15, z);
    WB.box(MAT.white, LOBBY, .04, .3, -LOBBY / 2, .87, z - sd * .07);
    WB.box(MAT.glass, LOBBY, WH - 1.15, .02, -LOBBY / 2, .85 + (WH - 1.15) / 2, z);
    for (let x = -LOBBY; x <= .01; x += 1.25) WB.box(MAT.frameDark, .07, WH - 1.15, .1, clamp(x, -LOBBY + .035, -.035), .85 + (WH - 1.15) / 2, z);
    WB.build(wg); shell.add(wg); cutWalls.push({ g: wg, side: sd, kind: "back", shell: true });
  }
  // le tan
  // va cham: tuong sanh, le tan, quay an uong, sofa
  wallXZ("shell", -LOBBY - .16, -ZB, -LOBBY, ZB); wallXZ("shell", -LOBBY, -ZB, 0, -ZB + .14); wallXZ("shell", -LOBBY, ZB - .14, 0, ZB);
  wallXZ("shell", -8.5, -3.45, -6.3, -2.1); wallXZ("shell", -8.0, -ZB, -3.3, -ZB + .75); wallXZ("shell", -8.65, -ZB, -7.95, -ZB + .75);
  wallXZ("shell", -7.75, 3.15 + LZ, -5.15, 4.05 + LZ); wallXZ("shell", -7.75, 6.7 + LZ, -5.15, 7.6 + LZ); wallXZ("shell", -7.15, 5.05 + LZ, -5.75, 5.75 + LZ);
  B.box(MAT.walnut, 2.2, 1.05, .5, -7.4, .525, -2.35);
  B.box(MAT.white, 2.3, .04, .62, -7.4, 1.07, -2.35);
  B.box(MAT.walnut, .5, 1.05, 1.0, -8.25, .525, -2.95);
  chair(B, -7.2, -3.2, 0);
  B.box(MAT.plastic, .5, .3, .03, -7.2, .9, -2.6);
  plant(B, -9.3, -1.6, 1.2, r); plant(B, -9.3, 1.6, 1.2, r);
  // goc an uong: quay + may pha ca phe + binh nuoc + tu lanh
  B.box(MAT.white, 4.6, .9, .65, -5.6, .45, -ZB + .4);
  B.box(MAT.walnut, 4.7, .05, .7, -5.6, .92, -ZB + .4);
  B.box(MAT.plastic, .38, .5, .4, -5.0, 1.2, -ZB + .4); B.box(MAT.chrome, .3, .05, .2, -5.0, 1.0, -ZB + .5);
  B.box(MAT.plastic, .36, .45, .38, -5.9, 1.17, -ZB + .4);
  for (let k = 0; k < 4; k++) B.cyl(MAT.mug, .04, .1, -6.6 + k * .12, .99, -ZB + .45);
  B.box(MAT.white, .7, 1.85, .65, -8.3, .925, -ZB + .4); B.box(MAT.chrome, .03, .5, .03, -8.0, 1.2, -ZB + .08);
  B.cyl(MAT.white, .18, 1.0, -2.2, .5, -ZB + .35); B.cyl(new THREE.MeshStandardMaterial({ color: "#7dd3fc", transparent: true, opacity: .55, roughness: .1 }), .15, .42, -2.2, 1.21, -ZB + .35);
  // ghe ban nho goc an uong
  B.cyl(MAT.white, .45, .03, -5.5, .74, -3.6); B.cyl(MAT.metal, .04, .72, -5.5, .36, -3.6);
  for (const a of [0, 1, 2]) chair(B, -5.5 + Math.cos(a * 2.1) * .75, -3.6 + Math.sin(a * 2.1) * .75, -a * 2.1 - Math.PI / 2);
  // phong khach: 2 sofa doi dien + ban tra + tham
  const rug = new THREE.Mesh(UNIT.plane, std("#ffffff", .98, 0, { map: canvasTex(128, 128, drawCarpet("#b45309"), [6, 5]) }));
  rug.scale.set(3.8, 3.6, 1); rug.rotation.x = -Math.PI / 2; rug.position.set(-6.45, .005, 5.4 + LZ); rug.receiveShadow = true; shell.add(rug);
  for (const [z, f] of [[3.6 + LZ, 1], [7.15 + LZ, -1]]) {
    B.box(MAT.sofa, 2.5, .42, .85, -6.45, .21, z - f * .05);
    B.box(MAT.sofa, 2.5, .5, .2, -6.45, .55, z - f * .42);
    for (const x of [-7.75, -5.15]) B.box(MAT.sofa, .2, .58, .85, x, .29, z - f * .05);
    for (let k = 0; k < 3; k++) B.box(MAT.sofa2, .7, .12, .7, -7.2 + k * .75, .46, z);
  }
  B.box(MAT.walnut, 1.4, .05, .7, -6.45, .42, 5.4 + LZ); B.box(MAT.metal, 1.3, .38, .6, -6.45, .2, 5.4 + LZ);
  B.cyl(MAT.mug, .04, .1, -6.2, .5, 5.3 + LZ); plant(B, -6.8, 5.45 + LZ, .2, r);
  plant(B, -9.3, ZB - 1, 1.3, r); plant(B, -1.0, ZB - 1, 1.1, r); plant(B, -1.0, -ZB + 1, 1.1, r);
  // phong hop cho o con trong
  B.build(shell);
  for (const rm of rooms.filter(x => !x.dept)) { scene.remove(rm.g); }
  for (let i = rooms.length - 1; i >= 0; i--) if (!rooms[i].dept) rooms.splice(i, 1);
  for (let s = realRooms().length; s < ncol * 2; s++) rooms.push(new Room(s, null));
  // ngoai troi: nen, san, duong, cay, phong canh thanh pho
  const og = new THREE.Group(), OB = new Batch(), r2 = rng(77);
  OB.box(MAT.plaza, xG + LOBBY + 16, .05, 2 * ZB + 14, (xG - LOBBY) / 2, -.31, 0);
  OB.box(MAT.road, xG + LOBBY + 80, .04, 7, (xG - LOBBY) / 2, -.33, ZB + 11);
  for (let x = -LOBBY - 6; x < xG + 6; x += 5.5) for (const z of [-ZB - 4, ZB + 4.5]) {
    const s = .8 + r2() * .5, tx = x + r2() * 1.5;
    OB.cyl(MAT.trunk, .12 * s, 2.2 * s, tx, -.3 + 1.1 * s, z);
    for (let k = 0; k < 3; k++) OB.add(UNIT.ico, k % 2 ? MAT.leaf : MAT.leaf2, M4(tx + (r2() - .5) * .8, -.3 + (2.4 + k * .5) * s, z + (r2() - .5) * .8, 1.1 * s, .9 * s, 1.1 * s, r2(), r2(), 0));
  }
  OB.build(og); shell.add(og);
  const ground = new THREE.Mesh(UNIT.plane, MAT.ground); ground.scale.set(500, 500, 1); ground.rotation.x = -Math.PI / 2; ground.position.y = -.34; ground.receiveShadow = true; shell.add(ground);
  sky.position.set((xG - LOBBY) / 2, -2, 0);
  // bong do phu het nha
  const cx = (xG - LOBBY) / 2, half = Math.max((xG + LOBBY) / 2, ZB) + 6;
  sun.target.position.set(cx, 0, 0);
  sun.position.set(cx - 22, 34, 26);
  Object.assign(sun.shadow.camera, { left: -half * 1.2, right: half * 1.2, top: half, bottom: -half, near: 1, far: 120 });
  sun.shadow.camera.updateProjectionMatrix();
  // giam doc ngoi dung cho; ai dang ngoi/dung trong phong giam doc thi doi theo phong
  if (!director) director = new Director();
  director.place();
  for (const w of workers.values()) if (w.spot && w.spot.room === GD && (!w.step || w.step.k !== "walk")) w.place(w.spot);
}

function buildGD(B, x0, r) {
  const xG = x0 + GW, mid = x0 + GW / 2, gh = WH - 1.15;
  // va cham: tuong 3 mat, canh cua kinh, ban giam doc, tu thap
  wallXZ("shell", x0, -ZB, xG + .14, -ZB + .14); wallXZ("shell", x0, ZB - .14, xG + .14, ZB); wallXZ("shell", xG, -ZB, xG + .14, ZB);
  for (const sd of [-1, 1]) wallXZ("shell", x0 - .04, Math.min(sd * .95, sd * CW / 2), x0 + .04, Math.max(sd * .95, sd * CW / 2));
  wallXZ("shell", x0 + GD_DESK - .48, -1.2, x0 + GD_DESK + .48, 1.2); wallXZ("shell", x0 + GD_DESK - .45, 1.15, x0 + GD_DESK + 1.15, 1.75);
  for (const s2 of [-2.8, 2.8]) wallXZ("shell", xG - .55, s2 - 1.2, xG - .05, s2 + 1.2);
  const ptex = TEX.parquet.clone(); ptex.repeat.set(GW / 2.4, 2 * ZB / 2.4); ptex.needsUpdate = true;
  const fl = new THREE.Mesh(UNIT.plane, std("#c39a72", .38, 0, { map: ptex }));
  fl.scale.set(GW, 2 * ZB, 1); fl.rotation.x = -Math.PI / 2; fl.position.set(mid, .003, 0); fl.receiveShadow = true; shell.add(fl);
  const rug = new THREE.Mesh(UNIT.plane, std("#ffffff", .98, 0, { map: canvasTex(128, 128, drawCarpet("#7c2d12"), [8, 9]) }));
  rug.scale.set(4.4, 5.0, 1); rug.rotation.x = -Math.PI / 2; rug.position.set(x0 + GD_DESK - .6, .006, 0); rug.receiveShadow = true; shell.add(rug);
  gdHit = new THREE.Mesh(UNIT.plane, new THREE.MeshBasicMaterial({ visible: false }));
  gdHit.scale.set(GW, 2 * ZB, 1); gdHit.rotation.x = -Math.PI / 2; gdHit.position.set(mid, .01, 0); gdHit.userData.gd = true; shell.add(gdHit);
  // tuong ngoai bac, nam, dong: chan tuong + kinh (ha xuong khi may quay o phia ngoai)
  for (const sd of [-1, 1]) {
    const wg = new THREE.Group(), WB = new Batch(), z = sd * (ZB - .07);
    WB.box(MAT.wall, GW, .85, .14, mid, .425, z); WB.box(MAT.wall, GW, .3, .14, mid, WH - .15, z);
    WB.box(MAT.white, GW, .04, .3, mid, .87, z - sd * .07);
    WB.box(MAT.glass, GW, gh, .02, mid, .85 + gh / 2, z);
    for (let x = x0; x <= xG + .01; x += 1.5) WB.box(MAT.frameDark, .07, gh, .1, clamp(x, x0 + .035, xG - .035), .85 + gh / 2, z);
    WB.build(wg); shell.add(wg); cutWalls.push({ g: wg, side: sd, kind: "back", shell: true });
  }
  {
    const wg = new THREE.Group(), WB = new Batch(), x = xG + .07;
    WB.box(MAT.wall, .14, .85, 2 * ZB, x, .425, 0); WB.box(MAT.wall, .14, .3, 2 * ZB, x, WH - .15, 0);
    WB.box(MAT.white, .3, .04, 2 * ZB, x - .07, .87, 0);
    WB.box(MAT.glass, .02, gh, 2 * ZB, x, .85 + gh / 2, 0);
    for (let z = -ZB; z <= ZB + .01; z += 1.5) WB.box(MAT.frameDark, .1, gh, .07, x, .85 + gh / 2, clamp(z, -ZB + .035, ZB - .035));
    WB.build(wg); shell.add(wg); cutWalls.push({ g: wg, kind: "east", x: xG, shell: true });
  }
  // cua kinh doi (mo vao trong) o cuoi hanh lang
  for (const sd of [-1, 1]) {
    B.box(MAT.glass, .02, WH - .1, .75, x0, (WH - .1) / 2 + .05, sd * 1.325);
    B.box(MAT.frame, .07, WH, .05, x0, WH / 2, sd * .95); B.box(MAT.frame, .07, WH, .05, x0, WH / 2, sd * (CW / 2 - .03));
    B.box(MAT.glass, .8, 2.15, .02, x0 + .42, 1.1, sd * .93); B.box(MAT.chrome, .03, .3, .03, x0 + .72, 1.0, sd * .9);
  }
  B.box(MAT.frame, .08, .06, CW, x0, 2.2, 0); B.box(MAT.frame, .08, .06, CW, x0, WH - .03, 0);
  B.box(MAT.glass, .02, WH - 2.23, 1.9, x0, 2.2 + (WH - 2.2) / 2, 0);
  const plate = canvasTex(512, 128, (g, W, H) => {
    roundRect(g, 0, 0, W, H, 18); g.fillStyle = "#3b2416"; g.fill(); g.fillStyle = "#f2c14e"; g.fillRect(0, H - 10, W, 10);
    g.fillStyle = "#fff"; g.textBaseline = "middle"; fitText(g, "🏛️ Phòng Giám Đốc", 24, H / 2 - 4, W - 48, "600 {px}px -apple-system, sans-serif", 44, 26);
  });
  const pm = new THREE.Mesh(UNIT.plane, new THREE.MeshStandardMaterial({ map: plate, roughness: .5, emissive: "#ffffff", emissiveMap: plate, emissiveIntensity: .25 }));
  pm.scale.set(1.5, .375, 1); pm.position.set(x0 - .06, 2.48, 0); pm.rotation.y = -Math.PI / 2; shell.add(pm);
  // ban giam doc (go oc cho) quay ra cua, 2 man hinh, khay ho so
  const dx = x0 + GD_DESK;
  B.box(MAT.walnut, .95, .06, 2.4, dx, .76, 0);
  B.box(MAT.walnut, .05, .7, 2.36, dx - .44, .38, 0);
  for (const s of [-1.15, 1.15]) B.box(MAT.walnut, .9, .73, .06, dx, .365, s);
  B.box(MAT.walnut, 1.6, .06, .6, dx + .35, .76, 1.45); B.box(MAT.walnut, .06, .73, .56, dx - .42, .365, 1.45);   // ban phu chu L
  B.box(MAT.chrome, .03, .09, .5, dx - .48, .84, 0);                                                             // bien ten vang
  // tam logo tron vien vang tren mat truoc ban, nhin ra cua
  const lg = new THREE.Mesh(new THREE.CircleGeometry(.24, 48), new THREE.MeshStandardMaterial({ map: LOGO_TEX, transparent: true, roughness: .45 }));
  lg.position.set(dx - .472, .43, 0); lg.rotation.y = -Math.PI / 2; shell.add(lg);
  const vien = new THREE.Mesh(new THREE.TorusGeometry(.245, .014, 8, 48), std("#f2c14e", .25, .9));
  vien.position.set(dx - .47, .43, 0); vien.rotation.y = -Math.PI / 2; shell.add(vien);
  B.box(MAT.keys, .16, .015, .45, dx + .22, .8, 0);
  B.box(MAT.plastic, .1, .02, .06, dx + .22, .8, .36);
  B.cyl(MAT.mug, .045, .11, dx + .25, .84, -.75);
  plant(B, dx + .25, 1.6, .3, r);
  B.cyl(MAT.metal, .1, .02, dx + .3, .8, -1.0); B.cyl(MAT.metal, .012, .4, dx + .3, 1.0, -1.0); B.box(MAT.metal, .12, .05, .22, dx + .22, 1.2, -1.0);
  gdScreens.forEach(sc => SCREENS.splice(SCREENS.indexOf(sc), 1));
  gdScreens = [-.42, .42].map((z, i) => {
    B.box(MAT.plastic, .2, .015, .25, dx - .17, .8, z); B.box(MAT.plastic, .05, .24, .05, dx - .17, .92, z);
    B.box(MAT.plastic, .035, .38, .64, dx - .15, 1.15, z);
    const sc = makeScreen(7000 + i);
    const sm = new THREE.Mesh(UNIT.plane, sc.mat); sm.scale.set(.6, .34, 1); sm.position.set(dx - .129, 1.15, z); sm.rotation.y = Math.PI / 2; shell.add(sm);
    return sc;
  });
  B.box(MAT.walnut, .32, .05, .4, dx + .05, .79, .97);      // khay ho so
  gdTray = new THREE.InstancedMesh(UNIT.box, std("#ffffff", .55), 30);
  const mtx = new THREE.Matrix4(), col = new THREE.Color(), r2 = rng(99);
  for (let i = 0; i < 30; i++) {
    mtx.compose(new V3(dx + .05 + (r2() - .5) * .02, .825 + i * .013, .97 + (r2() - .5) * .02), _q.setFromEuler(_e.set(0, (r2() - .5) * .2, 0)), new V3(.25, .011, .33));
    gdTray.setMatrixAt(i, mtx); gdTray.setColorAt(i, col.set(["#2f6fed", "#c2410c", "#12945c", "#7c3aed", "#b45309"][Math.floor(r2() * 5)]));
  }
  gdTray.count = Math.min(30, gdInbox); gdTray.castShadow = true; shell.add(gdTray);
  chair(B, x0 + GD_DESK + .78, 0, -Math.PI / 2, true);
  chair(B, dx - 1.1, -2.2, Math.PI / 2);
  // tu thap sau lung + cay goc
  for (const s of [-2.8, 2.8]) { B.box(MAT.walnut, .45, .7, 2.4, xG - .3, .35, s); plant(B, xG - .3, s + .7, .35, r); B.box(MAT.chrome, .12, .22, .12, xG - .3, .81, s - .6); }
  for (const [px, pz] of [[xG - .55, -ZB + .6], [xG - .55, ZB - .6], [x0 + .6, ZB - .6]]) plant(B, px, pz, 1.25, r);
  // ghe cho duyet: 2 hang doc tuong ngoai, bien "Chờ duyệt"
  for (const st of SEATS) chair(B, st.spot.pos[0], st.spot.pos[1], st.spot.yaw);
  for (const sd of [-1, 1]) {
    for (let k = 0; k < 5; k++) B.box(MAT.walnut, .3, .45, .3, x0 + 1.2 + k * .85 + .425, .225, sd * (ZB - .8));
    const sg = canvasTex(256, 96, (g, W, H) => { roundRect(g, 0, 0, W, H, 12); g.fillStyle = "#1f242c"; g.fill(); g.fillStyle = "#f59e0b";
      g.font = "600 36px -apple-system, sans-serif"; g.textBaseline = "middle"; g.fillText("⏳ Chờ duyệt", 18, H / 2); });
    B.cyl(MAT.metal, .02, 1.4, x0 + .55, .7, sd * (ZB - 1.1)); B.cyl(MAT.metal, .15, .02, x0 + .55, .01, sd * (ZB - 1.1));
    const sm = new THREE.Mesh(UNIT.plane, new THREE.MeshStandardMaterial({ map: sg, roughness: .5 }));
    sm.scale.set(.75, .28, 1); sm.position.set(x0 + .57, 1.45, sd * (ZB - 1.1)); sm.rotation.y = Math.PI / 2; shell.add(sm);
  }
  // hang cho viec: cot + day nhung mot ben, bien o cuoi hang
  const qEnd = 1.5 + (Q_N - 1) * .62 + .3, nPost = Math.max(2, Math.round((qEnd - 1.9) / .9) + 1), qStep = (qEnd - 1.9) / (nPost - 1);
  for (let k = 0; k < nPost; k++) { const z = 1.9 + k * qStep; B.cyl(MAT.chrome, .025, .95, x0 + 3.75, .475, z); B.cyl(MAT.chrome, .14, .03, x0 + 3.75, .015, z); }
  B.add(UNIT.cyl, std("#9f1239", .6), M4(x0 + 3.75, .82, (1.9 + qEnd) / 2, .02, qEnd - 1.9, .02, Math.PI / 2, 0, 0));
  const qs = canvasTex(256, 96, (g, W, H) => { roundRect(g, 0, 0, W, H, 12); g.fillStyle = "#1f242c"; g.fill(); g.fillStyle = "#4ade80";
    g.font = "600 32px -apple-system, sans-serif"; g.textBaseline = "middle"; g.fillText("🙋 Chờ việc", 22, H / 2); });
  const qSign = Math.min(qEnd + .35, ZB - 1.55 - .3);
  B.cyl(MAT.metal, .02, 1.4, x0 + 2.9, .7, qSign); B.cyl(MAT.metal, .15, .02, x0 + 2.9, .01, qSign);
  const qm = new THREE.Mesh(UNIT.plane, new THREE.MeshStandardMaterial({ map: qs, roughness: .5 }));
  qm.scale.set(.75, .28, 1); qm.position.set(x0 + 2.9, 1.45, qSign - .02); qm.rotation.y = Math.PI; shell.add(qm);
  // man hinh lon theo doi cac phong (chi so luong, khong noi dung)
  B.box(MAT.plastic, .06, 1.56, 2.76, x0 + .05, 1.75, -4.2);
  gdTV = canvasTex(1024, 576, () => {}); gdTvKey = "";
  const tv = new THREE.Mesh(UNIT.plane, new THREE.MeshStandardMaterial({ color: "#000", emissive: "#ffffff", emissiveMap: gdTV, emissiveIntensity: .95, roughness: .3 }));
  tv.scale.set(2.64, 1.485, 1); tv.position.set(x0 + .09, 1.75, -4.2); tv.rotation.y = Math.PI / 2; shell.add(tv);
}
// Logo xuong (logo/xuong_tron.png — anh Sep): bang logo sanh + tam logo tren ban Sep
const LOGO_TEX = new THREE.TextureLoader().load("/logo/xuong_tron.png");
LOGO_TEX.colorSpace = THREE.SRGBColorSpace; LOGO_TEX.anisotropy = 8;
const LOGO_IMG = new Image();
let lobbyLogo = null;
LOGO_IMG.onload = () => { if (lobbyLogo) textCanvas(lobbyLogo, veLogoSanh); };
LOGO_IMG.src = "/logo/xuong_tron.png";
function veLogoSanh(g, W, H) {
  let x = 40;
  if (LOGO_IMG.complete && LOGO_IMG.naturalWidth) { g.drawImage(LOGO_IMG, 30, 40, 340, 340); x = 400; }
  g.textBaseline = "middle"; g.textAlign = "left";
  g.fillStyle = "#f6efe4"; fitText(g, BIEN_SANH.dong1 || "", x, H / 2 - 40, W - x - 30, "700 {px}px -apple-system, sans-serif", 140, 60);
  g.fillStyle = "#e7c28a"; fitText(g, BIEN_SANH.dong2 || XUONG, x + 4, H / 2 + 80, W - x - 30, "{px}px -apple-system, sans-serif", 44, 22);
}
function setInbox(n) { gdInbox = Math.max(0, n); if (gdTray) gdTray.count = Math.min(30, gdInbox); }
function drawTV() {
  if (!gdTV || !S) return;
  const gd = S.giamdoc || { hom_nay: {}, theo_phong: {} }, all = [...S.agents, ...S.leads];
  const rows = realRooms().map(rm => {
    const ws = all.filter(a => a.dept === rm.dept);
    return [rm, ws.filter(a => a.status === "chay" || a.status === "cho").length, ws.filter(a => a.kind === "lead" && a.duyet).length,
      (gd.theo_phong[rm.dept] || {}).bao_cao || 0, rm.today || 0];
  });
  const key = JSON.stringify([rows.map(r => [r[0].dept, r[1], r[2], r[3], r[4]]), gd.hom_nay, anon, new Date().getMinutes()]);
  if (key === gdTvKey) return; gdTvKey = key;
  textCanvas(gdTV, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#0f172a"); gr.addColorStop(1, "#1e293b"); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = "#f8fafc"; g.font = "700 40px -apple-system, sans-serif"; g.textBaseline = "middle"; g.fillText("📋 Các phòng hôm nay", 36, 50);
    g.font = "26px -apple-system, sans-serif"; g.fillStyle = "#94a3b8"; g.textAlign = "right";
    g.fillText(new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }), W - 36, 50); g.textAlign = "left";
    const hn = gd.hom_nay || {};
    g.font = "600 26px -apple-system, sans-serif"; g.fillStyle = "#fbbf24";
    g.fillText(`📣 Đầu việc: ${hn.giao || 0}    📥 Báo cáo: ${hn.bao_cao || 0}    ⏳ Chờ duyệt: ${hn.cho_duyet || 0}`, 36, 100);
    const cols = [470, 640, 800, 950];
    g.font = "22px -apple-system, sans-serif"; g.fillStyle = "#94a3b8";
    ["🟢 Đang làm", "⏳ Chờ duyệt", "📥 Báo cáo", "📁 Hồ sơ"].forEach((t, i) => { g.textAlign = "right"; g.fillText(t, cols[i], 148); });
    g.textAlign = "left";
    rows.slice(0, 9).forEach(([rm, run, wait, rep, hs], i) => {
      const y = 196 + i * 42, [nm, , em] = deptInfo(rm.dept);
      if (i % 2) { g.fillStyle = "rgba(255,255,255,.04)"; g.fillRect(24, y - 21, W - 48, 42); }
      g.fillStyle = "#e2e8f0"; g.font = "26px -apple-system, sans-serif"; fitText(g, em + " " + nm, 36, y, 300, "{px}px -apple-system, sans-serif", 26, 18);
      g.textAlign = "right"; g.font = "600 28px -apple-system, sans-serif";
      [[run, "#4ade80"], [wait, "#fbbf24"], [rep, "#93c5fd"], [hs, "#e2e8f0"]].forEach(([v, c], k) => { g.fillStyle = v ? c : "#475569"; g.fillText(String(v), cols[k], y); });
      g.textAlign = "left";
    });
  });
}
const realRooms = () => rooms.filter(r => r.dept);
const SHARED = new Set(Object.values(UNIT));
// Va cham cho che do sep di kiem tra: tuong, vach, ban lon (chu nhat tren mat san, toa do the gioi)
let WALLS = [];
function wallRect(own, a, b) { WALLS.push({ x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z), own }); }
const wallXZ = (own, x0, z0, x1, z1) => wallRect(own, new V3(x0, 0, z0), new V3(x1, 0, z1));
function blocked(x, z, r = .22) { for (const w of WALLS) if (x > w.x0 - r && x < w.x1 + r && z > w.z0 - r && z < w.z1 + r) return true; return false; }
function drawClock() {
  if (!clockTex) return;
  const d = new Date();
  textCanvas(clockTex, (g, W, H) => {
    g.fillStyle = "#fbfaf7"; g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 4, 0, TAU); g.fill();
    g.strokeStyle = "#2b2b2b"; g.lineWidth = 8; g.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.lineWidth = i % 3 ? 3 : 6; g.beginPath(); g.moveTo(W / 2 + Math.sin(a) * 100, H / 2 - Math.cos(a) * 100); g.lineTo(W / 2 + Math.sin(a) * 114, H / 2 - Math.cos(a) * 114); g.stroke(); }
    const hand = (a, L, w, c) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = "round"; g.beginPath(); g.moveTo(W / 2, H / 2); g.lineTo(W / 2 + Math.sin(a) * L, H / 2 - Math.cos(a) * L); g.stroke(); };
    hand((d.getHours() % 12 + d.getMinutes() / 60) / 12 * TAU, 60, 9, "#222");
    hand(d.getMinutes() / 60 * TAU, 92, 6, "#222");
  });
}

// bau troi + thanh pho xa (tru tron, ve canvas theo gio)
const skyTex = canvasTex(2048, 512, () => {}, [3, 1]);
const sky = new THREE.Mesh(new THREE.CylinderGeometry(150, 150, 70, 64, 1, true), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
sky.geometry.translate(0, 33, 0);
scene.add(sky);
let skyNight = -1;
function drawSky(tod) {
  textCanvas(skyTex, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, tod.skyTop); gr.addColorStop(.72, tod.skyBot); gr.addColorStop(1, tod.skyBot);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const r = rng(42);
    for (let layer = 0; layer < 2; layer++) {
      let x = 0;
      while (x < W) {
        const bw = 30 + r() * 70, bh = (layer ? 60 : 30) + r() * (layer ? 150 : 90);
        const c = layer ? (tod.night > .5 ? "#141a2a" : "#7d8794") : (tod.night > .5 ? "#1d2539" : "#a3adb8");
        g.fillStyle = c; g.fillRect(x, H * .86 - bh, bw, bh + H * .14);
        if (layer) for (let wy = H * .86 - bh + 6; wy < H * .86; wy += 9) for (let wx = x + 4; wx < x + bw - 4; wx += 8)
          if (r() < (tod.night > .5 ? .35 : .15)) { g.fillStyle = tod.night > .5 ? "rgba(255,214,140,.85)" : "rgba(220,235,250,.5)"; g.fillRect(wx, wy, 4, 5); }
        x += bw + r() * 6;
      }
    }
    g.fillStyle = tod.night > .5 ? "#0f1520" : "#6f7b5c"; g.fillRect(0, H * .86, W, H * .14);
  });
}
// gio trong ngay theo dong ho that
const TOD = [
  [0, .05, "#8fa4d8", .25, .42, "#0b1430", "#26355a", 1], [5.5, .08, "#8fa4d8", .3, .45, "#141f44", "#3a4670", 1],
  [6.7, .9, "#ffbf8a", .5, .58, "#6f8fc4", "#f6c69c", .3], [9, 1.6, "#fff3e0", .62, .62, "#5c9be0", "#d5e7f6", 0],
  [16, 1.6, "#fff3e0", .62, .62, "#5c9be0", "#d5e7f6", 0], [18, .9, "#ffab78", .5, .58, "#4a5f9a", "#f2b07f", .3],
  [19.3, .08, "#8fa4d8", .3, .45, "#121c40", "#2f3c66", 1], [24, .05, "#8fa4d8", .25, .42, "#0b1430", "#26355a", 1],
];
function tod() {
  const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
  let i = 0; while (i < TOD.length - 2 && TOD[i + 1][0] <= h) i++;
  const a = TOD[i], b = TOD[i + 1], t = clamp((h - a[0]) / (b[0] - a[0]), 0, 1);
  const col = (x, y) => "#" + new THREE.Color(x).lerp(new THREE.Color(y), t).getHexString();
  return { sun: lerp(a[1], b[1], t), sunCol: col(a[2], b[2]), hemi: lerp(a[3], b[3], t), env: lerp(a[4], b[4], t),
    skyTop: col(a[5], b[5]), skyBot: col(a[6], b[6]), night: lerp(a[7], b[7], t) };
}
function applyTod() {
  const t = tod();
  sun.intensity = t.sun; sun.color.set(t.sunCol); hemi.intensity = t.hemi; scene.environmentIntensity = t.env + t.night * .15;
  scene.background = new THREE.Color(t.skyBot);
  const n = t.night > .5 ? 1 : 0;
  if (n !== skyNight || !skyTex.userData.drawn) { drawSky(t); skyNight = n; skyTex.userData.drawn = 1; }
  for (const sc of SCREENS) sc.mat.emissiveIntensity = .8 + t.night * .5;
}

// ---------- nhan vien ----------
const SKIN = ["#f6d7c3", "#efc8ad", "#f3cfb6", "#e8bc9c", "#f8dccb"];
const TRAIT = {
  nv_01: ["long", "#2b1d16"], nv_02: ["pony", "#3b2418"], nv_03: ["bob", "#1d1715", 1], nv_04: ["long", "#4a2c1d"], nv_05: ["braids", "#22180f"],
  nv_06: ["bun", "#3a2417"], nv_07: ["long", "#6b4a35"], nv_08: ["long", "#2a1a12"], nv_09: ["bun", "#4b3020"], nv_10: ["bob", "#141110"],
  nv_11: ["pony", "#7a5236"], nv_12: ["long", "#2b211b", 1], nv_13: ["bob", "#5a3a26"], nv_14: ["long", "#1a1412"], nv_15: ["braid", "#2b1a10"],
  nv_16: ["bun", "#3d2a1e"], nv_17: ["bob", "#e48aae"], nv_18: ["long", "#3a2a20"],
};
const BOTTOMS = ["#1f2937", "#374151", "#3f3a36", "#1e3a5f", "#4b3b2f", "#2b2d42"];
const GEO = {
  torso: new THREE.CapsuleGeometry(.13, .22, 6, 14),
  head: new THREE.SphereGeometry(.125, 24, 18), cap: new THREE.SphereGeometry(.137, 24, 16, 0, TAU, 0, Math.PI * .56),
  bob: new THREE.SphereGeometry(.145, 24, 16, 0, TAU, 0, Math.PI * .64), eye: new THREE.SphereGeometry(.016, 10, 8),
  skirt: new THREE.CylinderGeometry(.15, .23, .3, 18, 1, true), shoe: new THREE.BoxGeometry(.09, .06, .2),
  ring: new THREE.RingGeometry(.34, .42, 40), hitbox: new THREE.CylinderGeometry(.32, .32, 1.8, 8),
  mug: new THREE.CylinderGeometry(.04, .036, .1, 14), paper: new THREE.PlaneGeometry(.21, .29), folder: new THREE.BoxGeometry(.26, .33, .025),
  phone: new THREE.BoxGeometry(.075, .15, .012),
};
const CAPS = {};
const capsule = (r, len) => CAPS[r + ":" + len] || (CAPS[r + ":" + len] = new THREE.CapsuleGeometry(r, Math.max(.001, len - 2 * r), 4, 12));
const limbMesh = (mat, r, len, y) => { const m = new THREE.Mesh(capsule(r, len), mat); m.position.y = y; return m; };

function makePerson(id, type, isLead, male = false) {
  const r = rng(hash(id) ^ 0x9e37), av = avFile(id);
  const [hairStyle, hairCol, glasses] = male ? ["short", "#1b1714", true] : TRAIT[av] || [["long", "bob", "pony", "bun"][Math.floor(r() * 4)], ["#2b1d16", "#4a2c1d", "#141110"][Math.floor(r() * 3)], r() < .2];
  const skin = std(SKIN[Math.floor(r() * SKIN.length)], .62), hair = std(hairCol, .5);
  const topCol = male ? "#2b3245" : isLead ? "#1f2a44" : "#" + new THREE.Color(ROLE_COLOR(type)).lerp(new THREE.Color("#ffffff"), .25 + r() * .2).getHexString();
  const top = std(topCol, .82), bottom = std(male ? "#262a33" : BOTTOMS[Math.floor(r() * BOTTOMS.length)], .85), shoe = std(r() < .5 || male ? "#1a1a1a" : "#5a3d2b", .5);
  const P = {}, root = new THREE.Group();
  const add = (parent, m) => { m.castShadow = true; parent.add(m); return m; };
  const nho = (parent, m) => { parent.add(m); return m; };   // chi tiet nho: khong do bong (bot luot ve bong)
  P.hips = new THREE.Group(); P.hips.position.y = .86; root.add(P.hips);
  add(P.hips, new THREE.Mesh(UNIT.sph, bottom)).scale.set(.15, .08, .11);
  if (r() < .55 && !isLead) { const sk = add(P.hips, new THREE.Mesh(GEO.skirt, std(bottom.color, .85, 0, { side: THREE.DoubleSide }))); sk.position.y = -.12; }
  P.spine = new THREE.Group(); P.spine.position.y = .03; P.hips.add(P.spine);
  const torso = add(P.spine, new THREE.Mesh(GEO.torso, top)); torso.position.y = .24; torso.scale.set(1.05, 1, .74);
  if (isLead) {
    add(P.spine, new THREE.Mesh(UNIT.cone, std("#f8fafc", .6))).scale.set(.035, .12, .01); P.spine.children.at(-1).position.set(0, .4, .094); P.spine.children.at(-1).rotation.z = Math.PI;
    const pin = add(P.spine, new THREE.Mesh(UNIT.sph, std("#f2c14e", .25, .9))); pin.scale.setScalar(.018); pin.position.set(.07, .38, .1);
    if (male) { const tie = add(P.spine, new THREE.Mesh(UNIT.box, std("#b91c1c", .5))); tie.scale.set(.03, .15, .012); tie.position.set(0, .32, .1); }
  } else {
    const badge = add(P.spine, new THREE.Mesh(UNIT.box, std(ROLE_COLOR(type), .5))); badge.scale.set(.05, .065, .01); badge.position.set(-.06, .3, .1);
  }
  P.neck = new THREE.Group(); P.neck.position.y = .48; P.spine.add(P.neck);
  add(P.neck, new THREE.Mesh(UNIT.cyl, skin)).scale.set(.042, .1, .042); P.neck.children[0].position.y = .03;
  P.head = new THREE.Group(); P.head.position.y = .17; P.neck.add(P.head);
  add(P.head, new THREE.Mesh(GEO.head, skin));
  const capM = add(P.head, new THREE.Mesh(hairStyle === "bob" ? GEO.bob : GEO.cap, hair)); capM.rotation.x = hairStyle === "bob" ? -.5 : hairStyle === "short" ? -.15 : -.36; if (hairStyle === "short") capM.scale.set(1.01, .9, 1.04); capM.position.set(0, .012, -.008);
  if (hairStyle === "long") { const m = add(P.head, new THREE.Mesh(UNIT.box, hair)); m.scale.set(.25, .34, .07); m.position.set(0, -.15, -.085); }
  if (hairStyle === "pony" || hairStyle === "braid") { P.tail = new THREE.Group(); P.tail.position.set(0, .03, -.125); P.head.add(P.tail); const m = nho(P.tail, limbMesh(hair, .045, hairStyle === "braid" ? .42 : .28, hairStyle === "braid" ? -.2 : -.13)); m.scale.z = .045; }
  if (hairStyle === "bun") { const m = nho(P.head, new THREE.Mesh(UNIT.sph, hair)); m.scale.setScalar(.065); m.position.set(0, .12, -.08); }
  if (hairStyle === "braids") for (const s of [-1, 1]) { const m = nho(P.head, limbMesh(hair, .035, .32, -.2)); m.position.set(s * .11, -.16, -.02); }
  const eyeM = std("#1b1410", .3);
  P.eyes = [-1, 1].map(s => { const e = new THREE.Mesh(GEO.eye, eyeM); e.position.set(s * .045, -.005, .112); e.scale.set(1, 1.15, .55); P.head.add(e); return e; });
  const mouth = new THREE.Mesh(UNIT.box, std("#b4534b", .5)); mouth.scale.set(.028, .007, .01); mouth.position.set(0, -.055, .117); P.head.add(mouth);
  if (!male) for (const s of [-1, 1]) { const b = new THREE.Mesh(UNIT.sph, new THREE.MeshStandardMaterial({ color: "#f19a9a", transparent: true, opacity: .45, roughness: .8 })); b.scale.set(.022, .012, .006); b.position.set(s * .07, -.035, .103); P.head.add(b); }
  if (glasses) { const gm = std("#2b2b2b", .3, .5); for (const s of [-1, 1]) { const t = new THREE.Mesh(UNIT.torus, gm); t.scale.setScalar(.026); t.position.set(s * .045, -.005, .123); P.head.add(t); } const br = new THREE.Mesh(UNIT.box, gm); br.scale.set(.03, .004, .004); br.position.set(0, 0, .124); P.head.add(br); }
  for (const s of [1, -1]) {
    const k = s > 0 ? "l" : "r";
    const sh = new THREE.Group(); sh.position.set(s * .175, .4, 0); P.spine.add(sh); P[k + "Sh"] = sh;
    add(sh, limbMesh(top, .046, .29, -.13));
    const el = new THREE.Group(); el.position.y = -.27; sh.add(el); P[k + "El"] = el;
    nho(el, limbMesh(isLead ? top : skin, .04, .26, -.12));
    const hand = nho(el, new THREE.Mesh(UNIT.sph, skin)); hand.scale.set(.038, .045, .03); hand.position.y = -.27;
    const anchor = new THREE.Group(); anchor.position.y = -.3; el.add(anchor); P[k + "Hand"] = anchor;
    const hp = new THREE.Group(); hp.position.set(s * .085, -.02, 0); P.hips.add(hp); P[k + "Hp"] = hp;
    add(hp, limbMesh(bottom, .066, .44, -.21));
    const kn = new THREE.Group(); kn.position.y = -.42; hp.add(kn); P[k + "Kn"] = kn;
    add(kn, limbMesh(skin, .05, .4, -.19)).material = r() < .5 ? skin : bottom;
    const sm = nho(kn, new THREE.Mesh(GEO.shoe, shoe)); sm.position.set(0, -.39, .04);
  }
  // do cam tay
  const prop = (geo, mat, parent, pos, rot) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); m.visible = false; parent.add(m); return m; };
  P.mug = prop(GEO.mug, MAT.mug.clone(), P.rHand, [0, .0, .03], [Math.PI / 2, 0, 0]);
  P.paper = prop(GEO.paper, MAT.paper.clone(), P.spine, [0, .3, .33], [-1.0, 0, 0]);
  P.folder = prop(GEO.folder, std(["#2f6fed", "#c2410c", "#12945c", "#7c3aed"][Math.floor(r() * 4)], .5), P.rHand, [0, -.05, .02], [0, 0, 0]);
  P.phone = prop(GEO.phone, MAT.plastic.clone(), P.spine, [0, .07, .36], [-1.25, 0, 0]);
  // vong trang thai duoi chan + hop bam chuot
  P.ring = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({ color: "#22c55e", transparent: true, opacity: .6, depthWrite: false }));
  P.ring.rotation.x = -Math.PI / 2; P.ring.position.y = .015; root.add(P.ring);
  const hb = new THREE.Mesh(GEO.hitbox, new THREE.MeshBasicMaterial({ visible: false })); hb.position.y = .9; root.add(hb);
  return { root, P, hit: hb, blinkAt: 2 + r() * 4, seedPhase: r() * 100 };
}

// --- tu the: moi khop mot goc (rad), tron dan ve dich ---
const JOINTS = ["hipY", "spX", "spZ", "spY", "nkX", "nkY", "lShX", "lShZ", "lElX", "rShX", "rShZ", "rElX", "lHpX", "lKnX", "rHpX", "rKnX", "tailX"];
const BASE = { hipY: .86, spX: 0, spZ: 0, spY: 0, nkX: 0, nkY: 0, lShX: .05, lShZ: .1, lElX: -.15, rShX: .05, rShZ: -.1, rElX: -.15, lHpX: 0, lKnX: .05, rHpX: 0, rKnX: .05, tailX: .1 };
const SIT = { hipY: SEAT_Y + .06, lHpX: -1.48, rHpX: -1.48, lKnX: 1.45, rKnX: 1.45, spX: -.04 };
const sinp = (t, f, p = 0) => Math.sin(t * f + p);
const POSE = {
  stand: (t, w) => ({ spX: .02 * sinp(t, 1.3), nkY: .25 * sinp(t, .25, w.ph) }),
  type: (t, w) => ({ ...SIT, lShX: -.72, rShX: -.72, lShZ: -.16, rShZ: .16, lElX: -1.0 + .09 * sinp(t, 17, w.ph), rElX: -1.0 + .09 * sinp(t, 17, w.ph + 2), nkX: .14 + .03 * sinp(t, 2.2), spX: .06, nkY: .08 * sinp(t, .4, w.ph) }),
  peer: (t, w) => ({ ...SIT, spX: .16, nkX: .22, lShX: -.7, lElX: -1.05, lShZ: -.15, rShX: -.62, rShZ: .14, rElX: -1.0 + .15 * Math.max(0, sinp(t, 1.7, w.ph)), nkY: .15 * sinp(t, .5, w.ph) }),
  read: (t, w) => ({ ...SIT, lShX: -1.0, rShX: -1.0, lShZ: -.3, rShZ: .3, lElX: -1.25, rElX: -1.25, nkX: .38 + .04 * sinp(t, .8), spX: -.05, nkY: .1 * sinp(t, .3, w.ph) }),
  think: (t, w) => ({ ...SIT, rShX: -1.3, rShZ: .32, rElX: -2.25, lShX: -.62, lShZ: -.12, lElX: -1.1, nkX: .02, nkY: .18 * sinp(t, .35, w.ph), spZ: .05, spX: .05 }),
  wait: (t, w) => { const sip = Math.max(0, sinp(t, .9, w.ph) - .55) * 2.2; return { ...SIT, spX: -.17, lShX: .02, lElX: -.55, lShZ: .02, rShX: -.45 - .55 * sip, rElX: -1.45 - .75 * sip, rShZ: .12, nkX: -.06 - .12 * sip, nkY: .3 * sinp(t, .2, w.ph) * (1 - sip) }; },
  stretch: t => ({ ...SIT, lShX: -2.95, rShX: -2.95, lShZ: .25, rShZ: -.25, lElX: -.35, rElX: -.35, spX: -.22, nkX: -.25 }),
  error: (t, w) => ({ ...SIT, lShX: -2.5, rShX: -2.5, lShZ: .5, rShZ: -.5, lElX: -2.1, rElX: -2.1, spX: .32, nkX: .42, nkY: .12 * sinp(t, 3.1, w.ph) }),
  sofa: (t, w) => ({ hipY: .56, lHpX: -1.3, rHpX: -1.25, lKnX: 1.25, rKnX: 1.2, spX: -.24, rShX: -.3, rElX: -1.2 + .06 * sinp(t, 2.3, w.ph), rShZ: .32, lShX: -.3, lElX: -1.2, lShZ: -.32, nkX: .48 + .05 * sinp(t, .6, w.ph) }),
  check: (t, w) => ({ spX: .28, nkX: .32, lShX: .38, rShX: .38, lShZ: -.12, rShZ: .12, lElX: -.75, rElX: -.75, nkY: .12 * sinp(t, .7, w.ph) }),
  talk: (t, w) => ({ rShX: -.55 + .22 * sinp(t, 3, w.ph), rElX: -.95, rShZ: -.2, lShX: -.18, nkY: .18 * sinp(t, 1.2) }),
  coffee: (t, w) => { const sip = Math.max(0, sinp(t, 1.1, w.ph) - .4) * 1.6; return { rShX: -.5 - .6 * sip, rElX: -1.35 - .8 * sip, rShZ: .1, lShX: .05, nkX: -.1 * sip, nkY: .2 * sinp(t, .3) }; },
  place: () => ({ rShX: -1.45, rElX: -.25, rShZ: .05, spX: .08, nkX: .1 }),
  xephang: (t, w) => { const up = sinp(t, .3, w.ph) > .55; return { rShX: -.55, rElX: -1.35, rShZ: .28, lShX: -.55, lElX: -1.35, lShZ: -.28,
    nkX: up ? -.05 : .42, nkY: up ? .35 * sinp(t, .6, w.ph) : 0, spZ: .03 * sinp(t, .4, w.ph), lKnX: .05 + .12 * Math.max(0, sinp(t, .5, w.ph)) }; },
  report: (t, w) => ({ rShX: -1.15, rElX: -.45, rShZ: .05, lShX: -.35 + .25 * sinp(t, 2.6, w.ph), lElX: -.9, lShZ: .15, nkX: -.06, nkY: .08 * sinp(t, 1.4), spX: .04 }),
  nhan: (t, w) => ({ rShX: -.95, rElX: -.55, lShX: .05, nkX: .12 + .16 * Math.max(0, sinp(t, 4, w.ph)), spX: .1 }),
  phone: (t, w) => ({ ...SIT, spX: -.12, rShX: -.38, rElX: -1.25 + .05 * sinp(t, 2.3, w.ph), rShZ: .3, lShX: -.38, lElX: -1.25, lShZ: -.3, nkX: .45 }),
  choduyet: (t, w) => { const lk = (w.spot && w.spot.look) || 1; return { ...SIT, spX: -.06, lShX: -.5, rShX: -.5, lShZ: -.3, rShZ: .3, lElX: -1.0, rElX: -1.0,
    nkX: .05, nkY: lk * .6 * Math.max(0, sinp(t, .35, w.ph)), lKnX: 1.45 + .12 * Math.max(0, sinp(t, 7, w.ph)) }; },
  gdlisten: (t, w) => ({ ...SIT, lShX: -.82, rShX: -.82, lShZ: -.35, rShZ: .35, lElX: -1.3, rElX: -1.3, spX: .08, nkX: .05 + .1 * Math.max(0, sinp(t, 2.2)) }),
  gdassign: (t, w) => ({ ...SIT, rShX: -1.0 + .25 * sinp(t, 3), rElX: -.6, rShZ: -.1, lShX: -.7, lElX: -1.2, lShZ: -.15, nkY: .1 * sinp(t, 1.5), spX: .05 }),
  ghost: (t, w) => ({ hipY: .92 + .06 * sinp(t, 1.6, w.ph), lShX: -.2, rShX: -.2, lShZ: .5, rShZ: -.5, lElX: -.4, rElX: -.4, nkX: .3, lHpX: -.1, rHpX: .1, lKnX: .4, rKnX: .4 }),
};
const SIT_ANIMS = new Set(["type", "peer", "read", "think", "wait", "stretch", "error", "sofa", "phone", "choduyet", "gdlisten", "gdassign"]);
const PROPS = { wait: ["mug"], coffee: ["mug"], read: ["paper"], sofa: ["phone"], place: ["folder"], phone: ["phone"], report: ["folder"], choduyet: ["folder"], xephang: ["phone"] };

function animFromAct(act) {
  const s = String(act || "");
  if (/^(📖|📄)/u.test(s)) return "read";
  if (/^(🔎|🌐|🖼)/u.test(s)) return "peer";
  if (/^(🤔)/u.test(s)) return "think";
  if (/^(👥|🍵)/u.test(s)) return "think";
  return "type";
}

const workers = new Map();
let firstSync = true;

// nhip buoc chan/tay khi di (nhan vien + giam doc)
function walkTgt(w, dt) {
  w.walkPh = (w.walkPh || 0) + dt * w.speed * 4.6;
  const p = w.walkPh, s = Math.sin(p);
  return { hipY: .85 + .028 * Math.abs(Math.cos(p)), lHpX: .52 * s, rHpX: -.52 * s,
    lKnX: .12 + .75 * Math.max(0, Math.sin(p + .6)), rKnX: .12 + .75 * Math.max(0, Math.sin(p + Math.PI + .6)),
    lShX: -.38 * s, rShX: .38 * s, lElX: -.3, rElX: -.3, spZ: .035 * s, spX: .05, tailX: .25 + .15 * Math.sin(p * 2) };
}
// tron dan cac khop ve tu the dich roi gan vao xuong (nhan vien + giam doc)
function applyJoints(w, dt, tgt, anim, moving) {
  const k = 1 - Math.exp(-dt * (moving ? 14 : 8));
  const J = w.J, P = w.P;
  for (const j of JOINTS) J[j] += (tgt[j] - J[j]) * k;
  P.hips.position.y = J.hipY;
  P.hips.position.z = SIT_ANIMS.has(anim) && anim !== "sofa" ? -.04 : 0;
  P.spine.rotation.set(J.spX, J.spY, J.spZ);
  P.neck.rotation.set(J.nkX * .4, J.nkY * .5, 0); P.head.rotation.set(J.nkX * .6, J.nkY * .5, 0);
  P.lSh.rotation.set(J.lShX, 0, J.lShZ); P.rSh.rotation.set(J.rShX, 0, J.rShZ);
  P.lEl.rotation.x = J.lElX; P.rEl.rotation.x = J.rElX;
  P.lHp.rotation.x = J.lHpX; P.rHp.rotation.x = J.rHpX; P.lKn.rotation.x = J.lKnX; P.rKn.rotation.x = J.rKnX;
  if (P.tail) P.tail.rotation.x = J.tailX;
  // chop mat
  w.blinkAt -= dt;
  const bl = w.blinkAt < 0 ? .1 : 1.15; if (w.blinkAt < -.12) w.blinkAt = 2 + Math.random() * 4;
  P.eyes.forEach(e => e.scale.y = bl);
  const props = PROPS[anim] || [];
  P.mug.visible = props.includes("mug"); P.paper.visible = props.includes("paper"); P.phone.visible = props.includes("phone");
  P.folder.visible = props.includes("folder") || (w.carry && moving);
}

class Worker {
  constructor(a) {
    this.id = a.id; this.a = a; this.isLead = a.kind === "lead";
    const p = makePerson(a.id, a.type, this.isLead);
    Object.assign(this, p);
    this.root.userData.worker = this; this.hit.userData.worker = this;
    scene.add(this.root);
    this.J = { ...BASE }; this.ph = p.seedPhase; this.walkPh = 0; this.yawNow = 0; this.yawTarget = 0; this.speed = (2.2 + (hash(a.id) % 30) / 100) * TOC_DO;   // m/s, nhan he so toc do o trang Cau hinh
    this.plan = []; this.step = null; this.spot = null; this.slot = null; this.mode = "";
    this.opacity = 1; this.anim = "stand"; this.idleAt = DEMO ? 6 + Math.random() * 8 : 30 + Math.random() * 60; this.carry = false;
    this.el = document.createElement("div"); this.el.className = "lbl";
    this.el.onclick = e => { e.stopPropagation(); openPf(this.id); };
    this.el.ondblclick = e => { e.stopPropagation(); follow(this); };
    this.label = new CSS2DObject(this.el); this.label.position.set(0, 1.98, 0); this.root.add(this.label);
    this.lblKey = "";
  }
  pos() { return this.root.position; }
  place(spot) {
    const p = spot.room.w(...spot.pos); this.root.position.copy(p); this.yawNow = spot.yaw; this.root.rotation.y = spot.yaw; this.spot = spot;
  }
  setOpacity(o) {
    if (o === this.opacity) return;
    this.opacity = o;
    this.root.traverse(m => { if (m.isMesh && m !== this.hit && m.material && m !== this.P.ring) { m.material.transparent = o < 1; m.material.opacity = o; m.material.depthWrite = o >= 1; m.castShadow = o > .5; } });
  }
  freeSlot() { if (this.slot) { this.slot.owner = null; this.slot = null; } }
  claim(list, pref = 0) {
    const n = list.length; if (!n) return null;
    for (let k = 0; k < n; k++) { const s = list[(pref + k) % n]; if (!s.owner || s.owner === this) { this.freeSlot(); s.owner = this; this.slot = s; return s; } }
    return null;
  }
  room() { return roomBy[this.a.dept]; }
  deskSlot() {
    const rm = this.room(); if (!rm) return null;
    if (this.slot && (rm.desks.includes(this.slot) || this.slot === rm.lead || rm.stand.includes(this.slot))) return this.slot;
    if (this.isLead && (!rm.lead.owner || rm.lead.owner === this)) return this.claim([rm.lead]);
    return this.claim(rm.desks, hash(this.id) % rm.desks.length) || this.claim(rm.stand, hash(this.id) % 6);
  }
  // muc tieu theo trang thai du lieu
  wantMode() {
    const a = this.a, now = Date.now() / 1000, quiet = now - (a.last || a.mtime || now);
    if (a.kind === "lead") {   // truong phong: hoi y sep -> cho duyet; xong luot -> bao cao roi ngoi ban; 30 phut khong viec -> ve
      if (a.duyet) return now - (a.mtime || now) < 7200 ? "duyet" : "leave";
      if (a.status === "chay" || a.status === "cho") { this.forceLeave = false; return "desk"; }
      // ranh: xep hang cho viec toi da 5 phut (hang dong qua thi nguoi cho lau nhat ve truoc), het han thi ve
      if (this.forceLeave) return "leave";
      return now - (a.xongTs || a.mtime || 0) < HANG_PHUT * 60 ? "baocao" : "leave";
    }
    if (a.status === "chay" || a.status === "cho") return "desk";
    if (a.status === "loi") return quiet < 900 ? "desk" : "leave";
    if (a.status === "bo_do") return quiet < 7200 ? "desk" : "gone";
    if (a.status === "nghi") return now - a.mtime < 1500 ? "lounge" : "leave";
    return "leave";
  }
  update(a) {
    this.a = a;
    const m = this.wantMode(), rm = this.room();
    if (m !== this.mode) this.setMode(m);
    else if (m === "desk" && rm && this.slot && !(rm.desks.includes(this.slot) || rm.lead === this.slot || rm.stand.includes(this.slot))) this.setMode("desk");  // doi phong
    this.refreshLabel();
  }
  setMode(m) {
    const prev = this.mode; this.mode = m; this.plan = []; this.step = null;
    if (this.inQueue) { this.inQueue = false; this.queueSpot = null; hangCho = hangCho.filter(w => w !== this); xepHang(firstSync); }   // ra khoi hang, nguoi sau dich len
    for (const c of COFFEE) if (c.owner === this) c.owner = null;
    const instant = firstSync || !prev;
    if (m === "desk") {
      const s = this.deskSlot(); if (!s) return;
      // sep vua giao viec: truong phong toi phong giam doc nhan viec roi mang ve phong
      const recv = this.isLead && !firstSync && (prev === "baocao" || prev === "duyet" || !prev);
      if (instant && !prev && !firstSync) { this.place(ELEV); this.plan.push({ k: "appear" }); }
      else if (instant) { this.place(s.spot); }
      if (recv) this.plan.push({ k: "walk", spot: pickReport(this).spot }, { k: "act", anim: "nhan", dur: 1.7 }, { k: "walk", spot: s.spot, carry: true });
      else this.plan.push({ k: "walk", spot: s.spot });
      this.plan.push({ k: "work" });
    } else if (m === "baocao") {
      const s = this.deskSlot(); if (!s) { this.setMode("leave"); return; }
      // bao cao xong thi xep hang cho viec moi (khong ngoi choi tai ban); ban van giu cho de nhan viec xong quay ve
      if (instant) { this.inQueue = true; hangCho.push(this); this.plan.push({ k: "act", anim: "xephang", dur: Infinity }); return; }
      this.plan.push({ k: "walk", spot: pickReport(this).spot, carry: true }, { k: "act", anim: "report", dur: 2.2 },
        { k: "fn", tag: "inbox", fn: () => setInbox(gdInbox + 1) }, { k: "queue" });
    } else if (m === "duyet") {
      const fromSeat = this.slot && SEATS.includes(this.slot);
      const seat = this.claim(SEATS, hash(this.id) % SEATS.length);
      if (!seat) { this.mode = ""; this.setMode("baocao"); return; }
      if (instant) { this.place(seat.spot); this.plan.push({ k: "act", anim: "choduyet", dur: Infinity }); return; }
      if (!fromSeat) this.plan.push({ k: "walk", spot: pickReport(this).spot, carry: true }, { k: "act", anim: "report", dur: 1.9 },
        { k: "fn", tag: "inbox", fn: () => setInbox(gdInbox + 1) });
      this.plan.push({ k: "walk", spot: seat.spot }, { k: "act", anim: "choduyet", dur: Infinity });
    } else if (m === "leave") {
      const rm = this.room();
      if (instant) { this.remove(); return; }
      const fromDesk = this.slot && rm && (rm.desks.includes(this.slot) || this.slot === rm.lead);
      this.freeSlot();
      if (this.a.status === "xong" && rm && rm.shelf && fromDesk) {
        this.plan.push({ k: "walk", spot: rm.shelf, carry: true }, { k: "act", anim: "place", dur: 1.0 },
          { k: "fn", fn: () => { rm.setBinders(rm.binders + 1, (rm.today || 0) + 1); } });
      } else if (this.a.status === "loi") this.plan.push({ k: "act", anim: "talk", dur: 1.5 });
      this.plan.push({ k: "walk", spot: ELEV }, { k: "vanish" });
    } else if (m === "gone") { this.freeSlot(); this.plan.push({ k: "vanish" }); }
  }
  remove() {
    this.freeSlot(); this.root.remove(this.label); scene.remove(this.root); workers.delete(this.id);
    if (follow.w === this) follow(null);
  }
  // ---- buoc ke tiep ----
  next() {
    this.step = this.plan.shift() || null;
    const st = this.step; if (!st) return;
    st.t = 0;
    if (st.k === "walk") {
      st.path = this.spot === st.spot ? [] : route(this.root.position, this.spot, st.spot); st.i = 0;
      st.stand = SIT_ANIMS.has(this.anim) ? .32 : 0;
      this.carry = !!st.carry;
    }
    if (st.k === "appear") { this.setOpacity(0.01); st.dur = .6; this.noi(thoai("xuat_hien"), 3.5); }
    if (st.k === "queue") { this.inQueue = true; if (!hangCho.includes(this)) hangCho.push(this); this.queueSpot = null; xepHang(); return; }
    // doi dap o phong giam doc
    if (st.k === "act" && st.anim === "report") {
      this.noi(thoai(this.mode === "duyet" ? "xin_duyet" : "bao_cao"), 3.2);
      if (director && director.mode === "ban") director.sayLater = { at: tNow + 1.5, text: thoai(this.mode === "duyet" ? "gd_hen" : "gd_khen") };
    } else if (st.k === "act" && st.anim === "nhan") {
      if (director && director.mode === "ban") director.noi(`📣 ${staffOf(this.id)[0] || "Em"} ơi, ${thoai("gd_giao")}`, 3.4);   // Sep di vang thi khong noi vong
      this.sayLater = { at: tNow + 1.4, text: thoai("nhan_viec") };
    } else if (st.k === "act" && st.anim === "place") this.noi(thoai("nop_ho_so"), 3);
    else if (st.k === "walk" && Math.random() < .6 && (REPORT.some(r => r.spot === st.spot) || st.spot === ELEV)) this.noi(thoai(this.talkKey() || "di"), 3.5);
    if (st.k === "vanish") st.dur = .8;
  }
  tick(dt, t) {
    if (!this.step) this.next();
    const st = this.step;
    let moving = false, anim = this.anim;
    if (st) {
      st.t += dt;
      if (st.k === "appear") { this.setOpacity(Math.min(1, st.t / st.dur)); anim = "stand"; if (st.t >= st.dur) { this.setOpacity(1); this.step = null; } }
      else if (st.k === "vanish") { anim = "stand"; this.setOpacity(Math.max(.01, 1 - st.t / st.dur)); if (st.t >= st.dur) { this.remove(); return; } }
      else if (st.k === "fn") { st.fn(); this.step = null; }
      else if (st.k === "act") { anim = st.anim; if (st.t * TOC_DO >= st.dur) { this.step = null; if (st.anim === "place") this.carry = false; } }
      else if (st.k === "walk") {
        if (st.stand > 0 && st.t < st.stand) anim = "stand";
        else {
          const p = this.root.position, tgt = st.path[st.i];
          if (!tgt) { this.spot = st.spot; this.step = null; }
          else {
            const d = tgt.clone().sub(p); d.y = 0; const L = d.length(), stepLen = this.speed * dt;
            if (L > .001) this.yawTarget = Math.atan2(d.x, d.z);
            if (L <= stepLen) { p.copy(tgt); st.i++; }
            else p.addScaledVector(d, stepLen / L);
            moving = true; anim = "walk"; this.spot = null;
          }
        }
      } else if (st.k === "work") anim = this.workAnim(dt, t);
    }
    // xoay mat
    const yt = moving ? this.yawTarget : (this.spot ? this.spot.yaw : this.yawNow);
    let dy = ((yt - this.yawNow + Math.PI) % TAU + TAU) % TAU - Math.PI;
    this.yawNow += dy * Math.min(1, dt * (moving ? 14 : 8));
    this.root.rotation.y = this.yawNow;
    this.anim = anim;
    this.talkTick();
    this.pose(dt, t, anim, moving);
  }
  workAnim(dt, t) {
    const a = this.a;
    if (a.status === "loi") return "error";
    if (a.status === "bo_do") { this.setOpacity(.35); return "ghost"; }
    if (this.opacity < 1) this.setOpacity(1);
    // thinh thoang dung day: ca phe, xem may chay nen, sep di kiem tra tro ly
    this.idleAt -= dt;
    if (this.idleAt <= 0 && this.slot && this.slot.spot.chair) {
      this.idleAt = DEMO ? 8 + Math.random() * 12 : 40 + Math.random() * 70;
      const ex = this.excursion();
      if (ex) { const back = this.slot.spot; this.plan = [...ex, { k: "walk", spot: back }, { k: "work" }]; this.step = null; return this.anim; }
      if (a.status === "chay") { this.plan = [{ k: "act", anim: "stretch", dur: 2.6 }, { k: "work" }]; this.step = null; }
    }
    if (this.slot && !this.slot.spot.chair) return a.status === "cho" ? "coffee" : "talk";
    if (a.status === "cho") return this.isLead && a.helpers ? "think" : "wait";
    return animFromAct(a.act);
  }
  excursion() {
    const a = this.a, rm = this.room(); if (!rm) return null;
    const rk = rm.racks.find(x => x.data.owner === this.id);
    if (this.isLead && a.helpers) {
      const helpers = [...workers.values()].filter(w => !w.isLead && w.a.sid === a.sid && w.mode === "desk" && w.slot && w.slot.check && w.room() === rm);
      if (helpers.length) {
        const out = [];
        for (const h of helpers.slice(0, 3)) out.push({ k: "walk", spot: h.slot.check }, { k: "act", anim: "check", dur: 2.5 + Math.random() * 1.5 });
        return out;
      }
    }
    if (rk && Math.random() < .7) return [{ k: "walk", spot: rk.spot }, { k: "act", anim: "check", dur: 3 }];
    if (a.status === "cho" && Math.random() < .55) {
      const free = COFFEE.find(c => !c.owner);
      if (free) { free.owner = this; return [{ k: "walk", spot: free.spot }, { k: "act", anim: "coffee", dur: 4 }, { k: "fn", fn: () => { free.owner = null; } }]; }
    }
    return null;
  }
  pose(dt, t, anim, moving) {
    const tgt = { ...BASE, ...(POSE[anim] || POSE.stand)(t, this) };
    if (moving) {
      Object.assign(tgt, walkTgt(this, dt));
      if (this.carry) Object.assign(tgt, { rShX: -.3, rElX: -1.25, rShZ: .1 });
    }
    applyJoints(this, dt, tgt, anim, moving);
    const P = this.P;
    P.ring.material.color.set(ST_COLOR[this.a.status] || "#94a3b8");
    P.ring.material.opacity = (sel === this.id ? .95 : .5) * this.opacity;
    P.ring.scale.setScalar(sel === this.id ? 1.25 + .06 * Math.sin(t * 5) : 1);
    // man hinh ban
    const sc = this.slot && this.slot.screen;
    if (sc && this.step && this.step.k === "work") {
      const want = this.a.status === "loi" ? "err" : this.a.status === "cho" ? "wait" : "code";
      sc.t += dt; sc.want = want; sc.active = true;
      if (want === "code" && anim === "type") { sc.off += dt * 2.2; sc.dirty = true; }
      if (want === "wait") sc.dirty = true;
    }
  }
  noi(text, dur = 4.5) { if (!THOAI_NHIP) return; this.say = { text, until: tNow + dur }; this.refreshLabel(); }
  // cau hop tinh huong luc nay (dang di dau, dang lam gi)
  talkKey() {
    const st = this.step, a = this.a;
    if (!st) return null;
    if (st.k === "walk") {
      const sp = st.spot;
      if (REPORT.some(r => r.spot === sp)) return this.mode === "desk" ? "di_nhan" : "di_bao_cao";
      if (sp === ELEV) return "ve";
      if (COFFEE.some(c => c.spot === sp)) return "di_cafe";
      return "di";
    }
    if (st.k === "act") return { xephang: "xep_hang", choduyet: "cho_duyet", phone: "nghi_ngoi", coffee: "cafe", check: this.isLead && a.helpers ? "kiem_tra" : "xem_may",
      stretch: "vuon_vai", place: "nop_ho_so", talk: "lam" }[st.anim] || null;
    if (st.k === "work") {
      if (a.status === "loi") return "loi";
      if (a.status === "bo_do") return "ma";
      if (a.status === "cho") return a.bg && a.bg.length ? "cho_may" : a.helpers ? "cho_tro_ly" : "cho";
      return actKey(a);
    }
    return null;
  }
  talkTick() {
    if (this.say && tNow > this.say.until) { this.say = null; this.refreshLabel(); }
    if (this.sayLater && tNow >= this.sayLater.at) { this.noi(this.sayLater.text); this.sayLater = null; }
    if (this.say || tNow < (this.nextTalk ??= tNow + 1 + Math.random() * 8)) return;
    this.nextTalk = tNow + ((DEMO ? 6 : 10) + Math.random() * (DEMO ? 8 : 14)) * (THOAI_NHIP || 1);
    const k = this.talkKey();
    if (k && [...workers.values()].filter(w => w.say).length < 5) this.noi(thoai(k));
  }
  refreshLabel() {
    const a = this.a, [nm, nick] = staffOf(a.id), f = avFile(a.id);
    const remote = S && a.machine && a.machine !== S.host ? a.machine : "";
    const act = this.say ? this.say.text : this.mode === "duyet" ? "⏳ Chờ sếp duyệt" : this.inQueue ? "🙋 Xếp hàng chờ việc" : actChung(a);
    const key = [a.status, act, nm, remote, sel === a.id].join("|");
    this.el.classList.toggle("talk", !!this.say);
    if (key === this.lblKey) return; this.lblKey = key;
    this.el.style.setProperty("--c", ST_COLOR[a.status] || "#888");
    this.el.classList.toggle("err", a.status === "loi"); this.el.classList.toggle("ghost", a.status === "bo_do");
    this.el.classList.toggle("sel", sel === a.id);
    this.el.innerHTML = `<div class="act">${escRaw(act)}</div><div class="card">${f ? `<img src="/avatar/${f}.png" alt="">` : "🙂"}${this.isLead ? `<i class="crown">${a.cli === "codex" ? "🤖" : a.cli === "antigravity" ? "✨" : "👑"}</i>` : ""}<span class="nm">${escRaw(nm || "Nhân viên")}</span></div>`;
    this.el.title = (nm ? `${nm} — ${nick}` : "") + (a.cli === "codex" ? " · Codex" : a.cli === "antigravity" ? " · Antigravity" : "") + (remote ? ` · ${remote}` : "");
  }
}

const BOSS_SPOT = gdSpot(GD_DESK + .78, 0, -Math.PI / 2, [[GD_DESK + .78, -1.65], [1.6, -1.65]]);
class Director {
  constructor() {
    Object.assign(this, makePerson("giam-doc", "lead", true, true));
    this.J = { ...BASE }; this.ph = 1.3; this.carry = false; this.key = ""; this.mode = "ban"; this.yawNow = -Math.PI / 2;
    this.camYaw = 0; this.camDist = 4.6; this.camH = 2.3; this.speed = 2.3;
    this.hit.userData.director = true;
    scene.add(this.root); this.root.rotation.y = -Math.PI / 2;
    this.el = document.createElement("div"); this.el.className = "lbl gd";
    this.el.onclick = e => { e.stopPropagation(); openGD(); };
    this.label = new CSS2DObject(this.el); this.label.position.set(0, 1.98, 0); this.root.add(this.label);
  }
  place() { if (this.mode !== "ban") return; this.root.position.set(GD.x0 + GD_DESK + .78, 0, 0); this.yawNow = -Math.PI / 2; this.root.rotation.y = this.yawNow; }
  // ---- sep di kiem tra (tu di, khong dieu khien tay): bat/tat bang nut hoac phim K ----
  startInspect() {
    if (this.mode === "kiemtra") return;
    follow(null); fly = null; focusR = null; renderRoomList();
    this.mode = "kiemtra"; this.path = null; this.target = null; this.waitUntil = 0; controls.enabled = false;
    this.daTham = new Set(); this.daPhong = new Set(); this.phongNay = null;
    this.camYaw = 0; this.camDist = 4.6; this.camH = 2.3;
    this.noi(thoai("sep_di"), 3.5);
    $("#btnKt").classList.add("on"); $("#btnKt").textContent = "🪑 Sếp về bàn";
    $("#hint").textContent = "Sếp tự đi kiểm tra từng người đang làm · kéo chuột: xoay máy quay · cuộn: gần/xa · K / Esc: Sếp về bàn";
  }
  stopInspect() {
    if (this.mode !== "kiemtra") return;
    this.path = null; this.target = null; this.waitUntil = 0;
    this.mode = "ve"; this.path = route(this.root.position, null, BOSS_SPOT); this.pi = 0;
    $("#btnKt").classList.remove("on"); $("#btnKt").textContent = "🚶 Sếp đi kiểm tra";
    $("#hint").textContent = HINT;
  }
  // ---- Sep TU di kiem tra (khong dieu khien tay): ghe tung nhan vien dang lam, hoi tham, het nguoi thi di dao cac phong ----
  // Luot kiem tra: moi phong CO NGUOI vao dung 1 lan (gan truoc), chao tung nguoi dang lam trong phong; phong trong bo qua; het phong -> ve ban
  diemKeTiep() {
    const p = this.root.position;
    const coMat = w => w.mode === "desk" && w.slot && w.slot.check && w.opacity > .5;
    const gan = (a, b) => a.root.position.distanceTo(p) - b.root.position.distanceTo(p);
    for (let n = 0; n < 50; n++) {
      if (this.phongNay) {
        const ws = [...workers.values()].filter(w => w.room() === this.phongNay && coMat(w) && !this.daTham.has(w.id)).sort(gan);
        if (ws.length) { this.daTham.add(ws[0].id); return { spot: ws[0].slot.check, w: ws[0] }; }
        this.daPhong.add(this.phongNay); this.phongNay = null;
      }
      const con = realRooms().filter(rm => !this.daPhong.has(rm) && [...workers.values()].some(w => w.room() === rm && coMat(w)));
      if (!con.length) return null;                                   // het phong co nguoi -> ve
      this.phongNay = con.sort((a, b) => a.w(0, RD / 2).distanceTo(p) - b.w(0, RD / 2).distanceTo(p))[0];
    }
    return null;
  }
  tickInspect(dt, t) {
    const p = this.root.position;
    let moving = false;
    if (this.waitUntil && tNow < this.waitUntil) {           // dung xem man hinh / cho tra loi
      if (this.target && this.target.w) { const d = this.target.w.root.position.clone().sub(p); this.yawNow = Math.atan2(d.x, d.z); }
    } else if (!this.path || this.pi >= this.path.length) {
      if (this.path && this.target) {                         // vua toi canh nhan vien: chao hoi
        const w = this.target.w;
        if (workers.has(w.id)) { this.noi(`${staffOf(w.id)[0] || "Em"} ơi, ${thoai("sep_hoi")}`, 3.2); w.sayLater = { at: tNow + 1.4, text: thoai("tra_loi_sep") }; }
        this.waitUntil = tNow + 4.5 / TOC_DO; this.path = null; this.target = null;
      } else {
        this.target = this.diemKeTiep(); this.waitUntil = 0;
        if (!this.target) {                                     // da di het cac phong co nguoi: tu ve cho
          this.noi(this.daPhong.size ? thoai("sep_xong_vong") : thoai("sep_vang"), 3.5);
          this.stopInspect(); return;
        }
        this.path = route(p, null, this.target.spot); this.pi = 0;
      }
    } else {
      const tgt = this.path[this.pi], d = tgt.clone().sub(p); d.y = 0;
      const L = d.length(), st = 2.3 * TOC_DO * dt;
      if (L > .001) this.yawNow = Math.atan2(d.x, d.z);
      if (L <= st) { p.copy(tgt); this.pi++; } else p.addScaledVector(d, st / L);
      moving = true;
    }
    this.speed = 2.3 * TOC_DO;
    this.root.rotation.y = this.yawNow;
    applyJoints(this, dt, { ...BASE, ...(moving ? walkTgt(this, dt) : POSE.check(t, this)) }, moving ? "walk" : "check", moving);
    // may quay sau lung, hoi cao (keo chuot xoay, cuon gan/xa)
    const yaw = this.yawNow + this.camYaw, kk = 1 - Math.exp(-dt * 4);
    camera.position.lerp(new V3(p.x - Math.sin(yaw) * this.camDist, this.camH, p.z - Math.cos(yaw) * this.camDist), kk);
    controls.target.lerp(p.clone().add(new V3(0, 1.25, 0)), kk); camera.lookAt(controls.target);
    // ai o gan thi chao sep
    for (const w of workers.values()) if (!w.say && w.opacity > .5 && w.root.position.distanceTo(p) < 2.3 && (!w.chaoAt || tNow - w.chaoAt > 25)) { w.chaoAt = tNow; w.noi(thoai("chao_sep"), 3.5); }
  }
  tickReturn(dt, t) {
    const p = this.root.position, tgt = this.path && this.path[this.pi];
    if (!tgt) {   // toi ghe: ngoi xuong, tra may quay
      this.mode = "ban"; this.place(); controls.enabled = true; focusGD(); return;
    }
    const d = tgt.clone().sub(p); d.y = 0; const L = d.length(), st = 2.6 * TOC_DO * dt;
    if (L > .001) this.yawNow = Math.atan2(d.x, d.z);
    if (L <= st) { p.copy(tgt); this.pi++; } else p.addScaledVector(d, st / L);
    this.root.rotation.y = this.yawNow; this.speed = 2.6 * TOC_DO;
    applyJoints(this, dt, { ...BASE, ...walkTgt(this, dt) }, "walk", true);
  }
  noi(text, dur = 4.5) { if (!THOAI_NHIP) return; this.say = { text, until: tNow + dur }; }
  tick(dt, t) {
    if (this.mode !== "ban") {
      if (this.say && tNow > this.say.until) this.say = null;
      if (this.mode === "kiemtra") this.tickInspect(dt, t); else this.tickReturn(dt, t);
      const act = this.say ? this.say.text : this.mode === "kiemtra" ? "🚶 Đang đi kiểm tra" : "🪑 Về bàn làm việc";
      this.el.classList.toggle("talk", !!this.say);
      if (act !== this.key) { this.key = act; this.el.innerHTML = `<div class="act">${escRaw(act)}</div><div class="card"><img src="/logo/xuong_tron.png" alt=""><span>${escRaw(GIAM_DOC)}</span></div>`; }
      return;
    }
    const ws = [...workers.values()], at = k => ws.some(w => w.step && w.step.k === "act" && w.step.anim === k);
    const waiting = SEATS.filter(s => s.owner && s.owner.step && s.owner.step.k === "act").length;
    const anim = at("report") ? "gdlisten" : at("nhan") ? "gdassign" : waiting ? "read" : "type";
    applyJoints(this, dt, { ...BASE, ...POSE[anim](t, this) }, anim, false);
    for (const sc of gdScreens) { sc.active = true; sc.want = "code"; if (anim === "type") { sc.off += dt * 1.6; sc.dirty = true; } }
    if (this.say && tNow > this.say.until) this.say = null;
    if (this.sayLater && tNow >= this.sayLater.at) { this.noi(this.sayLater.text, 3.5); this.sayLater = null; }
    if (!this.say && tNow > (this.nextTalk ??= tNow + 3) && (anim === "type" || anim === "read")) {
      this.nextTalk = tNow + ((DEMO ? 7 : 12) + Math.random() * 10) * (THOAI_NHIP || 1);
      this.noi(thoai(anim === "read" ? "gd_duyet" : "gd_ranh"));
    }
    const act = this.say ? this.say.text : anim === "gdlisten" ? "👂 Đang nghe báo cáo" : anim === "gdassign" ? "📣 Đang giao việc" : waiting ? `📝 Đang duyệt · ${waiting} người chờ` : "☕ Chờ báo cáo";
    this.el.classList.toggle("talk", !!this.say);
    if (act !== this.key) { this.key = act; this.el.innerHTML = `<div class="act">${act}</div><div class="card"><img src="/logo/xuong_tron.png" alt=""><span>${escRaw(GIAM_DOC)}</span></div>`; this.el.title = "Giám đốc"; }
  }
}

// duong di: ra loi di -> cua -> hanh lang -> cua phong dich -> loi di -> cho
function route(p, fromSpot, toSpot) {
  const pts = [];
  const rB = toSpot.room;
  let rA = fromSpot ? fromSpot.room : regionOf(p);
  if (fromSpot) pts.push(...fromSpot.via.map(v => rA.w(...v)));
  else if (rA && rA.local) { const [u, v] = rA.local(p); if (v > 0) pts.push(rA.w(u, LANE_V)); }
  if (rA !== rB) { if (rA) pts.push(...rA.exitPts()); pts.push(...rB.enterPts()); }
  pts.push(...toSpot.via.slice().reverse().map(v => rB.w(...v)), rB.w(...toSpot.pos));
  return pts;
}
function regionOf(p) {
  if (p.x < 0) return LOB;
  if (p.x > GD.x0) return GD;
  if (Math.abs(p.z) < CW / 2) return null;
  return realRooms().find(r => r.col === Math.floor(p.x / RW) && r.side === Math.sign(p.z)) || null;
}

// ---------- dong bo du lieu ----------
function ensureRoom(dept) {
  if (roomBy[dept]) return roomBy[dept];
  const slot = realRooms().length;
  for (let i = rooms.length - 1; i >= 0; i--) if (!rooms[i].dept && rooms[i].slot === slot) { const old = rooms[i]; WALLS = WALLS.filter(w => w.own !== old); scene.remove(old.g); rooms.splice(i, 1); }
  for (let i = cutWalls.length - 1; i >= 0; i--) if (cutWalls[i].room && !cutWalls[i].room.dept && cutWalls[i].room.slot === slot) cutWalls.splice(i, 1);
  const rm = new Room(slot, dept);
  rooms.push(rm); roomBy[dept] = rm;
  const nc = Math.max(1, Math.ceil(realRooms().length / 2));
  if (nc !== ncol) { ncol = nc; buildShell(); }
  renderRoomList();
  return rm;
}
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d / 1000; };
function sync() {
  const now = Date.now() / 1000;
  const all = [...S.agents, ...S.leads];
  // phong: kenh co nguoi dang lam, hoac co hoat dong trong 24 gio (xep dang lam truoc)
  const score = {};
  for (const a of all) {
    if (now - (a.mtime || 0) > 86400 && !(a.status === "chay" || a.status === "cho")) continue;
    score[a.dept] = (score[a.dept] || 0) + (a.status === "chay" || a.status === "cho" ? 100 : 1);
  }
  Object.keys(score).sort((x, y) => score[y] - score[x]).forEach(ensureRoom);
  if (!ncol) { ncol = 1; buildShell(); }
  // ke ho so: so cong don trong kho SQLite (S.shelves); ho so con tren tay nhan vien thi chua tinh
  const shelves = shelvesOf(S);
  for (const rm of realRooms()) {
    const sh = shelves[rm.dept] || { tong: 0, hom_nay: 0 }, p = rm.pendingPlace();
    const n = Math.max(0, sh.tong - p), today = Math.max(0, sh.hom_nay - p);
    if (n !== rm.binders || today !== rm.today) rm.setBinders(n, today);
  }
  // nhan vien
  const seen = new Set();
  for (const a of all) {
    const id = a.id; seen.add(id);
    let w = workers.get(id);
    if (!w) {
      const m = Worker.prototype.wantMode.call({ a });
      if (m !== "desk" && m !== "baocao" && m !== "duyet") continue;
      if (a.dept && !roomBy[a.dept] && m !== "duyet") ensureRoom(a.dept);
      w = new Worker(a); workers.set(id, w);
    }
    w.update(a);
  }
  for (const w of [...workers.values()]) if (!seen.has(w.id) && w.mode !== "leave" && w.mode !== "gone") { w.a = { ...w.a, status: "xong" }; w.setMode("leave"); }
  // khay ho so phong giam doc: bao cao + cho duyet hom nay (tru ho so con tren tay truong phong)
  const gh = (S.giamdoc || {}).hom_nay;
  if (gh) setInbox((gh.bao_cao || 0) + (gh.cho_duyet || 0) - [...workers.values()].filter(w => w.plan.some(s => s.tag === "inbox")).length);
  drawTV();
  // may chay nen
  const tids = new Set();
  for (const t of S.tasks) {
    const rm = roomBy[t.dept] || ensureRoom(t.dept);
    const rk = rm.ensureRack(t); if (!rk) continue; tids.add(t.id);
    if (!rk.ten) {     // ten rieng cho moi tu dang chay: bat dau tu bam id, trung thi lay ten ke tiep
      const used = new Set(realRooms().flatMap(r => r.racks.map(x => x.ten)));
      let k = hash(t.id) % RACK_TEN.length;
      for (let n = 0; n < RACK_TEN.length && used.has(RACK_TEN[k]); n++) k = (k + 1) % RACK_TEN.length;
      rk.ten = RACK_TEN[k];
    }
    rk.el.textContent = [...rk.ten][0] + " " + dur(now - t.ts); rk.el.title = rk.ten + " · " + dur(now - t.ts);
  }
  for (const rm of realRooms()) for (const rk of [...rm.racks]) if (!tids.has(rk.id)) rm.dropRack(rk);
  // bien phong
  for (const rm of realRooms()) {
    const ws = [...workers.values()].filter(w => w.room() === rm && w.mode === "desk");
    const run = ws.filter(w => w.a.status === "chay").length, wait = ws.filter(w => w.a.status === "cho").length;
    const [nm, motto, emo] = deptInfo(rm.dept);
    rm.signEl.textContent = `${emo} ${nm}`;
    rm.signEl.title = `${run} đang cày · ${wait} ngồi đợi · ${rm.racks.length} máy chạy nền · ${rm.binders} hồ sơ`;
    rm.signEl.classList.toggle("hot", run > 0);
    // dong cua: phong dong tay hoac (tu dong) khong ai lam — co nguoi / may chay nen thi tu mo
    const coViec = ws.length > 0 || rm.racks.length > 0;
    rm.setDong(!coViec && (PHONG_DONG.includes(rm.dept) || !!BC.tu_dong));
  }
  xepHang(firstSync);
  firstSync = false;
  renderStats(); renderFeed(); renderRoomList();
}
// ho so dang tren tay nhan vien (chua dat len ke) thi chua tinh
Room.prototype.pendingPlace = function () {
  let n = 0; for (const w of workers.values()) if (w.room() === this && w.mode === "leave" && w.plan.some(s => s.k === "fn")) n++;
  return n;
};

// ?demo=1: them nhan vien gia vao du lieu that de xem di lai (vao ca, lam, ra may, ca phe, nop ho so, ve)
const DEMO = new URLSearchParams(location.search).has("demo");
const demo = { list: [], n: 0, next: 0 };
if (DEMO) { $("#demoA").href = "/3d"; $("#demoBtn").textContent = "🎬 Tắt chạy thử"; $("#demoBtn").classList.add("on"); }
const DEMO_ACT = ["⌨️ Chạy python3 build.py", "📖 Đọc README.md", "✍️ Viết ghi_chu.md", "🔎 Tìm: lỗi đăng nhập", "🌐 Mở trang tài liệu", "🤔 Đang vắt óc suy nghĩ…", "🖼️ Xem ảnh chụp màn hình"];
function demoInject(S) {
  const now = Date.now() / 1000, depts = realRooms().map(r => r.dept);
  if (!depts.length) depts.push("Tổng hợp");
  if (now > demo.next && demo.list.filter(d => d.end > now).length < 9) {
    demo.next = now + 4 + Math.random() * 5;
    const id = "demo" + (++demo.n), dept = depts[Math.floor(Math.random() * depts.length)];
    demo.list.push({ id, dept, t0: now, work: 25 + Math.random() * 35, wait: Math.random() < .5 ? 10 + Math.random() * 15 : 0, err: Math.random() < .12, end: now + 400 });
  }
  for (const d of demo.list) {
    const age = now - d.t0, endWork = d.work + d.wait;
    const status = age < d.work ? "chay" : age < endWork ? "cho" : d.err ? "loi" : "xong";
    if (status === "xong" || status === "loi") d.end = Math.min(d.end, d.t0 + endWork + 60);
    if (now > d.end + 30) continue;
    S.agents.push({ id: d.id, kind: "agent", status, dept: d.dept, type: ["general-purpose", "Explore", "Plan", "code-reviewer"][d.n % 4] || "general-purpose",
      act: status === "chay" ? DEMO_ACT[Math.floor(age / 6 + d.id.length) % DEMO_ACT.length] : status === "cho" ? "☕ Đợi máy chạy: render thử" : status === "loi" ? "🤕 Vấp cỏ: thiếu file" : "✅ Đã nộp bài",
      desc: "Nhân viên thử " + d.id, start: d.t0, last: status === "chay" ? now : d.t0 + endWork, mtime: now, machine: S.host, sid: "demo", bg: [], tools: 3, errors: 0, out: 0, ctx: 0 });
  }
  demo.list = demo.list.filter(d => now < d.end + 40);
  // truong phong gia: lam 30 s -> bao cao (luot le) / xin duyet (luot chan) 30 s -> sep giao viec moi -> lai lam
  const depts2 = realRooms().map(r => r.dept);
  for (let k = 0; k < 3 && depts2.length; k++) {
    const T = 60, t0 = (demo.t0 = demo.t0 || now) + k * 17, age = now - t0, n = Math.floor(age / T), ph = age - n * T;
    if (age < 0) continue;
    const ask = n % 2 === 1, busy = ph < 30;
    S.leads.push({ id: "demoL" + k, kind: "lead", type: "lead", dept: depts2[k % depts2.length], sid: "demoL" + k, status: busy ? "chay" : "nghi",
      duyet: !busy && ask, giaoTs: t0 + n * T, xongTs: busy ? t0 + n * T - 30 : t0 + n * T + 30, mtime: busy ? now : t0 + n * T + 30,
      act: busy ? DEMO_ACT[n % DEMO_ACT.length] : "😴 Chờ sếp giao việc", desc: "Trưởng phòng thử", start: t0, last: now, machine: S.host, bg: [], tools: 9, helpers: 0 });
  }
  S.shelves = JSON.parse(JSON.stringify(shelvesOf(S)));
  for (const a of S.agents) if (a.sid === "demo" && a.status === "xong") { const d = S.shelves[a.dept] = S.shelves[a.dept] || { tong: 0, hom_nay: 0 }; d.tong++; d.hom_nay++; }
}
async function load() {
  try {
    const r = await fetch("/api/state", { cache: "no-store" });
    S = await r.json();
    if (DEMO) demoInject(S);
    $("#led").className = "on";
    sync();
    hideLoad();
  } catch (e) {
    $("#led").className = "off";
    console.error(e);
    if (!S) $("#err").textContent = "Không đọc được /api/state: " + e.message;
  }
}

// ---------- HUD ----------
// ke ho so tu kho; may chu cu (chua co kho) thi dem hom nay tu du lieu quet
function shelvesOf(S) {
  if (S.shelves) return S.shelves;
  const t0 = today0(), out = {};
  for (const a of S.agents) if (a.status === "xong" && (a.last || a.mtime) >= t0) { const d = out[a.dept] = out[a.dept] || { tong: 0, hom_nay: 0 }; d.tong++; d.hom_nay++; }
  return out;
}
function renderStats() {
  const all = [...S.agents, ...S.leads];
  const run = all.filter(a => a.status === "chay").length, wait = all.filter(a => a.status === "cho").length;
  const done = Object.values(shelvesOf(S)).reduce((n, d) => n + d.hom_nay, 0);
  $("#stat").innerHTML = `<span><i class="dot" style="background:var(--run)"></i><b>${run}</b> đang cày</span>
    <span><i class="dot" style="background:var(--wait)"></i><b>${wait}</b> ngồi đợi</span>
    <span>⏳ <b>${S.leads.filter(a => a.duyet).length}</b> chờ duyệt</span>
    <span>⚙️ <b>${S.tasks.length}</b> máy chạy nền</span><span>📁 <b>${done}</b> hồ sơ hôm nay</span>
    <span>🕒 ${hm(S.scanned)}</span>`;
}
let feedKey = ""; const feedSeen = new Set();
function renderFeed() {
  // luon giu lenh moi nhat cua sep (giao viec cho truong phong) — khong bi thao tac lien tuc day mat
  const leadIds = new Set(S.leads.map(l => l.id)), feed = S.feed || [];
  const lenh = feed.filter(e => e.kind === "giao" && leadIds.has(e.aid) && Date.now() / 1000 - e.ts < 3600).slice(0, 1);
  const items = [...lenh, ...feed.filter(e => !lenh.includes(e)).slice(0, 6 - lenh.length)].sort((x, y) => y.ts - x.ts);
  const key = items.map(e => e.ts + e.aid).join();
  if (key === feedKey) return; feedKey = key;
  $("#feedList").innerHTML = items.map(e => {
    const f = avFile(e.aid), [nm] = staffOf(e.aid);
    const k = e.ts + e.aid, fresh = feedSeen.size && !feedSeen.has(k); feedSeen.add(k);
    // giao viec: sep -> truong phong (lead), truong phong -> tro ly (subagent) — chi ai giao ai, khong noi dung
    if (e.kind === "giao") {
      const lead = S.leads.find(l => l.id === e.aid), ag = !lead && S.agents.find(x => x.id === e.aid);
      const boss = lead ? "👔 " + GIAM_DOC : ag ? staffOf(ag.parent || ag.sid)[0] || "Trưởng phòng" : "";
      if (boss) return `<div class="fi${fresh ? " new" : ""}" data-id="${escRaw(e.aid)}">${f ? `<img src="/avatar/${f}.png" alt="">` : ""}<span class="t">${hm(e.ts)}</span><span class="x"><b>${escRaw(boss)}</b> 📣 giao việc cho <b>${escRaw(nm || "nhân viên")}</b></span></div>`;
    }
    const what = e.kind === "giao" ? "📥 nhận việc mới" : e.kind === "noi" ? "📝 nộp báo cáo" : e.kind === "loi" ? "⚠️ gặp trục trặc" : TOOL_CHUNG(e.name || "");
    return `<div class="fi${fresh ? " new" : ""}" data-id="${escRaw(e.aid)}">${f ? `<img src="/avatar/${f}.png" alt="">` : ""}<span class="t">${hm(e.ts)}</span><span class="x"><b>${escRaw(nm || "Nhân viên")}</b> ${what}</span></div>`;
  }).join("");
}
$("#feedList").onclick = e => { const it = e.target.closest("[data-id]"); if (it) { openPf(it.dataset.id); const w = workers.get(it.dataset.id); if (w) follow(w); } };
function renderRoomList() {
  const rs = realRooms(), nw = S ? S.leads.filter(a => a.duyet).length : 0;
  $("#rooms").innerHTML = `<button data-gd class="${focusR === "gd" ? "on" : ""}"><span class="k">G</span>🏛️ Phòng Giám Đốc<span class="n">${nw ? "⏳ " + nw : ""}</span></button>` + rs.map((rm, i) => {
    const [nm, , emo] = deptInfo(rm.dept);
    const n = [...workers.values()].filter(w => w.room() === rm && w.mode === "desk").length;
    const tay = PHONG_DONG.includes(rm.dept);
    const khoa = `<span class="khoa${tay && !rm.dong ? " cho" : ""}" data-khoa="${i}" title="${rm.dong ? "Đang đóng — bấm để mở" : tay ? "Sẽ đóng khi hết người làm — bấm để thôi" : "Bấm để đóng phòng (khi không ai làm)"}">${rm.dong || tay ? "🔒" : "🔓"}</span>`;
    return `<button data-r="${i}" class="${focusR === rm ? "on" : ""}${rm.dong ? " dong" : ""}"><span class="k">${i < 9 ? i + 1 : ""}</span>${emo} ${escRaw(nm)}<span class="n">${n || ""}</span>${khoa}</button>`;
  }).join("");
}
$("#rooms").onclick = e => {
  const k = e.target.closest("[data-khoa]");
  if (k) {   // dong / mo phong (luu kho de giu qua cac lan mo trang)
    const rm = realRooms()[+k.dataset.khoa]; if (!rm) return;
    const tay = PHONG_DONG.includes(rm.dept);
    // phong dang dong do "tu dong" ma bam mo: chua ho tro mo rieng -> chi doi danh sach dong tay
    PHONG_DONG = tay ? PHONG_DONG.filter(d => d !== rm.dept) : [...PHONG_DONG, rm.dept];
    fetch("/api/cauhinh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ khoa: "phong_dong", gia_tri: PHONG_DONG.length ? PHONG_DONG : null }) }).catch(() => {});
    if (S) sync();
    return;
  }
  if (e.target.closest("[data-gd]")) return openGD(); const b = e.target.closest("[data-r]"); if (b) focusRoom(realRooms()[+b.dataset.r]); };

// ---------- may quay ----------
let fly = null, focusR = null;
function flyTo(target, pos, d = 1.3) { if (director && director.mode === "kiemtra") return; fly = { t: 0, d, t0: controls.target.clone(), p0: camera.position.clone(), t1: target, p1: pos }; }
function focusRoom(rm) {
  if (!rm) return; follow(null); focusR = rm;
  const c = rm.w(0, RD / 2, .6);
  flyTo(c, c.clone().add(new V3(2.2, 7.5, -rm.side * 9.5)));
  renderRoomList();
}
function focusGD() {
  follow(null); focusR = "gd";
  const c = new V3(GD.x0 + GW / 2 + .5, .6, 0);
  flyTo(c, c.clone().add(new V3(-4.5, 10.5, 11.5)));
  renderRoomList();
}
function openGD() { focusGD(); sel = "__gd"; $("#pf").classList.add("open"); clearInterval(pfTimer); pfTimer = setInterval(loadPf, 3000); loadPf(); }
function overview() {
  follow(null); focusR = null;
  const xE = ncol * RW + GW, cx = (xE - LOBBY) / 2, span = xE + LOBBY;
  flyTo(new V3(cx, 0, 0), new V3(cx + span * .18, span * .55 + 10, span * .62 + 12));
  renderRoomList();
}
function follow(w) {
  follow.w = w;
  if (w) {   // dung truoc mat nhan vien, cheo sang mot ben
    focusR = null; const p = w.root.position.clone().add(new V3(0, 1, 0)), y = w.yawNow;
    flyTo(p, p.clone().add(new V3(Math.sin(y) * 2.6 + Math.cos(y) * 1.4, 1.5, Math.cos(y) * 2.6 - Math.sin(y) * 1.4)), 1);
  }
}
follow.w = null;

// ---------- ho so ----------
let sel = null, pfTimer = null;
function openPf(id) {
  sel = id; $("#pf").classList.add("open");
  for (const w of workers.values()) w.refreshLabel();
  clearInterval(pfTimer); pfTimer = setInterval(loadPf, 3000); loadPf();
}
function closePf() { pfLo = null; sel = null; $("#pf").classList.remove("open"); clearInterval(pfTimer); for (const w of workers.values()) w.refreshLabel(); }
// ho so: chi trang thai + so lieu tu /api/state, KHONG goi /api/agent (khong co viec giao, bao cao, nhat ky)
function loadPf() {
  if (!sel || !S) return;
  const box = $("#pfBody");
  if (sel === "__gd") return gdPanel(box);
  const a = [...S.agents, ...S.leads].find(x => x.id === sel) || workers.get(sel)?.a;
  if (!a) { box.innerHTML = `<p style="margin-top:30px;color:var(--dim)">Nhân viên này đã về.</p>`; return; }
  const [nm, nick] = staffOf(a.id), f = avFile(a.id), [dn, , emo] = deptInfo(a.dept);
  const end = a.status === "chay" || a.status === "cho" ? Date.now() / 1000 : (a.last || a.mtime);
  box.innerHTML = `<div class="hd" style="--c:${ST_COLOR[a.status]}">${f ? `<img src="/avatar/${f}.png" alt="">` : ""}<div>
      <h2>${escRaw(nm || "Nhân viên")}${a.kind === "lead" ? " 👑" : ""}</h2><div class="who">${nick ? `“${escRaw(nick)}”` : ""}</div></div></div>
    <div class="pills"><span class="pill ${a.duyet ? "cho" : a.status}">${a.duyet ? "⏳ Chờ sếp duyệt" : ST[a.status] || a.status}</span><span class="pill">${escRaw(ROLE(a.type))}</span>
      <span class="pill">${emo} ${escRaw(dn)}</span>${a.cli && a.cli !== "claude" ? `<span class="pill">${a.cli === "codex" ? "🤖 Codex" : "✨ Antigravity"}</span>` : ""}</div>
    <div style="font-weight:600;margin:10px 0 4px">${escRaw(a.duyet ? "⏳ Đang chờ sếp duyệt · đã chờ " + dur(Date.now() / 1000 - (a.mtime || Date.now() / 1000)) : actChung(a))}</div>
    <div class="row"><button id="pfFollow">🎥 Bám theo</button><button id="pfLo">${pfLo && pfLo.id === a.id ? "🙈 Ẩn nội dung" : a.duyet ? "👁 Xem đang chờ duyệt gì (riêng tư)" : "👁 Xem phiên (riêng tư)"}</button></div>
    ${pfLo && pfLo.id === a.id ? loHTML(a, pfLo.d) : ""}
    <div class="facts">
      <div class="fact"><div class="l">Vào ca</div><div class="v">${a.start ? hm(a.start) : "—"}</div></div>
      <div class="fact"><div class="l">Thời gian</div><div class="v">${dur(end - (a.start || end))}</div></div>
      <div class="fact"><div class="l">Thao tác</div><div class="v">${a.tools || 0}</div></div>
      <div class="fact"><div class="l">Máy chạy nền</div><div class="v">${(a.bg || []).length}</div></div>
    </div>`;
  $("#pfFollow").onclick = () => { const w = workers.get(a.id); if (w) follow(w); };
  $("#pfLo").onclick = async () => {
    if (pfLo && pfLo.id === a.id) { pfLo = null; return loadPf(); }
    try { const r = await fetch("/api/agent?id=" + encodeURIComponent(a.id), { cache: "no-store" }); pfLo = { id: a.id, d: r.ok ? await r.json() : null }; } catch (e) { pfLo = { id: a.id, d: null }; }
    loadPf();
  };
}
// Noi dung rieng tu (ten phien, thu muc, dang hoi gi) — chi tai khi bam nut, dong khung la an; man hinh chieu chung khong co.
let pfLo = null;
function loHTML(a, d) {
  if (!d) return `<p style="color:var(--dim)">Không tải được chi tiết phiên.</p>`;
  const cwd = (d.cwd || "").replace(/^\/Users\/[^/]+/, "~");
  const app = a.cli === "codex" ? "Codex (app Codex / terminal)" : a.cli === "antigravity" ? "Antigravity" : a.machine && S && a.machine !== S.host ? "Claude — phiên mở trên " + a.machine : "Claude (app Claude, tab Code / terminal)";
  return `<div class="fact" style="margin-top:6px"><div class="l">Phiên</div><div class="v" style="font-weight:600">${escRaw(a.desc || d.title || "(không tên)")}</div>
      <div class="l" style="margin-top:4px">${escRaw(app)}${cwd ? " · " + escRaw(cwd) : ""}${a.worktree ? " · worktree " + escRaw(a.worktree) : ""}</div></div>
    ${d.hoi ? `<div class="fact" style="margin-top:6px;border:1px solid rgba(245,158,11,.5)"><div class="l">Đang chờ sếp duyệt / trả lời</div><pre style="margin-top:4px">${escRaw(d.hoi)}</pre></div>` : ""}
    ${d.appLink ? `<div class="row"><a href="${escRaw(d.appLink)}"><button>↗ Mở phiên trong app Claude</button></a></div>` : ""}
    <div class="l" style="color:var(--dim);margin-top:6px;font-size:11.5px">Trả lời / duyệt: ${d.appLink ? "bấm Mở phiên ở trên" : "mở đúng phiên này trong " + escRaw(app.split(" (")[0])} rồi trả lời ở đó.</div>`;
}
// ho so phong giam doc: chi so luong + ai dang cho duyet (khong noi dung viec)
function gdPanel(box) {
  const gd = S.giamdoc || { hom_nay: {}, theo_phong: {} }, hn = gd.hom_nay || {}, now = Date.now() / 1000;
  const wait = S.leads.filter(a => a.duyet).sort((a, b) => a.mtime - b.mtime);
  const rows = Object.entries(gd.theo_phong).sort((a, b) => (b[1].giao + b[1].bao_cao) - (a[1].giao + a[1].bao_cao));
  box.innerHTML = `<div class="hd" style="--c:#f2c14e"><img src="/logo/xuong_tron.png" alt=""><div><h2>🏛️ Phòng Giám Đốc</h2><div class="who">Giám đốc ${escRaw(GIAM_DOC)}</div></div></div>
    <div class="facts">
      <div class="fact"><div class="l">📣 Đầu việc sếp giao hôm nay</div><div class="v">${hn.giao || 0}</div></div>
      <div class="fact"><div class="l">📥 Báo cáo hôm nay</div><div class="v">${hn.bao_cao || 0}</div></div>
      <div class="fact"><div class="l">⏳ Xin duyệt hôm nay</div><div class="v">${hn.cho_duyet || 0}</div></div>
      <div class="fact"><div class="l">Đang ngồi chờ</div><div class="v">${wait.length}</div></div>
    </div>
    <div style="color:var(--dim);margin:10px 0 4px">Đang chờ sếp duyệt</div>
    ${wait.length ? wait.map(a => { const [nm] = staffOf(a.id), f = avFile(a.id), [dn, , em] = deptInfo(a.dept);
      return `<div class="fi" data-id="${escRaw(a.id)}">${f ? `<img src="/avatar/${f}.png" alt="">` : ""}<span class="nm"><b>${escRaw(nm)}</b> · ${em} ${escRaw(dn)}</span><span class="t" style="margin-left:auto">${dur(now - a.mtime)}</span></div>`; }).join("")
      : `<div style="color:var(--dim)">Không ai chờ — sếp rảnh 🎉</div>`}
    <div style="color:var(--dim);margin:14px 0 4px">📜 Sổ lệnh hôm nay (ai, phòng nào, lúc nào)</div>
    <div class="tl">${(gd.nhat_ky || []).slice(0, 25).map(e => { const [nm] = staffOf(e.sid), f = avFile(e.sid), [dn, , em] = deptInfo(e.dept);
      const what = e.loai === "giao" ? `📣 Sếp giao một đầu việc cho <b>${escRaw(nm)}</b>` : e.loai === "bao_cao" ? `📥 <b>${escRaw(nm)}</b> báo cáo xong` : `⏳ <b>${escRaw(nm)}</b> xin duyệt`;
      return `<div class="ev"><span class="tm">${hm(e.ts)}</span><span class="tx">${what} · ${em} ${escRaw(dn)}</span></div>`; }).join("") || `<div style="color:var(--dim)">Chưa có lệnh nào hôm nay.</div>`}</div>
    <div style="color:var(--dim);margin:14px 0 4px">Theo phòng hôm nay</div>
    <div class="tl">${rows.map(([d, v]) => { const [dn, , em] = deptInfo(d);
      return `<div class="ev"><span class="tx">${em} ${escRaw(dn)}</span><span class="tm" style="margin-left:auto">📣 ${v.giao} · 📥 ${v.bao_cao} · ⏳ ${v.cho_duyet}</span></div>`; }).join("") || `<div style="color:var(--dim)">Chưa có.</div>`}</div>`;
  box.querySelectorAll("[data-id]").forEach(el => el.onclick = () => { const w = workers.get(el.dataset.id); openPf(el.dataset.id); if (w) follow(w); });
}
$("#pfX").onclick = closePf;

// ---------- su kien ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let downAt = null;
canvas.addEventListener("pointerdown", e => { downAt = [e.clientX, e.clientY, performance.now()]; });
canvas.addEventListener("pointerup", e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const hit = pick(e);
  if (hit && hit.worker) openPf(hit.worker.id);
  else if (hit && (hit.director || hit.gd)) openGD();
  else if (hit && hit.room) focusRoom(hit.room);
});
canvas.addEventListener("dblclick", e => { const hit = pick(e); if (hit && hit.worker) follow(hit.worker); });
function pick(e) {
  ndc.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const objs = [...[...workers.values()].map(w => w.hit), ...realRooms().map(r => r.hit), ...(director ? [director.hit] : []), ...(gdHit ? [gdHit] : [])];
  const h = ray.intersectObjects(objs, false)[0];
  return h ? h.object.userData : null;
}
controls.addEventListener("start", () => { if (fly) fly = null; });
addEventListener("keydown", e => {
  if (e.target.matches?.("input,textarea")) return;
  if (director && director.mode === "kiemtra") {   // Sep dang tu di kiem tra: chi K / Esc de goi ve ban
    const k = e.key.toLowerCase();
    if (k === "escape" || k === "k") director.stopInspect();
    return;
  }
  if (e.key === "k" || e.key === "K") { if (director) director.startInspect(); return; }
  if (e.key === "Escape") { if (sel) closePf(); else follow(null); }
  else if (e.key === "0") overview();
  else if (/^[1-9]$/.test(e.key)) focusRoom(realRooms()[+e.key - 1]);
  else if (e.key === "g" || e.key === "G") openGD();
  else if (e.key === "t" || e.key === "T") cycleWall();
});
const HINT = $("#hint").textContent + " · K: sếp đi kiểm tra";
$("#hint").textContent = HINT;
$("#btnKt").onclick = () => { if (!director) return; director.mode === "kiemtra" ? director.stopInspect() : director.startInspect(); };
// keo chuot / cuon khi dang lai sep: xoay + doi khoang cach may quay
canvas.addEventListener("pointermove", e => {
  if (!director || director.mode !== "kiemtra" || !e.buttons) return;
  director.camYaw -= e.movementX * .006; director.camH = clamp(director.camH + e.movementY * .012, .9, 7);
});
canvas.addEventListener("wheel", e => { if (director && director.mode === "kiemtra") director.camDist = clamp(director.camDist + e.deltaY * .004, 2, 11); }, { passive: true });
$("#btnAll").onclick = overview;
const WALL = ["Tường: tự động", "Tường: thấp", "Tường: cao"];
let wallMode = 0;
try { wallMode = +(localStorage.getItem("vp3d-wall") || 0); } catch (e) {}
function cycleWall() { wallMode = (wallMode + 1) % 3; try { localStorage.setItem("vp3d-wall", wallMode); } catch (e) {} $("#btnWall").textContent = WALL[wallMode]; }
$("#btnWall").textContent = WALL[wallMode];
$("#btnWall").onclick = cycleWall;
$("#btnQ").onclick = () => { quality = (quality + 1) % 3; qualityManual = true; try { localStorage.setItem("vp3d-q", quality); } catch (e) {} applyQuality(); };

function hideLoad() { $("#load").classList.add("hide"); }

// ---------- vong lap ----------
const timer = new THREE.Timer();
// so lieu chan doan (bo nho GPU, so nhan vien) — goi tu console / kiem tu dong: window.__vpChanDoan()
window.__vpChanDoan = () => ({ ...renderer.info.memory, calls: lastCalls, tris: lastTris, programs: (renderer.info.programs || []).length, workers: workers.size,
  sceneObjs: (() => { let n = 0; scene.traverse(() => n++); return n; })(), screens: SCREENS.length });
let fpsAcc = 0, fpsN = 0, fpsT = 0, lowStreak = 0, screenT = 0, ledT = 0, lblT = 0, todT = 0;
// gioi han khung hinh (trang Cau hinh, mac dinh 30): canh cham, ve het suc la phi CPU/GPU va nong may
const FPS_MAX = [20, 30, 60].includes(+BC.fps) ? +BC.fps : 30;
let khungDu = 0, lastCalls = 0, lastTris = 0, boDem = 0;
function frame() {
  requestAnimationFrame(frame);
  timer.update();
  khungDu += timer.getDelta();
  if (khungDu < 1 / FPS_MAX - .002) return;               // chua toi luot ve khung moi
  const dt = Math.min(khungDu, .1), t = timer.getElapsed();
  khungDu = 0;
  tNow = t;
  if (!innerWidth || !innerHeight) return;   // o xem truoc bi an
  // may quay bay / bam theo
  if (fly) {
    fly.t += dt; const k = ease(Math.min(1, fly.t / fly.d));
    controls.target.lerpVectors(fly.t0, fly.t1, k); camera.position.lerpVectors(fly.p0, fly.p1, k);
    if (fly.t >= fly.d) fly = null;
  } else if (follow.w) {
    const p = follow.w.root.position.clone().add(new V3(0, 1, 0)), d = p.sub(controls.target).multiplyScalar(Math.min(1, dt * 4));
    controls.target.add(d); camera.position.add(d);
  }
  controls.update();
  for (const w of [...workers.values()]) w.tick(dt, t);
  if (director) director.tick(dt, t);
  // man hinh: ve lai 6 lan/giay
  screenT += dt;
  if (screenT > .16) {
    screenT = 0;
    for (const sc of SCREENS) {
      if (!sc.active && sc.mode !== "saver" && sc.mode !== "off") drawScreen(sc, sc.seed % 3 ? "off" : "saver");
      else if (sc.active && (sc.dirty || sc.want !== sc.mode)) drawScreen(sc, sc.want);
      sc.active = false; sc.dirty = false;
    }
  }
  // den may chay nen nhap nhay
  ledT += dt;
  if (ledT > .18) {
    ledT = 0; const c = new THREE.Color();
    for (const rm of realRooms()) for (const rk of rm.racks) {
      for (let i = 0; i < 40; i++) rk.leds.setColorAt(i, c.set(Math.random() < .55 ? "#22c55e" : Math.random() < .3 ? "#f59e0b" : "#0b2a12"));
      rk.leds.instanceColor.needsUpdate = true;
    }
  }
  // thang may mo khi co nguoi gan
  const near = [...workers.values()].some(w => w.root.position.distanceTo(ELEV.room.w(...ELEV.pos)) < 2.2);
  elevOpen += ((near ? 1 : 0) - elevOpen) * Math.min(1, dt * 4);
  if (elevDoors) { elevDoors[0].position.z = -.39 - elevOpen * .7; elevDoors[1].position.z = .39 + elevOpen * .7; }
  // tuong: ha xuong theo che do / phia may quay
  for (const cw of cutWalls) {
    let want = 1;
    if (wallMode === 1) want = cw.kind === "front" ? 1 : .3;
    else if (wallMode === 0 && cw.kind === "back") want = camera.position.z * cw.side > CW / 2 + RD * .6 ? .3 : 1;
    else if (wallMode === 0 && cw.kind === "east") want = camera.position.x > cw.x + 1 ? .3 : 1;
    if (cw.kind === "side" && wallMode === 1) want = 1.05 / WH;
    cw.g.scale.y += (want - cw.g.scale.y) * Math.min(1, dt * 5);
  }
  // nhan: an hien theo khoang cach
  lblT += dt;
  if (lblT > .2) {
    lblT = 0;
    for (const w of workers.values()) {
      const d = camera.position.distanceTo(w.root.position);
      w.el.classList.toggle("near", d < 13); w.el.classList.toggle("far", d > 38);
    }
    if (director) { const d = camera.position.distanceTo(director.root.position); director.el.classList.toggle("near", d < 20); director.el.classList.toggle("far", d > 45); }
  }
  todT -= dt; if (todT <= 0) { todT = 60; applyTod(); drawClock(); }
  // bong do tinh lai 6 lan/giay thay vi moi khung (nhan vat di cham) — luot ve bong la nua chi phi moi khung
  boDem += dt; if (boDem > 1 / 6 || !sun.shadow.map) { boDem = 0; sun.shadow.needsUpdate = true; }
  renderer.info.autoReset = false; renderer.info.reset();
  if (composer && quality === 2) composer.render(); else renderer.render(scene, camera);
  lastCalls = renderer.info.render.calls; lastTris = renderer.info.render.triangles;
  labelR.render(scene, camera);
  // tu ha chat luong neu may chay khong noi
  fpsAcc += dt; fpsN++; fpsT += dt;
  if (fpsT > 3) {
    const fps = fpsN / fpsAcc; fpsAcc = fpsN = fpsT = 0;
    if (!qualityManual && fps < FPS_MAX * .8 && quality > 0) { if (++lowStreak >= 2) { quality--; lowStreak = 0; applyQuality(); } } else lowStreak = 0;
  }
}

// thanh tren cung xuong dong (cua so hep) -> danh sach phong + ho so lui xuong theo
new ResizeObserver(() => document.documentElement.style.setProperty("--topH", $("#top").offsetHeight + "px")).observe($("#top"));

// ---------- khoi dong ----------
$("#xuongName").textContent = XUONG;
try {
  if (!qualityManual) quality = 1;   // mac dinh Vua (Cao = GTAO + bong 4096, nong may)
  applyQuality(); applyTod();
  $("#loadMsg").textContent = "đọc dữ liệu văn phòng";
  await load();
  if (!S) throw new Error("Máy chủ không trả dữ liệu");
  overview(); fly.d = .01;
  setInterval(load, 3000);
  requestAnimationFrame(frame);
} catch (e) {
  console.error(e);
  $("#err").textContent = "Lỗi dựng cảnh: " + (e && e.message || e);
}
