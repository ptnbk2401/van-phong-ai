# MASTER PROMPT: NÂNG CẤP ĐỒ VẬT NỘI THẤT & NHÂN VẬT 3D (PROPS, ERGONOMIC CHAIRS, LIVING CHARACTERS & OFFICE PET)

> **Mục tiêu:** Nâng cấp toàn diện **chi tiết đồ vật nội thất** (ghế công thái học có bánh xe, setup màn hình kép/dọc, thùng case LED RGB, bảng Kanban dán Sticky Notes, cây nước nóng lạnh) và **sự sống động của nhân vật** (áo hoodie, dây thẻ nhân viên, đổi tư thế ngồi, chào nhau khi đi ngang) cùng **Robot hút bụi Roomba tự hành / Mèo văn phòng** trên nền tảng Three.js hiện có.

Bạn là **Senior 3D WebGL Technical Artist & Character Rigging Engineer**. Hãy triển khai lần lượt các nâng cấp đồ họa và hoạt họa chi tiết dưới đây vào tệp `3d/van_phong.js`.

---

## 1. NGUYÊN TẮC KỸ THUẬT & TỐI ƯU HÓA (BẮT BUỘC)

1. **Hiệu năng là ưu tiên hàng đầu (Tối ưu Draw Calls):**
   * Các đồ vật tĩnh lặp lại nhiều (chân ghế, bánh xe, thùng case PC, sticky notes) phải được gom vào cấu trúc `Batch` hiện có (`OB.box`, `OB.cyl`, `OB.add`) để ghép chung geometry (`mergeGeometries`), tuyệt đối không tạo hàng trăm Mesh riêng rẽ làm nghẽn CPU/GPU.
   * Giữ số lượng nhân viên hoạt họa mượt mà ở mức 30-60 FPS.
2. **Kế thừa và không phá vỡ logic cũ:**
   * Giữ nguyên cơ chế đồng bộ dữ liệu `/api/state`, chu kỳ ngày đêm `applyTod`, máy hát phòng Sếp, hệ thống hạt và máy quay Tour điện ảnh phím `C`.

---

## 2. CHI TIẾT CÁC HẠNG MỤC CẦN NÂNG CẤP

---

### HẠNG MỤC 1: NÂNG CẤP ĐỒ VẬT NỘI THẤT (FURNITURE & TECH DESK SETUP)

#### 1. Ghế văn phòng công thái học (Ergonomic Office Chair):
* **Cấu trúc lại hàm `chair(B, u, v, yaw, boss)`:**
  * Thay vì hình trụ thẳng đứng thô sơ:
    * **Chân ghế sao 5 cánh:** Trục xoay trung tâm bằng chrome bóng + 5 nan chân vươn ra góc $72^\circ$, mỗi đầu nan có 1 bánh xe nhỏ bằng kim loại mờ.
    * **Piston khí nén:** Trụ piston chrome sáng bóng nối từ chân sao lên đáy đệm ghế.
    * **Đệm ngồi & Tựa lưng công thái học:** Đệm ngồi bo góc mềm mại, lưng tựa uốn cong nhẹ mô phỏng khung lưng đỡ cột sống, chất liệu lưới đen mờ (`MAT.fabric`).
    * **Tay vịn chữ T:** Hai bên đệm ghế có tay vịn chữ T bằng nhựa đen mờ (`MAT.plastic`).
  * **Hiệu ứng động:** Khi nhân viên rời ghế đi nộp báo cáo hoặc đi tuần, chiếc ghế được xoay lệch góc nhẹ $\pm 12^\circ$ tự nhiên.

#### 2. Setup bàn làm việc cá nhân hóa (Desk Clutter & Variations):
Trong vòng lặp tạo bàn nhân viên tại `Room.build()`:
* **Màn hình kép (Dual Monitor) & Màn hình Ultra-wide (Tỉ lệ 30% số bàn):**
  * Với một số bàn Dev/Reviewer: Thay vì 1 màn hình đơn, bố trí **2 màn hình ghép góc $15^\circ$** (1 màn ngang code chính + 1 màn dựng dọc tỉ lệ 9:16 đọc tài liệu/logs) hoặc **1 màn hình cong Ultra-wide lớn**.
* **Thùng case PC đèn LED RGB:**
  * Dưới gầm bàn làm việc đặt một thùng máy PC Case đen có mặt kính hông trong suốt, bên trong có dải đèn LED RGB đổi màu nhè nhẹ (`MAT.plastic` + `emissive` đổi màu theo thời gian).
* **Phụ kiện bàn làm việc ngẫu nhiên (dựa trên RNG seed):**
  * Tai nghe chụp tai (Over-ear Headphones) gác trên thành vách ngăn giữa 2 bàn.
  * Hộp đựng bút chì nhỏ, lịch để bàn mini.
  * Dưới chân bàn có thùng rác văn phòng nhỏ với 1-2 viên giấy vo tròn.

#### 3. Bảng Kanban & Sơ đồ hệ thống trên vách kính:
* Trên một số vách kính ngăn giữa các phòng ban:
  * Vẽ hoặc dán các mẩu giấy ghi chú **Sticky Notes** nhiều màu rực rỡ (vàng neon, hồng pastel, xanh cyan, cam) dán so le nhau mô phỏng bảng công việc Sprint / Kanban.
  * Một vài nét sơ đồ mũi tên vẽ tay bằng bút dạ trắng trên mặt kính.

