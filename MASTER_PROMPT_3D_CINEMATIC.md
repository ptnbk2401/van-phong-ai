# MASTER PROMPT: NÂNG CẤP ĐỒ HỌA 3D ĐIỆN ẢNH & THẾ GIỚI VI MÔ (CINEMATIC COZY DIORAMA)

> **Mục tiêu:** Nâng tầm ứng dụng **Văn Phòng AI 3D** thành một **kiệt tác đồ họa WebGL/Three.js isometric sống động, giàu cảm xúc và đậm chất điện ảnh (Cozy Cyberpunk / Studio Ghibli Office)**. Biến văn phòng thành một sa bàn thu nhỏ có "hồn", với ánh sáng nội thất ấm áp ban đêm, hiệu ứng hạt vi mô (khói cà phê, tia quét máy in, bụi nắng), biểu cảm nhân vật vui nhộn và chế độ máy quay tự hành Cinematic Screensaver.

Bạn là **Lead 3D WebGL Technical Artist & Senior Three.js Creative Engineer**. Hãy triển khai lần lượt các tính năng 3D đỉnh cao dưới đây vào dự án.

---

## 1. NGUYÊN TẮC KỸ THUẬT & HIỆU NĂNG (BẮT BUỘC)

1. **Giữ vững hiệu năng 30–60 FPS:** 
   * Toàn bộ hiệu ứng hạt (particles) phải dùng `THREE.Points` hoặc gom hình (Batch / Instanced), tuyệt đối không tạo mesh riêng lẻ trong `requestAnimationFrame`.
   * Sử dụng ánh sáng giả lập (baked procedural emissive / vertex color hoặc số lượng `PointLight` giới hạn $\le 4$ bóng, có bán kính `distance` ngắn và `decay = 2` để tối ưu GPU).
2. **Không phá vỡ logic cốt lõi:**
   * Giữ nguyên cơ chế đồng bộ trạng thái nhân viên từ `/api/state`, phím tắt hiện có (0, 1-9, K, T, M, H, Esc), hệ thống âm nhạc máy hát `MayHat`.
3. **Các tệp tin tác động:**
   * `3d/van_phong.js`: Hệ thống ánh sáng, hạt, props nội thất, animation nhân vật, Cinematic Camera.
   * `3d/index.html`: Thêm nút bật/tắt Screensaver và tooltip phím tắt.

---

## 2. BỐN TÍNH NĂNG 3D ĐỈNH CAO CẦN TRIỂN KHAI

---

### TÍNH NĂNG 1: HỆ THỐNG CHIẾU SÁNG NỘI THẤT ẤM CÚNG (COZY INTERIOR NIGHT LIGHTS)

**Vấn đề hiện tại:** Khi trời tối (theo hàm `applyTod()`), toàn bộ không gian bị tối đều, chỉ có màn hình máy tính sáng, thiếu độ tương phản giữa không gian lạnh bên ngoài và sự ấm áp bên trong văn phòng.

**Giải pháp kỹ thuật:**
1. **Đèn trần ấm tự động theo giờ (`applyTod`):**
   * Bố trí các nguồn sáng ấm (màu vàng kem `#ffe8b3`, cường độ tự tăng khi trời về chiều và đạt cực đại vào ban đêm `t.night > 0.4`).
   * Đặt 1 nguồn sáng tại sảnh chính, 1 tại phòng Giám Đốc, và 2-3 nguồn sáng dọc hành lang các phòng ban.
   * Thêm vầng sáng tròn tỏa dịu trên trần hoặc sàn nhà (`canvasTex` vầng sáng radial gradient) giúp mô phỏng ánh đèn rọi trần (Downlight / Track light) mà không tốn chi phí render shadow phức tạp.
2. **Hiệu ứng Màn hình hắt sáng (Screen Glow Face Reflection):**
   * Khi nhân viên đang cật lực gõ phím (`status === 'chay'`), màn hình máy tính phát ra vệt sáng cyan/xanh ngọc nhẹ hắt lên nửa thân trên của nhân vật, nhấp nháy tinh tế theo nhịp gõ phím mô phỏng dòng code đang chạy.

---

### TÍNH NĂNG 2: HỆ THỐNG HẠT VI MÔ SINH ĐỘNG (MICRO-PARTICLE ECOSYSTEM)

Tạo một class quản lý hạt nhẹ `class ParticleOffice` quản lý các hiệu ứng sau:

1. **Làn khói cà phê bốc lên (Coffee Steam Wisps):**
   * Tại vị trí các ly cà phê (`MAT.mug`) trên bàn sếp và bàn nhân viên, phát sinh 3–5 hạt khói trắng mờ uốn lượn bay lên cao khoảng $20-30\,\text{cm}$ theo hình xoắn ốc rồi tan biến dần (`opacity` giảm dần, kích thước nở nhẹ).
2. **Bụi nắng & Đom đóm đêm (Ambient Dust / Fireflies):**
   * Ban ngày: 40–50 hạt bụi nhỏ li ti lơ lửng chậm chạp trong các vệt sáng chiếu qua cửa sổ kính.
   * Ban đêm: Các hạt này chuyển thành ánh đom đóm vàng/xanh lục nhấp nháy nhẹ quanh hàng cây ngoài sân văn phòng.
3. **Máy in/Photocopy tương tác ở sảnh (Interactive Printer Props):**
   * Dựng một khối máy in/photocopy hiện đại đặt ở góc sảnh hành lang.
   * Mỗi khi có nhân viên nộp bài thành công (trạng thái `xong` hoặc có sự kiện báo cáo trong feed), máy in nhấp nháy đèn laser quét màu xanh lục (horizontal laser scan beam) và đẩy nhẹ một tờ giấy trắng ra khay đựng.

