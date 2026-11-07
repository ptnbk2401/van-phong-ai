// May hat goc giai tri phong Sep (ban 3D).
// Nguon 1: danh sach YouTube o trang Cau hinh (NHAC.ds: id video 11 ky tu / "list:<id playlist>") — phat lan luot
//          bang IFrame Player API trong khung nho goc phai (YouTube yeu cau khung >= 200 px, khong duoc an).
// Nguon 2 (danh sach trong / mat mang / moi video deu khong nhung duoc): nhac lofi tu sinh bang WebAudio —
//          khong tai file nao, khong ban quyen. Moi "bai" ~32 o nhip, doi hop am + nhip + giong tu dong.
// Trinh duyet chi cho phat am thanh sau mot lan bam / go phim cua nguoi xem.

const rngOf = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

// ---------- lofi tu sinh ----------
// tien trinh hop am: [bac goc (nua cung tu chu am), cac quang tinh tu bac goc]
const TIEN_TRINH = [
  [[2, [0, 3, 7, 10, 14]], [7, [0, 4, 10, 14, 21]], [0, [0, 4, 7, 11, 14]], [9, [0, 3, 7, 10, 14]]],   // ii9 V13 Imaj9 vi9
  [[0, [0, 4, 7, 11]], [4, [0, 3, 7, 10]], [5, [0, 4, 7, 11, 14]], [5, [0, 3, 7, 9]]],                 // I iii IV iv6
  [[9, [0, 3, 7, 10, 14]], [5, [0, 4, 7, 11, 14]], [0, [0, 4, 7, 11, 14]], [7, [0, 4, 7, 9, 14]]],     // vi IV I V6/9
  [[5, [0, 4, 7, 11, 14]], [4, [0, 3, 7, 10]], [2, [0, 3, 7, 10, 14]], [7, [0, 5, 7, 10, 14]]],        // IV iii ii V7sus
];
const NGU_CUNG = [0, 2, 4, 7, 9, 12, 14, 16];
const TEN_BAI = ["Cà phê sáng", "Mưa trên mái tôn", "Deadline còn xa", "Trà sữa 50% đường", "Gió qua cửa kính", "Ca đêm yên ả",
  "Sếp đi vắng", "Cuối tuần chưa tới", "Bàn phím lạch cạch", "Hoàng hôn văn phòng", "Ly thứ năm", "Code chạy một lần là xanh"];

