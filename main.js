(() => {
  /** @typedef {0|1|2} Cell */ // 0 empty, 1 black, 2 white

  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("board"));
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));

  const elStatus = document.getElementById("statusText");
  const elTurn = document.getElementById("turnText");
  const elMove = document.getElementById("moveText");
  const elResult = document.getElementById("resultText");

  const btnRestart = /** @type {HTMLButtonElement} */ (document.getElementById("btnRestart"));
  const btnUndo = /** @type {HTMLButtonElement} */ (document.getElementById("btnUndo"));

  const modeSelect = /** @type {HTMLSelectElement} */ (document.getElementById("modeSelect"));
  const aiSideSelect = /** @type {HTMLSelectElement} */ (document.getElementById("aiSideSelect"));
  const aiLevelSelect = /** @type {HTMLSelectElement} */ (document.getElementById("aiLevelSelect"));

  const sizeSelect = /** @type {HTMLSelectElement} */ (document.getElementById("sizeSelect"));
  const winSelect = /** @type {HTMLSelectElement} */ (document.getElementById("winSelect"));
  const toggleCoords = /** @type {HTMLInputElement} */ (document.getElementById("toggleCoords"));
  const toggleLast = /** @type {HTMLInputElement} */ (document.getElementById("toggleLast"));

  const COLORS = {
    grid: "rgba(30, 18, 8, 0.42)",
    gridBold: "rgba(30, 18, 8, 0.58)",
    coord: "rgba(25, 15, 8, 0.55)",
    last: "rgba(124, 92, 255, 0.95)",
  };

  const DPI = Math.max(1, Math.floor(window.devicePixelRatio || 1));

  /** @type {{size:number, win:number, showCoords:boolean, showLast:boolean, mode:"pvp"|"ai", aiPlayer:0|1|2, aiLevel:"easy"|"normal"}} */
  let settings = {
    size: Number(sizeSelect.value) || 15,
    win: Number(winSelect.value) || 5,
    showCoords: toggleCoords.checked,
    showLast: toggleLast.checked,
    mode: (modeSelect?.value === "ai" ? "ai" : "pvp"),
    aiPlayer: /** @type {0|1|2} */ (Number(aiSideSelect?.value) || 2),
    aiLevel: aiLevelSelect?.value === "easy" ? "easy" : "normal",
  };

  /** @type {Cell[][]} */
  let board = [];
  /** @type {{r:number,c:number,player:1|2, mark?:boolean}[]} */
  let moves = [];
  /** @type {1|2} */
  let current = 1;
  /** @type {{winner:0|1|2, line?:{a:{r:number,c:number}, b:{r:number,c:number}}}} */
  let result = { winner: 0 };
  let aiThinking = false;

  let geometry = {
    padding: 36,
    cell: 40,
    originX: 0,
    originY: 0,
    inner: 0,
  };

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function initBoard() {
    board = Array.from({ length: settings.size }, () =>
      Array.from({ length: settings.size }, () => /** @type {Cell} */ (0)),
    );
    moves = [];
    current = 1;
    result = { winner: 0 };
    aiThinking = false;
    syncUI();
    resizeCanvas();
    draw();
    maybeAiTurn();
  }

  function resizeCanvas() {
    // Keep canvas square, using its CSS rendered width.
    const rect = canvas.getBoundingClientRect();
    const cssSize = Math.floor(rect.width);
    const pxSize = cssSize * DPI;
    canvas.width = pxSize;
    canvas.height = pxSize;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(DPI, DPI);

    const size = cssSize;
    // Compute cell size to fit board including padding.
    const pad = clamp(Math.floor(size * 0.055), 26, 52);
    const inner = size - pad * 2;
    const cell = inner / (settings.size - 1);
    geometry = {
      padding: pad,
      cell,
      originX: pad,
      originY: pad,
      inner,
    };
  }

  function syncUI() {
    const turnText = current === 1 ? "黑" : "白";
    const moveCount = moves.length;
    const resultText =
      result.winner === 0 ? "—" : result.winner === 1 ? "黑勝" : "白勝";

    elTurn.textContent = turnText;
    elMove.textContent = String(moveCount);
    elResult.textContent = resultText;

    btnUndo.disabled =
      moveCount === 0 || result.winner !== 0 || (settings.mode === "ai" && aiThinking);

    if (result.winner !== 0) {
      elStatus.textContent = `對局結束：${resultText}（按「重新開始」再來一局）`;
    } else {
      if (settings.mode === "ai" && current === settings.aiPlayer) {
        elStatus.textContent = aiThinking ? "AI 思考中…" : "輪到：AI（即將落子）";
      } else {
        const modeHint = settings.mode === "ai" ? "（點擊落子）" : "（點擊落子）";
        elStatus.textContent = `輪到：${turnText}${modeHint}`;
      }
    }
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const size = rect.width;
    ctx.clearRect(0, 0, size, size);
    drawGrid(size);
    drawStarpPoints();
    if (settings.showCoords) drawCoords();
    drawStones();
    if (settings.showLast) drawLastMove();
    if (result.winner !== 0 && result.line) drawWinLine(result.line);
  }

  function drawGrid(size) {
    const { originX, originY, cell } = geometry;
    const n = settings.size;

    ctx.lineCap = "round";

    for (let i = 0; i < n; i++) {
      const x = originX + cell * i;
      const y = originY + cell * i;

      const isBold = i === 0 || i === n - 1;
      ctx.strokeStyle = isBold ? COLORS.gridBold : COLORS.grid;
      ctx.lineWidth = isBold ? 1.6 : 1.1;

      // vertical
      ctx.beginPath();
      ctx.moveTo(x, originY);
      ctx.lineTo(x, originY + cell * (n - 1));
      ctx.stroke();

      // horizontal
      ctx.beginPath();
      ctx.moveTo(originX, y);
      ctx.lineTo(originX + cell * (n - 1), y);
      ctx.stroke();
    }

    // subtle vignette
    const g = ctx.createRadialGradient(
      size * 0.5,
      size * 0.45,
      size * 0.2,
      size * 0.5,
      size * 0.5,
      size * 0.62,
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.15)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  function starPointIndices() {
    // Standard-ish star points depending on size.
    // 15: 3,7,11; 19: 3,9,15; 13: 3,6,9
    const n = settings.size;
    if (n <= 13) return [3, Math.floor((n - 1) / 2), n - 4];
    return [3, Math.floor((n - 1) / 2), n - 4];
  }

  function drawStarpPoints() {
    const { originX, originY, cell } = geometry;
    const n = settings.size;
    if (n < 11) return;

    const idx = starPointIndices();
    const pts = [];
    for (const r of idx) for (const c of idx) pts.push({ r, c });

    ctx.fillStyle = "rgba(30, 18, 8, 0.55)";
    for (const { r, c } of pts) {
      // Skip corners for smaller boards? Keep it simple.
      const x = originX + cell * c;
      const y = originY + cell * r;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2.2, cell * 0.07), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCoords() {
    const { originX, originY, cell } = geometry;
    const n = settings.size;
    ctx.fillStyle = COLORS.coord;
    ctx.font = `600 ${Math.max(10, Math.floor(cell * 0.26))}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < n; i++) {
      const x = originX + cell * i;
      const y = originY + cell * i;
      // top labels (A,B,C... skipping I like Go? keep simple, include I)
      const label = String.fromCharCode("A".charCodeAt(0) + i);
      ctx.fillText(label, x, originY - cell * 0.62);
      ctx.fillText(label, x, originY + cell * (n - 1) + cell * 0.62);

      const num = String(i + 1);
      ctx.fillText(num, originX - cell * 0.62, y);
      ctx.fillText(num, originX + cell * (n - 1) + cell * 0.62, y);
    }
  }

  function stoneRadius() {
    return Math.max(8, geometry.cell * 0.44);
  }

  function drawStones() {
    const { originX, originY, cell } = geometry;
    const rStone = stoneRadius();

    for (let r = 0; r < settings.size; r++) {
      for (let c = 0; c < settings.size; c++) {
        const v = board[r][c];
        if (v === 0) continue;
        const x = originX + cell * c;
        const y = originY + cell * r;
        drawStone(x, y, rStone, v);
      }
    }
  }

  function drawStone(x, y, r, player) {
    // Shadow
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y + r * 0.07, r * 1.02, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fill();

    // Stone gradient
    const g = ctx.createRadialGradient(
      x - r * 0.35,
      y - r * 0.35,
      r * 0.1,
      x,
      y,
      r * 1.2,
    );
    if (player === 1) {
      g.addColorStop(0, "rgba(95, 95, 95, 0.95)");
      g.addColorStop(0.5, "rgba(20, 20, 20, 0.98)");
      g.addColorStop(1, "rgba(0, 0, 0, 1)");
    } else {
      g.addColorStop(0, "rgba(255, 255, 255, 1)");
      g.addColorStop(0.55, "rgba(235, 238, 244, 0.98)");
      g.addColorStop(1, "rgba(200, 205, 214, 1)");
    }

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = player === 1 ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawLastMove() {
    if (moves.length === 0) return;
    const last = moves[moves.length - 1];
    const { originX, originY, cell } = geometry;
    const x = originX + cell * last.c;
    const y = originY + cell * last.r;
    const r = stoneRadius();

    ctx.save();
    ctx.strokeStyle = COLORS.last;
    ctx.lineWidth = Math.max(2, cell * 0.07);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
    ctx.stroke();

    if (last.mark) {
      ctx.fillStyle = COLORS.last;
      ctx.font = `800 ${Math.max(12, Math.floor(cell * 0.36))}px ui-sans-serif, system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("●", x, y);
    }
    ctx.restore();
  }

  function drawWinLine(line) {
    const { originX, originY, cell } = geometry;
    const ax = originX + cell * line.a.c;
    const ay = originY + cell * line.a.r;
    const bx = originX + cell * line.b.c;
    const by = originY + cell * line.b.r;

    ctx.save();
    ctx.strokeStyle = "rgba(48, 213, 200, 0.95)";
    ctx.lineWidth = Math.max(3, cell * 0.11);
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.restore();
  }

  function canvasToCell(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const { originX, originY, cell } = geometry;
    const c = Math.round((x - originX) / cell);
    const r = Math.round((y - originY) / cell);
    return { r, c };
  }

  function inBounds(r, c) {
    return r >= 0 && r < settings.size && c >= 0 && c < settings.size;
  }

  function tryPlace(r, c, opts) {
    if (!inBounds(r, c)) return;
    if (result.winner !== 0) return;
    if (aiThinking) return;
    if (settings.mode === "ai" && current === settings.aiPlayer) return;
    if (board[r][c] !== 0) return;

    board[r][c] = current;
    moves.push({ r, c, player: current, mark: !!opts?.markLast });

    const win = checkWinFrom(r, c, current, settings.win);
    if (win) {
      result = { winner: current, line: win };
    } else {
      current = current === 1 ? 2 : 1;
    }

    syncUI();
    draw();
    maybeAiTurn();
  }

  function undo() {
    if (moves.length === 0) return;
    if (result.winner !== 0) return;
    if (aiThinking) return;

    const undoOne = () => {
      const last = moves.pop();
      if (!last) return;
      board[last.r][last.c] = 0;
      current = last.player;
    };

    if (settings.mode === "ai") {
      // Rewind a full ply (player + AI) when possible.
      undoOne();
      if (moves.length > 0 && current === settings.aiPlayer) undoOne();
    } else {
      undoOne();
    }

    syncUI();
    draw();
  }

  function checkWinFrom(r0, c0, player, need) {
    /** @type {{dr:number,dc:number}[]} */
    const dirs = [
      { dr: 0, dc: 1 },
      { dr: 1, dc: 0 },
      { dr: 1, dc: 1 },
      { dr: 1, dc: -1 },
    ];

    for (const { dr, dc } of dirs) {
      let count = 1;
      let a = { r: r0, c: c0 };
      let b = { r: r0, c: c0 };

      // forward
      let r = r0 + dr;
      let c = c0 + dc;
      while (inBounds(r, c) && board[r][c] === player) {
        count++;
        b = { r, c };
        r += dr;
        c += dc;
      }

      // backward
      r = r0 - dr;
      c = c0 - dc;
      while (inBounds(r, c) && board[r][c] === player) {
        count++;
        a = { r, c };
        r -= dr;
        c -= dc;
      }

      if (count >= need) {
        // Trim to exact segment length for nicer line (take endpoints of a length-need window)
        const line = trimLineToNeed(a, b, dr, dc, need, player);
        return line;
      }
    }
    return null;
  }

  function trimLineToNeed(a, b, dr, dc, need, player) {
    // Collect all points from a..b along direction (dr,dc), then pick window containing the last move.
    const pts = [];
    let r = a.r;
    let c = a.c;
    while (true) {
      pts.push({ r, c });
      if (r === b.r && c === b.c) break;
      r += dr;
      c += dc;
    }
    if (pts.length <= need) return { a, b };

    // Prefer a window that includes the most recent move (which is on this line).
    const last = moves[moves.length - 1];
    const idx = pts.findIndex((p) => p.r === last.r && p.c === last.c);
    let start = clamp(idx - (need - 1), 0, pts.length - need);
    return { a: pts[start], b: pts[start + need - 1] };
  }

  // Events
  canvas.addEventListener("click", (e) => {
    const { r, c } = canvasToCell(e.clientX, e.clientY);
    tryPlace(r, c, { markLast: e.shiftKey });
  });

  window.addEventListener("resize", () => {
    resizeCanvas();
    draw();
  });

  btnRestart.addEventListener("click", () => initBoard());
  btnUndo.addEventListener("click", () => undo());

  function syncAiControls() {
    const on = settings.mode === "ai";
    aiSideSelect.disabled = !on;
    aiLevelSelect.disabled = !on;
  }

  modeSelect.addEventListener("change", () => {
    settings.mode = modeSelect.value === "ai" ? "ai" : "pvp";
    syncAiControls();
    initBoard();
  });
  aiSideSelect.addEventListener("change", () => {
    settings.aiPlayer = /** @type {0|1|2} */ (Number(aiSideSelect.value) || 2);
    initBoard();
  });
  aiLevelSelect.addEventListener("change", () => {
    settings.aiLevel = aiLevelSelect.value === "easy" ? "easy" : "normal";
    initBoard();
  });

  sizeSelect.addEventListener("change", () => {
    settings.size = Number(sizeSelect.value) || 15;
    initBoard();
  });
  winSelect.addEventListener("change", () => {
    settings.win = Number(winSelect.value) || 5;
    initBoard();
  });
  toggleCoords.addEventListener("change", () => {
    settings.showCoords = toggleCoords.checked;
    draw();
  });
  toggleLast.addEventListener("change", () => {
    settings.showLast = toggleLast.checked;
    draw();
  });

  // Start
  syncAiControls();
  initBoard();

  function maybeAiTurn() {
    if (settings.mode !== "ai") return;
    if (result.winner !== 0) return;
    if (current !== settings.aiPlayer) return;
    if (aiThinking) return;

    aiThinking = true;
    syncUI();

    // Let UI paint before heavy work
    window.setTimeout(() => {
      const move = pickAiMove(settings.aiPlayer);
      aiThinking = false;
      if (move && result.winner === 0 && current === settings.aiPlayer) {
        placeDirect(move.r, move.c, settings.aiPlayer);
      } else {
        syncUI();
        draw();
      }
    }, 40);
  }

  function placeDirect(r, c, player) {
    if (!inBounds(r, c)) return;
    if (result.winner !== 0) return;
    if (board[r][c] !== 0) return;
    if (current !== player) return;

    board[r][c] = player;
    moves.push({ r, c, player });

    const win = checkWinFrom(r, c, player, settings.win);
    if (win) {
      result = { winner: player, line: win };
    } else {
      current = current === 1 ? 2 : 1;
    }
    syncUI();
    draw();
  }

  function pickAiMove(aiPlayer) {
    const n = settings.size;
    const opp = aiPlayer === 1 ? 2 : 1;
    const empties = [];
    let hasStone = false;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (board[r][c] !== 0) hasStone = true;
        else empties.push({ r, c });
      }
    }
    if (!hasStone) {
      const mid = Math.floor((n - 1) / 2);
      return { r: mid, c: mid };
    }

    const candidates = generateCandidates(2);
    if (candidates.length === 0) return empties[0] || null;

    // 1) Win immediately
    for (const p of candidates) {
      if (wouldWin(p.r, p.c, aiPlayer)) return p;
    }
    // 2) Block opponent immediate win
    for (const p of candidates) {
      if (wouldWin(p.r, p.c, opp)) return p;
    }

    let best = null;
    let bestScore = -Infinity;
    const mid = (n - 1) / 2;

    for (const p of candidates) {
      const s = scoreMove(p.r, p.c, aiPlayer, opp);
      const centerBias = -((p.r - mid) ** 2 + (p.c - mid) ** 2) * 0.003;
      const jitter = settings.aiLevel === "easy" ? (Math.random() - 0.5) * 0.25 : 0;
      const total = s + centerBias + jitter;
      if (total > bestScore) {
        bestScore = total;
        best = p;
      }
    }
    return best;
  }

  function generateCandidates(radius) {
    const n = settings.size;
    const set = new Set();
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (board[r][c] === 0) continue;
        for (let dr = -radius; dr <= radius; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            const rr = r + dr;
            const cc = c + dc;
            if (!inBounds(rr, cc)) continue;
            if (board[rr][cc] !== 0) continue;
            set.add(rr + "," + cc);
          }
        }
      }
    }
    const out = [];
    for (const key of set) {
      const [r, c] = key.split(",").map(Number);
      out.push({ r, c });
    }
    return out;
  }

  function wouldWin(r, c, player) {
    if (board[r][c] !== 0) return false;
    return !!checkWinFromVirtual(r, c, player, settings.win);
  }

  function checkWinFromVirtual(r0, c0, player, need) {
    const dirs = [
      { dr: 0, dc: 1 },
      { dr: 1, dc: 0 },
      { dr: 1, dc: 1 },
      { dr: 1, dc: -1 },
    ];
    for (const { dr, dc } of dirs) {
      let count = 1;
      let a = { r: r0, c: c0 };
      let b = { r: r0, c: c0 };

      let r = r0 + dr;
      let c = c0 + dc;
      while (inBounds(r, c) && board[r][c] === player) {
        count++;
        b = { r, c };
        r += dr;
        c += dc;
      }
      r = r0 - dr;
      c = c0 - dc;
      while (inBounds(r, c) && board[r][c] === player) {
        count++;
        a = { r, c };
        r -= dr;
        c -= dc;
      }
      if (count >= need) return { a, b };
    }
    return null;
  }

  function scoreMove(r, c, me, opp) {
    // Evaluate both attack and defense potential if we place at (r,c).
    const dirs = [
      { dr: 0, dc: 1 },
      { dr: 1, dc: 0 },
      { dr: 1, dc: 1 },
      { dr: 1, dc: -1 },
    ];

    let score = 0;
    for (const { dr, dc } of dirs) {
      const a = lineInfoVirtual(r, c, dr, dc, me);
      const d = lineInfoVirtual(r, c, dr, dc, opp);
      score += attackScore(a.len, a.open);
      score += defenseScore(d.len, d.open);
    }
    return score;
  }

  function lineInfoVirtual(r0, c0, dr, dc, player) {
    // After placing at (r0,c0) as player, count contiguous stones and open ends.
    let len = 1;
    let open = 0;

    // forward
    let r = r0 + dr;
    let c = c0 + dc;
    while (inBounds(r, c) && board[r][c] === player) {
      len++;
      r += dr;
      c += dc;
    }
    if (inBounds(r, c) && board[r][c] === 0) open++;

    // backward
    r = r0 - dr;
    c = c0 - dc;
    while (inBounds(r, c) && board[r][c] === player) {
      len++;
      r -= dr;
      c -= dc;
    }
    if (inBounds(r, c) && board[r][c] === 0) open++;

    return { len, open };
  }

  function attackScore(len, open) {
    // Favor longer lines and open ends. Rough weights tuned for casual play.
    if (len >= settings.win) return 1e9;
    const base = len * len * (open === 2 ? 1.35 : open === 1 ? 1.0 : 0.4);
    // Bonus for "almost win"
    if (len === settings.win - 1 && open > 0) return 900000 + base * 1200;
    if (len === settings.win - 2 && open === 2) return 35000 + base * 200;
    if (len === 3 && open === 2) return 1200 + base * 40;
    return base * 22;
  }

  function defenseScore(len, open) {
    // Blocking opponent threats is important.
    if (len >= settings.win) return 9e8;
    const base = len * len * (open === 2 ? 1.3 : open === 1 ? 1.0 : 0.35);
    if (len === settings.win - 1 && open > 0) return 850000 + base * 1000;
    if (len === settings.win - 2 && open === 2) return 26000 + base * 180;
    if (len === 3 && open === 2) return 900 + base * 35;
    return base * 18;
  }
})();
