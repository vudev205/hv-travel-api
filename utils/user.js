export function validPhone(data) {
  const errors = {};

  if (!validator.isMobilePhone(data.phone)) {
    errors.email = "Số điện thoại không hợp lệ";
  }
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}