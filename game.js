/* ═══════════════════════════════════════════════════════════════
   Solitaire (Klondike) – game.js
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ── Constants ──────────────────────────────────────────────── */
const SUITS   = ['♠', '♥', '♦', '♣'];
const RANKS   = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED_SUITS   = new Set(['♥', '♦']);
const SUIT_INDEX  = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };
const RANK_VALUE  = Object.fromEntries(RANKS.map((r, i) => [r, i + 1]));

const SCORE_WASTE_TO_TABLEAU   = 5;
const SCORE_WASTE_TO_FOUNDATION = 10;
const SCORE_TABLEAU_TO_FOUNDATION = 10;
const SCORE_FLIP_CARD         = 5;
const SCORE_RECYCLE_STOCK     = -100;

const DEFAULT_CARD_HEIGHT      = 126;   // px – fallback when CSS var unavailable
const DRAG_STACK_OFFSET_RATIO  = 0.38;  // fraction of card height between stacked drag clones
const TOUCH_DRAG_THRESHOLD     = 8;     // px of movement before a touch becomes a drag
const DOUBLE_TAP_MS            = 400;   // max ms between taps to count as double-tap

/* ── State ──────────────────────────────────────────────────── */
let deck        = [];
let stock       = [];
let waste       = [];
let foundations = [[], [], [], []];  // indexed by suit: ♠ 0, ♥ 1, ♦ 2, ♣ 3
let tableau     = [[], [], [], [], [], [], []];

let score       = 0;
let moves       = 0;
let seconds     = 0;
let timerHandle = null;
let history     = [];   // for undo

/* ── DOM refs ───────────────────────────────────────────────── */
const $score    = document.getElementById('score');
const $moves    = document.getElementById('moves');
const $timer    = document.getElementById('timer');
const $stock    = document.getElementById('stock');
const $waste    = document.getElementById('waste');
const $foundations = [0,1,2,3].map(i => document.getElementById(`foundation-${i}`));
const $tableau  = [0,1,2,3,4,5,6].map(i => document.getElementById(`tableau-${i}`));
const $winOverlay = document.getElementById('win-overlay');

/* ═══════════════════════════════════════════════════════════════
   CARD  CREATION
   ═══════════════════════════════════════════════════════════════ */
