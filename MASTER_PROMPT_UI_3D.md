# MASTER PROMPT: NÂNG CẤP TOÀN DIỆN UI/UX & VISUAL CHO VĂN PHÒNG AI 3D

Bạn là Senior Creative Technologist kiêm Lead Frontend & Three.js UI/UX Designer. Dự án hiện tại là **Văn Phòng AI 3D** (một dashboard mô phỏng văn phòng làm việc AI tương tác dạng 3D Isometric dựa trên Three.js, HTML5 và CSS Glassmorphism).

Nhiệm vụ của bạn là **chỉnh sửa, tái cấu trúc và làm đẹp toàn diện UI/UX** cho ứng dụng theo đặc tả chi tiết dưới đây.

---

## 1. THÔNG TIN CODEBASE & PHẠM VI TỆP TIN

Các tệp tin cần tập trung chỉnh sửa:
* `3d/index.html`: Cấu trúc HTML, CSS cho các lớp HUD 2D (Top bar, Sidebar phòng ban, Bảng tin, Hint, Profile).
* `3d/van_phong.js`: Three.js scene, camera, ánh sáng, vật liệu (PBR materials), màu nền (`MAT.ground`, `scene.background`, `applyTod`), nhãn phòng 3D (`CSS2DObject`).

> **RÀNG BUỘC BẮT BUỘC (CRITICAL):**
> 1. Không làm hỏng hoặc xóa logic nhận dữ liệu trạng thái nhân viên từ `/api/state` và vòng lặp hoạt họa Three.js hiện có.
> 2. Đảm bảo hiệu năng mượt mà (30-60 FPS), không gây lag hoặc rò rỉ bộ nhớ Three.js.
> 3. Phong cách thiết kế: **Modern Clean Diorama / Cyber-SaaS Glassmorphism 2.0**.

---

## 2. CÁC HẠNG MỤC CẦN NÂNG CẤP CHI TIẾT

### HẠNG MỤC A: VISUAL 3D & KHÔNG GIAN MÔI TRƯỜNG (van_phong.js)
1. **Khắc phục màu nền sân cỏ úa:**
   * Hiện tại tấm nền `MAT.ground` đang dùng mã màu xanh ô liu xỉn `#76815f` chiếm phần lớn màn hình.
   * **Yêu cầu:** Chuyển sang phong cách **Diorama Studio Cao Cấp**:
     * Đổi màu nền bao quanh sang tông **Dark Studio Slate** sâu thẳm (`#0d1117` hoặc gradient mờ dần ra xa), hoặc nếu giữ phong cách cỏ/sân thì dùng màu thảm cỏ tươi mát giàu sức sống (`#48bb78` / `#3ea662`), vỉa hè gạch sáng ấm sạch sẽ.
     * Tinh chỉnh ánh sáng mặt trời (`sun`) và ánh sáng môi trường (`hemiLight` / `RoomEnvironment`) để văn phòng có độ tương phản trong trẻo, bóng đổ mềm mại, không bị đục.
2. **Dọn dẹp Biển Tên Phòng 3D (`CSS2DObject`):**
   * Hiện tại các biển tên phòng lơ lửng ngay giữa không trung ở tầm mắt, đè lên bàn ghế và nhân vật gây rối mắt.
   * **Yêu cầu:** 
     * Hạ thấp cao độ của biển tên phòng, gắn tinh tế sát mép vách kính cửa vào phòng, hoặc làm dạng badge kính mờ nhỏ gọn có icon.
     * Thêm cơ chế: Chỉ làm nổi bật (highlight) biển tên phòng khi rê chuột (hover) vào hoặc khi chọn phòng đó từ danh sách.

---

### HẠNG MỤC B: REDESIGN TOP BAR HUD (index.html)
1. **Bố cục Floating Capsule:**
   * Thay vì một thanh chữ nhật đen đục ép sát viền màn hình, chuyển thành thanh nổi bo cong viền mềm (border-radius: 16px - 20px), nổi nhẹ trên nền 3D với hiệu ứng Glassmorphism hiện đại:
     ```css
     background: rgba(15, 23, 42, 0.7);
     backdrop-filter: blur(16px) saturate(1.8);
     border: 1px solid rgba(255, 255, 255, 0.08);
     box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.12);
     ```