#### 4. Trạm Pantry ở sảnh hành lang (Coffee & Water Station):
* Đặt tại khu vực sảnh (Lobby) gần máy in:
  * **Cây nước nóng lạnh:** Thân máy đứng màu trắng, bình nước 20L màu xanh dương trong suốt úp ngược phía trên, khay lấy nước có 2 vòi gạt đỏ (nóng) và xanh (lạnh).
  * **Máy pha cà phê Espresso tự động:** Đặt trên mặt kệ gỗ nhỏ, có đèn LED hiển thị mini.

---

### HẠNG MỤC 2: NÂNG CẤP NHÂN VẬT & CỬ ĐỘNG (LIVING CHARACTERS)

#### 1. Thời trang & Phụ kiện đa dạng (`makePerson`):
* **Biến thể trang phục Tech Startup:**
  * Thêm biến thể áo **Hoodie** nỉ có mũ vải trùm sau gáy (bổ sung khối bo cong sau cổ áo cho nhân viên trẻ).
  * Áo phông in logo ký hiệu tech mini (prompt terminal `>_` hoặc lambda `λ`).
* **Phụ kiện nhân vật:**
  * **Dây đeo thẻ nhân viên (Lanyard & Badge):** Dây thẻ mảnh đeo quanh cổ với thẻ nhân viên nhựa lủng lẳng trước ngực, đung đưa nhẹ khi bước đi.
  * **Tai nghe AirPods:** Chấm trắng nhỏ nhắn đeo ở 2 bên tai.
  * **Đồng hồ thông minh (Smartwatch):** Đeo ở cổ tay trái, thi thoảng phát sáng nhẹ.

#### 2. Biến thể tư thế ngồi làm việc (Micro-Idle Variations):
* Trong hàm cập nhật nhân vật:
  * Sau mỗi $30 - 45\,\text{giây}$, nhân viên ngồi làm việc tự động luân phiên đổi dáng ngồi nhẹ:
    * Dáng 1 (Mặc định): Hai tay gõ bàn phím nhịp nhàng.
    * Dáng 2 (Chống cằm suy nghĩ): Tay trái chống cằm, nghiêng đầu, tay phải rê chuột.
    * Dáng 3 (Thư giãn): Hai tay đan sau gáy, ngả lưng ghế ra sau một chút và vươn vai.
  * Mắt và đầu nhân viên thi thoảng liếc sang trái/phải mô phỏng việc đọc 2 bên màn hình.

#### 3. Tương tác xã hội (Social Interactions):
* **Gật đầu chào nhau ở hành lang:** Khi 2 nhân viên di chuyển ngược chiều nhau trên hành lang (khoảng cách giữa 2 người $< 1.5\,\text{m}$), cả hai tự động hơi quay đầu về phía nhau và gật đầu chào nhẹ (`head nod` trong $0.6\,\text{giây}$).
* **Đi lấy nước giải lao:** Khi nhân viên rơi vào trạng thái nghỉ giải lao (`status === 'nghi'`), thay vì ngồi bấm điện thoại mãi, nhân viên có thể đứng dậy đi bộ ra cây nước ở sảnh, cầm ly nước rồi quay về chỗ ngồi.

---

### HẠNG MỤC 3: LINH VẬT VĂN PHÒNG — ROBOT HÚT BỤI ROOMBA TỰ HÀNH

Tạo một thực thể nhỏ vui nhộn tuần tra trên sàn văn phòng: **Robot Roomba**:
* **Hình dáng 3D:** Khối trụ tròn dẹt (`đường kính 38cm, cao 8cm`), màu đen bóng hoặc trắng mờ sang trọng, có viền chống va chạm phía trước và đèn LED tròn màu xanh lục phát sáng ở tâm.
* **Hoạt động tự hành:**
  * Tự động chạy tuần tra dọc theo hành lang chính và sảnh đón tiếp.
  * Khi gặp chân người hoặc chướng ngại vật ở cự ly gần ($< 0.5\,\text{m}$), robot tự động xoay góc ngẫu nhiên $45^\circ - 90^\circ$ và lùi lại rồi tiếp tục chạy.
  * Nếu di chuyển đến gần góc máy quay của Sếp hoặc trong chế độ Tour điện ảnh (phím `C`), mang lại cảm giác văn phòng công nghệ cao cực kỳ sống động và đáng yêu.

---

## 3. CHECKLIST KIỂM THỬ SAU KHI TRIỂN KHAI
- [ ] Ghế làm việc có chân 5 cánh, bánh xe và piston nâng hạ; xoay nhẹ tự nhiên khi nhân viên rời bàn.
- [ ] Một số bàn có 2 màn hình (ngang + dọc), thùng case PC có đèn LED dưới gầm bàn.
- [ ] Có trạm nước nóng lạnh và máy pha cà phê ở sảnh.
- [ ] Nhân viên có biến thể áo hoodie, dây đeo thẻ nhân viên đung đưa khi đi.
- [ ] Có chuyển đổi tư thế ngồi ngẫu nhiên (chống cằm, ngả lưng vươn vai) sau mỗi 30-45 giây.
- [ ] Robot Roomba tự động chạy quanh hành lang dọn dẹp và né người.
- [ ] Tốc độ khung hình (FPS) giữ ổn định ở mức $\ge 30\text{ FPS}$, không gây giật lag.

*Hãy đọc kỹ mã nguồn hiện có của `3d/van_phong.js` và triển khai nâng cấp một cách tinh tế, liền mạch nhất!*
