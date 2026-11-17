/**
 * Code-style minimap for the formatted output (like the VS Code minimap): every rendered text line
 * is drawn as colored blocks, one block per word, using the colors of the rendered tokens.
 *
 * Performance:
 * - Entry positions are measured once per render (one layout pass over .log-entry).
 * - Only entries inside the minimap window are drawn; their tokens are read from the DOM lazily
 *   and cached until the next render/resize, so scrolling paints a few hundred rects at most.
 * - Thin overview rulers on both edges show selected rows (left) and ERROR/WARN (right)
 *   for the whole output, painted into per-pixel buckets.
 */
const MINIMAP_LEVEL_RANK = { WARN: 1, ERROR: 2 };

class OutputMinimap {
  constructor({ scroller, content }) {
    this.scroller = scroller;
    this.content = content;
    this.root = document.getElementById("output-minimap");
    this.canvas = this.root.querySelector("canvas");
    this.viewport = this.root.querySelector(".minimap-viewport");
    this.measureCtx = document.createElement("canvas").getContext("2d");
    this.layout = null;
    this.entryRuns = new Map();
    this.styleCache = new Map();
    this.rulerCache = null;
    this.layoutKey = "";
    this.measureFrame = 0;
    this.drawFrame = 0;
    this.resizeTimer = 0;
    this.enabled = true;
    this.onScroll = () => this.scheduleDraw();
    this.onPointerDown = event => this.startDrag(event);
    this.onWheel = event => this.handleWheel(event);
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.themeObserver = new MutationObserver(() => {
      this.styleCache.clear();
      this.entryRuns.clear();
      this.scheduleDraw();
    });
    this.root.style.setProperty("--minimap-selection-ruler-width", `${MINIMAP_SELECTION_RULER_WIDTH}px`);
    this.root.style.setProperty("--minimap-level-ruler-width", `${MINIMAP_LEVEL_RULER_WIDTH}px`);
    this.attach();
  }

  /** Re-measure and redraw on the next frame; repeated calls within a frame are coalesced. */
  refresh() {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = 0;
    if (!this.enabled) return;
    if (this.measureFrame) return;
    this.measureFrame = requestAnimationFrame(() => {
      this.measureFrame = 0;
      this.measure();
      this.draw();
    });
  }

  attach() {
    this.scroller.addEventListener("scroll", this.onScroll, { passive: true });
    this.root.addEventListener("pointerdown", this.onPointerDown);
    this.root.addEventListener("wheel", this.onWheel, { passive: false });
    [this.scroller, this.content, this.root].forEach(element => this.resizeObserver.observe(element));
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }

  detach() {
    this.scroller.removeEventListener("scroll", this.onScroll);
    this.root.removeEventListener("pointerdown", this.onPointerDown);
    this.root.removeEventListener("wheel", this.onWheel);
    this.resizeObserver.disconnect();
    this.themeObserver.disconnect();
  }

  setEnabled(enabled) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (enabled) {
      this.attach();
      this.refresh();
      return;
    }

