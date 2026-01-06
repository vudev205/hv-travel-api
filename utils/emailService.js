import nodemailer from "nodemailer";

// Tạo transporter với Gmail
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,     // your-email@gmail.com
      pass: process.env.EMAIL_PASSWORD  // App Password (không phải password Gmail thường)
    }
  });
};

// Generate OTP 6 số
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// HTML Template cho OTP email
const getOTPEmailTemplate = (otp, type) => {
  const titles = {
    register: 'Xác thực tài khoản',
    forgot_password: 'Đặt lại mật khẩu',
    change_email: 'Thay đổi email'
  };

  const messages = {
    register: 'Cảm ơn bạn đã đăng ký tài khoản HV Travel! Vui lòng nhập mã OTP bên dưới để xác thực tài khoản.',
    forgot_password: 'Bạn đã yêu cầu đặt lại mật khẩu. Vui lòng nhập mã OTP bên dưới để tiếp tục.',
    change_email: 'Bạn đã yêu cầu thay đổi email. Vui lòng nhập mã OTP bên dưới để xác nhận.'
  };

  return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
        body {
        margin: 0;
        padding: 0;
        background-color: #fafafa;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        .email-wrapper {
        width: 100%;
        padding: 40px 20px;
        }
        .container {
        max-width: 480px;
        margin: 0 auto;
        background-color: #ffffff;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        overflow: hidden;
        }
        .header {
        padding: 32px 32px 24px;
        text-align: center;
        border-bottom: 1px solid #efefef;
        }
        .logo {
        margin-bottom: 16px;
        }
        .logo img {
        max-width: 100%;
        height: auto;
        display: inline-block;
        }
        .content {
        padding: 32px;
        }
        h1 {
        font-size: 24px;
        font-weight: 600;
        margin: 0 0 16px;
        color: #262626;
        text-align: center;
        }
        .message {
        font-size: 15px;
        line-height: 1.5;
        color: #737373;
        text-align: center;
        margin: 0 0 32px;
        }
        .otp-container {
        background: #f7f7f7;
        border-radius: 12px;
        padding: 24px;
        text-align: center;
        margin: 0 0 24px;
        }
        .otp-label {
        font-size: 13px;
        color: #737373;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 1px;
        font-weight: 500;
        }
        .otp {
        font-size: 42px;
        font-weight: 700;
        letter-spacing: 12px;
        color: #737373;
        margin: 0;
        }
        .info-box {
        background-color: #f7f7f7;
        border-radius: 8px;
        padding: 16px;
        margin: 0 0 24px;
        }
        .info-box p {
        font-size: 13px;
        line-height: 1.6;
        color: #737373;
        margin: 0;
        }
        .divider {
        height: 1px;
        background-color: #efefef;
        margin: 32px 0;
        }
        .footer {
        padding: 24px 32px 32px;
        text-align: center;
        }
        .footer-text {
        font-size: 13px;
        color: #8e8e8e;
        line-height: 1.6;
        margin: 0 0 8px;
        }
        .footer-brand {
        font-size: 14px;
        font-weight: 600;
        color: #262626;
        margin: 0 0 16px;
        }
        .footer a {
        color: #0095f6;
        text-decoration: none;
        }
        @media only screen and (max-width: 480px) {
        .email-wrapper {
            padding: 20px 10px;
        }
        .content {
            padding: 24px 20px;
        }
        .header {
            padding: 24px 20px 20px;
        }
        .footer {
            padding: 20px 20px 24px;
        }
        .otp {
            font-size: 36px;
            letter-spacing: 8px;
        }
        }
    </style>
    </head>
    <body>
    <div class="email-wrapper">
        <div class="container">
        <div class="header">
            <div class="logo">
            <img src="https://res.cloudinary.com/ddrvkqh6h/image/upload/v1767704458/Logo_Icon_c3wssi.png" alt="HV Travel" />
            </div>
        </div>
        
        <div class="content">
            <h1>${titles[type]}</h1>
            <p class="message">${messages[type]}</p>
            
            <div class="otp-container">
            <div class="otp-label">Mã xác nhận của bạn</div>
            <div class="otp">${otp}</div>
            </div>
            
            <div class="info-box">
            <p>
                <strong>Mã này sẽ hết hạn sau 5 phút. Vui lòng không chia sẻ mã này với bất kỳ ai.</strong><br/>
                Nếu bạn không yêu cầu email này có thể bỏ qua tin nhắn.
            </p>
            </div>
        </div>
        
        <div class="divider"></div>
        
        <div class="footer">
            <p class="footer-brand">HV Travel</p>
            <p class="footer-text">
            Email này được gửi tự động, vui lòng không trả lời.
            </p>
            <p class="footer-text">
            © 2026 HV Travel. All rights reserved.
            </p>
        </div>
        </div>
    </div>
    </body>
    </html>
  `;
};

// Gửi OTP email
export const sendOTPEmail = async (email, otp, type = 'register') => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: {
        name: 'HV Travel',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: type === 'register' 
        ? 'Xác thực email HV Travel'
        : type === 'forgot_password'
        ? 'Đặt lại mật khẩu HV Travel'
        : 'Thay đổi email HV Travel',
      html: getOTPEmailTemplate(otp, type)
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
    
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Không thể gửi email. Vui lòng thử lại sau.');
  }
};