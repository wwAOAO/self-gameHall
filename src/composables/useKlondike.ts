import { ref, onUnmounted } from 'vue';

const SUITS = ['♠', '♥', '♣', '♦'];
const SUIT_COLORS: Record<string, string> = {
    '♠': '#000000',
    '♥': '#dc2626',
    '♣': '#000000',
    '♦': '#dc2626',
};
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

interface Card {
    suit: string;
    rank: string;
    value: number;
    faceUp: boolean;
}

type PileId = { type: 'foundation'; index: number } | { type: 'tableau'; index: number } | { type: 'waste' };

const CARD_W = 60;
const CARD_H = 84;
const STACK_Y = 8;
const STACK_X = 10;
const TABLEAU_X = 10;
const TABLEAU_Y = 110;
const FOUNDATION_Y = 8;
const WASTE_X = 76;
const STOCK_X = 10;
const FOUNDATION_X = 190;
const OFFSET_Y = 22;
const STOCK_OFFSET = 3;
const CARD_RADIUS = 7;

function shuffle<T>(arr: T[]) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function isRed(card: Card): boolean {
    return card.suit === '♥' || card.suit === '♦';
}

function createDeck(): Card[] {
    const cards: Card[] = [];
    for (const suit of SUITS) {
        for (let v = 1; v <= 13; v++) {
            cards.push({ suit, rank: RANKS[v - 1], value: v, faceUp: false });
        }
    }
    return cards;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function fillRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fillStyle: string | CanvasGradient,
) {
    ctx.fillStyle = fillStyle;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
}

function strokeRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    strokeStyle: string,
    lineWidth = 1,
) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    roundRect(ctx, x, y, w, h, r);
    ctx.stroke();
}

