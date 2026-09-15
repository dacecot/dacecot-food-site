/* ============================================================
   da Cecot — class rosters + the "push an under-filled class" planner.

   Sunday classes need a minimum number of guests to be worth running. When one
   falls short, Erika moves those guests to the 2nd-choice date THEY picked when
   they booked — so nobody lands on a Sunday they never agreed to.

   Every booking resolves to exactly one of two outcomes:
     move   — they gave a 2nd choice and it still has room  → rebooked + emailed
     rebook — no 2nd choice, or their 2nd choice is now full → asked to pick again

   This module is pure: no database, no email, no clock beyond the date passed
   in. planPush() decides; the API applies. Keeping the decision separate is what
   lets it be tested — these moves rewrite paid bookings and send real mail.
   ============================================================ */

const R = require('../orders/reservations');
const schedule = require('./schedule');

const DEFAULT_MAX = 12;
const DEFAULT_MIN = 4;

// A booking's guest count. Anything unparseable counts as 1 — never 0, or a
// booking could silently take up no room in a class.
function guestCount(sub) {
  const raw = sub && sub.details ? sub.details.guests : null;
  const n = parseInt(String(raw == null ? '' : raw).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function isActive(sub) {
  return !!sub && !!sub.details && !sub.details.cancelled;
}

function firstChoice(sub) { return (sub && sub.details && sub.details.class_date) || null; }
function secondChoice(sub) {
  const v = sub && sub.details && sub.details.class_date_2;
  return String(v == null ? '' : v).trim() || null;
}

/* Roster for every class date that has bookings, newest date last.
   Returns [{ iso, label, booked, left, bookings, underMin, min, max }].
   `list` is the raw submissions of type 'class'. Cancelled bookings are
   excluded from counts but their dates never invent a class on their own. */
function rosters(list, opts) {
  const o = opts || {};
  const max = Number.isFinite(Number(o.max)) && Number(o.max) > 0 ? Number(o.max) : DEFAULT_MAX;
  const min = Number.isFinite(Number(o.min)) && Number(o.min) > 0 ? Number(o.min) : DEFAULT_MIN;
  const byIso = {};
  (list || []).forEach((s) => {
    if (!isActive(s)) return;
    const label = firstChoice(s);
    const iso = R.parseDate(label);
    if (!iso) return;
    if (!byIso[iso]) byIso[iso] = { iso, label: label, booked: 0, bookings: [] };
    byIso[iso].booked += guestCount(s);
    byIso[iso].bookings.push(s);
  });
  return Object.keys(byIso).sort().map((iso) => {
    const g = byIso[iso];
    return Object.assign(g, {
      left: Math.max(0, max - g.booked),
      underMin: g.booked < min,
      min: min,
      max: max
    });
  });
}

// Seats already taken on a given date, across all active bookings.
function bookedOn(list, dateStr) {
  const iso = R.parseDate(dateStr);
  if (!iso) return 0;
  return (list || []).reduce((sum, s) => {
    if (!isActive(s)) return sum;
    return R.parseDate(firstChoice(s)) === iso ? sum + guestCount(s) : sum;
  }, 0);
}

/* Plan the push for one under-filled class date.

   `all` must be every class submission (not just this date's) — the planner
   needs the target dates' existing load to know whether a guest actually fits.

   Moves are planned in sequence and each one claims its seats against the
   running total for its target date, so two bookings heading for the same
   Sunday can't both be told "there's room" when only one fits.

   Returns { date, iso, moves, rebooks, movedGuests, rebookGuests, totalGuests }
     moves   : [{ id, sub, guests, from, to }]
     rebooks : [{ id, sub, guests, from, reason }]  reason: no_second | second_full
*/
function planPush(all, dateStr, opts) {
  const o = opts || {};
  const max = Number.isFinite(Number(o.max)) && Number(o.max) > 0 ? Number(o.max) : DEFAULT_MAX;
  const iso = R.parseDate(dateStr);
  const moves = [];
  const rebooks = [];
  if (!iso) return { date: dateStr, iso: null, moves, rebooks, movedGuests: 0, rebookGuests: 0, totalGuests: 0 };

  const list = all || [];
  const roster = list.filter((s) => isActive(s) && R.parseDate(firstChoice(s)) === iso);

  // Running seat count per target date, seeded with what's already booked there.
  const load = {};
  function seatsTaken(targetIso) {
    if (!(targetIso in load)) load[targetIso] = bookedOn(list, targetIso);
    return load[targetIso];
  }

  roster.forEach((sub) => {
    const guests = guestCount(sub);
    const from = firstChoice(sub);
    const second = secondChoice(sub);
    const secondIso = second ? R.parseDate(second) : null;

    if (!second || !secondIso) {
      rebooks.push({ id: sub.id, sub, guests, from, reason: 'no_second' });
      return;
    }
    // A 2nd choice that names the same day as the 1st is no backup at all.
    if (secondIso === iso) {
      rebooks.push({ id: sub.id, sub, guests, from, reason: 'no_second' });
      return;
    }
    if (seatsTaken(secondIso) + guests > max) {
      rebooks.push({ id: sub.id, sub, guests, from, reason: 'second_full' });
      return;
    }
    load[secondIso] = seatsTaken(secondIso) + guests;
    moves.push({ id: sub.id, sub, guests, from, to: second, toIso: secondIso });
  });

  const sum = (arr) => arr.reduce((n, x) => n + x.guests, 0);
  return {
    date: dateStr,
    iso: iso,
    moves: moves,
    rebooks: rebooks,
    movedGuests: sum(moves),
    rebookGuests: sum(rebooks),
    totalGuests: sum(moves) + sum(rebooks)
  };
}

module.exports = {
  rosters, planPush, bookedOn, guestCount, isActive,
  firstChoice, secondChoice,
  DEFAULT_MAX, DEFAULT_MIN
};
