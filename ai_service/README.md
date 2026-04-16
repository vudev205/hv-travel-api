# 🤖 HV-Travel AI & ML Service

## Mục lục
1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Module 1: Gợi ý Tour — Học Máy (Machine Learning)](#2-module-1-gợi-ý-tour--học-máy)
3. [Module 2: Tối ưu Lộ trình — Trí Tuệ Nhân Tạo (AI)](#3-module-2-tối-ưu-lộ-trình--trí-tuệ-nhân-tạo)
4. [Cần Training hay không?](#4-cần-training-hay-không)
5. [Cách chạy](#5-cách-chạy)
6. [Cấu trúc thư mục](#6-cấu-trúc-thư-mục)

---

## 1. Tổng quan hệ thống

Hệ thống AI Service được xây dựng bằng **Python (FastAPI)**, hoạt động như một **Microservice** độc lập bên cạnh Node.js API và ASP.NET Admin. 

Hệ thống phục vụ **2 đề tài đồ án** trên cùng 1 cơ sở dữ liệu MongoDB:

| Đề tài | Môn học | Thuật toán | File code |
|--------|---------|-----------|-----------|
| Gợi ý Tour cá nhân hóa | **Học Máy** | Hybrid (TF-IDF + Cosine Similarity + Budget Heuristic) | `recommendation.py` |
| Tối ưu lộ trình du lịch | **Trí Tuệ Nhân Tạo** | TSP Brute-force + Hàm Heuristic A* | `tsp_heuristic.py` |

### Kiến trúc tổng thể

```
React Native (Mobile App)
        │
        ▼
Node.js API (Vercel) ──HTTP call──► Python AI Service (FastAPI)
        │                                   │
        ▼                                   ▼
   MongoDB Atlas ◄──────────────────── Đọc dữ liệu (motor)
```

---

## 2. Module 1: Gợi ý Tour — Học Máy

### 2.1 Bài toán
> **Đầu vào:** ID của một Khách hàng (Customer).  
> **Đầu ra:** Danh sách Top 5 Tour phù hợp nhất với sở thích cá nhân của khách.

### 2.2 Thuật toán Hybrid Recommendation (Gợi ý Lai)

Hệ thống **kết hợp 2 phương pháp** để cho kết quả chính xác hơn so với dùng riêng lẻ.

#### Bước 1: Content-Based Filtering (Lọc dựa trên Nội dung)

Phương pháp này dựa vào **nội dung** (tags) của Tour và **sở thích** (preferences) của Khách hàng.

**Cách hoạt động:**

1. Mỗi Tour có một mảng `tags`, ví dụ: `["Biển", "Nghỉ_Dưỡng", "Miền_Trung", "Ẩm_Thực"]`.
2. Mỗi Customer có `preferences.favoriteThemes`, ví dụ: `["Biển", "Ẩm_Thực"]`.
3. Dùng thuật toán **TF-IDF** (Term Frequency - Inverse Document Frequency) để chuyển đổi các mảng text thành **vector số học** trong không gian đa chiều.
4. Tính **Cosine Similarity** (Độ tương đồng Cosine) giữa vector sở thích của Khách với vector tags của từng Tour.

**Công thức Cosine Similarity:**

```
                    A · B           Σ(Ai × Bi)
cos(θ) = ─────────────────── = ─────────────────────
              ‖A‖ × ‖B‖       √Σ(Ai²) × √Σ(Bi²)
```

- Giá trị = **1.0**: Hoàn toàn trùng khớp (Tour đúng gu khách).
- Giá trị = **0.0**: Không liên quan (Tour trái ngược sở thích).

**Ví dụ minh họa:**

```
Khách thích:   ["Biển", "Ẩm_Thực"]           → Vector: [0.7, 0.7, 0, 0]
Tour Đà Nẵng:  ["Biển", "Ẩm_Thực", "Di_Sản"] → Vector: [0.5, 0.5, 0.5, 0]
Tour Hà Giang: ["Núi_Rừng", "Khám_Phá"]       → Vector: [0, 0, 0, 0.7]

→ Cosine(Khách, Đà Nẵng) = 0.82  ← Điểm CAO, gợi ý!
→ Cosine(Khách, Hà Giang) = 0.0   ← Điểm THẤP, bỏ qua.
```

#### Bước 2: Budget Matching (Khớp Ngân sách)

Sau khi có điểm Content, hệ thống **nhân thêm hệ số ngân sách**:

| Sở thích ngân sách | Giá Tour | Hệ số |
|---------------------|----------|-------|
| Low (Tiết kiệm) | < 3 triệu | ×1.2 (ưu tiên) |
| Medium (Phổ thông) | 3-8 triệu | ×1.2 (ưu tiên) |
| High (Sang trọng) | > 8 triệu | ×1.2 (ưu tiên) |
| Không khớp | | ×1.0 (bình thường) |

#### Bước 3: Tính Hybrid Score (Điểm tổng hợp)

```
Hybrid Score = Content Score (Cosine) × Budget Multiplier
```

Sắp xếp giảm dần theo `Hybrid Score`, trả về Top K tour có điểm cao nhất.

### 2.3 API Endpoint

```http
POST /api/recommend
Content-Type: application/json

{
    "customer_id": "60b9b...",
    "top_k": 5
}
```

**Response:**
```json
{
    "customer": {
        "id": "60b9b...",
        "favoriteThemes": ["Biển", "Ẩm Thực"],
        "budget": "Medium"
    },
    "recommendations": [
        {
            "tour_id": "abc123",
            "name": "Da Nang & Hoi An Discovery",
            "match_score": 82.5,
            "matched_tags": ["Biển", "Ẩm Thực"]
        }
    ]
}
```

---

## 3. Module 2: Tối ưu Lộ trình — Trí Tuệ Nhân Tạo

### 3.1 Bài toán TSP (Travelling Salesman Problem)

> **Đầu vào:** Một danh sách N địa điểm du lịch (POIs) mà khách muốn ghé thăm.  
> **Đầu ra:** Thứ tự đi qua các điểm sao cho **tổng thời gian di chuyển ngắn nhất**, sau đó quay về điểm xuất phát.

### 3.2 Tại sao bài toán này khó?

Với N điểm, số lượng cách sắp xếp hành trình = **(N-1)!** (giai thừa).

| Số điểm | Số cách đi | Thời gian tính |
|---------|-----------|---------------|
| 4 điểm | 6 cách | < 1ms |
| 5 điểm | 24 cách | < 1ms |
| 6 điểm | 120 cách | < 5ms |
| 7 điểm | 720 cách | < 10ms |
| 8 điểm | 5,040 cách | ~ 50ms |
| 10 điểm | 362,880 cách | ~ 2 giây |
| 20 điểm | 121 tỷ tỷ cách | **Hàng triệu năm!** |

→ Với ≤ 8 điểm (đủ cho 1 chuyến du lịch thực tế), thuật toán **Brute-force** (thử hết mọi cách) chạy gần như tức thì và đảm bảo tìm ra kết quả **TỐI ƯU TUYỆT ĐỐI**.

### 3.3 Thuật toán chi tiết

#### Bước 1: Xây dựng Đồ thị có hướng (Directed Graph)

Dữ liệu từ collection `RouteEdges` trong MongoDB được nạp vào thư viện **NetworkX** (Python) dưới dạng đồ thị có hướng:

```
Nodes (Đỉnh) = Các địa điểm POI (Hồ Hoàn Kiếm, Vịnh Hạ Long, ...)
Edges (Cạnh) = Đường đi giữa 2 điểm, gồm:
    - distanceMeters: Khoảng cách mét (từ OpenRouteService API)
    - baseDurationSeconds: Thời gian lái xe gốc (từ OpenRouteService API) 
    - trafficDelayMultiplier: Hệ số kẹt xe giả lập
```

#### Bước 2: Tính hàm chi phí Heuristic f(n)

Đây là trái tim của thuật toán AI. Thay vì chỉ tính khoảng cách thuần túy, chúng ta dùng **hàm đánh giá thông minh**:

```
f(n) = baseDurationSeconds × trafficDelayMultiplier
```

**Ý nghĩa:**
- `baseDurationSeconds` = Thời gian lái xe trong điều kiện lý tưởng (không kẹt xe).
- `trafficDelayMultiplier` = Hệ số nhân mô phỏng tình trạng giao thông:

| Loại đường | Khoảng cách | Hệ số kẹt xe | Giải thích |
|-----------|------------|-------------|------------|
| Nội thành | < 10 km | 1.3 → 1.8 | Đông đúc, đèn đỏ nhiều |
| Ngoại ô | 10 - 50 km | 1.1 → 1.4 | Kẹt vừa phải |
| Liên tỉnh | > 50 km | 1.02 → 1.15 | Đường cao tốc, thông thoáng |

**Ví dụ:**
```
Hoàn Kiếm → Lăng Bác: 2.4p gốc × 1.5 (nội thành kẹt) = 3.6 phút thực tế
Hoàn Kiếm → Hạ Long:  101p gốc × 1.04 (liên tỉnh)     = 105 phút thực tế
```

#### Bước 3: Duyệt tất cả hoán vị (Brute-force Permutation)

```python
import itertools

best_cost = vô cực
best_path = rỗng

# Thử TẤT CẢ các cách sắp xếp điểm trung gian
for mỗi_hoán_vị in itertools.permutations(các_điểm_trung_gian):
    
    route = [điểm_xuất_phát] + list(mỗi_hoán_vị) + [điểm_xuất_phát]
    
    # Tính tổng chi phí cho route này
    total_cost = 0
    for mỗi_chặng(A → B) trong route:
        total_cost += f(n)  # = baseDuration × trafficMultiplier
    
    # So sánh: Nếu route này rẻ hơn → ghi nhớ lại
    if total_cost < best_cost:
        best_cost = total_cost
        best_path = route

return best_path  # Đường đi tối ưu nhất!
```

#### Bước 4: Trả về kết quả

Kết quả bao gồm:
- **Thứ tự đi tối ưu** (danh sách ID các POI đã sắp xếp).
- **Tổng khoảng cách** (km).
- **Tổng thời gian dự kiến** (đã tính kẹt xe).
- **Chi tiết từng chặng** (khoảng cách, thời gian gốc, thời gian có kẹt xe).

### 3.4 Thế nào là TỐI ƯU vs KHÔNG TỐI ƯU?

**❌ Thuật toán Tham Lam (Greedy - Nearest Neighbor):**
> Luôn chọn điểm GẦN NHẤT tiếp theo. Nhanh nhưng thường cho kết quả sai.

```
Hà Nội → Hoàn Kiếm (0.7km) → Lăng Bác (3km) → Hạ Long (150km) → Sửng Sốt (90km) → Sa Pa (450km!) → về Hà Nội (320km)
Tổng: ~1013km, ~1400 phút
```

**✅ Thuật toán Brute-force + Heuristic (của chúng ta):**
> Thử tất cả hoán vị, chọn cái có TỔNG THỜI GIAN (kể cả kẹt xe) thấp nhất.

```
Hà Nội → Hạ Long (150km) → Sửng Sốt (90km) → Lăng Bác (161km) → Sa Pa (319km) → Hoàn Kiếm (322km) → về Hà Nội (0.7km)
Tổng: ~1045km, ~1155 phút  ← NHANH HƠN 245 phút!
```

**Điểm mấu chốt:** 
> *"Đường NGẮN nhất chưa chắc đã NHANH nhất. Thuật toán AI của em tối ưu theo THỜI GIAN THỰC TẾ (có kẹt xe), không phải theo khoảng cách."*

### 3.5 API Endpoint

```http
POST /api/optimize-route
Content-Type: application/json

{
    "start_poi_id": "abc...",
    "pois_to_visit": ["def...", "ghi...", "jkl..."],
    "end_poi_id": null
}
```

**Response:**
```json
{
    "optimized_route_ids": ["abc...", "def...", "ghi...", "jkl...", "abc..."],
    "total_distance_km": 1045.65,
    "total_estimated_time_minutes": 1155,
    "path_details": [
        {
            "from": "Phố cổ Hà Nội",
            "to": "Vịnh Hạ Long",
            "distance_km": 150.97,
            "base_time_minutes": 101.1,
            "computed_time_minutes": 105.2
        }
    ]
}
```

---

## 4. Cần Training hay không?

### Module Học Máy (Recommendation): ❌ KHÔNG CẦN TRAINING TRƯỚC

Thuật toán TF-IDF + Cosine Similarity là thuật toán **"lazy learning"** (học lười). Nó **tính toán ngay lập tức** mỗi khi có request đến:
1. Đọc tags của tất cả Tour từ MongoDB.
2. Đọc preferences của Customer.
3. Tính TF-IDF vector + Cosine Similarity ngay tại chỗ.
4. Trả kết quả.

→ Không cần bước training riêng. Khi thêm Tour mới hoặc Customer mới vào DB, lần gọi API tiếp theo sẽ tự động bao gồm dữ liệu mới.

### Module AI (TSP Heuristic): ❌ KHÔNG CẦN TRAINING

Thuật toán TSP là thuật toán **tìm kiếm/tối ưu hóa** (Search & Optimization), KHÔNG phải Machine Learning. Nó:
1. Đọc đồ thị (Graph) từ MongoDB (collection RouteEdges).
2. Chạy brute-force duyệt mọi hoán vị.
3. Tính hàm f(n) cho mỗi cách đi.
4. Chọn cách đi có f(n) tổng nhỏ nhất.

→ Không có mô hình nào được "huấn luyện". Thuật toán chạy **real-time** mỗi khi người dùng yêu cầu.

### Tóm lại

| Module | Cần Training? | Lý do |
|--------|:---:|--------|
| Gợi ý Tour (ML) | ❌ Không | TF-IDF tính on-the-fly, không cần pre-train |
| Lộ trình TSP (AI) | ❌ Không | Là thuật toán tìm kiếm, không phải ML model |

> **Câu trả lời cho giảng viên:** *"Thưa thầy/cô, hệ thống của em không cần bước Training riêng. Module Học Máy dùng TF-IDF tính toán real-time mỗi khi có yêu cầu. Module AI dùng thuật toán tìm kiếm Heuristic trên đồ thị, vốn không phải là mô hình cần huấn luyện. Tất cả dữ liệu đầu vào (tags, tọa độ, ma trận khoảng cách) đã được seed sẵn vào MongoDB."*

---

## 5. Cách chạy

### Yêu cầu
- Python >= 3.10
- MongoDB đang chạy (Atlas hoặc Local)
- File `.env` ở thư mục cha chứa `MONGO_URI`

### Khởi động

```bash
# Terminal 1: Chạy Node.js API
cd "HV-Travel API"
npm run dev

# Terminal 2: Chạy Python AI Service
cd "HV-Travel API/ai_service"
.\venv\Scripts\python -m uvicorn main:app --reload
```

### Test trên trình duyệt
- **Swagger UI (test API):** http://localhost:8000/docs
- **Demo Bản đồ TSP:** Mở file `demo_map.html` bằng trình duyệt

---

## 6. Cấu trúc thư mục

```
ai_service/
├── main.py                 # Server FastAPI - Điểm khởi động chính
├── database.py             # Kết nối MongoDB (async với Motor)
├── models.py               # Pydantic models cho Request/Response
├── recommendation.py       # Module Học Máy: Hybrid Recommendation
├── tsp_heuristic.py        # Module AI: TSP + Heuristic A*
├── demo_map.html           # Giao diện Web Demo bản đồ Leaflet
├── requirements.txt        # Danh sách thư viện Python
└── venv/                   # Môi trường ảo Python (không commit lên Git)
```