export function useKlondike() {
    const tableau = ref<Card[][]>(Array.from({ length: 7 }, () => []));
    const foundation = ref<Card[][]>(Array.from({ length: 4 }, () => []));
    const stock = ref<Card[]>([]);
    const waste = ref<Card[]>([]);
    const gameStatus = ref<'idle' | 'playing' | 'won'>('idle');
    const selectedPile = ref<PileId | null>(null);
    const selectedIdx = ref(-1);
    const hint = ref('');
    const moves = ref(0);
    const timer = ref(0);

    let timerInterval: ReturnType<typeof setInterval> | null = null;

    const STOCK_LABEL_X = STOCK_X;
    const STOCK_LABEL_Y = STACK_Y;
    const WASTE_LABEL_X = WASTE_X;
    const WASTE_LABEL_Y = STACK_Y;

    function startGame() {
        stopTimer();
        const deck = createDeck();
        shuffle(deck);

        const newTableau: Card[][] = Array.from({ length: 7 }, () => []);
        for (let c = 0; c < 7; c++) {
            for (let r = 0; r <= c; r++) {
                const card = deck.pop()!;
                card.faceUp = r === c;
                newTableau[c].push(card);
            }
        }

        tableau.value = newTableau;
        stock.value = deck;
        waste.value = [];
        foundation.value = Array.from({ length: 4 }, () => []);
        gameStatus.value = 'playing';
        selectedPile.value = null;
        selectedIdx.value = -1;
        hint.value = '';
        moves.value = 0;
        timer.value = 0;
        startTimer();
    }

    function startTimer() {
        stopTimer();
        timerInterval = setInterval(() => {
            timer.value++;
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval !== null) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function getFormattedTime(): string {
        const m = Math.floor(timer.value / 60);
        const s = timer.value % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    function drawStock() {
        if (gameStatus.value !== 'playing') return;
        if (stock.value.length === 0) {
            if (waste.value.length === 0) return;
            stock.value = [...waste.value].reverse();
            for (const c of stock.value) c.faceUp = false;
            waste.value = [];
            clearSelection();
            hint.value = '';
            moves.value++;
            return;
        }
        const card = stock.value.pop()!;
        card.faceUp = true;
        waste.value.push(card);
        clearSelection();
        hint.value = '';
        moves.value++;
    }

    function canAddToFoundation(card: Card, pile: Card[]): boolean {
        if (pile.length === 0) return card.value === 1;
        const top = pile[pile.length - 1];
        return card.suit === top.suit && card.value === top.value + 1;
    }

    function canAddToTableau(card: Card, pile: Card[]): boolean {
        if (pile.length === 0) return card.value === 13;
        const top = pile[pile.length - 1];
        return isRed(card) !== isRed(top) && card.value === top.value - 1;
    }

    function canDragSequence(colIdx: number, fromIdx: number): boolean {
        const col = tableau.value[colIdx];
        if (fromIdx < 0 || fromIdx >= col.length) return false;
        if (!col[fromIdx].faceUp) return false;
        for (let i = fromIdx; i < col.length - 1; i++) {
            if (col[i].value !== col[i + 1].value + 1) return false;
            if (isRed(col[i]) === isRed(col[i + 1])) return false;
        }
        return true;
    }

    function getCard(pileId: PileId, idx: number): Card | null {
        if (pileId.type === 'waste') {
            return idx === waste.value.length - 1 ? waste.value[idx] || null : null;
        }
        if (pileId.type === 'tableau') {
            const col = tableau.value[pileId.index];
            return col[idx] || null;
        }
        if (pileId.type === 'foundation') {
            return foundation.value[pileId.index][idx] || null;
        }
        return null;
    }

    function clearSelection() {
        selectedPile.value = null;
        selectedIdx.value = -1;
    }

    function selectPile(pileId: PileId, idx: number) {
        selectedPile.value = pileId;
        selectedIdx.value = idx;
    }

    function getSelectedCards(): Card[] {
        const pile = selectedPile.value;
        if (!pile) return [];

        if (pile.type === 'waste') {
            const card = getCard(pile, selectedIdx.value);
            return card ? [card] : [];
        }

        if (pile.type === 'foundation') {
            const pileCards = foundation.value[pile.index];
            const topIdx = pileCards.length - 1;
            return selectedIdx.value === topIdx && topIdx >= 0 ? [pileCards[topIdx]] : [];
        }

        return tableau.value[pile.index].slice(selectedIdx.value);
    }

    function revealTopTableauCard(col: Card[]) {
        if (col.length > 0 && !col[col.length - 1].faceUp) {
            col[col.length - 1].faceUp = true;
        }
    }

    function checkWin() {
        if (foundation.value.every(p => p.length === 13)) {
            gameStatus.value = 'won';
            clearSelection();
            stopTimer();
        }
    }

    function findFoundationForCard(card: Card): number {
        for (let f = 0; f < 4; f++) {
            if (canAddToFoundation(card, foundation.value[f])) return f;
        }
        return -1;
    }

    function tryMoveSelectedToFoundation(foundIdx: number): boolean {
        if (!selectedPile.value) return false;
        const cards = getSelectedCards();
        if (cards.length !== 1) return false;
        if (!canAddToFoundation(cards[0], foundation.value[foundIdx])) return false;

        const moved = removeAndAdd(selectedPile.value, selectedIdx.value, { type: 'foundation', index: foundIdx });
        if (moved) {
            clearSelection();
            checkWin();
        }
        return moved;
    }

    function tryMoveSelectedToTableau(colIdx: number): boolean {
        if (!selectedPile.value) return false;
        const cards = getSelectedCards();
        if (cards.length === 0) return false;
        if (!canAddToTableau(cards[0], tableau.value[colIdx])) return false;

        const moved = removeAndAdd(selectedPile.value, selectedIdx.value, { type: 'tableau', index: colIdx });
        if (moved) clearSelection();
        return moved;
    }

    function tryMoveCardToAnyFoundation(pileId: PileId, idx: number): boolean {
        const card = getCard(pileId, idx);
        if (!card) return false;
        const foundIdx = findFoundationForCard(card);
        if (foundIdx < 0) return false;

        selectPile(pileId, idx);
        return tryMoveSelectedToFoundation(foundIdx);
    }

    function handleClick(mx: number, my: number) {
        if (gameStatus.value !== 'playing') return;
        hint.value = '';

        const stockHit = mx >= STOCK_X && mx <= STOCK_X + CARD_W && my >= STACK_Y && my <= STACK_Y + CARD_H;
        if (stockHit) {
            drawStock();
            return;
        }

        if (findWasteClick(mx, my)) {
            const wasteIdx = waste.value.length - 1;
            if (selectedPile.value?.type === 'waste') {
                clearSelection();
            } else {
                selectPile({ type: 'waste' }, wasteIdx);
            }
            return;
        }

        const foundIdx = findFoundationClick(mx, my);
        if (foundIdx >= 0) {
            const pile = foundation.value[foundIdx];
            if (selectedPile.value && selectedPile.value.type !== 'foundation') {
                if (!tryMoveSelectedToFoundation(foundIdx)) {
                    hint.value = '无法收牌';
                    clearSelection();
                }
                return;
            }

            if (pile.length > 0) {
                if (selectedPile.value?.type === 'foundation' && selectedPile.value.index === foundIdx) {
                    clearSelection();
                } else {
                    selectPile({ type: 'foundation', index: foundIdx }, pile.length - 1);
                }
            } else {
                clearSelection();
            }
            return;
        }

        const tblHit = findTableauClick(mx, my);
        if (tblHit) {
            const { col, cardIdx } = tblHit;
            if (selectedPile.value) {
                const sameTableau = selectedPile.value.type === 'tableau' && selectedPile.value.index === col;
                if (!sameTableau && tryMoveSelectedToTableau(col)) return;

                if (!sameTableau && cardIdx < 0) {
                    hint.value = '只有 K 可以移到空列';
                    clearSelection();
                    return;
                }
            }

            if (cardIdx >= 0 && tableau.value[col][cardIdx].faceUp && canDragSequence(col, cardIdx)) {
                const sameSelection =
                    selectedPile.value?.type === 'tableau' &&
                    selectedPile.value.index === col &&
                    selectedIdx.value === cardIdx;
                if (sameSelection) {
                    clearSelection();
                } else {
                    selectPile({ type: 'tableau', index: col }, cardIdx);
                }
            } else {
                clearSelection();
            }
            return;
        }

        clearSelection();
    }

    function handleDoubleClick(mx: number, my: number) {
        if (gameStatus.value !== 'playing') return;
        hint.value = '';

        if (findWasteClick(mx, my)) {
            if (!tryMoveCardToAnyFoundation({ type: 'waste' }, waste.value.length - 1)) {
                hint.value = '暂时不能收这张牌';
            }
            return;
        }

        const tblHit = findTableauClick(mx, my);
        if (tblHit && tblHit.cardIdx >= 0) {
            const col = tableau.value[tblHit.col];
            if (tblHit.cardIdx !== col.length - 1) {
                selectPile({ type: 'tableau', index: tblHit.col }, tblHit.cardIdx);
                return;
            }
            if (!tryMoveCardToAnyFoundation({ type: 'tableau', index: tblHit.col }, tblHit.cardIdx)) {
                hint.value = '暂时不能收这张牌';
            }
        }
    }

    function autoMoveAll() {
        if (gameStatus.value !== 'playing') return;
        let movedAny = false;
        let movedThisPass = true;

        while (movedThisPass && gameStatus.value === 'playing') {
            movedThisPass = false;

            if (waste.value.length > 0 && tryMoveCardToAnyFoundation({ type: 'waste' }, waste.value.length - 1)) {
                movedAny = true;
                movedThisPass = true;
                continue;
            }

            for (let c = 0; c < 7; c++) {
                const col = tableau.value[c];
                if (col.length === 0) continue;

                if (tryMoveCardToAnyFoundation({ type: 'tableau', index: c }, col.length - 1)) {
                    movedAny = true;
                    movedThisPass = true;
                    break;
                }
            }
        }

        if (movedAny) {
            hint.value = '';
            checkWin();
        } else {
            hint.value = '没有可自动收的牌';
            clearSelection();
        }
    }

    function removeAndAdd(src: PileId, srcIdx: number, dst: PileId): boolean {
        const cards = getSelectedCards();
        if (cards.length === 0) return false;
        if (dst.type === 'foundation' && cards.length !== 1) return false;

        let movedCards: Card[] = [];
        if (src.type === 'tableau') {
            const col = tableau.value[src.index];
            if (srcIdx < 0 || srcIdx >= col.length) return false;
            movedCards = col.splice(srcIdx);
            revealTopTableauCard(col);
        } else if (src.type === 'foundation') {
            const pile = foundation.value[src.index];
            if (srcIdx !== pile.length - 1) return false;
            movedCards = [pile.pop()!].filter(Boolean);
        } else if (src.type === 'waste') {
            if (srcIdx !== waste.value.length - 1) return false;
            movedCards = [waste.value.pop()!].filter(Boolean);
        }

        if (movedCards.length === 0) return false;

        if (dst.type === 'foundation') {
            foundation.value[dst.index].push(...movedCards);
            moves.value++;
            return true;
        }
        if (dst.type === 'tableau') {
            tableau.value[dst.index].push(...movedCards);
            moves.value++;
            return true;
        }
        return false;
    }

    function findFoundationClick(mx: number, my: number): number {
        for (let f = 0; f < 4; f++) {
            const x = FOUNDATION_X + f * (CARD_W + 8);
            if (mx >= x && mx <= x + CARD_W && my >= FOUNDATION_Y && my <= FOUNDATION_Y + CARD_H) {
                return f;
            }
        }
        return -1;
    }

    function findTableauClick(mx: number, my: number): { col: number; cardIdx: number } | null {
        for (let c = 6; c >= 0; c--) {
            const col = tableau.value[c];
            const x = TABLEAU_X + c * (CARD_W + 6);
            if (mx < x || mx > x + CARD_W) continue;

            if (col.length === 0) {
                if (my >= TABLEAU_Y && my <= TABLEAU_Y + CARD_H) {
                    return { col: c, cardIdx: -1 };
                }
                continue;
            }

            for (let i = col.length - 1; i >= 0; i--) {
                let y: number;
                if (i === col.length - 1) {
                    y = TABLEAU_Y + (col.length - 1) * OFFSET_Y;
                } else {
                    y = TABLEAU_Y + i * OFFSET_Y;
                }
                const h = i === col.length - 1 ? CARD_H : OFFSET_Y;
                if (my >= y && my <= y + h && col[i].faceUp) {
                    return { col: c, cardIdx: i };
                }
            }

            if (col.length > 0 && !col[0].faceUp) {
                const y = TABLEAU_Y;
                if (my >= y && my <= y + CARD_H) {
                    return { col: c, cardIdx: col.length - 1 };
                }
            }
        }
        return null;
    }

    function findWasteClick(mx: number, my: number): boolean {
        return (
            waste.value.length > 0 && mx >= WASTE_X && mx <= WASTE_X + CARD_W && my >= STACK_Y && my <= STACK_Y + CARD_H
        );
    }

    function draw(ctx: CanvasRenderingContext2D) {
        const canvasW = 610;
        const canvasH = TABLEAU_Y + 13 * OFFSET_Y + CARD_H + 10;

        ctx.clearRect(0, 0, canvasW, canvasH);

        const gradient = ctx.createLinearGradient(0, 0, 0, canvasH);
        gradient.addColorStop(0, '#0f5f46');
        gradient.addColorStop(0.54, '#0b513d');
        gradient.addColorStop(1, '#08372d');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvasW, canvasH);

        ctx.fillStyle = 'rgba(255,255,255,0.035)';
        for (let y = -canvasH; y < canvasH; y += 18) {
            ctx.fillRect(0, y, canvasW, 1);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        strokeRoundedRect(ctx, 5, 5, canvasW - 10, canvasH - 10, 12, 'rgba(255,255,255,0.11)', 1);

        renderStock(ctx);

        for (let f = 0; f < 4; f++) {
            const x = FOUNDATION_X + f * (CARD_W + 8);
            const pile = foundation.value[f];
            if (pile.length === 0) {
                drawSlot(ctx, x, FOUNDATION_Y);
                const suitLabels = ['♠', '♥', '♣', '♦'];
                ctx.fillStyle =
                    suitLabels[f] === '♥' || suitLabels[f] === '♦' ? 'rgba(248,113,113,0.7)' : 'rgba(15,23,42,0.55)';
                ctx.font = '26px Georgia, serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(suitLabels[f], x + CARD_W / 2, FOUNDATION_Y + CARD_H / 2);
            } else {
                const isSelected = selectedPile.value?.type === 'foundation' && selectedPile.value.index === f;
                drawCard(ctx, pile[pile.length - 1], x, FOUNDATION_Y, isSelected);
            }
        }

        for (let c = 0; c < 7; c++) {
            const col = tableau.value[c];
            const x = TABLEAU_X + c * (CARD_W + 6);
            if (col.length === 0) {
                drawSlot(ctx, x, TABLEAU_Y);
                continue;
            }
            for (let i = 0; i < col.length; i++) {
                const card = col[i];
                const y = TABLEAU_Y + i * OFFSET_Y;
                const isSelected =
                    !!selectedPile.value &&
                    selectedPile.value.type === 'tableau' &&
                    selectedPile.value.index === c &&
                    i >= selectedIdx.value;
                drawCard(ctx, card, x, y, isSelected);
            }
        }

        if (hint.value) {
            fillRoundedRect(ctx, canvasW / 2 - 88, canvasH - 24, 176, 18, 9, 'rgba(127,29,29,0.72)');
            ctx.fillStyle = '#fecaca';
            ctx.font = '12px "Microsoft YaHei", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(hint.value, canvasW / 2, canvasH - 15);
        }

        if (gameStatus.value === 'won') {
            ctx.fillStyle = 'rgba(3,7,18,0.64)';
            ctx.fillRect(0, 0, canvasW, canvasH);
            fillRoundedRect(ctx, canvasW / 2 - 146, canvasH / 2 - 64, 292, 128, 10, 'rgba(15,23,42,0.86)');
            strokeRoundedRect(ctx, canvasW / 2 - 146, canvasH / 2 - 64, 292, 128, 10, 'rgba(250,204,21,0.52)', 1.5);
            ctx.fillStyle = '#fde68a';
            ctx.font = 'bold 34px "Microsoft YaHei", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('恭喜通关！', canvasW / 2, canvasH / 2 - 22);
            ctx.fillStyle = '#e2e8f0';
            ctx.font = '17px "Microsoft YaHei", sans-serif';
            ctx.fillText(`步数 ${moves.value}  ·  用时 ${getFormattedTime()}`, canvasW / 2, canvasH / 2 + 24);
        }

        if (gameStatus.value === 'idle') {
            ctx.fillStyle = 'rgba(3,7,18,0.42)';
            ctx.fillRect(0, 0, canvasW, canvasH);
            fillRoundedRect(ctx, canvasW / 2 - 154, canvasH / 2 - 72, 308, 144, 10, 'rgba(8,47,73,0.56)');
            strokeRoundedRect(ctx, canvasW / 2 - 154, canvasH / 2 - 72, 308, 144, 10, 'rgba(125,211,252,0.3)', 1);
            ctx.fillStyle = '#f8fafc';
            ctx.font = 'bold 25px "Microsoft YaHei", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('经典接龙', canvasW / 2, canvasH / 2 - 36);
            ctx.font = '14px "Microsoft YaHei", sans-serif';
            ctx.fillStyle = '#bae6fd';
            ctx.fillText('准备发牌', canvasW / 2, canvasH / 2 + 2);
            ctx.fillStyle = '#cbd5e1';
            ctx.fillText('A  →  K', canvasW / 2, canvasH / 2 + 30);
        }
    }

    function drawSlot(ctx: CanvasRenderingContext2D, x: number, y: number) {
        fillRoundedRect(ctx, x, y, CARD_W, CARD_H, CARD_RADIUS, 'rgba(6,78,59,0.34)');
        strokeRoundedRect(ctx, x + 0.5, y + 0.5, CARD_W - 1, CARD_H - 1, CARD_RADIUS, 'rgba(255,255,255,0.2)', 1);
        strokeRoundedRect(ctx, x + 7, y + 7, CARD_W - 14, CARD_H - 14, 5, 'rgba(255,255,255,0.09)', 1);
    }

    function drawCard(ctx: CanvasRenderingContext2D, card: Card, x: number, y: number, selected: boolean) {
        ctx.save();
        ctx.shadowColor = selected ? 'rgba(250,204,21,0.48)' : 'rgba(2,6,23,0.32)';
        ctx.shadowBlur = selected ? 14 : 6;
        ctx.shadowOffsetY = selected ? 0 : 3;

        if (!card.faceUp) {
            const back = ctx.createLinearGradient(x, y, x + CARD_W, y + CARD_H);
            back.addColorStop(0, '#0f766e');
            back.addColorStop(0.48, '#0e7490');
            back.addColorStop(1, '#1d4ed8');
            fillRoundedRect(ctx, x, y, CARD_W, CARD_H, CARD_RADIUS, back);
            ctx.shadowColor = 'transparent';
            strokeRoundedRect(ctx, x + 0.5, y + 0.5, CARD_W - 1, CARD_H - 1, CARD_RADIUS, 'rgba(255,255,255,0.55)', 1);
            strokeRoundedRect(ctx, x + 6, y + 6, CARD_W - 12, CARD_H - 12, 5, 'rgba(255,255,255,0.28)', 1);
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.font = '22px Georgia, serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('♠', x + CARD_W / 2, y + CARD_H / 2);
            ctx.restore();
            return;
        }

        const front = ctx.createLinearGradient(x, y, x, y + CARD_H);
        front.addColorStop(0, '#ffffff');
        front.addColorStop(1, '#eef2f7');
        fillRoundedRect(ctx, x, y, CARD_W, CARD_H, CARD_RADIUS, front);
        ctx.shadowColor = 'transparent';
        strokeRoundedRect(
            ctx,
            x + 0.5,
            y + 0.5,
            CARD_W - 1,
            CARD_H - 1,
            CARD_RADIUS,
            selected ? '#facc15' : 'rgba(15,23,42,0.22)',
            selected ? 2.5 : 1,
        );
        if (selected) {
            strokeRoundedRect(ctx, x + 4, y + 4, CARD_W - 8, CARD_H - 8, 5, 'rgba(250,204,21,0.38)', 1);
        }

        const color = SUIT_COLORS[card.suit] || '#000';
        ctx.fillStyle = color;
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(card.rank, x + 5, y + 5);
        ctx.font = '13px Georgia, serif';
        ctx.fillText(card.suit, x + 5, y + 21);

        ctx.font = '28px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(card.suit, x + CARD_W / 2, y + CARD_H / 2);

        ctx.save();
        ctx.translate(x + CARD_W - 5, y + CARD_H - 5);
        ctx.rotate(Math.PI);
        ctx.font = 'bold 13px Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(card.rank, 0, 0);
        ctx.restore();
        ctx.restore();
    }

    function renderStock(ctx: CanvasRenderingContext2D) {
        const sx = STOCK_X;
        const sy = STACK_Y;

        if (stock.value.length === 0 && waste.value.length === 0) {
            drawSlot(ctx, sx, sy);
            return;
        }

        if (stock.value.length > 0) {
            for (let i = 0; i < Math.min(stock.value.length, 3); i++) {
                const x = sx + i * 1.5;
                const y = sy - i * 1.5;
                const back = ctx.createLinearGradient(x, y, x + CARD_W, y + CARD_H);
                back.addColorStop(0, '#0f766e');
                back.addColorStop(0.48, '#0e7490');
                back.addColorStop(1, '#1d4ed8');
                fillRoundedRect(ctx, x, y, CARD_W, CARD_H, CARD_RADIUS, back);
                strokeRoundedRect(
                    ctx,
                    x + 0.5,
                    y + 0.5,
                    CARD_W - 1,
                    CARD_H - 1,
                    CARD_RADIUS,
                    'rgba(255,255,255,0.5)',
                    1,
                );
            }
        }

        if (waste.value.length > 0) {
            const wx = WASTE_X;
            const wy = STACK_Y;
            const showCount = Math.min(waste.value.length, 3);
            for (let i = 0; i < showCount; i++) {
                const card = waste.value[waste.value.length - showCount + i];
                if (card) {
                    const cardIdx = waste.value.length - showCount + i;
                    const isSelected = selectedPile.value?.type === 'waste' && cardIdx === waste.value.length - 1;
                    drawCard(ctx, card, wx + i * 1.5, wy - i * 1.5, isSelected);
                }
            }
        }

        if (stock.value.length > 0) {
            fillRoundedRect(ctx, sx + 18, sy + 31, 24, 20, 10, 'rgba(2,6,23,0.42)');
            ctx.fillStyle = '#e0f2fe';
            ctx.font = 'bold 11px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${stock.value.length}`, sx + CARD_W / 2, sy + CARD_H / 2);
        }
    }

    function getWidth() {
        return 610;
    }
    function getHeight() {
        return TABLEAU_Y + 13 * OFFSET_Y + CARD_H + 10;
    }

    onUnmounted(() => {
        stopTimer();
    });

    return {
        tableau,
        foundation,
        stock,
        waste,
        gameStatus,
        moves,
        timer,
        selectedPile,
        selectedIdx,
        hint,
        startGame,
        handleClick,
        handleDoubleClick,
        drawStock,
        draw,
        getWidth,
        getHeight,
        autoMoveAll,
        getFormattedTime,
    };
}