function buildDeck() {
  const d = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      d.push({ suit, rank, faceUp: false, id: `${rank}${suit}` });
  return d;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ═══════════════════════════════════════════════════════════════
   GAME INIT
   ═══════════════════════════════════════════════════════════════ */
function newGame() {
  clearInterval(timerHandle);
  deck        = shuffle(buildDeck());
  stock       = [];
  waste       = [];
  foundations = [[], [], [], []];
  tableau     = [[], [], [], [], [], [], []];
  score       = 0; moves = 0; seconds = 0;
  history     = [];
  $winOverlay.classList.add('hidden');
  removeConfettiCanvas();

  // Deal to tableau
  let di = 0;
  for (let col = 0; col < 7; col++) {
    for (let row = col; row < 7; row++) {
      const card = deck[di++];
      card.faceUp = (row === col);
      tableau[row].push(card);
    }
  }
  // Rest to stock (face-down)
  stock = deck.slice(di);

  updateUI(true);
  startTimer();
}

/* ═══════════════════════════════════════════════════════════════
   TIMER
   ═══════════════════════════════════════════════════════════════ */
function startTimer() {
  seconds = 0; $timer.textContent = '00:00';
  clearInterval(timerHandle);
  timerHandle = setInterval(() => {
    seconds++;
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    $timer.textContent = `${m}:${s}`;
  }, 1000);
}

/* ═══════════════════════════════════════════════════════════════
   UI RENDERING
   ═══════════════════════════════════════════════════════════════ */
function updateUI(deal = false) {
  $score.textContent = score;
  $moves.textContent = moves;
  renderStock();
  renderWaste();
  renderFoundations();
  renderTableau(deal);
  checkWin();
}

/* ── Stock ─────────────────────────────────────────────────── */
function renderStock() {
  $stock.innerHTML = '';
  $stock.classList.toggle('stock-empty', stock.length === 0);
  if (stock.length > 0) {
    const el = makeCardEl({ suit: '?', rank: '?', faceUp: false }, 0, 'stock', 0);
    el.style.cursor = 'pointer';
    $stock.appendChild(el);
  }
}

/* ── Waste ─────────────────────────────────────────────────── */
function renderWaste() {
  $waste.innerHTML = '';
  if (waste.length === 0) return;
  // Show up to 3 fanned cards for visual depth
  const show = waste.slice(-3);
  show.forEach((card, i) => {
    const el = makeCardEl(card, i, 'waste', i);
    el.style.left = `${i * 18}px`;
    el.style.zIndex = i + 1;
    if (i < show.length - 1) el.style.pointerEvents = 'none';
    $waste.appendChild(el);
  });
}

/* ── Foundations ───────────────────────────────────────────── */
function renderFoundations() {
  foundations.forEach((pile, fi) => {
    const el = $foundations[fi];
    el.innerHTML = '';
    if (pile.length > 0) {
      const card = pile[pile.length - 1];
      el.appendChild(makeCardEl(card, 0, 'foundation', fi));
    }
  });
}

/* ── Tableau ───────────────────────────────────────────────── */
function renderTableau(deal = false) {
  const CARD_H = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--card-h')
  ) || DEFAULT_CARD_HEIGHT;
  tableau.forEach((pile, ci) => {
    const el = $tableau[ci];
    el.innerHTML = '';
    const FACE_DOWN_OFFSET = Math.round(CARD_H * 0.16);
    const FACE_UP_OFFSET   = Math.round(CARD_H * 0.24);
    let top = 0;
    pile.forEach((card, ri) => {
      const cardEl = makeCardEl(card, ri, 'tableau', ci);
      cardEl.style.top  = `${top}px`;
      cardEl.style.left = '0';
      if (deal) {
        cardEl.style.animationDelay = `${(ci * 7 + ri) * 30}ms`;
        cardEl.classList.add('deal-anim');
      }
      el.appendChild(cardEl);
      top += card.faceUp ? FACE_UP_OFFSET : FACE_DOWN_OFFSET;
    });
    // Grow pile height
    const lastCard = pile[pile.length - 1];
    const finalH   = top + (lastCard ? CARD_H : 0);
    el.style.minHeight = `${Math.max(CARD_H, finalH)}px`;
  });
}

/* ── Build card DOM element ────────────────────────────────── */
function makeCardEl(card, idx, zone, pileIdx) {
  const el = document.createElement('div');
  el.classList.add('card');
  el.dataset.zone    = zone;
  el.dataset.pile    = pileIdx;
  el.dataset.idx     = idx;
  el.dataset.cardId  = card.id;

  if (!card.faceUp) {
    el.classList.add('face-down');
    return el;
  }

  const isRed = RED_SUITS.has(card.suit);
  el.classList.add(isRed ? 'red' : 'black');

  el.innerHTML = `
    <div class="card-corner top-left">
      <span class="card-rank">${card.rank}</span>
      <span class="card-suit">${card.suit}</span>
    </div>
    <div class="card-center">${card.suit}</div>
    <div class="card-corner bot-right">
      <span class="card-rank">${card.rank}</span>
      <span class="card-suit">${card.suit}</span>
    </div>`;

  // Events for face-up cards (not in foundation)
  if (zone !== 'foundation') {
    el.addEventListener('mousedown', onCardMouseDown);
    el.addEventListener('dblclick',  onDoubleClick);
    el.addEventListener('touchstart', onCardTouchStart, { passive: false });
  }
  return el;
}

/* ═══════════════════════════════════════════════════════════════
   STOCK CLICK
   ═══════════════════════════════════════════════════════════════ */
$stock.addEventListener('click', () => {
  saveHistory();
  if (stock.length === 0) {
    // Recycle waste
    if (waste.length === 0) return;
    stock  = waste.slice().reverse().map(c => ({ ...c, faceUp: false }));
    waste  = [];
    addScore(SCORE_RECYCLE_STOCK);
  } else {
    const card = stock.pop();
    card.faceUp = true;
    waste.push(card);
  }
  moves++;
  updateUI();
});

