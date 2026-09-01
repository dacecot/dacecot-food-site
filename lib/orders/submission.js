/* ============================================================
   da Cecot — normalize a raw form payload into a submission object.

   The website posts several form shapes to /api/send:
     - Pasta-shop order : item, quantity, pickup_day, pickup_time, allergies,
                          notes, name, phone, email, _subject "Pasta Shop Order: …"
     - Class booking    : class_date, guests, name, phone, email, notes,
                          _subject "Sunday Pasta Class Booking — da Cecot"
     - Reservation / contact / wholesale : name, email, phone, notes/message …

   normalize() detects the type, extracts amount_cents where a price is knowable,
   builds a compact `details` object, and returns a submission-shaped object.
   The store assigns `id` on record(); we leave it unset here.
   ============================================================ */

const CLASS_PRICE_CENTS = 9500; // $95.00 per guest (Sunday Pasta Class)

function str(v) {
  return v == null ? '' : String(v).trim();
}
function toInt(v) {
  const n = parseInt(String(v == null ? '' : v).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

// Parse a $-prefixed dollar amount out of a string → integer cents.
// "$9.95" → 995, "$15" → 1500, "$1,250" → 125000. Returns null if none.
// A leading "$" is REQUIRED so bare numbers in a product name (e.g. the "450"
// in "Fresh Pasta — 450 g") are never mistaken for a price.
function parsePriceCents(s) {
  if (!s) return null;
  const m = String(s).match(/\$\s*([0-9][0-9,]*)(?:\.([0-9]{1,2}))?/);
  if (!m) return null;
  const dollars = parseInt(m[1].replace(/,/g, ''), 10);
  if (!Number.isFinite(dollars)) return null;
  let cents = dollars * 100;
  if (m[2]) cents += parseInt(m[2].padEnd(2, '0').slice(0, 2), 10);
  return cents;
}

// Detect submission type from the subject line and present fields.
function detectType(subject, data) {
  const s = subject.toLowerCase();
  if (s.includes('pasta shop order') || s.includes('pasta shop') || data.item != null) return 'order';
  if (s.includes('class') || data.class_date != null || data.guests != null) return 'class';
  if (s.includes('reservation') || s.includes('book a table') || data.reservation != null) return 'reservation';
  if (s.includes('wholesale') || s.includes('partnership') || s.includes('partner')) return 'wholesale';
  return 'contact';
}

function normalize(payload) {
  const data = (payload && typeof payload === 'object') ? payload : {};
  const subject = str(data._subject);
  const type = detectType(subject, data);

  // details: everything order/booking-specific, empty values dropped.
  const detailKeys = ['item', 'quantity', 'pickup_day', 'pickup_time',
    'class_date', 'guests', 'allergies', 'notes', 'message'];
  const details = {};
  detailKeys.forEach((k) => { if (str(data[k]) !== '') details[k] = str(data[k]); });

  // amount_cents: parse from the item/subject for orders; guests × price for classes.
  let amount_cents = null;
  if (type === 'class') {
    const guests = toInt(data.guests) || 0;
    amount_cents = guests > 0 ? guests * CLASS_PRICE_CENTS : null;
  } else if (type === 'order') {
    // Prefer the explicit unit price from the order modal; fall back to any
    // $-amount in the item name or subject.
    let unit = parsePriceCents(str(data.price));
    if (unit == null) unit = parsePriceCents(str(data.item));
    if (unit == null) unit = parsePriceCents(subject);
    const qty = toInt(data.quantity);
    if (unit != null) amount_cents = unit * (qty && qty > 0 ? qty : 1);
  }

  // pay_link: the Square checkout URL the front-end passes with paid items.
  const rawPay = str(data.pay_link || data._pay || data.pay);
  const payLink = /^https:\/\/(square\.link|checkout\.square)/i.test(rawPay) ? rawPay : null;

  return {
    type: type,
    name: str(data.name) || null,
    email: (str(data.email).indexOf('@') > 0) ? str(data.email) : null,
    phone: str(data.phone) || null,
    amount_cents: amount_cents,
    currency: 'CAD',
    payment_status: payLink ? 'pending' : 'none',
    payment_link_url: payLink,
    square_order_id: null,
    square_payment_id: null,
    paid_at: null,
    reminded_at: null,
    details: details,
    subject: subject || null
  };
}

module.exports = { normalize, parsePriceCents, detectType, CLASS_PRICE_CENTS };