class Lofi {
  constructor(ctx, out) {
    this.ctx = ctx; this.out = out; this.timer = null; this.so = 0;
    // bang nhieu trang dung chung (trong, hi-hat, tieng dia than)
    const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
    // tieng vong (delay) cho giai dieu + hop am
    this.delay = ctx.createDelay(2); this.fb = ctx.createGain(); this.wet = ctx.createGain();
    this.fb.gain.value = .32; this.wet.gain.value = .28;
    this.delay.connect(this.fb); this.fb.connect(this.delay); this.delay.connect(this.wet); this.wet.connect(out);
  }
  baiMoi() {
    const r = rngOf(Date.now() ^ (++this.so * 7919)), ctx = this.ctx;
    this.r = r;
    this.bpm = 68 + Math.floor(r() * 16);
    this.beat = 60 / this.bpm;
    this.goc = 48 + Math.floor(r() * 8);                      // chu am: C3..G3
    this.tt = TIEN_TRINH[Math.floor(r() * TIEN_TRINH.length)];
    this.swing = .56 + r() * .08;
    this.soO = 32; this.o = 0;                                // so o nhip moi bai
    this.ten = TEN_BAI[Math.floor(r() * TEN_BAI.length)];
    this.delay.delayTime.value = this.beat * .75;
    this.t0 = ctx.currentTime + .15; this.next = this.t0;
  }
  start() {
    if (this.timer) return;
    this.baiMoi(); this.crackle(true);
    // xep lich truoc: tab an thi trinh duyet goi timer thua hon -> xep xa hon
    this.timer = setInterval(() => {
      const xa = document.hidden ? 1.6 : .35;
      while (this.next < this.ctx.currentTime + xa) {
        this.o1(this.next, this.o);
        this.next += this.beat * 4; this.o++;
        if (this.o >= this.soO) { const t = this.next; this.baiMoi(); this.next = this.t0 = t + this.beat * 2; this.onBai && this.onBai(this.ten); }
      }
    }, 60);
  }
  stop() { clearInterval(this.timer); this.timer = null; this.crackle(false); }
  // ---- nhac cu ----
  env(g, t, a, peak, dur, rel = .25) {
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(0, t + Math.max(a, dur), rel);
  }
  osc(type, f, t, dur, peak, dst, a = .01, rel = .25, detune = 0) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = f; o.detune.value = detune; o.connect(g); g.connect(dst);
    this.env(g, t, a, peak, dur, rel); o.start(t); o.stop(t + dur + rel * 6);
    return o;
  }
  pad(t, notes, dur) {
    const ctx = this.ctx, lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = "lowpass"; lp.frequency.value = 700 + this.r() * 500; lp.Q.value = .4; lp.connect(g); g.connect(this.out); g.connect(this.delay);
    g.gain.value = .9;
    for (const m of notes) for (const dt of [-7, 7]) this.osc("triangle", hz(m), t, dur - .3, .032, lp, .5, .7, dt);
    setTimeout(() => { lp.disconnect(); g.disconnect(); }, (t - ctx.currentTime + dur + 6) * 1000);
  }
  ep(t, notes, peak = .05) {   // dan dien kieu Rhodes: sine + hoa am bac 2 tat nhanh
    for (const m of notes) { this.osc("sine", hz(m), t, .05, peak, this.out, .005, .9); this.osc("sine", hz(m) * 2, t, .02, peak * .25, this.out, .003, .25); }
  }
  bass(t, m, dur) { this.osc("sine", hz(m), t, dur, .22, this.out, .01, .18); this.osc("triangle", hz(m), t, dur * .5, .05, this.out, .01, .12); }
  kick(t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + .12);
    o.connect(g); g.connect(this.out); g.gain.setValueAtTime(.55, t); g.gain.exponentialRampToValueAtTime(.001, t + .35);
    o.start(t); o.stop(t + .4);
    this.kickAt = t;
  }
  tieng(t, dur, peak, type, f, q = .7) {
    const s = this.ctx.createBufferSource(), fl = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    s.connect(fl); fl.connect(g); g.connect(this.out);
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + .05);
  }
  snare(t) { this.tieng(t, .18, .16, "bandpass", 1900, .8); this.osc("triangle", 185, t, .02, .08, this.out, .002, .05); }
  hat(t, v) { this.tieng(t, .05, .05 * v, "highpass", 7500); }
  crackle(on) {
    if (!on) { if (this.cr) { try { this.cr.stop(); } catch (e) {} this.cr = null; } return; }
    const ctx = this.ctx, n = ctx.sampleRate * 3, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * .08 + (Math.random() < .0004 ? (Math.random() * 2 - 1) * .9 : 0);
    const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = b; s.loop = true; hp.type = "highpass"; hp.frequency.value = 1200; g.gain.value = .05;
    s.connect(hp); hp.connect(g); g.connect(this.out); s.start(); this.cr = s;
  }
  // ---- mot o nhip (4 phach) ----
  o1(t, i) {
    const r = this.r, B = this.beat, [deg, iv] = this.tt[i % this.tt.length], root = this.goc + deg;
    const notes = iv.map(x => root + 12 + x).map(m => (m > this.goc + 31 ? m - 12 : m));
    const sw = k => t + B * (Math.floor(k) + (k % 1 ? this.swing : 0));   // vi tri phach k (0..3.5) co swing
    const vao = i < 2, ket = i >= this.soO - 2;                           // 2 o dau / cuoi bai: thua trong
    this.pad(t, notes, B * 4);
    if (!vao) this.ep(t + .02, notes.slice(0, 4), .035);
    if (!vao && r() < .55) this.ep(sw(2.5), notes.slice(1, 4), .025);
    this.bass(t, root - 12, B * 1.6);
    this.bass(sw(2), root - 12 + (r() < .4 ? 7 : 0), B * 1.2);
    if (r() < .35) this.bass(sw(3.5), root - 12 + (r() < .5 ? 12 : 10), B * .4);
    if (!vao && !ket) {
      this.kick(t); this.kick(sw(2)); if (r() < .4) this.kick(sw(2.5));
      this.snare(t + B); this.snare(t + B * 3);
      for (let k = 0; k < 4; k += .5) this.hat(sw(k), k % 1 ? .6 : 1);
    } else if (ket) this.kick(t);
    // giai dieu thua, ngu cung cua chu am, quang 5
    if (!vao && r() < .7) {
      const n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const pos = Math.floor(r() * 8) / 2, m = this.goc + 24 + NGU_CUNG[Math.floor(r() * NGU_CUNG.length)];
        this.osc("sine", hz(m), sw(pos), B * .4, .06, this.out, .01, .35);
        this.osc("sine", hz(m), sw(pos), B * .4, .03, this.delay, .01, .35);
      }
    }
  }
}