/* ═══════════════════════════════════════════════════════════════
   MOVE VALIDATION
   ═══════════════════════════════════════════════════════════════ */
function canDropOnFoundation(card, fi) {
  const pile = foundations[fi];
  const si   = SUIT_INDEX[card.suit];
  if (si !== fi) return false;
  if (pile.length === 0) return card.rank === 'A';
  const top = pile[pile.length - 1];
  return RANK_VALUE[card.rank] === RANK_VALUE[top.rank] + 1;
}

function canDropOnTableau(card, ti) {
  const pile = tableau[ti];
  if (pile.length === 0) return card.rank === 'K';
  const top = pile[pile.length - 1];
  if (!top.faceUp) return false;
  const diffColor = RED_SUITS.has(card.suit) !== RED_SUITS.has(top.suit);
  return diffColor && RANK_VALUE[card.rank] === RANK_VALUE[top.rank] - 1;
}

/* ═══════════════════════════════════════════════════════════════
   POINTER-EVENT  DRAG  &  DROP
   ═══════════════════════════════════════════════════════════════ */
let dragData  = null;   // { zone, pileIdx, cardIdx, cards[] }
let dragProxy = null;   // floating DOM clone(s)
let dragOffX  = 0;
let dragOffY  = 0;

// Touch drag state
let touchDragging = false;
let touchStartX   = 0;
let touchStartY   = 0;
let touchCardEl   = null;
let lastTapEl     = null;
let lastTapTime   = 0;