---

### TÍNH NĂNG 3: TRANG THÁI & BIỂU CẢM NHÂN VẬT HÀI HƯỚC (EXPRESSIVE AVATAR FX)

1. **Hiệu ứng khi gặp trục trặc (`status === 'loi'`):**
   * Ngoài vòng tròn đỏ dưới chân, xuất hiện một đám mây xám nhỏ tí hon trên đỉnh đầu với biểu tượng tia sét ⚡ nhấp nháy, nhân vật thỉnh thoảng có động tác ôm đầu hoặc gãi đầu bối rối.
2. **Hiệu ứng hoàn thành xuất sắc (`status === 'xong'`):**
   * Khi vừa chuyển sang trạng thái xong, bung nhẹ một chùm hạt pháo giấy màu sắc rực rỡ (mini confetti burst) trong $1.5\,\text{giây}$ quanh nhân vật.
3. **Động tác khi rảnh rỗi / Chờ việc (`status === 'cho'`):**
   * Ghế xoay văn phòng lắc lư nhẹ góc $\pm 10^\circ$, nhân vật ngả lưng ra sau ghế hoặc thỉnh thoảng giơ cốc cà phê lên uống.

---

### TÍNH NĂNG 4: CHẾ ĐỘ MÁY QUAY ĐIỆN ẢNH TỰ HÀNH (CINEMATIC SCREENSAVER TOUR)

**Kích hoạt:** Phím `C` (Cinematic) hoặc nút camera điện ảnh `🎬 Tour` trên thanh Top Bar, hoặc tự động kích hoạt sau 90 giây người dùng không tương tác chuột.

**Hành vi máy quay:**
* Camera thoát khỏi góc nhìn Orbit thông thường và chuyển động mượt mà theo đường cong Bezier khép kín (spline curve).
* Hệ thống tự động chuyển đổi ngẫu nhiên giữa 3 góc máy điện ảnh:
  1. **Góc Diorama Low-Angle:** Máy quay lướt ngang tầm mắt bên ngoài vách kính nhìn vào toàn cảnh văn phòng nhộn nhịp, thấy rõ bóng người đi lại.
  2. **Góc Sếp Chill:** Máy quay lia cận cảnh từ góc sofa phòng Giám Đốc, ngắm đĩa than đang quay trên mâm đĩa và nốt nhạc bay, nhìn xuyên qua cửa kính ra các phòng ban bên ngoài.
  3. **Góc Over-the-Shoulder:** Máy quay đặt chéo sau lưng một nhân viên đang chạy lệnh hăng say nhất, bắt trọn màn hình code nhảy liên tục.
* Bất kỳ cú click chuột hoặc nhấn phím nào của người dùng sẽ êm ái trả máy quay về vị trí ban đầu (Seamless exit).

---

## 3. GỢI Ý MÃ NGUỒN THAM KHẢO

### Mẫu khởi tạo Coffee Steam Particles (`3d/van_phong.js`):
```javascript
// Hệ thống hạt khói cà phê siêu nhẹ
class SteamSystem {
  constructor(scene) {
    const count = 30;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const life = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      life[i] = Math.random();
      pos[i * 3 + 1] = -100; // ẩn ban đầu
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.12,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.points = new THREE.Points(geo, this.mat);
    scene.add(this.points);
  }
  update(dt, coffeeMugs) {
    // Di chuyển hạt bay lên theo trục Y và xoắn nhẹ hình sin
  }
}
```

### Mẫu chế độ Cinematic Tour (`3d/van_phong.js`):
```javascript
let cineTour = false, cineTime = 0;
function toggleCinematic(force) {
  cineTour = force !== undefined ? force : !cineTour;
  $("#btnCine")?.classList.toggle("on", cineTour);
  if (cineTour) {
    cineTime = 0;
    controls.enabled = false;
  } else {
    controls.enabled = true;
    overview();
  }
}
// Trong hàm render frame(dt):
if (cineTour) {
  cineTime += dt * 0.15;
  const radius = 28;
  camera.position.x = Math.sin(cineTime) * radius + (xG - LOBBY) / 2;
  camera.position.z = Math.cos(cineTime) * radius;
  camera.position.y = 12 + Math.sin(cineTime * 1.5) * 4;
  camera.lookAt((xG - LOBBY) / 2, 1, 0);
}
```

---

## 4. CHECKLIST NGHIỆM THU CUỐI CÙNG
- [ ] Bật/tắt Cinematic Tour bằng phím `C` và nút trên Top Bar hoạt động mượt mà.
- [ ] Ban đêm văn phòng có ánh sáng vàng ấm lan tỏa qua kính đẹp mắt, màn hình máy tính có vệt hắt sáng.
- [ ] Có khói cà phê bốc lên ở các bàn có ly nước.
- [ ] Nhân viên lỗi có biểu tượng ⚡/mây bão; nhân viên xong có hiệu ứng vui nhộn.
- [ ] Không sụt giảm FPS (duy trì $\ge 30\text{ FPS}$ ngay cả trên laptop thông thường).
- [ ] Code sạch sẽ, có chú thích tiếng Việt rõ ràng, tương thích 100% với phiên bản hiện tại.

*Hãy tiến hành hiện thực hóa các tính năng trên để biến Văn Phòng AI 3D thành một tác phẩm nghệ thuật xuất sắc!*