    this.detach();
    clearTimeout(this.resizeTimer);
    this.resizeTimer = 0;
    if (this.measureFrame) cancelAnimationFrame(this.measureFrame);
    if (this.drawFrame) cancelAnimationFrame(this.drawFrame);
    this.measureFrame = 0;
    this.drawFrame = 0;
    this.dragCleanup?.();
    this.root.hidden = true;
    this.viewport.hidden = true;
    this.layout = null;
    this.layoutKey = "";
    this.entryRuns.clear();
    this.styleCache.clear();
    this.rulerCache = null;
    this.canvas.width = 0;
    this.canvas.height = 0;
  }

  getLayoutKey() {
    return [this.content.offsetWidth, this.content.offsetHeight, this.scroller.clientHeight, this.root.clientHeight].join();
  }

  handleResize() {
    if (!this.enabled) return;
    // Ignore notifications caused by our own refresh (e.g. a re-render that kept the same size).
    if (this.getLayoutKey() === this.layoutKey) return;
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => this.refresh(), MINIMAP_RESIZE_DEBOUNCE);
  }

  measure() {
    if (!this.enabled) return;
    const entries = [...this.content.querySelectorAll(".log-entry")];
    this.entryRuns.clear();
    this.rulerCache = null;
    // Toggle first: showing the minimap narrows the output, which can change line wrapping.
    this.root.hidden = entries.length === 0;
    if (!entries.length) {
      this.layout = null;
      this.layoutKey = this.getLayoutKey();
      return;
    }
    const count = entries.length;
    const tops = new Float64Array(count);
    const bottoms = new Float64Array(count);
    const ranks = new Uint8Array(count);
    const indexByEntry = new Map();
    // .log-entry is positioned within #output, which is offset by the sticky header in the scroller.
    const base = this.content.offsetTop;
    entries.forEach((entry, index) => {
      tops[index] = base + entry.offsetTop;
      bottoms[index] = tops[index] + entry.offsetHeight;
      ranks[index] = MINIMAP_LEVEL_RANK[entry.dataset.level] ?? 0;
      indexByEntry.set(entry, index);
    });
    // Stretch entries over the gap to the next one, so dense output doesn't render as stripes.
    for (let index = 0; index < count - 1; index++) {
      bottoms[index] = Math.max(bottoms[index], tops[index + 1]);
    }
    const flagEntries = selector => {
      const flags = new Uint8Array(count);
      this.content.querySelectorAll(selector).forEach(element => {
        const index = indexByEntry.get(element.closest(".log-entry"));
        if (index !== undefined) flags[index] = 1;
      });
      return flags;
    };

    const outputStyle = getComputedStyle(this.content);
    // Monospace output: one character width converts pixels to columns.
    this.measureCtx.font = `${outputStyle.fontSize} ${outputStyle.fontFamily}`;
    const charPx = this.measureCtx.measureText("0".repeat(100)).width / 100 || 7;
    const firstTs = entries[0].querySelector(".ts");
    const entryLeft = entries[0].getBoundingClientRect().left;
    const baseCol = firstTs ? (firstTs.getBoundingClientRect().left - entryLeft) / charPx : 0;
    this.layout = {
      entries,
      count,
      tops,
      bottoms,
      ranks,
      charPx,
      baseCol,
      // Widest text column (incl. scrollable field columns), used to fit lines into the minimap width.
      textCols: Math.max(1, this.content.scrollWidth / charPx - baseCol),
      // Minimap px per output px; an output text line becomes MINIMAP_LINE_HEIGHT px tall.
      scale: MINIMAP_LINE_HEIGHT / (parseFloat(outputStyle.lineHeight) || 20),
      selected: flagEntries(".row-check:checked")
    };
    this.layoutKey = this.getLayoutKey();
  }

  // ── Geometry ────────────────────────────────────────────────────────────

  getMetrics() {
    const { scrollHeight, clientHeight, scrollTop } = this.scroller;
    const height = this.root.clientHeight;
    const scale = this.layout.scale;
    const total = scrollHeight * scale;
    // Like VS Code: when the minimap is taller than its box, it scrolls proportionally with the output.
    const track = total <= height
      ? 1 / scale
      : (scrollHeight - clientHeight) / Math.max(1, height - clientHeight * scale);
    return {
      scrollHeight,
      clientHeight,
      scrollTop,
      height,
      scale,
      track,
      // While the whole output fits, the ruler uses the minimap's scale so both line up.
      rulerHeight: Math.max(1, Math.min(height, Math.ceil(total))),
      // Minimap scroll offset; the viewport box top is scrollTop / track.
      offset: scrollTop * scale - scrollTop / track
    };
  }

  // ── Tokens ──────────────────────────────────────────────────────────────

  styleFor(element) {
    const key = element.className;
    let style = this.styleCache.get(key);
    if (style === undefined) {
      const css = getComputedStyle(element);
      const strong = element.classList.contains("search-match");
      style = { color: strong ? css.backgroundColor : css.color, strong };
      this.styleCache.set(key, style);
    }
    return style;
  }

  /** Text of an element with a style index per character. */
  collectText(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.parentElement.closest(".line-prefix")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
    });
    const pieces = [];
    const styles = [];
    const styleIndex = new Map();
    let length = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const style = this.styleFor(node.parentElement);
      if (!styleIndex.has(style)) {
        styleIndex.set(style, styles.length);
        styles.push(style);
      }
      pieces.push([node.data, styleIndex.get(style)]);
      length += node.data.length;
    }
    const colors = new Uint16Array(length);
    let text = "";
    for (const [data, index] of pieces) {
      colors.fill(index, text.length, text.length + data.length);
      text += data;
    }
    return { text, colors, styles };
  }

  /** Content box of a block relative to the entry, in output px. */
  getBox(block, entryRect) {
    const rect = block.getBoundingClientRect();
    const css = getComputedStyle(block);
    const top = parseFloat(css.borderTopWidth) + parseFloat(css.paddingTop);
    const left = parseFloat(css.borderLeftWidth) + parseFloat(css.paddingLeft);
    const right = parseFloat(css.borderRightWidth) + parseFloat(css.paddingRight);
    return {
      top: rect.top - entryRect.top + top,
      left: rect.left - entryRect.left + left,
      right: rect.right - entryRect.left - right,
      height: rect.height - top - parseFloat(css.borderBottomWidth) - parseFloat(css.paddingBottom),
      lineHeight: parseFloat(css.lineHeight) || 20
    };
  }

  /** Word-wrapped blocks (minimap units, relative to the entry top) for one entry. */
  getEntryRuns(index) {
    let runs = this.entryRuns.get(index);
    if (runs) return runs;
    runs = [];
    const { entries, charPx, baseCol, scale } = this.layout;
    const entry = entries[index];
    const entryRect = entry.getBoundingClientRect();
    const addFlow = (source, box, startPx = box.left) => {
      const { text, colors, styles } = this.collectText(source);
      const pitch = box.lineHeight * scale;
      const maxLines = Math.max(1, Math.ceil(box.height / box.lineHeight));
      const hang = box.left / charPx;
      wrapText(text, startPx / charPx, hang, Math.max(hang + 1, box.right / charPx), maxLines, (line, col, from, to) => {
        for (let k = from; k < to;) {
          let end = k + 1;
          while (end < to && colors[end] === colors[k]) end++;
          const style = styles[colors[k]];
          runs.push({
            y: (box.top + line * box.lineHeight) * scale,
            h: pitch * MINIMAP_ROW_FILL,
            x: col + (k - from) - baseCol,
            w: end - k,
            color: style.color,
            strong: style.strong
          });
          k = end;
        }
      });
    };

    const line = entry.querySelector(".log-line");
    if (line?.classList.contains("is-columns")) {
      for (const cell of line.children) {
        if (!cell.classList.contains("line-prefix")) addFlow(cell, this.getBox(cell, entryRect));
      }
    } else if (line) {
      const ts = line.querySelector(".ts");
      const start = ts ? ts.getBoundingClientRect().left - entryRect.left : undefined;
      addFlow(line, this.getBox(line, entryRect), start);
    }
    const stack = entry.querySelector(".stack-trace");
    if (stack) addFlow(stack, this.getBox(stack, entryRect));
    const raw = entry.querySelector(".raw-json:not([hidden])");
    if (raw) {
      const box = this.getBox(raw, entryRect);
      box.lineHeight = parseFloat(getComputedStyle(raw).lineHeight) || box.lineHeight;
      addFlow(raw.querySelector(".raw-content"), box);
    }
    this.entryRuns.set(index, runs);
    return runs;
  }

  // ── Painting ────────────────────────────────────────────────────────────

  scheduleDraw() {
    if (!this.enabled || this.drawFrame || this.root.hidden || !this.layout) return;
    this.drawFrame = requestAnimationFrame(() => {
      this.drawFrame = 0;
      this.draw();
    });
  }

  draw() {
    if (!this.enabled || !this.layout || this.root.hidden) return;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = this.root.clientWidth;
    const width = Math.round(cssWidth * dpr);
    const height = Math.round(this.root.clientHeight * dpr);
    if (!width || !height) return;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;

    const metrics = this.getMetrics();
    const { scale, offset } = metrics;
    const { tops, bottoms, count, selected } = this.layout;
    const css = getComputedStyle(this.root);
    const cssColor = name => css.getPropertyValue(name).trim();
    const ctx = this.canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const textLeft = Math.round(MINIMAP_SELECTION_RULER_WIDTH * dpr);
    const textRight = width - Math.round(MINIMAP_LEVEL_RULER_WIDTH * dpr);
    // Fit the output's line width into the minimap, so wrapped lines keep their shape.
    const charWidth = Math.min(MINIMAP_CHAR_WIDTH,
      (cssWidth - MINIMAP_SELECTION_RULER_WIDTH - MINIMAP_LEVEL_RULER_WIDTH - MINIMAP_PADDING * 2) / this.layout.textCols);
    const groups = new Map();
    const addRect = (color, strong, x, y, w, h) => {
      const left = Math.max(textLeft, Math.round(x * dpr));
      const right = Math.min(textRight, Math.round((x + w) * dpr));
      if (right <= left) return;
      const key = strong ? `!${color}` : color;
      let group = groups.get(key);
      if (!group) groups.set(key, group = { color, alpha: strong ? 1 : MINIMAP_TEXT_ALPHA, rects: [] });
      const top = Math.round(y * dpr);
      group.rects.push(left, top, right - left, Math.max(1, Math.round(h * dpr)));
    };

    // Entries intersecting the minimap window.
    const fromY = offset / scale;
    const toY = (offset + metrics.height) / scale;
    const selectedColor = cssColor("--minimap-selected");
    for (let index = Math.max(0, upperBound(tops, fromY) - 1); index < count && tops[index] <= toY; index++) {
      const entryY = tops[index] * scale - offset;
      if (selected[index]) {
        addRect(selectedColor, false, MINIMAP_SELECTION_RULER_WIDTH, entryY,
          cssWidth - MINIMAP_SELECTION_RULER_WIDTH - MINIMAP_LEVEL_RULER_WIDTH, (bottoms[index] - tops[index]) * scale);
      }
      for (const run of this.getEntryRuns(index)) {
        const y = entryY + run.y;
        if (y > metrics.height || y + run.h < 0) continue;
        const x = MINIMAP_SELECTION_RULER_WIDTH + MINIMAP_PADDING + run.x * charWidth;
        if (x >= cssWidth) continue;
        addRect(run.color, run.strong, x, y, run.w * charWidth, run.h);
      }
    }
    // Selection bands go first so text stays on top of them.
    const selectedGroup = groups.get(selectedColor);
    if (selectedGroup) selectedGroup.alpha = MINIMAP_SELECTED_ALPHA;
    const ordered = [...groups.values()].sort((a, b) => (a === selectedGroup ? -1 : b === selectedGroup ? 1 : a.alpha - b.alpha));
    for (const { color, alpha, rects } of ordered) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < rects.length; i += 4) ctx.rect(rects[i], rects[i + 1], rects[i + 2], rects[i + 3]);
      ctx.fill();
    }

    this.drawRuler(ctx, cssColor, textLeft, textRight, width, height, Math.round(metrics.rulerHeight * dpr), metrics.scrollHeight);
    ctx.globalAlpha = 1;
    this.updateViewport(metrics);
  }

  /** Overview rulers for the whole output: selected rows on the left edge, ERROR/WARN on the right. */
  drawRuler(ctx, cssColor, selectionWidth, levelLeft, width, height, rulerHeight, scrollHeight) {
    const cache = this.rulerCache;
    if (cache?.height !== height || cache.rulerHeight !== rulerHeight || cache.scrollHeight !== scrollHeight) {
      const { count, tops, bottoms, ranks, selected } = this.layout;
      const scale = rulerHeight / Math.max(scrollHeight, 1);
      const levels = new Uint8Array(height);
      const selections = new Uint8Array(height);
      for (let index = 0; index < count; index++) {
        if (!ranks[index] && !selected[index]) continue;
        const start = Math.min(height - 1, Math.floor(tops[index] * scale));
        const end = Math.max(start + 1, Math.min(height, Math.ceil(bottoms[index] * scale)));
        for (let y = start; y < end; y++) {
          if (ranks[index] > levels[y]) levels[y] = ranks[index];
          if (selected[index]) selections[y] = 1;
        }
      }
      this.rulerCache = { height, rulerHeight, scrollHeight, levels, selections };
    }
    const { levels, selections } = this.rulerCache;
    const levelWidth = width - levelLeft;
    ctx.globalAlpha = MINIMAP_RULER_BG_ALPHA;
    ctx.fillStyle = cssColor("--minimap-ruler-bg");
    ctx.fillRect(0, 0, selectionWidth, height);
    ctx.fillRect(levelLeft, 0, levelWidth, height);
    ctx.globalAlpha = 1;
    paintLane(ctx, selections, 0, selectionWidth, [null, cssColor("--minimap-selected")]);
    paintLane(ctx, levels, levelLeft, levelWidth, [null, cssColor("--minimap-warn"), cssColor("--minimap-error")]);
  }

  updateViewport(metrics = this.getMetrics()) {
    const { scrollHeight, clientHeight, scrollTop, height, scale, track } = metrics;
    this.viewport.hidden = scrollHeight <= clientHeight;
    if (this.viewport.hidden) return;
    const boxHeight = Math.min(height, Math.max(MINIMAP_MIN_VIEWPORT_HEIGHT, clientHeight * scale));
    const top = Math.max(0, Math.min(height - boxHeight, scrollTop / track));
    this.viewport.style.height = `${boxHeight}px`;
    this.viewport.style.transform = `translateY(${top}px)`;
  }

  // ── Pointer ─────────────────────────────────────────────────────────────

  /** Wheel over the minimap scrolls the output by the same amount as over the output itself. */
  handleWheel(event) {
    if (event.ctrlKey) return;
    event.preventDefault();
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? parseFloat(getComputedStyle(this.content).lineHeight) || 20
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? this.scroller.clientHeight : 1;
    this.scroller.scrollBy({ top: event.deltaY * unit, left: event.deltaX * unit });
  }

  startDrag(event) {
    if (event.button !== 0 || !this.layout) return;
    event.preventDefault();
    const rect = this.root.getBoundingClientRect();
    let scrollTo;
    if (event.clientX >= rect.right - MINIMAP_LEVEL_RULER_WIDTH
      || event.clientX < rect.left + MINIMAP_SELECTION_RULER_WIDTH) {
      // The rulers map the whole output onto their height.
      scrollTo = clientY => {
        const { scrollHeight, clientHeight, rulerHeight } = this.getMetrics();
        this.scroller.scrollTop = (clientY - rect.top) / rulerHeight * scrollHeight - clientHeight / 2;
      };
      scrollTo(event.clientY);
    } else {
      if (event.target !== this.viewport) {
        // Center the clicked line first; dragging then moves the box from there.
        const { offset, scale, clientHeight } = this.getMetrics();
        this.scroller.scrollTop = (event.clientY - rect.top + offset) / scale - clientHeight / 2;
      }
      const grab = event.clientY - rect.top - this.scroller.scrollTop / this.getMetrics().track;
      scrollTo = clientY => {
        this.scroller.scrollTop = (clientY - rect.top - grab) * this.getMetrics().track;
      };
    }
    this.root.setPointerCapture(event.pointerId);
    document.body.classList.add("is-dragging-minimap");
    const onMove = moveEvent => scrollTo(moveEvent.clientY);
    const onEnd = () => {
      this.root.removeEventListener("pointermove", onMove);
      this.root.removeEventListener("pointerup", onEnd);
      this.root.removeEventListener("pointercancel", onEnd);
      document.body.classList.remove("is-dragging-minimap");
      this.dragCleanup = null;
    };
    this.dragCleanup = onEnd;
    this.root.addEventListener("pointermove", onMove);
    this.root.addEventListener("pointerup", onEnd);
    this.root.addEventListener("pointercancel", onEnd);
  }
}

