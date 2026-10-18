/* Shared capacity — reservations and Sunday classes draw from ONE seat pool.
   Pins: a class eats room seats; a reservation in the class window competes
   with class guests; a class is capped by BOTH its teaching cap and the room;
   no floor plan falls back to classMax-only (the old behaviour). */
const assert = require('assert');
const capacity = require('../lib/orders/capacity');

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); passed++; }
function eq(name, a, b) { assert.strictEqual(a, b, name + ' (' + a + ' !== ' + b + ')'); passed++; }

// content stub: classStart/classEnd default via nulls → 5–9 PM; no override.
const content = { get: (k) => ({ totalCapacity: 0, classStart: '5:00 PM', classEnd: '9:00 PM' }[k]) };
const tables20 = [{ seats: 10, active: true }, { seats: 10, active: true }]; // 20-seat room
const SUN = '2026-11-08';

function resv(date, time, party) { return { type: 'reservation', details: { reservation_date: date, reservation_time: time, party_size: party + ' guests' } }; }
function cls(date, guests) { return { type: 'class', details: { class_date: date, guests: guests + ' guests' } }; }

// --- totalSeats ---
eq('room seats = floor plan sum', capacity.totalSeats(tables20, content), 20);
eq('override wins when set', capacity.totalSeats(tables20, { get: () => 50 }), 50);

// --- class eats room seats; reservation in the class window competes ---
// 6 class guests booked for Sunday 5–9 PM.
const withClass = [cls(SUN, 6)];
eq('class seats left = min(classMax12, room20) - 6 = 6', capacity.classSeatsLeft({ list: withClass, tables: tables20, content, dateISO: SUN, classMax: 12 }), 6);

// A 7 PM reservation that night overlaps the class window → sees 20 - 6 = 14 left.
eq('reservation at 7 PM competes with the class (20-6=14)',
  capacity.reservationSeatsLeft({ list: withClass, tables: tables20, content, dateISO: SUN, timeMin: 19 * 60 }), 14);

// A 1 PM reservation (outside the 5–9 window) is NOT reduced by the class.
eq('reservation at 1 PM does not see the evening class (20 left)',
  capacity.reservationSeatsLeft({ list: withClass, tables: tables20, content, dateISO: SUN, timeMin: 13 * 60 }), 20);

// --- class capped by the ROOM, not just classMax ---
// Fill the class window with 16 seats of reservations → only 4 room seats left
// for the class even though classMax is 12.
const busyEvening = [resv(SUN, '6:30 PM', 16)];
eq('class capped by room: 20 - 16 reservations = 4 (below classMax 12)',
  capacity.classSeatsLeft({ list: busyEvening, tables: tables20, content, dateISO: SUN, classMax: 12 }), 4);

// --- reservations compete with each other in the 2h window ---
const twoRes = [resv(SUN, '7:00 PM', 8), resv(SUN, '8:00 PM', 8)]; // overlap within 2h
eq('two overlapping reservations take 16 → 4 left at 7:30',
  capacity.reservationSeatsLeft({ list: twoRes, tables: tables20, content, dateISO: SUN, timeMin: 19 * 60 + 30 }), 4);
eq('a reservation 3h later does NOT overlap (full room again)',
  capacity.reservationSeatsLeft({ list: [resv(SUN, '5:00 PM', 8)], tables: tables20, content, dateISO: SUN, timeMin: 20 * 60 }), 20);

// --- no floor plan → classMax-only (old behaviour), reservations unlimited ---
eq('no tables: class falls back to classMax - booked (12-6=6)',
  capacity.classSeatsLeft({ list: withClass, tables: [], content, dateISO: SUN, classMax: 12 }), 6);
ok('no tables: reservation capacity is unlimited (Infinity)',
  capacity.reservationSeatsLeft({ list: withClass, tables: [], content, dateISO: SUN, timeMin: 19 * 60 }) === Infinity);

// --- cancelled / no-show seats are freed ---
const cancelled = [Object.assign(cls(SUN, 6), { details: { class_date: SUN, guests: '6 guests', cancelled: true } })];
eq('a cancelled class booking frees its seats', capacity.classSeatsLeft({ list: cancelled, tables: tables20, content, dateISO: SUN, classMax: 12 }), 12);

console.log('capacity.test.js: ' + passed + ' assertions passed');