function onCardMouseDown(e) {
  // Only primary button; ignore if a modal is open
  if (e.button !== 0) return;
  if (!document.getElementById('help-overlay').classList.contains('hidden')) return;

  const el   = e.currentTarget;
  const zone = el.dataset.zone;
  const pi   = parseInt(el.dataset.pile);
  const ci   = parseInt(el.dataset.idx);
  let cards  = [];

  if (zone === 'waste') {
    if (!waste.length) return;
    cards = [waste[waste.length - 1]];
    dragData = { zone, pileIdx: pi, cardIdx: waste.length - 1, cards };
  } else if (zone === 'tableau') {
    const pile = tableau[pi];
    // Only allow dragging face-up cards
    if (!pile[ci] || !pile[ci].faceUp) return;
    cards = pile.slice(ci);
    dragData = { zone, pileIdx: pi, cardIdx: ci, cards };
  } else {
    return;
  }

  e.preventDefault();

  // Build a floating proxy (one clone per card in the run)
  dragProxy = document.createElement('div');
  dragProxy.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;';
  const CARD_W = el.offsetWidth;
  const CARD_H = el.offsetHeight;
  const STACK_OFFSET = 30;
  dragProxy.style.width  = CARD_W + 'px';
  dragProxy.style.height = (CARD_H + (cards.length - 1) * STACK_OFFSET) + 'px';

  cards.forEach((card, i) => {
    const clone = makeCardEl(card, i, '__drag__', -1);
    clone.style.position = 'absolute';
    clone.style.top  = (i * STACK_OFFSET) + 'px';
    clone.style.left = '0';
    clone.style.width  = CARD_W + 'px';
    clone.style.height = CARD_H + 'px';
    clone.style.boxShadow = '0 12px 32px rgba(0,0,0,.7)';
    clone.style.transform = 'scale(1.06) rotate(1.5deg)';
    dragProxy.appendChild(clone);
  });

  // Offset so cursor sits on the first card
  const rect = el.getBoundingClientRect();
  dragOffX = e.clientX - rect.left;
  dragOffY = e.clientY - rect.top;

  dragProxy.style.left = (e.clientX - dragOffX) + 'px';
  dragProxy.style.top  = (e.clientY - dragOffY) + 'px';
  document.body.appendChild(dragProxy);
  document.body.classList.add('is-dragging');

  // Dim the source cards
  el.classList.add('drag-ghost');
  if (zone === 'tableau' && cards.length > 1) {
    const pileEl = $tableau[pi];
    Array.from(pileEl.children).slice(ci).forEach(c => c.classList.add('drag-ghost'));
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup',   onMouseUp);
}

function onMouseMove(e) {
  if (!dragProxy) return;
  dragProxy.style.left = (e.clientX - dragOffX) + 'px';
  dragProxy.style.top  = (e.clientY - dragOffY) + 'px';

  // Highlight valid targets
  [...$foundations, ...$tableau].forEach(el => {
    el.classList.toggle('drag-over', isOverElement(e, el) && isValidDropTarget(el));
  });
}

function onMouseUp(e) {
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup',   onMouseUp);

  // Remove ghost styling
  document.body.classList.remove('is-dragging');
  document.querySelectorAll('.drag-ghost').forEach(el => el.classList.remove('drag-ghost'));
  [...$foundations, ...$tableau].forEach(el => el.classList.remove('drag-over'));

  if (dragProxy) { dragProxy.remove(); dragProxy = null; }
  if (!dragData) return;

  // Find drop target under cursor
  const target = [...$foundations, ...$tableau].find(
    el => isOverElement(e, el) && isValidDropTarget(el)
  );

  if (target) commitDrop(target);
  dragData = null;
}

/* ═══════════════════════════════════════════════════════════════
   TOUCH  DRAG  &  DROP
   ═══════════════════════════════════════════════════════════════ */
function onCardTouchStart(e) {
  if (e.touches.length !== 1) return;
  if (!document.getElementById('help-overlay').classList.contains('hidden')) return;

  const touch = e.touches[0];
  const el    = e.currentTarget;
  const zone  = el.dataset.zone;
  const pi    = parseInt(el.dataset.pile);
  const ci    = parseInt(el.dataset.idx);
  let cards   = [];

  if (zone === 'waste') {
    if (!waste.length) return;
    cards = [waste[waste.length - 1]];
    dragData = { zone, pileIdx: pi, cardIdx: waste.length - 1, cards };
  } else if (zone === 'tableau') {
    const pile = tableau[pi];
    if (!pile[ci] || !pile[ci].faceUp) return;
    cards = pile.slice(ci);
    dragData = { zone, pileIdx: pi, cardIdx: ci, cards };
  } else {
    return;
  }

  e.preventDefault();

  touchStartX   = touch.clientX;
  touchStartY   = touch.clientY;
  touchCardEl   = el;
  touchDragging = false;

  document.addEventListener('touchmove',   onTouchMove,   { passive: false });
  document.addEventListener('touchend',    onTouchEnd);
  document.addEventListener('touchcancel', onTouchCancel);
}

function _buildDragProxy(el, cards, startX, startY) {
  dragProxy = document.createElement('div');
  dragProxy.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;';
  const CARD_W       = el.offsetWidth;
  const CARD_H       = el.offsetHeight;
  const STACK_OFFSET = Math.round(CARD_H * DRAG_STACK_OFFSET_RATIO);
  dragProxy.style.width  = CARD_W + 'px';
  dragProxy.style.height = (CARD_H + (cards.length - 1) * STACK_OFFSET) + 'px';

  cards.forEach((card, i) => {
    const clone = makeCardEl(card, i, '__drag__', -1);
    clone.style.cssText =
      `position:absolute;top:${i * STACK_OFFSET}px;left:0;` +
      `width:${CARD_W}px;height:${CARD_H}px;` +
      `box-shadow:0 12px 32px rgba(0,0,0,.7);transform:scale(1.06) rotate(1.5deg);`;
    dragProxy.appendChild(clone);
  });

  const rect = el.getBoundingClientRect();
  dragOffX = startX - rect.left;
  dragOffY = startY - rect.top;
  document.body.appendChild(dragProxy);
  document.body.classList.add('is-dragging');

  el.classList.add('drag-ghost');
  if (dragData.zone === 'tableau' && cards.length > 1) {
    Array.from($tableau[dragData.pileIdx].children)
      .slice(dragData.cardIdx)
      .forEach(c => c.classList.add('drag-ghost'));
  }
}

function onTouchMove(e) {
  if (!dragData) return;
  e.preventDefault();
  const touch = e.touches[0];

  if (!touchDragging) {
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    if (Math.sqrt(dx * dx + dy * dy) < TOUCH_DRAG_THRESHOLD) return;
    touchDragging = true;
    _buildDragProxy(touchCardEl, dragData.cards, touchStartX, touchStartY);
  }

  dragProxy.style.left = (touch.clientX - dragOffX) + 'px';
  dragProxy.style.top  = (touch.clientY - dragOffY) + 'px';

  const pt = { clientX: touch.clientX, clientY: touch.clientY };
  [...$foundations, ...$tableau].forEach(el => {
    el.classList.toggle('drag-over', isOverElement(pt, el) && isValidDropTarget(el));
  });
}

function _cleanupTouchDrag() {
  document.removeEventListener('touchmove',   onTouchMove);
  document.removeEventListener('touchend',    onTouchEnd);
  document.removeEventListener('touchcancel', onTouchCancel);
  document.body.classList.remove('is-dragging');
  document.querySelectorAll('.drag-ghost').forEach(el => el.classList.remove('drag-ghost'));
  [...$foundations, ...$tableau].forEach(el => el.classList.remove('drag-over'));
  if (dragProxy) { dragProxy.remove(); dragProxy = null; }
}

function onTouchEnd(e) {
  _cleanupTouchDrag();

  if (!touchDragging) {
    // Treat as tap – detect double-tap for auto-send
    const now = Date.now();
    const el  = touchCardEl;
    if (el && lastTapEl === el && now - lastTapTime < DOUBLE_TAP_MS) {
      lastTapEl = null;
      dragData  = null;
      onDoubleClick({ currentTarget: el });
      return;
    }
    lastTapEl   = el;
    lastTapTime = now;
    dragData    = null;
    return;
  }

  if (!dragData) return;

  const touch = e.changedTouches[0];
  const pt    = { clientX: touch.clientX, clientY: touch.clientY };
  const target = [...$foundations, ...$tableau].find(
    el => isOverElement(pt, el) && isValidDropTarget(el)
  );

  if (target) commitDrop(target);
  dragData = null;
}

function onTouchCancel() {
  _cleanupTouchDrag();
  dragData = null;
}

/* Check if mouse event is over a DOM element */
function isOverElement(e, el) {
  const r = el.getBoundingClientRect();
  return e.clientX >= r.left && e.clientX <= r.right &&
         e.clientY >= r.top  && e.clientY <= r.bottom;
}

function isValidDropTarget(targetEl) {
  if (!dragData) return false;
  const card = dragData.cards[0];
  if (targetEl.classList.contains('foundation-pile')) {
    const fi = parseInt(targetEl.dataset.index);
    return dragData.cards.length === 1 && canDropOnFoundation(card, fi);
  }
  if (targetEl.classList.contains('tableau-pile')) {
    const ti = parseInt(targetEl.dataset.index);
    return canDropOnTableau(card, ti);
  }
  return false;
}

function commitDrop(targetEl) {
  saveHistory();
  const card    = dragData.cards[0];
  const isFound = targetEl.classList.contains('foundation-pile');

  // Remove from source
  if (dragData.zone === 'waste') {
    waste.pop();
    addScore(isFound ? SCORE_WASTE_TO_FOUNDATION : SCORE_WASTE_TO_TABLEAU);
  } else if (dragData.zone === 'tableau') {
    const srcPile = tableau[dragData.pileIdx];
    srcPile.splice(dragData.cardIdx);
    if (srcPile.length > 0 && !srcPile[srcPile.length - 1].faceUp) {
      srcPile[srcPile.length - 1].faceUp = true;
      addScore(SCORE_FLIP_CARD);
    }
    if (isFound) addScore(SCORE_TABLEAU_TO_FOUNDATION);
  }

  // Add to target
  if (isFound) {
    foundations[parseInt(targetEl.dataset.index)].push(...dragData.cards);
  } else {
    tableau[parseInt(targetEl.dataset.index)].push(...dragData.cards);
  }

  moves++;
  updateUI();
}

// No-op — kept so bootstrap call doesn't break
function setupDropTargets() {}

/* ═══════════════════════════════════════════════════════════════
   DOUBLE-CLICK  →  auto send to foundation
   ═══════════════════════════════════════════════════════════════ */
function onDoubleClick(e) {
  const el   = e.currentTarget;
  const zone = el.dataset.zone;
  const pi   = parseInt(el.dataset.pile);
  const ci   = parseInt(el.dataset.idx);
  let card, srcPile;

  if (zone === 'waste') {
    if (waste.length === 0) return;
    card = waste[waste.length - 1];
  } else if (zone === 'tableau') {
    srcPile = tableau[pi];
    if (ci !== srcPile.length - 1) return;  // only top card
    card = srcPile[srcPile.length - 1];
  } else return;

  const fi = SUIT_INDEX[card.suit];
  if (!canDropOnFoundation(card, fi)) return;

  saveHistory();

  if (zone === 'waste')    waste.pop();
  else                     srcPile.pop();

  // Flip new top in tableau
  if (zone === 'tableau' && srcPile.length > 0 && !srcPile[srcPile.length - 1].faceUp) {
    srcPile[srcPile.length - 1].faceUp = true;
    addScore(SCORE_FLIP_CARD);
  }

  foundations[fi].push(card);
  addScore(zone === 'waste' ? SCORE_WASTE_TO_FOUNDATION : SCORE_TABLEAU_TO_FOUNDATION);
  moves++;
  updateUI();
}

/* ═══════════════════════════════════════════════════════════════
   UNDO
   ═══════════════════════════════════════════════════════════════ */
function saveHistory() {
  history.push({
    stock:       stock.map(c => ({ ...c })),
    waste:       waste.map(c => ({ ...c })),
    foundations: foundations.map(p => p.map(c => ({ ...c }))),
    tableau:     tableau.map(p => p.map(c => ({ ...c }))),
    score, moves,
  });
  if (history.length > 50) history.shift();
}

document.getElementById('undo-btn').addEventListener('click', () => {
  if (!history.length) return;
  const s = history.pop();
  stock       = s.stock;
  waste       = s.waste;
  foundations = s.foundations;
  tableau     = s.tableau;
  score       = s.score;
  moves       = s.moves;
  updateUI();
});

/* ═══════════════════════════════════════════════════════════════
   SCORE
   ═══════════════════════════════════════════════════════════════ */
function addScore(n) {
  score = Math.max(0, score + n);
}

/* ═══════════════════════════════════════════════════════════════
   WIN CHECK
   ═══════════════════════════════════════════════════════════════ */
function checkWin() {
  const won = foundations.every(p => p.length === 13);
  if (!won) return;
  clearInterval(timerHandle);
  const m = String(Math.floor(seconds / 60)).padStart(2,'0');
  const s = String(seconds % 60).padStart(2,'0');
  document.getElementById('win-stats').textContent =
    `Score: ${score}  •  Moves: ${moves}  •  Time: ${m}:${s}`;
  $winOverlay.classList.remove('hidden');
  launchConfetti();
}

/* ═══════════════════════════════════════════════════════════════
   CONFETTI
   ═══════════════════════════════════════════════════════════════ */
function removeConfettiCanvas() {
  const old = document.getElementById('confetti-canvas');
  if (old) old.remove();
}

function launchConfetti() {
  removeConfettiCanvas();
  const canvas = document.createElement('canvas');
  canvas.id = 'confetti-canvas';
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99;';
  document.body.appendChild(canvas);

  const ctx  = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const COLORS = ['#f0c040','#e74c3c','#3498db','#2ecc71','#9b59b6','#ffffff'];
  const pieces = Array.from({ length: 160 }, () => ({
    x:   Math.random() * canvas.width,
    y:   -Math.random() * canvas.height,
    r:   Math.random() * 6 + 3,
    d:   Math.random() * 80 + 20,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    tilt: Math.random() * 10 - 10,
    tiltAngle: 0,
    tiltAngleInc: Math.random() * .07 + .05,
    angle: 0,
    angleInc: Math.random() * .06 + .02,
  }));

  let frame;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.tiltAngle += p.tiltAngleInc;
      p.angle     += p.angleInc;
      p.y         += (Math.cos(p.angle + p.d) + 2);
      p.x         += Math.sin(p.angle) * 1.5;
      p.tilt       = Math.sin(p.tiltAngle) * 12;
      if (p.y > canvas.height) {
        p.y = -10; p.x = Math.random() * canvas.width;
      }
      ctx.save();
      ctx.beginPath();
      ctx.lineWidth = p.r;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
      ctx.stroke();
      ctx.restore();
    });
    frame = requestAnimationFrame(draw);
  }
  draw();
  setTimeout(() => { cancelAnimationFrame(frame); canvas.remove(); }, 6000);
}

