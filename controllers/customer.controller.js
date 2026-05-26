import connectDB from "../config/db.js";
import Customer from "../models/Customer.js";
import validator from "validator";

const trimText = (value) => String(value ?? "").trim();

const MAX_LENGTHS = {
  phoneNumber: 30,
  avatarUrl: 500,
  street: 200,
  city: 100,
  country: 100,
};

function sanitizeCustomerProfile(customer) {
  const raw = customer?.toObject ? customer.toObject() : { ...customer };

  return {
    id: String(raw?._id ?? raw?.id ?? ""),
    customerCode: raw?.customerCode || "",
    fullName: raw?.fullName || "",
    email: raw?.email || "",
    phoneNumber: raw?.phoneNumber || "",
    avatarUrl: raw?.avatarUrl || null,
    address: {
      street: raw?.address?.street || "",
      city: raw?.address?.city || "",
      country: raw?.address?.country || "",
    },
    segment: raw?.segment || "New",
    status: raw?.status || "Active",
    stats: raw?.stats || {},
    preferences: raw?.preferences || {},
    emailVerified: Boolean(raw?.emailVerified),
    createdAt: raw?.createdAt,
    updatedAt: raw?.updatedAt,
  };
}

function hasMaxLength(value, maxLength) {
  return trimText(value).length <= maxLength;
}

// Get current customer profile
export const getProfile = async (req, res) => {
  try {
    await connectDB();
    const customer = await Customer.findById(req.customer?._id).select("-password -refreshSessions");

    if (!customer) {
      return res.status(404).json({ status: false, message: "Tài khoản không tồn tại" });
    }

    return res.json({ status: true, data: sanitizeCustomerProfile(customer) });
  } catch (err) {
    console.error("getProfile error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

// Update current customer profile
export const updateProfile = async (req, res) => {
  try {
    await connectDB();

    const customerId = req.customer._id;
    const { fullName, email, phoneNumber, avatarUrl, address } = req.body || {};

    const updateData = {};

    if (fullName !== undefined) {
      const normalizedFullName = trimText(fullName);
      if (normalizedFullName.length < 2) {
        return res.status(400).json({ status: false, message: "Họ tên phải có ít nhất 2 ký tự" });
      }
      if (normalizedFullName.length > 100) {
        return res.status(400).json({ status: false, message: "Họ tên không được quá 100 ký tự" });
      }
      updateData.fullName = normalizedFullName;
    }

    if (email !== undefined) {
      const normalizedEmail = trimText(email).toLowerCase();
      if (!validator.isEmail(normalizedEmail)) {
        return res.status(400).json({ status: false, message: "Email không hợp lệ" });
      }

      const emailOwner = await Customer.exists({
        _id: { $ne: customerId },
        email: normalizedEmail,
      });
      if (emailOwner) {
        return res.status(409).json({ status: false, message: "Email này đã được sử dụng" });
      }

      updateData.email = normalizedEmail;
      if (normalizedEmail !== req.customer.email) {
        updateData.emailVerified = false;
      }
    }

    if (phoneNumber !== undefined) {
      const normalizedPhoneNumber = trimText(phoneNumber);
      if (!hasMaxLength(normalizedPhoneNumber, MAX_LENGTHS.phoneNumber)) {
        return res.status(400).json({ status: false, message: "Số điện thoại không hợp lệ" });
      }
      updateData.phoneNumber = normalizedPhoneNumber;
    }

    if (avatarUrl !== undefined) {
      const normalizedAvatarUrl = trimText(avatarUrl);
      if (
        normalizedAvatarUrl &&
        (!hasMaxLength(normalizedAvatarUrl, MAX_LENGTHS.avatarUrl) ||
          !validator.isURL(normalizedAvatarUrl, {
            require_protocol: true,
            require_tld: false,
            protocols: ["http", "https"],
          }))
      ) {
        return res.status(400).json({ status: false, message: "Ảnh đại diện không hợp lệ" });
      }
      updateData.avatarUrl = normalizedAvatarUrl || null;
    }

    if (address !== undefined) {
      if (!address || typeof address !== "object" || Array.isArray(address)) {
        return res.status(400).json({ status: false, message: "Địa chỉ không hợp lệ" });
      }

      const normalizedAddress = {
        street: trimText(address.street),
        city: trimText(address.city),
        country: trimText(address.country),
      };

      if (
        !hasMaxLength(normalizedAddress.street, MAX_LENGTHS.street) ||
        !hasMaxLength(normalizedAddress.city, MAX_LENGTHS.city) ||
        !hasMaxLength(normalizedAddress.country, MAX_LENGTHS.country)
      ) {
        return res.status(400).json({ status: false, message: "Địa chỉ quá dài" });
      }

      updateData.address = normalizedAddress;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ status: false, message: "Không có thông tin cần cập nhật" });
    }

    const customer = await Customer.findByIdAndUpdate(
      customerId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password -refreshSessions");

    if (!customer) {
      return res.status(404).json({ status: false, message: "Tài khoản không tồn tại" });
    }

    return res.json({
      status: true,
      message: "Cập nhật thông tin thành công",
      data: sanitizeCustomerProfile(customer),
    });
  } catch (err) {
    console.error("updateProfile error:", err);
    if (err?.code === 11000 && err?.keyPattern?.email) {
      return res.status(409).json({ status: false, message: "Email này đã được sử dụng" });
    }
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};