/** Index of the first value greater than `target` in an ascending array. */
function upperBound(values, target) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (values[mid] <= target) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Fill runs of equal bucket values with a single rect each. */
function paintLane(ctx, rows, x, laneWidth, colors) {
  let start = 0;
  for (let y = 1; y <= rows.length; y++) {
    if (y < rows.length && rows[y] === rows[start]) continue;
    const color = colors[rows[start]];
    if (color) {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), start, Math.round(laneWidth), y - start);
    }
    start = y;
  }
}

function isMinimapSpace(code) {
  return code === 32 || code === 9 || code === 10 || code === 13;
}

/**
 * Greedy word wrap in character columns, approximating `word-break: break-word`:
 * words move to the next line (starting at hangCol) and only overlong words are split.
 * Calls emit(line, col, from, to) for each visible chunk of text[from, to).
 */
function wrapText(text, startCol, hangCol, maxCol, maxLines, emit) {
  let line = 0;
  let col = startCol;
  let i = 0;
  const newline = () => {
    line++;
    col = hangCol;
    return line < maxLines;
  };
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (code === 10) {
      if (!newline()) return;
      i++;
      continue;
    }
    if (isMinimapSpace(code)) {
      col += code === 9 ? 8 - ((col - hangCol) % 8) : 1;
      i++;
      continue;
    }
    let end = i;
    while (end < text.length && !isMinimapSpace(text.charCodeAt(end))) end++;
    if (col + (end - i) > maxCol && col > hangCol && !newline()) return;
    while (i < end) {
      if (col >= maxCol && !newline()) return;
      const take = Math.max(1, Math.min(end - i, Math.floor(maxCol - col)));
      emit(line, col, i, i + take);
      col += take;
      i += take;
    }
  }
}
