// Widget placement: the resting and expanded window bounds, clamped to the work area of
// the display that holds the widget, and where the widget should rest after a drag. All
// pure given an Electron `screen` (or a double) and the widget sizes, so the clamping can
// be tested without a real display. widgetBounds returns the clamped resting position
// alongside the bounds; src/main.js remembers that so a later placement re-uses it.
function createWindowGeometry({ screen, restingSize, readingSize, screenMargin }) {
  function displayForPoint(point) {
    return screen.getDisplayNearestPoint({ x: Math.round(point.x), y: Math.round(point.y) });
  }

  function defaultRestingPosition() {
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    return {
      x: Math.round(workArea.x + workArea.width - restingSize.width - screenMargin),
      y: Math.round(workArea.y + workArea.height - restingSize.height - screenMargin)
    };
  }

  function clampedRestingPosition(position) {
    const at = position || defaultRestingPosition();
    const { workArea } = displayForPoint({
      x: at.x + restingSize.width / 2,
      y: at.y + restingSize.height / 2
    });
    return {
      x: Math.min(Math.max(at.x, workArea.x), workArea.x + workArea.width - restingSize.width),
      y: Math.min(Math.max(at.y, workArea.y), workArea.y + workArea.height - restingSize.height)
    };
  }

  function widgetBounds({ expanded, restingPosition, readingHeight }) {
    const resting = clampedRestingPosition(restingPosition);
    if (!expanded) return { bounds: { ...resting, ...restingSize }, restingPosition: resting };

    const { workArea } = displayForPoint(resting);
    const height = Math.min(readingHeight, workArea.height - screenMargin * 2);
    const width = Math.min(readingSize.width, workArea.width - screenMargin * 2);
    const desired = {
      x: resting.x - (width - restingSize.width),
      y: resting.y - (height - restingSize.height)
    };
    return {
      bounds: {
        width,
        height,
        x: Math.min(Math.max(desired.x, workArea.x), workArea.x + workArea.width - width),
        y: Math.min(Math.max(desired.y, workArea.y), workArea.y + workArea.height - height)
      },
      restingPosition: resting
    };
  }

  // Where the widget should rest after a drag. An expanded window's resting anchor is its
  // bottom-right corner (the resting widget sits there inside the larger reading window).
  function draggedRestingPosition({ position: [x, y], size: [width, height], expanded }) {
    const raw = expanded
      ? { x: x + width - restingSize.width, y: y + height - restingSize.height }
      : { x, y };
    return clampedRestingPosition(raw);
  }

  return { clampedRestingPosition, defaultRestingPosition, widgetBounds, draggedRestingPosition };
}

module.exports = { createWindowGeometry };