/* ═══════════════════════════════════════════════════════════════
   CARD  CLICK  HANDLERS  (pile elements)
   ═══════════════════════════════════════════════════════════════ */
// Foundation piles accept drops through dragover/drop set up in setupDropTargets()
// Tableau piles same

// Clicking a face-down top tableau card flips it
document.addEventListener('click', e => {
  const cardEl = e.target.closest('.card');
  if (!cardEl) return;
  const zone = cardEl.dataset.zone;
  const pi   = parseInt(cardEl.dataset.pile);
  if (zone !== 'tableau') return;
  const pile = tableau[pi];
  if (!pile.length) return;
  const top = pile[pile.length - 1];
  if (top.faceUp) return;  // handled by drag
  // face-down top card – flip
  if (cardEl !== $tableau[pi].lastElementChild) return;
  saveHistory();
  top.faceUp = true;
  addScore(SCORE_FLIP_CARD);
  moves++;
  updateUI();
});

/* ═══════════════════════════════════════════════════════════════
   BUTTON  HANDLERS
   ═══════════════════════════════════════════════════════════════ */
document.getElementById('new-game-btn').addEventListener('click', newGame);
document.getElementById('win-new-game-btn').addEventListener('click', newGame);

// Help modal
const $helpOverlay = document.getElementById('help-overlay');
document.getElementById('help-btn').addEventListener('click', () => $helpOverlay.classList.remove('hidden'));
document.getElementById('help-close').addEventListener('click', () => $helpOverlay.classList.add('hidden'));
$helpOverlay.addEventListener('click', e => { if (e.target === $helpOverlay) $helpOverlay.classList.add('hidden'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $helpOverlay.classList.add('hidden'); });

/* ═══════════════════════════════════════════════════════════════
   TUTORIAL
   ═══════════════════════════════════════════════════════════════ */
const TUTORIAL_STEPS = [
  {
    title: 'Welcome to Solitaire! \uD83C\uDCCF',
    text: "Let's quickly walk through the game so you can start playing with confidence. Click Next to begin.",
  },
  {
    target: '#stock',
    position: 'right',
    title: 'Stock Pile',
    text: 'The face-down draw pile. Click it to flip cards onto the Waste pile one at a time. When empty, click it again to recycle the Waste (\u2212100\u00a0pts).',
  },
  {
    target: '#waste',
    position: 'right',
    title: 'Waste Pile',
    text: 'Cards drawn from the Stock land here. Only the top card is available to play \u2014 drag it to the Tableau or a Foundation.',
  },
  {
    target: '#foundation-0',
    position: 'bottom',
    title: 'Foundation Piles',
    text: 'Your goal! Move all 52 cards here \u2014 one pile per suit (\u2660 \u2665 \u2666 \u2663), built up from Ace to King. Double-click a card to send it here automatically.',
  },
  {
    target: '#tableau-row',
    position: 'top',
    title: 'The Tableau',
    text: 'Your 7 main playing columns. Stack cards in descending rank with alternating colors (e.g.\u00a0red\u00a07 on black\u00a08). Only a King can fill an empty column.',
  },
  {
    title: 'Moving Cards',
    text: 'Drag any face-up card \u2014 or an entire stack \u2014 to a valid pile. Face-down cards flip when they reach the top of a column. Double-click the top card to auto-send it to its Foundation.',
  },
  {
    target: '#undo-btn',
    position: 'bottom',
    title: 'Undo Button',
    text: 'Made a mistake? Click Undo to take back up to 50 moves. Start a fresh game any time with the New Game button.',
  },
  {
    title: 'You\'re Ready! \uD83C\uDF89',
    text: 'Good luck! The faster you finish with fewer moves, the higher your score. Now go play!',
  },
];

let tutorialStep = 0;
const $tutorialOverlay   = document.getElementById('tutorial-overlay');
const $tutorialSpotlight = document.getElementById('tutorial-spotlight');
const $tutorialTitle     = document.getElementById('tutorial-title');
const $tutorialText      = document.getElementById('tutorial-text');
const $tutorialCounter   = document.getElementById('tutorial-step-counter');
const $tutorialTooltip   = document.getElementById('tutorial-tooltip');
const $tutorialPrevBtn   = document.getElementById('tutorial-prev-btn');
const $tutorialNextBtn   = document.getElementById('tutorial-next-btn');

function startTutorial() {
  $helpOverlay.classList.add('hidden');
  tutorialStep = 0;
  $tutorialOverlay.classList.remove('hidden');
  showTutorialStep();
}

function showTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialStep];
  $tutorialTitle.textContent   = step.title;
  $tutorialText.textContent    = step.text;
  $tutorialCounter.textContent = `Step ${tutorialStep + 1} of ${TUTORIAL_STEPS.length}`;
  $tutorialPrevBtn.disabled    = (tutorialStep === 0);
  $tutorialNextBtn.textContent = (tutorialStep === TUTORIAL_STEPS.length - 1) ? '\u2713 Done' : 'Next \u2192';

  if (step.target) {
    const el = document.querySelector(step.target);
    if (el) {
      const r   = el.getBoundingClientRect();
      const PAD = 10;
      Object.assign($tutorialSpotlight.style, {
        display: 'block',
        left:    `${r.left   - PAD}px`,
        top:     `${r.top    - PAD}px`,
        width:   `${r.width  + PAD * 2}px`,
        height:  `${r.height + PAD * 2}px`,
      });
      $tutorialOverlay.classList.remove('tutorial-no-target');
      positionTooltip(r, step.position || 'bottom');
      return;
    }
  }

  // No target — center tooltip
  $tutorialSpotlight.style.display = 'none';
  $tutorialOverlay.classList.add('tutorial-no-target');
  $tutorialTooltip.style.cssText = 'top:50%;left:50%;transform:translate(-50%,-50%);';
}

