const test = require("node:test");
const assert = require("node:assert/strict");
const { createWindowGeometry } = require("../src/window-geometry");

const RESTING = { width: 158, height: 202 };
const READING = { width: 660, height: 380 };
const MARGIN = 8;

// A single-display screen double: one work area, ignoring the point it is asked about.
function geometryOn(workArea, cursor = { x: 700, y: 500 }) {
  const screen = {
    getDisplayNearestPoint: () => ({ workArea }),
    getCursorScreenPoint: () => cursor
  };
  return createWindowGeometry({ screen, restingSize: RESTING, readingSize: READING, screenMargin: MARGIN });
}

const WORK = { x: 0, y: 0, width: 1470, height: 956 };

test("the default resting position sits at the bottom-right inside the margin", () => {
  const g = geometryOn(WORK);
  assert.deepEqual(g.defaultRestingPosition(), {
    x: WORK.width - RESTING.width - MARGIN,
    y: WORK.height - RESTING.height - MARGIN
  });
});

test("a resting position outside the work area is clamped back inside", () => {
  const g = geometryOn(WORK);
  assert.deepEqual(g.clampedRestingPosition({ x: -500, y: -500 }), { x: 0, y: 0 });
  assert.deepEqual(g.clampedRestingPosition({ x: 99999, y: 99999 }), {
    x: WORK.width - RESTING.width,
    y: WORK.height - RESTING.height
  });
});

test("resting bounds are the resting size at the clamped resting position", () => {
  const g = geometryOn(WORK);
  const { bounds, restingPosition } = g.widgetBounds({ expanded: false, restingPosition: { x: 99999, y: 99999 }, readingHeight: 380 });
  assert.deepEqual(restingPosition, { x: WORK.width - RESTING.width, y: WORK.height - RESTING.height });
  assert.deepEqual(bounds, { ...restingPosition, ...RESTING });
});

test("expanded bounds clamp width and height to the work area minus its margins", () => {
  const g = geometryOn(WORK);
  const { bounds } = g.widgetBounds({ expanded: true, restingPosition: { x: 1000, y: 700 }, readingHeight: 100000 });
  assert.equal(bounds.width, Math.min(READING.width, WORK.width - MARGIN * 2));
  assert.equal(bounds.height, WORK.height - MARGIN * 2, "an oversized reading height clamps to the work area");
  assert.ok(bounds.x >= WORK.x && bounds.x + bounds.width <= WORK.x + WORK.width, "stays within the work area horizontally");
  assert.ok(bounds.y >= WORK.y && bounds.y + bounds.height <= WORK.y + WORK.height, "stays within the work area vertically");
});

test("after a drag, an expanded window rests at its bottom-right corner", () => {
  const g = geometryOn(WORK);
  const resting = g.draggedRestingPosition({ position: [200, 100], size: [READING.width, READING.height], expanded: true });
  // The resting widget anchors to the bottom-right of the expanded window, then clamps.
  assert.deepEqual(resting, g.clampedRestingPosition({
    x: 200 + READING.width - RESTING.width,
    y: 100 + READING.height - RESTING.height
  }));
  // Collapsed, the drag position is the resting position directly.
  assert.deepEqual(g.draggedRestingPosition({ position: [300, 200], size: [RESTING.width, RESTING.height], expanded: false }), { x: 300, y: 200 });
});
