const ACTIVE_BOOKING_STATUSES = new Set(["Pending", "Paid", "Confirmed"]);
const LOCKED_BOOKING_STATUSES = new Set(["Cancelled", "Completed"]);

function toIdString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function toNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (value && typeof value.toString === "function") {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIsoString(value) {
  const parsed = toDate(value);
  return parsed ? parsed.toISOString() : "";
}

function getDayValue(value) {
  const parsed = toDate(value);
  if (!parsed) return null;
  const day = new Date(parsed);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

export function normalizePaymentStatus(value) {
  if (!value) return "Unpaid";
  if (value === "Paid") return "Full";
  return value;
}

export function resolveTourSnapshotStartDate(selectedDate, tourStartDates = []) {
  const normalizedSelectedDate = toIsoString(selectedDate);
  if (normalizedSelectedDate) {
    return normalizedSelectedDate;
  }

  const firstTourStartDate = Array.isArray(tourStartDates) ? tourStartDates[0] : null;
  return toIsoString(firstTourStartDate);
}

export function resolveBookingStatus(booking, options = {}) {
  const currentStatus = booking?.status || "Pending";
  if (LOCKED_BOOKING_STATUSES.has(currentStatus)) return currentStatus;
  if (!ACTIVE_BOOKING_STATUSES.has(currentStatus)) return currentStatus;

  const startDate =
    booking?.tour_snapshot?.start_date ??
    booking?.tour_snapshot?.startDate ??
    booking?.tourSnapshot?.start_date ??
    booking?.tourSnapshot?.startDate;
  const startDay = getDayValue(startDate);
  if (startDay == null) return currentStatus;

  const nowDay = getDayValue(options.now ?? new Date());
  if (nowDay == null) return currentStatus;

  return startDay < nowDay ? "Completed" : currentStatus;
}

function buildTourSnapshot(snapshot) {
  if (!snapshot) return undefined;

  const startDate = toIsoString(snapshot.start_date ?? snapshot.startDate);
  const normalized = {
    code: snapshot.code || "",
    name: snapshot.name || "",
    startDate,
    duration: snapshot.duration || "",
  };

  return {
    ...normalized,
    start_date: normalized.startDate,
  };
}

function buildPassengers(passengers) {
  if (!Array.isArray(passengers)) return [];
  return passengers.map((passenger) => ({
    fullName: passenger?.fullName ?? passenger?.full_name ?? "",
    full_name: passenger?.full_name ?? passenger?.fullName ?? "",
    birthDate: toIsoString(passenger?.birthDate ?? passenger?.birth_date),
    birth_date: toIsoString(passenger?.birth_date ?? passenger?.birthDate),
    type: passenger?.type ?? "Adult",
    gender: passenger?.gender ?? null,
    passportNumber: passenger?.passportNumber ?? passenger?.passport_number ?? null,
    passport_number: passenger?.passport_number ?? passenger?.passportNumber ?? null,
  }));
}

function buildContactInfo(contactInfo) {
  if (!contactInfo) return undefined;
  return {
    name: contactInfo.name || "",
    email: contactInfo.email || "",
    phone: contactInfo.phone || "",
  };
}

function buildHistoryLog(historyLog) {
  if (!Array.isArray(historyLog)) return [];
  return historyLog.map((item) => ({
    action: item?.action || "",
    timestamp: toIsoString(item?.timestamp),
    user: item?.user || "",
    note: item?.note || "",
  }));
}

export function toBookingResponse(booking, options = {}) {
  const id = toIdString(booking?.id ?? booking?._id);
  const tourId = toIdString(booking?.tourId ?? booking?.tour_id);
  const customerId = toIdString(booking?.customerId ?? booking?.customer_id);
  const bookingCode = booking?.bookingCode ?? booking?.booking_code ?? "";
  const bookingDate = toIsoString(booking?.bookingDate ?? booking?.booking_date);
  const createdAt = toIsoString(booking?.createdAt ?? booking?.created_at);
  const updatedAt = toIsoString(booking?.updatedAt ?? booking?.updated_at);
  const paymentStatus = normalizePaymentStatus(
    booking?.paymentStatus ?? booking?.payment_status
  );
  const passengers = buildPassengers(booking?.passengers);
  const contactInfo = buildContactInfo(booking?.contactInfo ?? booking?.contact_info);
  const historyLog = buildHistoryLog(booking?.historyLog ?? booking?.history_log);
  const participantsCount = toNumber(
    booking?.participantsCount ??
      booking?.participants_count ??
      passengers.length,
    0
  );
  const totalAmount = toNumber(booking?.totalAmount ?? booking?.total_amount, 0);
  const tourSnapshot = buildTourSnapshot(booking?.tourSnapshot ?? booking?.tour_snapshot);
  const status = resolveBookingStatus(
    {
      status: booking?.status,
      tourSnapshot,
      tour_snapshot: tourSnapshot,
    },
    options
  );

  return {
    id,
    _id: id,
    bookingCode,
    booking_code: bookingCode,
    tourId,
    tour_id: tourId,
    customerId,
    customer_id: customerId,
    bookingDate,
    booking_date: bookingDate,
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt,
    status,
    paymentStatus,
    payment_status: paymentStatus,
    participantsCount,
    participants_count: participantsCount,
    totalAmount,
    total_amount: totalAmount,
    tourSnapshot,
    tour_snapshot: tourSnapshot,
    passengers,
    contactInfo,
    contact_info: contactInfo,
    historyLog,
    history_log: historyLog,
    notes: booking?.notes ?? "",
    isDeleted: Boolean(booking?.isDeleted ?? booking?.is_deleted),
    is_deleted: Boolean(booking?.isDeleted ?? booking?.is_deleted),
  };
}
