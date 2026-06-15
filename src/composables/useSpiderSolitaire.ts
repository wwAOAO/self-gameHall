import { computed, ref, onUnmounted } from 'vue';

const SUITS = ['♠', '♥', '♣', '♦'];
const SUIT_COLORS: Record<string, string> = {
    '♠': '#1a1a2e',
    '♥': '#ef4444',
    '♣': '#1a1a2e',
    '♦': '#ef4444',
};
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_SYMBOLS = ['♠', '♥', '♣', '♦'];

interface Card {
    suit: string;
    rank: string;
    value: number;
    faceUp: boolean;
}

const CARD_W = 58;
const CARD_H = 80;
const STACK_OFFSET_Y = 22;
const STACK_OFFSET_X = CARD_W + 8;
const STOCK_X = 18;
const STOCK_Y = 16;
const TABLEAU_X = 18;
const TABLEAU_Y = 112;
const CARD_RADIUS = 7;

export function useSpiderSolitaire() {
    const tableau = ref<Card[][]>(Array.from({ length: 10 }, () => []));
    const stock = ref<Card[]>([]);
    const completed = ref(0);
    const moves = ref(0);
    const timer = ref(0);
    const selectedCol = ref(-1);
    const selectedIdx = ref(-1);
    const gameStatus = ref<'idle' | 'playing' | 'won'>('idle');
    const hint = ref('');
    const remainingDeals = computed(() => Math.floor(stock.value.length / 10));
    const canDealStock = computed(() => {
        return gameStatus.value === 'playing' && stock.value.length >= 10 && tableau.value.every(col => col.length > 0);
    });

    let timerInterval: ReturnType<typeof setInterval> | null = null;

    let canvasWidth = TABLEAU_X * 2 + STACK_OFFSET_X * 9 + CARD_W;
    let canvasHeight = TABLEAU_Y + STACK_OFFSET_Y * 14 + CARD_H;

    function createDeck(): Card[] {
        const cards: Card[] = [];
        for (let s = 0; s < 8; s++) {
            const suit = SUITS[s % 4];
            for (let r = 0; r < 13; r++) {
                cards.push({ suit, rank: RANKS[r], value: r + 1, faceUp: false });
            }
        }
        return cards;
    }

    function shuffle(arr: Card[]) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    function startGame() {
        stopTimer();
        const deck = createDeck();
        shuffle(deck);

        const newTableau: Card[][] = Array.from({ length: 10 }, () => []);
        for (let c = 0; c < 10; c++) {
            const count = c < 4 ? 6 : 5;
            for (let r = 0; r < count; r++) {
                const card = deck.pop()!;
                card.faceUp = r === count - 1;
                newTableau[c].push(card);
            }
        }

        const newStock: Card[] = [];
        const stockPiles = 5;
        for (let p = 0; p < stockPiles; p++) {
            for (let c = 0; c < 10; c++) {
                newStock.push(deck.pop()!);
            }
        }

        tableau.value = newTableau;
        stock.value = newStock;
        completed.value = 0;
        moves.value = 0;
        timer.value = 0;
        selectedCol.value = -1;
        selectedIdx.value = -1;
        gameStatus.value = 'playing';
        hint.value = '';
        startTimer();
        updateCanvasSize();
        checkCompletedRuns();
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
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function clearSelection() {
        selectedCol.value = -1;
        selectedIdx.value = -1;
    }

    function revealTopCard(col: Card[]) {
        if (col.length > 0 && !col[col.length - 1].faceUp) {
            col[col.length - 1].faceUp = true;
        }
    }

    function updateCanvasSize() {
        const longest = Math.max(14, ...tableau.value.map(col => col.length));
        canvasWidth = TABLEAU_X * 2 + STACK_OFFSET_X * 9 + CARD_W;
        canvasHeight = TABLEAU_Y + STACK_OFFSET_Y * Math.max(0, longest - 1) + CARD_H + 26;
    }

    function canMoveSequence(colIdx: number, fromIdx: number): boolean {
        const col = tableau.value[colIdx];
        if (fromIdx < 0 || fromIdx >= col.length) return false;
        if (!col[fromIdx].faceUp) return false;

        for (let i = fromIdx; i < col.length - 1; i++) {
            if (col[i].value !== col[i + 1].value + 1 || col[i].suit !== col[i + 1].suit) {
                return false;
            }
        }
        return true;
    }

    function isCompleteRun(cards: Card[]): boolean {
        if (cards.length !== 13) return false;
        if (cards[0].value !== 13 || cards[12].value !== 1) return false;

        for (let i = 0; i < cards.length - 1; i++) {
            if (!cards[i].faceUp || !cards[i + 1].faceUp) return false;
            if (cards[i].suit !== cards[i + 1].suit) return false;
            if (cards[i].value !== cards[i + 1].value + 1) return false;
        }

        return true;
    }

    function removeComplete(colIdx: number): boolean {
        const col = tableau.value[colIdx];
        const len = col.length;
        if (len < 13) return false;

        const start = len - 13;
        if (!isCompleteRun(col.slice(start))) return false;

        col.splice(start, 13);
        completed.value++;
        revealTopCard(col);
        updateCanvasSize();

        if (completed.value === 8) {
            gameStatus.value = 'won';
            stopTimer();
        }

        return true;
    }

    function checkCompletedRuns() {
        let removed = true;
        while (removed) {
            removed = false;
            for (let c = 0; c < tableau.value.length; c++) {
                if (removeComplete(c)) removed = true;
            }
        }
    }

    function canPlaceOnTableau(card: Card, dstCol: Card[]): boolean {
        if (dstCol.length === 0) return true;
        const topDst = dstCol[dstCol.length - 1];
        return topDst.faceUp && card.value === topDst.value - 1;
    }

    function selectSequence(colIdx: number, cardIdx: number): boolean {
        if (colIdx < 0 || cardIdx < 0) return false;
        if (!canMoveSequence(colIdx, cardIdx)) return false;
        selectedCol.value = colIdx;
        selectedIdx.value = cardIdx;
        return true;
    }

    function handleClick(colIdx: number, cardIdx: number) {
        if (gameStatus.value !== 'playing') return;
        hint.value = '';

        if (selectedCol.value === -1) {
            if (!selectSequence(colIdx, cardIdx)) {
                hint.value = cardIdx >= 0 ? '只能移动同花连续降序的牌组' : '';
            }
            return;
        }

        if (selectedCol.value === colIdx) {
            selectedCol.value = -1;
            selectedIdx.value = -1;
            return;
        }

        const srcCol = tableau.value[selectedCol.value];
        const dstCol = tableau.value[colIdx];
        const moving = srcCol.slice(selectedIdx.value);

        if (moving.length > 0 && canPlaceOnTableau(moving[0], dstCol)) {
            dstCol.push(...moving);
            srcCol.length = selectedIdx.value;
            revealTopCard(srcCol);
            moves.value++;
            clearSelection();
            checkCompletedRuns();
            updateCanvasSize();
        } else {
            const changedSelection = selectSequence(colIdx, cardIdx);
            if (!changedSelection) clearSelection();
            hint.value = changedSelection ? '' : '无法移动到该位置';
        }
    }

    function dealStock() {
        if (gameStatus.value !== 'playing') return;
        if (stock.value.length < 10) return;
        if (tableau.value.some(col => col.length === 0)) {
            hint.value = '发牌前每一列都必须有牌';
            return;
        }

        for (let c = 0; c < 10; c++) {
            const card = stock.value.pop()!;
            card.faceUp = true;
            tableau.value[c].push(card);
        }

        moves.value++;
        clearSelection();
        hint.value = '';
        checkCompletedRuns();
        updateCanvasSize();
    }

    function isSelected(colIdx: number, cardIdx: number): boolean {
        return selectedCol.value === colIdx && selectedIdx.value === cardIdx;
    }

    function findClickTarget(mx: number, my: number): { col: number; card: number } | null {
        for (let c = 0; c < 10; c++) {
            const col = tableau.value[c];
            if (col.length === 0) {
                const x = TABLEAU_X + c * STACK_OFFSET_X;
                const y = TABLEAU_Y;
                if (mx >= x && mx <= x + CARD_W && my >= y && my <= y + CARD_H) {
                    return { col: c, card: -1 };
                }
                continue;
            }
            for (let i = col.length - 1; i >= 0; i--) {
                const x = TABLEAU_X + c * STACK_OFFSET_X;
                let y: number;
                if (i === col.length - 1) {
                    y = TABLEAU_Y + (col.length - 1) * STACK_OFFSET_Y;
                } else {
                    y = TABLEAU_Y + i * STACK_OFFSET_Y;
                }
                const h = i === col.length - 1 ? CARD_H : STACK_OFFSET_Y + (CARD_H - STACK_OFFSET_Y) * 0.3;
                if (mx >= x && mx <= x + CARD_W && my >= y && my <= y + h) {
                    return { col: c, card: i };
                }
            }
        }
        return null;
    }

    function findStockClick(mx: number, my: number): boolean {
        return mx >= STOCK_X && mx <= STOCK_X + CARD_W && my >= STOCK_Y && my <= STOCK_Y + CARD_H;
    }

    function draw(ctx: CanvasRenderingContext2D) {
        updateCanvasSize();

        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        drawTableBackground(ctx);
        drawTopRail(ctx);

        for (let c = 0; c < 10; c++) {
            const col = tableau.value[c];
            if (col.length === 0) {
                const x = TABLEAU_X + c * STACK_OFFSET_X;
                drawEmptySlot(ctx, x, TABLEAU_Y, '空');
                continue;
            }
            for (let i = 0; i < col.length; i++) {
                const card = col[i];
                const x = TABLEAU_X + c * STACK_OFFSET_X;
                const y = TABLEAU_Y + i * STACK_OFFSET_Y;
                drawCard(ctx, card, x, y, isSelected(c, i));
            }
        }

        if (hint.value) {
            const labelWidth = Math.min(canvasWidth - 48, Math.max(160, hint.value.length * 13 + 36));
            const labelX = (canvasWidth - labelWidth) / 2;
            const labelY = canvasHeight - 34;
            roundedRect(ctx, labelX, labelY, labelWidth, 24, 8);
            ctx.fillStyle = 'rgba(127, 29, 29, 0.88)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(252, 165, 165, 0.45)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#fee2e2';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(hint.value, canvasWidth / 2, labelY + 12);
        }

        if (gameStatus.value === 'won') {
            ctx.fillStyle = 'rgba(2, 6, 23, 0.64)';
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            roundedRect(ctx, canvasWidth / 2 - 172, canvasHeight / 2 - 62, 344, 124, 8);
            const winGradient = ctx.createLinearGradient(0, canvasHeight / 2 - 62, 0, canvasHeight / 2 + 62);
            winGradient.addColorStop(0, 'rgba(15, 118, 110, 0.96)');
            winGradient.addColorStop(1, 'rgba(15, 23, 42, 0.96)');
            ctx.fillStyle = winGradient;
            ctx.fill();
            ctx.strokeStyle = 'rgba(253, 224, 71, 0.42)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = '#fde68a';
            ctx.font = 'bold 32px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('恭喜通关！', canvasWidth / 2, canvasHeight / 2 - 22);
            ctx.fillStyle = '#f8fafc';
            ctx.font = '15px sans-serif';
            ctx.fillText(
                `全部 8 副牌已收齐  步数: ${moves.value}  用时: ${getFormattedTime()}`,
                canvasWidth / 2,
                canvasHeight / 2 + 24,
            );
        }

        if (gameStatus.value === 'idle') {
            ctx.fillStyle = 'rgba(2, 6, 23, 0.5)';
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            roundedRect(ctx, canvasWidth / 2 - 188, canvasHeight / 2 - 74, 376, 148, 8);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(45, 212, 191, 0.36)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = '#f8fafc';
            ctx.font = 'bold 28px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('蜘蛛纸牌', canvasWidth / 2, canvasHeight / 2 - 38);
            ctx.font = '14px sans-serif';
            ctx.fillStyle = '#cbd5e1';
            ctx.fillText('点击牌列移动同花连续牌组，空列可放任意牌组', canvasWidth / 2, canvasHeight / 2 + 4);
            ctx.fillText('普通叠放只需降序，K 到 A 同花顺自动收走', canvasWidth / 2, canvasHeight / 2 + 30);
        }
    }

    function drawTableBackground(ctx: CanvasRenderingContext2D) {
        const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
        gradient.addColorStop(0, '#0f3f35');
        gradient.addColorStop(0.48, '#145341');
        gradient.addColorStop(1, '#0c352f');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        for (let x = -canvasHeight; x < canvasWidth; x += 28) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + canvasHeight, canvasHeight);
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(255,255,255,0.025)';
            ctx.stroke();
        }

        const vignette = ctx.createRadialGradient(
            canvasWidth / 2,
            canvasHeight / 2,
            90,
            canvasWidth / 2,
            canvasHeight / 2,
            canvasWidth * 0.72,
        );
        vignette.addColorStop(0, 'rgba(255,255,255,0.04)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.28)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    function drawTopRail(ctx: CanvasRenderingContext2D) {
        roundedRect(ctx, 10, 8, canvasWidth - 20, 90, 8);
        const rail = ctx.createLinearGradient(0, 8, 0, 98);
        rail.addColorStop(0, 'rgba(15, 23, 42, 0.54)');
        rail.addColorStop(1, 'rgba(15, 23, 42, 0.2)');
        ctx.fillStyle = rail;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();

        drawStock(ctx, stock.value.length);

        for (let i = 0; i < 8; i++) {
            const x = canvasWidth - 18 - CARD_W - i * 17;
            const y = STOCK_Y;
            if (i < completed.value) {
                drawFoundationStack(ctx, x, y, i);
            } else {
                drawEmptySlot(ctx, x, y, '');
            }
        }

        ctx.fillStyle = 'rgba(248,250,252,0.92)';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`已完成 ${completed.value}/8`, canvasWidth / 2, 24);

        ctx.fillStyle = 'rgba(203,213,225,0.82)';
        ctx.font = '12px sans-serif';
        ctx.fillText(
            `步数 ${moves.value}  ·  用时 ${getFormattedTime()}  ·  发牌 ${remainingDeals.value}`,
            canvasWidth / 2,
            45,
        );
    }

    function drawCard(ctx: CanvasRenderingContext2D, card: Card, x: number, y: number, selected: boolean) {
        const w = CARD_W;
        const h = CARD_H;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.32)';
        ctx.shadowBlur = selected ? 14 : 7;
        ctx.shadowOffsetY = selected ? 5 : 3;

        if (!card.faceUp) {
            roundedRect(ctx, x, y, w, h, CARD_RADIUS);
            const back = ctx.createLinearGradient(x, y, x + w, y + h);
            back.addColorStop(0, '#1e3a8a');
            back.addColorStop(0.52, '#172554');
            back.addColorStop(1, '#0f172a');
            ctx.fillStyle = back;
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.strokeStyle = 'rgba(191, 219, 254, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            roundedRect(ctx, x + 6, y + 6, w - 12, h - 12, 5);
            ctx.strokeStyle = 'rgba(255,255,255,0.16)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.font = '20px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('♠', x + w / 2, y + h / 2);
            ctx.restore();
            return;
        }

        roundedRect(ctx, x, y, w, h, CARD_RADIUS);
        const face = ctx.createLinearGradient(x, y, x, y + h);
        face.addColorStop(0, '#ffffff');
        face.addColorStop(1, '#e9eef5');
        ctx.fillStyle = face;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = selected ? '#facc15' : 'rgba(30, 41, 59, 0.36)';
        ctx.lineWidth = selected ? 2.5 : 1;
        ctx.stroke();

        roundedRect(ctx, x + 3, y + 3, w - 6, h - 6, 5);
        ctx.strokeStyle = selected ? 'rgba(250, 204, 21, 0.55)' : 'rgba(148, 163, 184, 0.18)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = SUIT_COLORS[card.suit];
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(card.rank, x + 6, y + 5);
        ctx.font = '12px serif';
        ctx.fillText(card.suit, x + 7, y + 20);

        ctx.font = '28px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(card.suit, x + w / 2, y + h / 2);

        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(card.rank, x + w - 6, y + h - 20);
        ctx.font = '10px serif';
        ctx.fillText(card.suit, x + w - 7, y + h - 6);
        ctx.restore();
    }

    function drawStock(ctx: CanvasRenderingContext2D, count: number) {
        const x = STOCK_X;
        const y = STOCK_Y;

        if (count === 0) {
            drawEmptySlot(ctx, x, y, '发牌');
            return;
        }

        for (let i = 0; i < Math.min(count, 3); i++) {
            drawCardBack(ctx, x + i * 2.5, y - i * 2.5);
        }

        roundedRect(ctx, x + 14, y + CARD_H / 2 - 12, CARD_W - 28, 24, 8);
        ctx.fillStyle = 'rgba(15,23,42,0.72)';
        ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${count}`, x + CARD_W / 2 + 2, y + CARD_H / 2);

        if (!canDealStock.value) {
            ctx.fillStyle = 'rgba(0,0,0,0.38)';
            roundedRect(ctx, x, y, CARD_W, CARD_H, CARD_RADIUS);
            ctx.fill();
        }
    }

    function drawCardBack(ctx: CanvasRenderingContext2D, x: number, y: number) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.28)';
        ctx.shadowBlur = 7;
        ctx.shadowOffsetY = 3;
        roundedRect(ctx, x, y, CARD_W, CARD_H, CARD_RADIUS);
        const back = ctx.createLinearGradient(x, y, x + CARD_W, y + CARD_H);
        back.addColorStop(0, '#2563eb');
        back.addColorStop(0.52, '#1e3a8a');
        back.addColorStop(1, '#172554');
        ctx.fillStyle = back;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = 'rgba(191,219,254,0.42)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        roundedRect(ctx, x + 6, y + 6, CARD_W - 12, CARD_H - 12, 5);
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.font = '20px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('♠', x + CARD_W / 2, y + CARD_H / 2);
        ctx.restore();
    }

    function drawEmptySlot(ctx: CanvasRenderingContext2D, x: number, y: number, label: string) {
        ctx.save();
        roundedRect(ctx, x, y, CARD_W, CARD_H, CARD_RADIUS);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.18)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        if (label) {
            ctx.fillStyle = 'rgba(226,232,240,0.42)';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x + CARD_W / 2, y + CARD_H / 2);
        }
        ctx.restore();
    }

    function drawFoundationStack(ctx: CanvasRenderingContext2D, x: number, y: number, index: number) {
        ctx.save();
        roundedRect(ctx, x, y, CARD_W, CARD_H, CARD_RADIUS);
        const fill = ctx.createLinearGradient(x, y, x, y + CARD_H);
        fill.addColorStop(0, '#fef3c7');
        fill.addColorStop(1, '#f8fafc');
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = 'rgba(180, 83, 9, 0.36)';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        const suit = SUIT_SYMBOLS[index % SUIT_SYMBOLS.length];
        ctx.fillStyle = suit === '♥' || suit === '♦' ? '#dc2626' : '#0f172a';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('K-A', x + 6, y + 6);
        ctx.font = '26px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(suit, x + CARD_W / 2, y + CARD_H / 2 + 4);
        ctx.restore();
    }

    function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
        const r = Math.min(radius, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function getWidth() {
        return canvasWidth;
    }
    function getHeight() {
        return canvasHeight;
    }

    onUnmounted(() => {
        stopTimer();
    });

    return {
        tableau,
        stock,
        completed,
        moves,
        timer,
        remainingDeals,
        canDealStock,
        gameStatus,
        startGame,
        handleClick,
        dealStock,
        findClickTarget,
        findStockClick,
        getFormattedTime,
        draw,
        getWidth,
        getHeight,
    };
}
