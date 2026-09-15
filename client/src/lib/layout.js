// The table is drawn on a fixed logical stage and scaled to fit the viewport,
// so every coordinate here is in stage pixels.
export const STAGE_W = 1280;
export const STAGE_H = 800;

// Table (stadium) geometry.
export const TABLE = { cx: 640, cy: 372, w: 960, h: 520 };
export const BOARD = { x: 640, y: 388 };
export const POT = { x: 640, y: 272 };
export const POT_TWO_BOARDS = { x: 640, y: 238 };
// Bottom seat (hero) has big cards in front, so its chips/button sit beside them.
export const HERO_BET = [800, 522];
export const HERO_BUTTON = [812, 596];

// Seat anchor positions relative to the hero (index 0 = bottom center, clockwise).
const LAYOUTS = {
  2: [[640, 668], [640, 120]],
  3: [[640, 668], [190, 250], [1090, 250]],
  4: [[640, 668], [150, 372], [640, 120], [1130, 372]],
  5: [[640, 668], [190, 560], [270, 150], [1010, 150], [1090, 560]],
  6: [[640, 668], [190, 520], [200, 180], [640, 120], [1080, 180], [1090, 520]],
  7: [[640, 668], [280, 600], [130, 360], [350, 120], [930, 120], [1150, 360], [1000, 600]],
  8: [[640, 668], [330, 630], [140, 430], [230, 170], [640, 120], [1050, 170], [1140, 430], [950, 630]],
  9: [[640, 668], [310, 625], [120, 460], [175, 215], [455, 118], [825, 118], [1105, 215], [1160, 460], [970, 625]],
};

export function seatPositions(n) {
  return LAYOUTS[Math.min(9, Math.max(2, n))];
}

// Where a seat's bet chips sit: pulled toward the table center. Top seats are
// nudged sideways so they never cover the pot label.
export function betPosition([x, y]) {
  if (x === 640 && y === 668) return HERO_BET;
  const t = 0.42;
  const dx = TABLE.cx - x;
  const dy = TABLE.cy - y;
  let bx = x + dx * t;
  let by = y + dy * t + (y > TABLE.cy ? -18 : 12);
  if (Math.abs(dx) < 120) bx += x <= TABLE.cx ? -110 : 110; // top-centre seats
  return [bx, by];
}

// Dealer button sits between the seat and its bet, on the table.
export function buttonPosition([x, y]) {
  if (x === 640 && y === 668) return HERO_BUTTON;
  const dx = TABLE.cx - x;
  const dy = TABLE.cy - y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  let bx = x + ux * 108;
  let by = y + uy * 108;
  if (Math.abs(ux) < 0.55) bx += 64; // top/bottom seats: shift beside the chips
  return [bx, by];
}

// Map an absolute seat index to a hero-relative slot.
export function slotFor(seat, heroSeat, maxSeats) {
  if (heroSeat === null || heroSeat === undefined) return seat;
  return ((seat - heroSeat) % maxSeats + maxSeats) % maxSeats;
}