function positionTooltip(r, preferred) {
  const TW            = 320;
  const TOOLTIP_HEIGHT = 220;
  const M  = 18;
  const VW = window.innerWidth;
  const VH = window.innerHeight;
  let top, left;

  switch (preferred) {
    case 'right':
      top  = r.top;
      left = r.right + M;
      break;
    case 'left':
      top  = r.top;
      left = r.left - TW - M;
      break;
    case 'top':
      top  = r.top - M;
      left = r.left + (r.width / 2) - (TW / 2);
      left = Math.max(16, Math.min(left, VW - TW - 16));
      $tutorialTooltip.style.cssText =
        `top:${Math.max(16, top)}px;left:${left}px;transform:translateY(-100%);`;
      return;
    case 'bottom':
    default:
      top  = r.bottom + M;
      left = r.left + (r.width / 2) - (TW / 2);
      break;
  }

  top  = Math.max(16, Math.min(top,  VH - TOOLTIP_HEIGHT));
  left = Math.max(16, Math.min(left, VW - TW - 16));
  $tutorialTooltip.style.cssText = `top:${top}px;left:${left}px;transform:none;`;
}

function endTutorial() {
  $tutorialOverlay.classList.add('hidden');
}

document.getElementById('tutorial-start-btn').addEventListener('click', startTutorial);
document.getElementById('tutorial-skip-btn').addEventListener('click', endTutorial);
$tutorialNextBtn.addEventListener('click', () => {
  if (tutorialStep < TUTORIAL_STEPS.length - 1) {
    tutorialStep++;
    showTutorialStep();
  } else {
    endTutorial();
  }
});
$tutorialPrevBtn.addEventListener('click', () => {
  if (tutorialStep > 0) {
    tutorialStep--;
    showTutorialStep();
  }
});

/* ═══════════════════════════════════════════════════════════════
   BOOTSTRAP
   ═══════════════════════════════════════════════════════════════ */
setupDropTargets();
newGame();
