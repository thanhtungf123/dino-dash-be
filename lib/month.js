// Tính "khóa tháng" (monthKey) theo giờ Việt Nam (Asia/Ho_Chi_Minh).
// Mọi điểm số được gắn vào tháng theo múi giờ này để việc chốt top
// (23:59 ngày cuối tháng) khớp với cảm nhận của người chơi trong nước.

const TZ = 'Asia/Ho_Chi_Minh';

/** Trả về { year, month, day } theo giờ Việt Nam cho một thời điểm. */
function partsInTz(date = new Date()) {
  // en-CA cho định dạng YYYY-MM-DD, dễ tách.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [y, m, d] = fmt.format(date).split('-');
  return { year: Number(y), month: Number(m), day: Number(d) };
}

/** Khóa tháng hiện tại, dạng "YYYY-MM" (vd "2026-10"). */
export function currentMonthKey(date = new Date()) {
  const { year, month } = partsInTz(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Khóa tháng liền trước một khóa tháng cho trước (mặc định: tháng trước). */
export function previousMonthKey(fromKey = currentMonthKey()) {
  const [y, m] = fromKey.split('-').map(Number);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

/** "2026-10" -> "10/2026" để hiển thị cho người dùng. */
export function monthKeyLabel(key) {
  if (!key || !key.includes('-')) return key || '';
  const [y, m] = key.split('-');
  return `${m}/${y}`;
}
