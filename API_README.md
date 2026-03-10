# Tài liệu API - HV-Travel

Tài liệu này tổng hợp toàn bộ các endpoints, routes và controllers trong dự án `hv-travel-api`. Hệ thống tuân theo chuẩn RESTful API, phục vụ cho ứng dụng Mobile (React Native) và các client khác.

## 1. Cấu trúc Routing (Base Routes)
Các route chính được định nghĩa trong `server.js` và điều phối request đến các module route cụ thể:
- `/api/tours` ➝ Xử lý truy xuất thông tin Tour.
- `/api/auth` ➝ Xác thực người dùng (Login, Register, OTP).
- `/api/favourites` ➝ Quản lý danh sách tour yêu thích.
- `/api/bookings` ➝ Quản lý đặt tour (Booking).
- `/api/payments` ➝ Xử lý thanh toán.
- `/api/reviews` ➝ Quản lý đánh giá.
- `/api/customers` ➝ Quản lý thông tin khách hàng (Profile).
- `/api/chatbot` ➝ Tích hợp AI Chatbot tư vấn du lịch.
- `/api/test` ➝ Kiểm tra hệ thống.

---

## 2. Chi tiết Endpoints & Logic Controllers

### 🔐 TÀI KHOẢN & XÁC THỰC (`/api/auth`)
Quản lý đăng nhập, đăng ký và bảo mật tài khoản khách hàng.  
_Middleware:_ Hầu hết các API bảo mật đều được bảo vệ bởi middleware `customerAuth` kiểm tra token JWT.

- `POST /register`: Đăng ký tài khoản khách hàng mới.
- `POST /login`: Đăng nhập, sinh token JWT.
- `POST /logout`: Đăng xuất (yêu cầu auth).
- `GET /me`: Lấy thông tin tài khoản hiện tại (thông qua token).
- `POST /forgot-password`: Gửi yêu cầu quên mật khẩu (gửi OTP qua email).
- `POST /resend-otp`: Gửi lại mã OTP.
- `POST /verify-otp`: Xác thực mã OTP người dùng nhập.
- `POST /reset-password`: Đổi mật khẩu mới sau khi xác thực OTP thành công.
- `POST /change-password`: Thay đổi mật khẩu khi đang đăng nhập.
- `GET /db`: Kiểm tra trạng thái Database.

### 👤 KHÁCH HÀNG (`/api/customers`)
Quản lý hồ sơ cá nhân của người dùng trên ứng dụng.

- `GET /profile`: Lấy thông tin chi tiết hồ sơ (Tên, email, số điện thoại, địa chỉ).
- `PUT /profile`: Cập nhật thông tin cá nhân.

### 🏖️ QUẢN LÝ TOUR (`/api/tours`)
Các API liên quan đến tìm kiếm và hiển thị dữ liệu du lịch.

- `GET /list`: Lấy danh sách tour, hỗ trợ phân trang (pagination), phân loại (category) và tìm kiếm (search keyword).
- `GET /:id`: Xem chi tiết thông tin của 1 tour (lịch trình, giá cả, thời gian, hình ảnh).

### ❤️ TOUR YÊU THÍCH (`/api/favourites`)
Chức năng Wishlist cho phép người dùng lưu lại các tour quan tâm.

- `GET /list`: Danh sách các tour mà người dùng hiện tại đã thả tim.
- `POST /tour/:tourId`: Thêm/Xóa tour vào danh sách yêu thích (Logic Upsert).
- `DELETE /tour/:tourId`: Xóa mềm tour khỏi danh sách yêu thích.

### 📅 ĐẶT TOUR (`/api/bookings`)
Quá trình booking tour của khách hàng.

- `GET /`: Xem danh sách các booking của tài khoản hiện tại.
- `POST /calculate-price`: (Preview) Kiểm tra và tính tổng giá tiền tạm tính trước khi book thực tế dựa trên số lượng người lớn/trẻ em và voucher (nếu có).
- `POST /`: Xác nhận tạo Booking mới vào Database.
- `GET /:id`: Xem chi tiết hoá đơn/đặt chỗ theo Booking ID.
- `PUT /:id`: Cập nhật trạng thái Booking (Huỷ, Xác nhận...).

### 💳 THANH TOÁN (`/api/payments`)
Theo dõi giao dịch thanh toán. Các integration Cổng thanh toán (VNPay, Momo, ZaloPay) thường giao tiếp với module này.

- `GET /`: Lịch sử các giao dịch/thanh toán của user.
- `POST /`: Khởi tạo thanh toán cho một booking, lưu log transaction.

### ⭐ ĐÁNH GIÁ & BÌNH LUẬN (`/api/reviews`)
- `GET /`: Lấy danh sách các đánh giá (thường lọc theo `tourId`).
- `POST /`: Viết đánh giá mới (Kèm sao đánh giá và nội dung), tự động cập nhật lại `reviewCount` và `rating` trung bình của Tour.

### 🤖 CHATBOT AI (`/api/chatbot`)
Hệ thống AI Assistant (tích hợp Gemini/ChatGPT) hỗ trợ tư vấn trực tuyến.

- `GET /health`: Ping kiểm tra server chatbot.
- `GET /check-gemini-key`: Kiểm tra api key AI hợp lệ.
- `POST /tour`: Trò chuyện và tư vấn liên quan tới kho dữ liệu Tour của HV-Travel.

---

## 3. Kiến trúc Database và Models
Tất cả controller tương tác với MongoDB thông qua Mongoose, với các models chủ chốt:
- **`Customer`**: Lưu trữ người dùng app Mobile (Phân biệt với `User` nội bộ/Admin).
- **`Tour`**: Chứa thông tin chi tiết các chuyến đi, ngày khởi hành.
- **`Booking`**: Ghi lại lịch sử đặt tour, số lượng hành khách, thông tin liên hệ và snapshot của Tour tại thời điểm đặt.
- **`Payment`**: Quản lý lịch sử nạp/rút/giao dịch.
- **`Favourite`**: Liên kết nhiều-nhiều (Many-to-Many) giữa Customer và Tour.
- **`Review`**: Lưu phản hồi và điểm đánh giá.

*Tài liệu này được tự động phân tích và tạo dựa trên mã nguồn hiện tại.*