// ---------- YouTube ----------
let ytApi = null;
function napYT() {
  if (ytApi) return ytApi;
  ytApi = new Promise((ok, loi) => {
    if (window.YT && window.YT.Player) return ok(window.YT);
    const cu = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { cu && cu(); ok(window.YT); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api"; s.async = true;
    s.onerror = () => { ytApi = null; loi(new Error("không tải được YouTube")); };
    document.head.appendChild(s);
    setTimeout(() => { if (!(window.YT && window.YT.Player)) { ytApi = null; loi(new Error("YouTube không phản hồi")); } }, 9000);
  });
  return ytApi;
}

// ---------- may hat ----------
export class MayHat {
  constructor({ khung, onDoi }) {
    this.khung = khung;           // phan tu HTML chua khung YouTube nho (co #ytP ben trong)
    this.onDoi = onDoi || (() => {});
    this.bat = false; this.nguon = ""; this.ten = ""; this.am = 60;
    this.ds = []; this.i = -1; this.loiLienTiep = 0;
    try { this.am = +(localStorage.getItem("vp3d-am") || 60); } catch (e) {}
  }
  // nhip cho hinh 3D (0..1, 1 = vua go trong): lofi theo trong that, YouTube gia lap ~ 80 bpm
  nhip() {
    if (!this.bat) return 0;
    if (this.nguon === "lofi" && this.lofi && this.lofi.kickAt) return Math.max(0, 1 - (this.ctx.currentTime - this.lofi.kickAt) / .35);
    const p = (performance.now() / 750) % 1; return Math.max(0, 1 - p * 2.6);
  }
  async batTat() { return this.bat ? this.tat() : this.batLen(); }
  async batLen() {
    this.bat = true; this.onDoi();
    let ds = (typeof NHAC !== "undefined" && NHAC.ds) || [], tron = typeof NHAC !== "undefined" && NHAC.tron;
    try { const c = await (await fetch("/api/cauhinh", { cache: "no-store" })).json(); if (c && c.nhac) { ds = c.nhac.ds || []; tron = !!c.nhac.tron; } else if (c) ds = []; } catch (e) {}
    if (!this.bat) return;
    if (ds.length) {
      this.ds = ds.slice(); if (tron) for (let k = this.ds.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [this.ds[k], this.ds[j]] = [this.ds[j], this.ds[k]]; }
      try { await this.chayYT(); return; } catch (e) { this.baoLoi = "Không mở được YouTube — phát nhạc tự sinh"; }
    }
    this.chayLofi();
  }
  tat() {
    this.bat = false;
    if (this.lofi) this.lofi.stop();
    if (this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, .05);
    if (this.yt && this.yt.stopVideo) try { this.yt.stopVideo(); } catch (e) {}
    this.khung.classList.remove("on");
    this.nguon = ""; this.ten = ""; this.onDoi();
  }
  datAm(v) {
    this.am = Math.max(0, Math.min(100, Math.round(v)));
    try { localStorage.setItem("vp3d-am", this.am); } catch (e) {}
    if (this.master) this.master.gain.setTargetAtTime(this.nguon === "lofi" ? this.am / 100 * .8 : 0, this.ctx.currentTime, .05);
    if (this.yt && this.yt.setVolume) try { this.yt.setVolume(this.am); } catch (e) {}
  }
  baiSau() { if (!this.bat) return; if (this.nguon === "yt") this.toi(1); else if (this.lofi) { this.lofi.stop(); this.lofi.start(); this.ten = "Lofi · " + this.lofi.ten; this.onDoi(); } }
  // ---- lofi ----
  chayLofi() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0;
      const lp = this.ctx.createBiquadFilter(), comp = this.ctx.createDynamicsCompressor();
      lp.type = "lowpass"; lp.frequency.value = 4200; comp.threshold.value = -16; comp.ratio.value = 3;
      this.master.connect(lp); lp.connect(comp); comp.connect(this.ctx.destination);
      this.lofi = new Lofi(this.ctx, this.master);
      this.lofi.onBai = ten => { this.ten = "Lofi · " + ten; this.onDoi(); };
    }
    this.ctx.resume();
    this.nguon = "lofi"; this.khung.classList.remove("on");
    this.lofi.start(); this.ten = "Lofi · " + this.lofi.ten;
    this.master.gain.setTargetAtTime(this.am / 100 * .8, this.ctx.currentTime, .3);
    this.onDoi();
  }
  // ---- YouTube ----
  async chayYT() {
    const YT = await napYT();
    if (!this.bat) return;
    this.nguon = "yt"; this.khung.classList.add("on"); this.loiLienTiep = 0;
    if (this.lofi) this.lofi.stop();
    if (this.master) this.master.gain.value = 0;
    if (!this.yt) {
      await new Promise(ok => {
        this.yt = new YT.Player("ytP", { width: 356, height: 200,
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
          events: {
            onReady: () => { this.yt.setVolume(this.am); ok(); },
            onStateChange: e => this.trangThaiYT(e.data),
            onError: () => this.loiYT(),
          } });
      });
    }
    this.i = -1; this.toi(1);
  }
  toi(buoc) {
    if (!this.ds.length) return;
    this.i = (this.i + buoc + this.ds.length) % this.ds.length;
    const x = this.ds[this.i];
    this.laList = x.startsWith("list:");
    if (this.laList) this.yt.loadPlaylist({ list: x.slice(5), listType: "playlist", index: 0 });
    else this.yt.loadVideoById(x);
    this.ten = `YouTube · ${this.i + 1}/${this.ds.length}`; this.onDoi();
  }
  trangThaiYT(s) {
    if (!this.bat || this.nguon !== "yt") return;
    if (s === 1) {   // dang phat
      this.loiLienTiep = 0;
      const d = this.yt.getVideoData ? this.yt.getVideoData() : null;
      this.ten = `YouTube · ${this.i + 1}/${this.ds.length}` + (d && d.title ? " · " + d.title : ""); this.onDoi();
    }
    if (s === 0) {   // het bai: playlist con bai thi YouTube tu chuyen
      if (this.laList) { const pl = this.yt.getPlaylist() || [], k = this.yt.getPlaylistIndex(); if (k >= 0 && k < pl.length - 1) return; }
      this.toi(1);
    }
  }
  loiYT() {
    if (!this.bat || this.nguon !== "yt") return;
    if (++this.loiLienTiep >= this.ds.length) { this.baoLoi = "Các video trong danh sách đều không phát được — chuyển sang nhạc tự sinh"; this.yt.stopVideo(); this.chayLofi(); return; }
    setTimeout(() => this.toi(1), 800);   // video bi chan nhung / da xoa -> bai sau
  }
}