2. **Thống kê dạng Metric Pills (Kén số liệu):**
   * Chuyển các dòng thống kê text phẳng (`0 đang cày`, `1 ngồi đợi`...) thành các pill badge trực quan có chấm trạng thái phát sáng (neon glow):
     * 🟢 **0** Đang cày
     * 🟡 **1** Chờ việc
     * ⏳ **2** Chờ duyệt
     * ⚙️ **1** Nền
     * 📁 **24** Hồ sơ
3. **Phân cấp nút bấm (Button Hierarchy):**
   * Nút hành động chính (`🚶 Sếp đi kiểm tra`): Tạo viền nổi bật hoặc hiệu ứng gradient hổ phách/cam ấm (`#f59e0b` -> `#d97706`) với micro-hover animation (nhấc nhẹ 1px).
   * Các nút phụ (`Toàn cảnh`, `Tường`, `Chất lượng`): Thiết kế tối giản, tinh tế, icon rõ nét.
   * Thêm nút **Zen Mode (👁️ / Phím H)**: Cho phép ẩn/hiện toàn bộ lớp giao diện 2D để người dùng có thể thưởng thức toàn cảnh 3D không bị che khuất.

---

### HẠNG MỤC C: SIDEBAR DANH SÁCH PHÒNG BAN (COLLAPSIBLE SIDEBAR)
1. **Cơ chế Thu gọn thông minh (Expand / Collapse):**
   * Hiện tại panel danh sách phòng cố định mở toang chiếm mảng lớn bên trái.
   * **Yêu cầu:** Thêm nút thu nhỏ sidebar. 
     * Khi thu gọn: Chỉ hiện cột icon phòng (🏛️, 🚀, 🧪, 💻...) kèm chấm trạng thái hoạt động của phòng đó.
     * Khi rê chuột hoặc click: Mở rộng mượt mà (smooth transition) để xem tên phòng đầy đủ và phím tắt số (1-9).
2. **Hover & Active State:**
   * Khi chọn phòng, tạo hiệu ứng active sáng viền màu chủ đạo, camera lia mượt tới phòng tương ứng.

---

### HẠNG MỤC D: NÂNG CẤP BẢNG TIN (#feed) & THANH GỢI Ý (#hint)
1. **Bảng tin (Activity Feed):**
   * Thiết kế lại các dòng tin nhắn theo dạng **Notification Stream**:
     * Avatar tròn sắc nét có viền phân loại vai trò.
     * Dấu thời gian mờ tinh tế, tên nhân viên in đậm.
     * Badge hành động với màu sắc riêng (⌨️ Lệnh: tím pastel, 📄 Báo cáo: xanh ngọc, ⚠️ Lỗi: đỏ mềm).
   * Thêm hiệu ứng fade-out nhẹ ở mép trên để danh sách cuộn tự nhiên.
2. **Thanh phím tắt (#hint):**
   * Chuyển chuỗi text dài lê thê thành các **Keyboard/Mouse Chips**:
     * `[🖱️ Kéo] Xoay` · `[Chuột phải] Dời` · `[Cuộn] Zoom` · `[K] Đi tuần` · `[1-9] Chọn phòng` · `[H] Ẩn/Hiện UI`.
   * Tự động làm mờ nhẹ (opacity: 0.6) sau 5 giây để không làm phiền mắt, hover vào sẽ sáng rõ trở lại.

---

### HẠNG MỤC E: NÂNG CẤP PANEL HỒ SƠ NHÂN VIÊN (#pf)
* Thiết kế lại slide-out profile drawer bên phải:
  * Header avatar to nổi bật với status badge động (pulse animation).
  * Các khối thông số (facts) chia card lưới 2 cột bo góc mềm mại, có đổ bóng nhẹ.
  * Tab hoặc accordion nhật ký hoạt động có màu syntax highlighting dễ đọc.

---

## 3. CHECKLIST KIỂM THỬ SAU KHI TRIỂN KHAI
- [ ] Không có lỗi runtime trên Console trình duyệt.
- [ ] Các phím tắt (0, 1-9, K, T, Esc) và tương tác click chuột vào nhân viên vẫn hoạt động chính xác.
- [ ] Responsive tốt trên các kích thước màn hình phổ biến.
- [ ] Tốc độ khung hình (FPS) giữ ổn định ở mức 30-60 FPS.

Hãy bắt đầu phân tích code hiện tại và thực hiện lần lượt từng bước nâng cấp trên!
