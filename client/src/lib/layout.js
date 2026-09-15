// The table is drawn on a fixed logical stage and scaled to fit the viewport,
// so every coordinate here is in stage pixels. Two stages exist: a wide one
// for desktops and a tall one for phones held upright.

const LANDSCAPE = {
  mode: 'landscape',
  W: 1280, H: 800,
  TABLE: { cx: 640, cy: 372, w: 960, h: 520 },
  BOARD: { x: 640, y: 388 },
  POT: { x: 640, y: 272 },
  POT_TWO_BOARDS: { x: 640, y: 238 },
  HERO: [640, 668],
  HERO_BET: [800, 522],
  HERO_BUTTON: [812, 596],
  boardSize: 'lg', boardSize2: 'md',
  seats: {
    2: [[640, 668], [640, 120]],
    3: [[640, 668], [190, 250], [1090, 250]],
    4: [[640, 668], [150, 372], [640, 120], [1130, 372]],
    5: [[640, 668], [190, 560], [270, 150], [1010, 150], [1090, 560]],
    6: [[640, 668], [190, 520], [200, 180], [640, 120], [1080, 180], [1090, 520]],
    7: [[640, 668], [280, 600], [130, 360], [350, 120], [930, 120], [1150, 360], [1000, 600]],
    8: [[640, 668], [330, 630], [140, 430], [230, 170], [640, 120], [1050, 170], [1140, 430], [950, 630]],
    9: [[640, 668], [310, 625], [120, 460], [175, 215], [455, 118], [825, 118], [1105, 215], [1160, 460], [970, 625]],
  },
};

const PORTRAIT = {
  mode: 'portrait',
  W: 480, H: 880,
  TABLE: { cx: 240, cy: 392, w: 400, h: 600 },
  BOARD: { x: 240, y: 400 },
  POT: { x: 240, y: 294 },
  POT_TWO_BOARDS: { x: 240, y: 276 },
  HERO: [240, 716],
  HERO_BET: [352, 600],
  HERO_BUTTON: [368, 650],
  boardSize: 'md', boardSize2: 'sm',
  seats: {
    2: [[240, 716], [240, 100]],
    3: [[240, 716], [70, 300], [410, 300]],
    4: [[240, 716], [62, 440], [240, 100], [418, 440]],
    5: [[240, 716], [70, 560], [90, 230], [390, 230], [410, 560]],
    6: [[240, 716], [70, 600], [70, 290], [240, 100], [410, 290], [410, 600]],
    7: [[240, 716], [80, 650], [50, 420], [130, 180], [350, 180], [430, 420], [400, 650]],
    8: [[240, 716], [92, 680], [52, 500], [80, 300], [240, 100], [400, 300], [428, 500], [388, 680]],
    9: [[240, 716], [92, 688], [52, 530], [60, 360], [150, 150], [330, 150], [420, 360], [428, 530], [388, 688]],
  },
};

let current = LANDSCAPE;
export function setLayoutMode(mode) { current = mode === 'portrait' ? PORTRAIT : LANDSCAPE; }
export function getLayout() { return current; }
export function layoutFor(mode) { return mode === 'portrait' ? PORTRAIT : LANDSCAPE; }

export function seatPositions(n, L = current) {
  return L.seats[Math.min(9, Math.max(2, n))];
}

function isHero([x, y], L) { return x === L.HERO[0] && y === L.HERO[1]; }

// Where a seat's bet chips sit: pulled toward the table center. Top seats are
// nudged sideways so they never cover the pot label.
export function betPosition(pos, L = current) {
  if (isHero(pos, L)) return L.HERO_BET;
  const [x, y] = pos;
  const dx = L.TABLE.cx - x;
  const dy = L.TABLE.cy - y;
  // Side seats on the narrow stage need their chips pushed further in to clear the pill.
  const t = L.mode === 'portrait' ? (Math.abs(dx) >= 120 ? 0.52 : 0.36) : 0.42;
  let bx = x + dx * t;
  const by = y + dy * t + (y > L.TABLE.cy ? -18 : 12);
  if (Math.abs(dx) < 120) bx += x <= L.TABLE.cx ? -(L.mode === 'portrait' ? 90 : 110) : 110; // top-centre seats
  return [bx, by];
}

// Dealer button sits between the seat and its bet, on the table.
export function buttonPosition(pos, L = current) {
  if (isHero(pos, L)) return L.HERO_BUTTON;
  const [x, y] = pos;
  const dx = L.TABLE.cx - x;
  const dy = L.TABLE.cy - y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const reach = L.mode === 'portrait' ? 96 : 108;
  let bx = x + ux * reach;
  const by = y + uy * reach;
  if (Math.abs(ux) < 0.55) bx += L.mode === 'portrait' ? 54 : 64; // top/bottom seats: shift beside the chips
  return [bx, by];
}

// Map an absolute seat index to a hero-relative slot.
export function slotFor(seat, heroSeat, maxSeats) {
  if (heroSeat === null || heroSeat === undefined) return seat;
  return ((seat - heroSeat) % maxSeats + maxSeats) % maxSeats;
}
