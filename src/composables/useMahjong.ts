import { ref, onUnmounted } from 'vue';

const WIND_CHARS = ['东', '南', '西', '北'];
const NUM_CHARS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
let playerWindOffset = 0;
type TileSuit = 'wan' | 'tong' | 'suo' | 'feng' | 'jian';
const TILE_SUITS: TileSuit[] = ['wan', 'tong', 'suo', 'feng', 'jian'];
const NUMBER_SUITS: TileSuit[] = ['wan', 'tong', 'suo'];
const SUIT_BASE: Record<TileSuit, number> = { wan: 0, tong: 9, suo: 18, feng: 27, jian: 31 };

function getWindLabel(seat: number): string {
    const offsets: Record<number, number> = {
        1: playerWindOffset,
        2: (playerWindOffset + 1) % 4,
        3: (playerWindOffset + 2) % 4,
        0: (playerWindOffset + 3) % 4,
    };
    const windIdx = offsets[seat];
    if (seat === 1) return WIND_CHARS[windIdx] + '(你)';
    return WIND_CHARS[windIdx] + '(AI)';
}

interface Tile {
    id: number;
    suit: TileSuit;
    value: number;
    name: string;
}

interface PlayerData {
    hand: Tile[];
    melds: { type: 'chi' | 'peng' | 'minggang' | 'angang'; tiles: Tile[] }[];
    discarded: Tile[];
}

type GameStatus = 'idle' | 'dealing' | 'playing' | 'won' | 'draw';
type PendingActionMode = 'claim' | 'self';

const ACTION_CHI = '\u5403';
const ACTION_PENG = '\u78b0';
const ACTION_GANG = '\u6760';
const ACTION_WIN = '\u80e1';
const ACTION_PASS = '\u8fc7';

const SELF_TILE_WIDTH = 26;
const SELF_TILE_HEIGHT = 40;
const SELF_TILE_GAP = 28;
const SELF_HAND_Y = 538;
const DISCARD_TILE_WIDTH = 20;
const DISCARD_TILE_HEIGHT = 28;
const DISCARD_GAP_X = 24;
const DISCARD_GAP_Y = 30;
const SIDE_DISCARD_GAP_Y = 24;
const ACTION_BUTTON_Y = 468;
const ACTION_BUTTON_WIDTH = 64;
const ACTION_BUTTON_HEIGHT = 28;
const ACTION_BUTTON_GAP = 10;
const WALL_TILE_WIDTH = 12;
const WALL_TILE_HEIGHT = 9;
const WALL_TILE_GAP = 2;
const WALL_ROW_CAP = 10;
const WALL_SIDE_CAP = 6;

const TILE_NAMES: Record<string, string[]> = {
    wan: ['一万', '二万', '三万', '四万', '五万', '六万', '七万', '八万', '九万'],
    tong: ['一筒', '二筒', '三筒', '四筒', '五筒', '六筒', '七筒', '八筒', '九筒'],
    suo: ['一索', '二索', '三索', '四索', '五索', '六索', '七索', '八索', '九索'],
    feng: ['东风', '南风', '西风', '北风'],
    jian: ['中', '发', '白'],
};

let tileIdCounter = 0;

function createDeck(): Tile[] {
    tileIdCounter = 0;
    const deck: Tile[] = [];
    for (const suit of ['wan', 'tong', 'suo'] as const) {
        for (let v = 1; v <= 9; v++) {
            for (let i = 0; i < 4; i++) {
                deck.push({ id: tileIdCounter++, suit, value: v, name: TILE_NAMES[suit][v - 1] });
            }
        }
    }
    for (const suit of ['feng'] as const) {
        for (let v = 1; v <= 4; v++) {
            for (let i = 0; i < 4; i++) {
                deck.push({ id: tileIdCounter++, suit, value: v, name: TILE_NAMES[suit][v - 1] });
            }
        }
    }
    for (const suit of ['jian'] as const) {
        for (let v = 1; v <= 3; v++) {
            for (let i = 0; i < 4; i++) {
                deck.push({ id: tileIdCounter++, suit, value: v, name: TILE_NAMES[suit][v - 1] });
            }
        }
    }
    return deck;
}

function shuffle(arr: Tile[]): Tile[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function sortHand(hand: Tile[]): Tile[] {
    const suitOrder: Record<string, number> = { wan: 0, tong: 1, suo: 2, feng: 3, jian: 4 };
    return [...hand].sort((a, b) => suitOrder[a.suit] - suitOrder[b.suit] || a.value - b.value);
}

function isNumberSuit(suit: TileSuit): boolean {
    return NUMBER_SUITS.includes(suit);
}

function tileIndex(suit: TileSuit, value: number): number {
    return SUIT_BASE[suit] + value - 1;
}

function tileFromIndex(index: number): Omit<Tile, 'id'> {
    const suit = TILE_SUITS.find(s => index >= SUIT_BASE[s] && index < SUIT_BASE[s] + TILE_NAMES[s].length)!;
    const value = index - SUIT_BASE[suit] + 1;
    return { suit, value, name: TILE_NAMES[suit][value - 1] };
}

function tileCounts(hand: Tile[]): number[] {
    const counts = Array(34).fill(0);
    for (const tile of hand) {
        counts[tileIndex(tile.suit, tile.value)]++;
    }
    return counts;
}

function canSevenPairs(counts: number[], total: number): boolean {
    if (total !== 14) return false;
    let pairs = 0;
    for (const count of counts) {
        if (count === 0) continue;
        if (count === 2) pairs++;
        else if (count === 4) pairs += 2;
        else return false;
    }
    return pairs === 7;
}

function canFormMelds(counts: number[], memo: Map<string, boolean>): boolean {
    const first = counts.findIndex(count => count > 0);
    if (first < 0) return true;

    const key = counts.join(',');
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    if (counts[first] >= 3) {
        counts[first] -= 3;
        if (canFormMelds(counts, memo)) {
            counts[first] += 3;
            memo.set(key, true);
            return true;
        }
        counts[first] += 3;
    }

    const tile = tileFromIndex(first);
    if (isNumberSuit(tile.suit) && tile.value <= 7) {
        const second = tileIndex(tile.suit, tile.value + 1);
        const third = tileIndex(tile.suit, tile.value + 2);
        if (counts[second] > 0 && counts[third] > 0) {
            counts[first]--;
            counts[second]--;
            counts[third]--;
            if (canFormMelds(counts, memo)) {
                counts[first]++;
                counts[second]++;
                counts[third]++;
                memo.set(key, true);
                return true;
            }
            counts[first]++;
            counts[second]++;
            counts[third]++;
        }
    }

    memo.set(key, false);
    return false;
}

function canWin(hand: Tile[]): boolean {
    if (hand.length % 3 !== 2) return false;

    const counts = tileCounts(hand);
    if (canSevenPairs(counts, hand.length)) return true;

    for (let i = 0; i < counts.length; i++) {
        if (counts[i] < 2) continue;
        counts[i] -= 2;
        if (canFormMelds(counts, new Map())) {
            counts[i] += 2;
            return true;
        }
        counts[i] += 2;
    }

    return false;
}

function countTile(hand: Tile[], suit: TileSuit, value: number): number {
    return hand.filter(t => t.suit === suit && t.value === value).length;
}

function findTiles(hand: Tile[], suit: TileSuit, value: number, count: number): Tile[] {
    return hand.filter(t => t.suit === suit && t.value === value).slice(0, count);
}

function withoutTiles(hand: Tile[], tiles: Tile[]): Tile[] {
    return hand.filter(t => !tiles.includes(t));
}

function canPeng(hand: Tile[], tile: Tile): boolean {
    return countTile(hand, tile.suit, tile.value) >= 2;
}

function canChi(hand: Tile[], tile: Tile, seat: number): boolean {
    void seat;
    return findChiOptions(hand, tile).length > 0;
}

function findChiOptions(hand: Tile[], tile: Tile): Tile[][] {
    if (!isNumberSuit(tile.suit)) return [];

    const options: Tile[][] = [];
    const pairs = [
        [tile.value - 2, tile.value - 1],
        [tile.value - 1, tile.value + 1],
        [tile.value + 1, tile.value + 2],
    ];

    for (const [a, b] of pairs) {
        if (a < 1 || b > 9) continue;
        const first = findTiles(hand, tile.suit, a, 1);
        const second = findTiles(hand, tile.suit, b, 1);
        if (first.length && second.length) options.push([first[0], second[0]]);
    }

    return options;
}

function canMingGang(hand: Tile[], tile: Tile): boolean {
    return countTile(hand, tile.suit, tile.value) >= 3;
}

function canAnGang(hand: Tile[]): { suit: string; value: number } | null {
    const grouped: Record<string, number> = {};
    for (const t of hand) {
        const k = `${t.suit}-${t.value}`;
        grouped[k] = (grouped[k] || 0) + 1;
    }
    for (const [k, count] of Object.entries(grouped)) {
        if (count >= 4) {
            const [suit, v] = k.split('-');
            return { suit, value: Number(v) };
        }
    }
    return null;
}

function canJiaGang(hand: Tile[], melds: PlayerData['melds']): Tile | null {
    for (const m of melds) {
        if (m.type === 'peng') {
            const t = m.tiles[0];
            const has = hand.find(h => h.suit === t.suit && h.value === t.value);
            if (has) return has;
        }
    }
    return null;
}

function estimateWinningDraws(hand: Tile[]): number {
    if (hand.length % 3 !== 1) return 0;

    const counts = tileCounts(hand);
    let outs = 0;
    for (let i = 0; i < counts.length; i++) {
        if (counts[i] >= 4) continue;
        const tile = tileFromIndex(i);
        if (canWin([...hand, { id: -1, ...tile }])) {
            outs += 4 - counts[i];
        }
    }
    return outs;
}

function evaluateHandPotential(hand: Tile[]): number {
    const counts = tileCounts(hand);
    let score = estimateWinningDraws(hand) * 80;

    for (let i = 0; i < counts.length; i++) {
        const count = counts[i];
        if (count === 0) continue;
        const tile = tileFromIndex(i);

        if (count >= 4) score += 28;
        else if (count === 3) score += 22;
        else if (count === 2) score += 12;

        if (!isNumberSuit(tile.suit)) {
            if (count === 1) score -= 8;
            continue;
        }

        const left1 = tile.value > 1 ? counts[tileIndex(tile.suit, tile.value - 1)] : 0;
        const right1 = tile.value < 9 ? counts[tileIndex(tile.suit, tile.value + 1)] : 0;
        const left2 = tile.value > 2 ? counts[tileIndex(tile.suit, tile.value - 2)] : 0;
        const right2 = tile.value < 8 ? counts[tileIndex(tile.suit, tile.value + 2)] : 0;

        if (left1 > 0 && right1 > 0) score += 16 * count;
        if (left1 > 0 || right1 > 0) score += 8 * count;
        if (left2 > 0 || right2 > 0) score += 3 * count;
        if (count === 1 && left1 === 0 && right1 === 0 && left2 === 0 && right2 === 0) score -= 6;
        if ((tile.value === 1 || tile.value === 9) && count === 1 && left1 + right1 === 0) score -= 3;
    }

    return score;
}

function chooseDiscardIndex(hand: Tile[]): number {
    const scored = hand.map((tile, idx) => {
        const rest = hand.filter((_, i) => i !== idx);
        const visiblePenalty = countTile(hand, tile.suit, tile.value) >= 2 ? 4 : 0;
        return {
            idx,
            score: evaluateHandPotential(rest) - visiblePenalty + Math.random() * 0.5,
        };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.idx ?? 0;
}

function chooseChiTiles(hand: Tile[], tile: Tile): Tile[] | null {
    const options = findChiOptions(hand, tile);
    if (options.length === 0) return null;

    const scored = options.map(tiles => ({
        tiles,
        score: evaluateHandPotential(withoutTiles(hand, tiles)) + Math.random() * 0.5,
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0].tiles;
}

function getNextSeat(seat: number): number {
    return (seat + 1) % 4;
}

export function useMahjong() {
    const gameStatus = ref<GameStatus>('idle');
    const currentTurn = ref(0);
    const deck = ref<Tile[]>([]);
    const players = ref<PlayerData[]>([
        { hand: [], melds: [], discarded: [] },
        { hand: [], melds: [], discarded: [] },
        { hand: [], melds: [], discarded: [] },
        { hand: [], melds: [], discarded: [] },
    ]);
    const lastDiscard = ref<Tile | null>(null);
    const lastDiscardSeat = ref(-1);
    const pendingActionTile = ref<Tile | null>(null);
    const pendingActions = ref<string[]>([]);
    const selectedTile = ref<number>(-1);
    const message = ref('');
    const isPlayerTurn = ref(false);
    const actionPending = ref(false);
    const pendingActionMode = ref<PendingActionMode>('claim');

    let screenCtx: CanvasRenderingContext2D | null = null;
    let offscreen: HTMLCanvasElement | null = null;
    let offCtx: CanvasRenderingContext2D | null = null;
    let rafId: number | null = null;
    let lastTime = 0;
    let dealingStep = 0;
    let dealingTimer = 0;
    let afterPlayerPass: (() => void) | null = null;

    function setCanvas(ctx: CanvasRenderingContext2D) {
        screenCtx = ctx;
        if (!offscreen) {
            offscreen = document.createElement('canvas');
            offscreen.width = 800;
            offscreen.height = 600;
            offCtx = offscreen.getContext('2d')!;
        }
    }

    function startGame() {
        playerWindOffset = Math.floor(Math.random() * 4);
        const d = shuffle(createDeck());
        deck.value = d;
        players.value = [
            { hand: [], melds: [], discarded: [] },
            { hand: [], melds: [], discarded: [] },
            { hand: [], melds: [], discarded: [] },
            { hand: [], melds: [], discarded: [] },
        ];
        // Deal 13 to each
        for (let i = 0; i < 4; i++) {
            players.value[i].hand = d.splice(0, 13);
        }
        gameStatus.value = 'playing';
        currentTurn.value = (1 - playerWindOffset + 4) % 4;
        lastDiscard.value = null;
        lastDiscardSeat.value = -1;
        pendingActionTile.value = null;
        pendingActions.value = [];
        pendingActionMode.value = 'claim';
        selectedTile.value = -1;
        message.value = '东家(' + getWindLabel(currentTurn.value) + ')出牌';
        isPlayerTurn.value = false;
        actionPending.value = false;

        // Sort all hands
        for (let i = 0; i < 4; i++) {
            players.value[i].hand = sortHand(players.value[i].hand);
        }

        lastTime = performance.now();
        if (!rafId) gameLoop(lastTime);

        // If first turn is AI, handle their turn
        if (currentTurn.value !== 1) {
            setTimeout(() => aiTurn(currentTurn.value), 600);
        } else {
            setTimeout(() => playerDrawAndTurn(), 600);
        }
    }

    function gameLoop(time: number) {
        draw();
        rafId = requestAnimationFrame(gameLoop);
    }

    function draw(): void {
        if (!offCtx || !screenCtx || !offscreen) return;
        const c = offCtx;
        c.clearRect(0, 0, 800, 600);
        const bg = c.createLinearGradient(0, 0, 800, 600);
        bg.addColorStop(0, '#13221b');
        bg.addColorStop(0.55, '#0f3f2e');
        bg.addColorStop(1, '#07130f');
        c.fillStyle = bg;
        c.fillRect(0, 0, 800, 600);

        c.save();
        c.shadowColor = 'rgba(0, 0, 0, 0.45)';
        c.shadowBlur = 28;
        c.shadowOffsetY = 12;
        const wood = c.createLinearGradient(38, 34, 762, 568);
        wood.addColorStop(0, '#9a5b2f');
        wood.addColorStop(0.48, '#5b321d');
        wood.addColorStop(1, '#b46e35');
        c.fillStyle = wood;
        c.beginPath();
        c.roundRect(32, 36, 736, 520, 44);
        c.fill();
        c.restore();

        const rim = c.createLinearGradient(58, 62, 742, 536);
        rim.addColorStop(0, '#f0bf72');
        rim.addColorStop(0.5, '#6f3a20');
        rim.addColorStop(1, '#d79545');
        c.strokeStyle = rim;
        c.lineWidth = 4;
        c.beginPath();
        c.roundRect(32, 36, 736, 520, 44);
        c.stroke();

        const felt = c.createLinearGradient(74, 82, 726, 520);
        felt.addColorStop(0, '#2da466');
        felt.addColorStop(0.45, '#147246');
        felt.addColorStop(1, '#0b4d34');
        c.fillStyle = felt;
        c.beginPath();
        c.roundRect(74, 82, 652, 438, 32);
        c.fill();

        c.strokeStyle = 'rgba(201, 255, 216, 0.22)';
        c.lineWidth = 2;
        c.beginPath();
        c.roundRect(74, 82, 652, 438, 32);
        c.stroke();

        c.strokeStyle = 'rgba(255, 255, 255, 0.045)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(126, 300);
        c.lineTo(674, 300);
        c.moveTo(400, 118);
        c.lineTo(400, 482);
        c.stroke();

        drawDiscardZone(c, 290, 128, 220, 88);
        drawDiscardZone(c, 290, 374, 220, 88);
        drawDiscardZone(c, 156, 190, 88, 220);
        drawDiscardZone(c, 556, 190, 88, 220);

        drawWall(c, deck.value.length);
        drawWindCompass(c, deck.value.length);

        // Draw each player area
        drawPlayerArea(c, 1, 400, SELF_HAND_Y); // South (self, bottom)
        drawPlayerArea(c, 3, 400, 126); // North (top)
        drawPlayerArea(c, 2, 54, 300); // West (left)
        drawPlayerArea(c, 0, 746, 300); // East (right)

        // Action buttons area (for player)
        if (actionPending.value && pendingActions.value.length > 0) {
            const totalWidth =
                pendingActions.value.length * ACTION_BUTTON_WIDTH +
                (pendingActions.value.length - 1) * ACTION_BUTTON_GAP;
            const bx = 400 - totalWidth / 2;
            const buttonY = ACTION_BUTTON_Y;
            c.save();
            c.fillStyle = 'rgba(14, 41, 30, 0.74)';
            c.strokeStyle = 'rgba(255, 237, 213, 0.16)';
            c.lineWidth = 1;
            c.beginPath();
            c.roundRect(bx - 10, buttonY - 7, totalWidth + 20, ACTION_BUTTON_HEIGHT + 14, 12);
            c.fill();
            c.stroke();
            c.restore();
            for (let i = 0; i < pendingActions.value.length; i++) {
                const buttonX = bx + i * (ACTION_BUTTON_WIDTH + ACTION_BUTTON_GAP);
                const actionGrad = c.createLinearGradient(buttonX, buttonY, buttonX, buttonY + ACTION_BUTTON_HEIGHT);
                actionGrad.addColorStop(0, '#f97316');
                actionGrad.addColorStop(1, '#b91c1c');
                c.save();
                c.shadowColor = 'rgba(0, 0, 0, 0.35)';
                c.shadowBlur = 10;
                c.shadowOffsetY = 4;
                c.fillStyle = actionGrad;
                c.beginPath();
                c.roundRect(buttonX, buttonY, ACTION_BUTTON_WIDTH, ACTION_BUTTON_HEIGHT, 7);
                c.fill();
                c.restore();
                c.strokeStyle = 'rgba(255, 237, 213, 0.45)';
                c.stroke();
                c.fillStyle = '#fff';
                c.font = 'bold 13px sans-serif';
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.fillText(
                    pendingActions.value[i],
                    buttonX + ACTION_BUTTON_WIDTH / 2,
                    buttonY + ACTION_BUTTON_HEIGHT / 2 + 0.5,
                );
                c.textBaseline = 'alphabetic';
            }
        }

        screenCtx.clearRect(0, 0, 800, 600);
        screenCtx.drawImage(offscreen, 0, 0);
    }

    function drawPlayerArea(c: CanvasRenderingContext2D, seat: number, px: number, py: number) {
        const player = players.value[seat];
        const isSelf = seat === 1;

        // Discard pile
        for (let i = 0; i < player.discarded.length; i++) {
            if (isSelf) {
                const dx = 304 + (i % 8) * DISCARD_GAP_X;
                const dy = 382 + Math.floor(i / 8) * DISCARD_GAP_Y;
                drawDiscardedTile(c, player.discarded[i], dx, dy);
            } else if (seat === 3) {
                const dx = 304 + (i % 8) * DISCARD_GAP_X;
                const dy = 180 - Math.floor(i / 8) * DISCARD_GAP_Y;
                drawDiscardedTile(c, player.discarded[i], dx, dy);
            } else {
                const isLeft = seat === 2;
                const dx = isLeft ? 170 + Math.floor(i / 8) * DISCARD_GAP_X : 602 - Math.floor(i / 8) * DISCARD_GAP_X;
                const dy = 202 + (i % 8) * SIDE_DISCARD_GAP_Y;
                drawDiscardedTile(c, player.discarded[i], dx, dy);
            }
        }

        if (isSelf) {
            // Player's own hand - enlarged and moved down
            const hand = player.hand;

            // Draw melds
            drawMeldArea(c, player.melds, 1);

            const startX = px - (hand.length * SELF_TILE_GAP) / 2;
            for (let i = 0; i < hand.length; i++) {
                const isSelected = selectedTile.value === i && isPlayerTurn.value;
                drawTile(
                    c,
                    hand[i],
                    startX + i * SELF_TILE_GAP,
                    py + (isSelected ? -8 : 0),
                    SELF_TILE_WIDTH,
                    SELF_TILE_HEIGHT,
                );
                // Highlight selected tile
                if (isSelected) {
                    c.strokeStyle = '#facc15';
                    c.lineWidth = 2.5;
                    c.beginPath();
                    c.roundRect(startX + i * SELF_TILE_GAP - 2, py - 10, SELF_TILE_WIDTH + 4, SELF_TILE_HEIGHT + 4, 7);
                    c.stroke();
                    c.lineWidth = 1;
                }
            }
        } else if (seat === 3) {
            // Top AI - horizontal layout
            for (let i = 0; i < player.hand.length; i++) {
                const tx = px - player.hand.length * 10 + i * 20;
                const ty = 64;
                drawTileBack(c, tx, ty, 18, 32);
            }

            drawMeldArea(c, player.melds, 3);
        } else {
            // Left (seat 2) / Right (seat 0) - vertical stack
            const isLeft = seat === 2;
            const tileW = 14;
            const tileH = 20;
            const step = 20;
            const handLen = player.hand.length;
            const startY = py - (handLen * step) / 2;
            const startX = isLeft ? 84 : 702;

            // Vertical hand tiles
            for (let i = 0; i < handLen; i++) {
                const ty = startY + i * step;
                drawTileBack(c, startX, ty, tileW, tileH);
            }

            drawMeldArea(c, player.melds, seat);
        }
    }

    function drawMeldArea(c: CanvasRenderingContext2D, melds: PlayerData['melds'], seat: number) {
        if (melds.length === 0) return;

        const layout: Record<
            number,
            { x: number; y: number; dx: number; dy: number; groupDx: number; groupDy: number; w: number; h: number }
        > = {
            1: { x: 520, y: 488, dx: 16, dy: 0, groupDx: -68, groupDy: 0, w: 64, h: 26 },
            3: { x: 246, y: 106, dx: 16, dy: 0, groupDx: 68, groupDy: 0, w: 64, h: 26 },
            2: { x: 88, y: 164, dx: 16, dy: 0, groupDx: 0, groupDy: 30, w: 64, h: 26 },
            0: { x: 648, y: 164, dx: 16, dy: 0, groupDx: 0, groupDy: 30, w: 64, h: 26 },
        };

        const l = layout[seat];
        for (let i = 0; i < melds.length; i++) {
            const m = melds[i];
            const gx = l.x + i * l.groupDx;
            const gy = l.y + i * l.groupDy;
            c.save();
            c.fillStyle = 'rgba(0, 0, 0, 0.18)';
            c.beginPath();
            c.roundRect(gx - 4, gy - 3, l.w, l.h, 6);
            c.fill();
            c.restore();
            for (let j = 0; j < m.tiles.length; j++) {
                drawTileSmall(c, m.tiles[j], gx + j * l.dx, gy + j * l.dy);
            }
        }
    }

    function getTileDisplay(tile: Tile): { main: string; sub: string; jianType?: number } {
        if (tile.suit === 'feng') {
            const winds = ['东', '南', '西', '北'];
            return { main: winds[tile.value - 1], sub: '' };
        }
        if (tile.suit === 'jian') {
            return { main: '', sub: '', jianType: tile.value };
        }
        const suitSub = tile.suit === 'wan' ? '萬' : '';
        if (tile.suit === 'suo' || tile.suit === 'tong') {
            return { main: '', sub: '' };
        }
        return { main: NUM_CHARS[tile.value - 1], sub: suitSub };
    }

    function drawTileBase(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
        c.save();
        c.shadowColor = 'rgba(0, 0, 0, 0.22)';
        c.shadowBlur = Math.max(3, w * 0.22);
        c.shadowOffsetY = Math.max(1, h * 0.08);
        const tileFace = c.createLinearGradient(x, y, x, y + h);
        tileFace.addColorStop(0, '#fffdf1');
        tileFace.addColorStop(0.58, '#fff5d6');
        tileFace.addColorStop(1, '#e8d59e');
        c.fillStyle = tileFace;
        c.beginPath();
        c.roundRect(x, y, w, h, Math.min(5, w * 0.22));
        c.fill();
        c.restore();

        c.strokeStyle = 'rgba(91, 63, 25, 0.34)';
        c.lineWidth = 0.7;
        c.beginPath();
        c.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, Math.min(5, w * 0.22));
        c.stroke();

        c.fillStyle = 'rgba(255, 255, 255, 0.55)';
        c.fillRect(x + 2, y + 2, Math.max(1, w - 4), 2);
    }

    function drawDiscardZone(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
        c.save();
        c.fillStyle = 'rgba(3, 24, 18, 0.18)';
        c.beginPath();
        c.roundRect(x, y, w, h, 12);
        c.fill();
        c.strokeStyle = 'rgba(213, 255, 226, 0.08)';
        c.lineWidth = 1;
        c.stroke();
        c.restore();
    }

    function drawWall(c: CanvasRenderingContext2D, remaining: number) {
        const perSide = Math.ceil(remaining / 4);
        drawWallSide(c, 330, 244, Math.min(perSide, remaining), 'top');
        drawWallSide(c, 330, 336, Math.min(perSide, Math.max(remaining - perSide, 0)), 'bottom');
        drawWallSide(c, 294, 250, Math.min(perSide, Math.max(remaining - perSide * 2, 0)), 'left');
        drawWallSide(c, 486, 250, Math.min(perSide, Math.max(remaining - perSide * 3, 0)), 'right');
    }

    function drawWallSide(
        c: CanvasRenderingContext2D,
        x: number,
        y: number,
        count: number,
        side: 'top' | 'bottom' | 'left' | 'right',
    ) {
        const rowCap = side === 'top' || side === 'bottom' ? WALL_ROW_CAP : WALL_SIDE_CAP;
        const maxCount = rowCap * 2;
        const shown = Math.min(maxCount, count);
        if (shown <= 0) return;

        c.save();
        c.fillStyle = 'rgba(2, 20, 14, 0.1)';
        c.beginPath();
        if (side === 'top' || side === 'bottom') {
            c.roundRect(
                x - 4,
                y - 3,
                rowCap * (WALL_TILE_WIDTH + WALL_TILE_GAP) - WALL_TILE_GAP + 8,
                WALL_TILE_HEIGHT * 2 + WALL_TILE_GAP + 6,
                7,
            );
        } else {
            c.roundRect(
                x - 3,
                y - 4,
                WALL_TILE_HEIGHT * 2 + WALL_TILE_GAP + 6,
                rowCap * (WALL_TILE_WIDTH + WALL_TILE_GAP) - WALL_TILE_GAP + 8,
                7,
            );
        }
        c.fill();
        c.restore();

        for (let i = 0; i < shown; i++) {
            const col = i % rowCap;
            const row = Math.floor(i / rowCap);
            if (side === 'top' || side === 'bottom') {
                const tx = x + col * (WALL_TILE_WIDTH + WALL_TILE_GAP);
                const ty = y + row * (WALL_TILE_HEIGHT + WALL_TILE_GAP);
                drawWallTile(c, tx, ty, WALL_TILE_WIDTH, WALL_TILE_HEIGHT, side === 'bottom' || row === 1);
            } else {
                const tx = x + row * (WALL_TILE_HEIGHT + WALL_TILE_GAP);
                const ty = y + col * (WALL_TILE_WIDTH + WALL_TILE_GAP);
                drawWallTile(c, tx, ty, WALL_TILE_HEIGHT, WALL_TILE_WIDTH, side === 'right' || row === 1);
            }
        }
    }

    function drawWallTile(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alternate: boolean) {
        c.save();
        c.shadowColor = 'rgba(0, 0, 0, 0.18)';
        c.shadowBlur = 3;
        c.shadowOffsetY = 1;
        const grad = c.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, alternate ? '#f9e7b7' : '#fff7d6');
        grad.addColorStop(1, alternate ? '#c7a86a' : '#d9bc7a');
        c.fillStyle = grad;
        c.beginPath();
        c.roundRect(x, y, w, h, 3);
        c.fill();
        c.restore();

        c.strokeStyle = 'rgba(88, 59, 25, 0.35)';
        c.lineWidth = 0.7;
        c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }

    function drawWindCompass(c: CanvasRenderingContext2D, remaining: number) {
        const cx = 400;
        const cy = 300;
        const badgeRadius = 8;
        const positions = [
            { label: '东', seat: 0, x: cx + 24, y: cy },
            { label: '南', seat: 1, x: cx, y: cy + 20 },
            { label: '西', seat: 2, x: cx - 24, y: cy },
            { label: '北', seat: 3, x: cx, y: cy - 20 },
        ];

        c.save();
        c.shadowColor = 'rgba(0, 0, 0, 0.28)';
        c.shadowBlur = 12;
        const plate = c.createRadialGradient(cx, cy, 8, cx, cy, 36);
        plate.addColorStop(0, 'rgba(33, 49, 39, 0.92)');
        plate.addColorStop(1, 'rgba(8, 18, 14, 0.72)');
        c.fillStyle = plate;
        c.beginPath();
        c.arc(cx, cy, 36, 0, Math.PI * 2);
        c.fill();
        c.restore();

        c.strokeStyle = 'rgba(255, 226, 142, 0.28)';
        c.lineWidth = 1.2;
        c.beginPath();
        c.arc(cx, cy, 36, 0, Math.PI * 2);
        c.stroke();
        c.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        c.beginPath();
        c.arc(cx, cy, 21, 0, Math.PI * 2);
        c.stroke();

        c.fillStyle = '#fef3c7';
        c.font = 'bold 13px sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(String(remaining), cx, cy);

        for (const pos of positions) {
            const active = currentTurn.value === pos.seat && gameStatus.value === 'playing';
            c.save();
            if (active) {
                c.shadowColor = '#facc15';
                c.shadowBlur = 10;
            }
            c.fillStyle = active ? '#facc15' : 'rgba(245, 222, 170, 0.18)';
            c.beginPath();
            c.arc(pos.x, pos.y, badgeRadius, 0, Math.PI * 2);
            c.fill();
            c.strokeStyle = active ? '#fff7cc' : 'rgba(255, 226, 142, 0.32)';
            c.lineWidth = 1;
            c.stroke();
            c.fillStyle = active ? '#3b2506' : '#f8e8b7';
            c.font = 'bold 12px serif';
            c.fillText(pos.label, pos.x, pos.y + 0.5);
            c.restore();
        }

        c.textBaseline = 'alphabetic';
    }

    function drawTileBack(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
        c.save();
        c.shadowColor = 'rgba(0, 0, 0, 0.2)';
        c.shadowBlur = 4;
        c.shadowOffsetY = 2;
        const back = c.createLinearGradient(x, y, x + w, y + h);
        back.addColorStop(0, '#1e88a8');
        back.addColorStop(0.55, '#14537b');
        back.addColorStop(1, '#0b2f4a');
        c.fillStyle = back;
        c.beginPath();
        c.roundRect(x, y, w, h, Math.min(5, w * 0.25));
        c.fill();
        c.restore();

        c.strokeStyle = 'rgba(208, 244, 255, 0.28)';
        c.lineWidth = 1;
        c.beginPath();
        c.roundRect(x + 1, y + 1, w - 2, h - 2, Math.min(4, w * 0.22));
        c.stroke();
        c.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        c.beginPath();
        c.moveTo(x + w * 0.28, y + 4);
        c.lineTo(x + w * 0.28, y + h - 4);
        c.moveTo(x + w * 0.72, y + 4);
        c.lineTo(x + w * 0.72, y + h - 4);
        c.stroke();
    }

    function getPipPositions(value: number): Array<[number, number]> {
        const patterns: Record<number, Array<[number, number]>> = {
            1: [[0.5, 0.5]],
            2: [
                [0.5, 0.28],
                [0.5, 0.72],
            ],
            3: [
                [0.5, 0.22],
                [0.5, 0.5],
                [0.5, 0.78],
            ],
            4: [
                [0.32, 0.28],
                [0.68, 0.28],
                [0.32, 0.72],
                [0.68, 0.72],
            ],
            5: [
                [0.32, 0.24],
                [0.68, 0.24],
                [0.5, 0.5],
                [0.32, 0.76],
                [0.68, 0.76],
            ],
            6: [
                [0.32, 0.22],
                [0.68, 0.22],
                [0.32, 0.5],
                [0.68, 0.5],
                [0.32, 0.78],
                [0.68, 0.78],
            ],
            7: [
                [0.32, 0.2],
                [0.68, 0.2],
                [0.32, 0.42],
                [0.68, 0.42],
                [0.32, 0.64],
                [0.68, 0.64],
                [0.5, 0.82],
            ],
            8: [
                [0.32, 0.18],
                [0.68, 0.18],
                [0.32, 0.38],
                [0.68, 0.38],
                [0.32, 0.62],
                [0.68, 0.62],
                [0.32, 0.82],
                [0.68, 0.82],
            ],
            9: [
                [0.28, 0.2],
                [0.5, 0.2],
                [0.72, 0.2],
                [0.28, 0.5],
                [0.5, 0.5],
                [0.72, 0.5],
                [0.28, 0.8],
                [0.5, 0.8],
                [0.72, 0.8],
            ],
        };
        return patterns[value] ?? patterns[1];
    }

    function drawCircleSuit(c: CanvasRenderingContext2D, value: number, x: number, y: number, w: number, h: number) {
        const positions = getPipPositions(value);
        const radius = Math.max(1.7, Math.min(w / 8, h / 11));
        const colors = ['#1d4ed8', '#dc2626', '#15803d'];

        for (let i = 0; i < positions.length; i++) {
            const [px, py] = positions[i];
            const cx = x + px * w;
            const cy = y + py * h;
            const color = value === 1 ? '#1d4ed8' : colors[i % colors.length];

            c.fillStyle = color;
            c.beginPath();
            c.arc(cx, cy, radius, 0, Math.PI * 2);
            c.fill();
            c.strokeStyle = 'rgba(255,255,255,0.85)';
            c.lineWidth = Math.max(0.7, radius * 0.24);
            c.beginPath();
            c.arc(cx, cy, radius * 0.62, 0, Math.PI * 2);
            c.stroke();
            c.fillStyle = 'rgba(255,255,255,0.9)';
            c.beginPath();
            c.arc(cx, cy, Math.max(0.7, radius * 0.22), 0, Math.PI * 2);
            c.fill();
        }
    }

    function drawBambooSuit(c: CanvasRenderingContext2D, value: number, x: number, y: number, w: number, h: number) {
        if (value === 1) {
            drawBambooBird(c, x, y, w, h);
            return;
        }

        const positions = getPipPositions(value);
        for (let i = 0; i < positions.length; i++) {
            const [px, py] = positions[i];
            const cx = x + px * w;
            const cy = y + py * h;
            const color = i % 3 === 1 ? '#dc2626' : '#15803d';
            drawBambooStick(c, cx, cy, Math.max(2.2, w * 0.12), Math.max(6, h * 0.2), color);
        }
    }

    function drawBambooStick(
        c: CanvasRenderingContext2D,
        cx: number,
        cy: number,
        stickW: number,
        stickH: number,
        color: string,
    ) {
        const x = cx - stickW / 2;
        const y = cy - stickH / 2;
        c.fillStyle = color;
        c.beginPath();
        c.roundRect(x, y, stickW, stickH, stickW / 2);
        c.fill();

        c.strokeStyle = 'rgba(255,255,255,0.65)';
        c.lineWidth = Math.max(0.6, stickW * 0.2);
        c.beginPath();
        c.moveTo(cx, y + stickH * 0.18);
        c.lineTo(cx, y + stickH * 0.82);
        c.stroke();

        c.strokeStyle = '#0f3f2e';
        c.lineWidth = Math.max(0.6, stickW * 0.18);
        c.beginPath();
        c.moveTo(x - stickW * 0.25, cy);
        c.lineTo(x + stickW * 1.25, cy);
        c.stroke();
    }

    function drawBambooBird(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
        c.save();
        c.translate(x + w / 2, y + h / 2);
        const s = Math.min(w, h) / 24;
        c.scale(s, s);

        c.fillStyle = '#15803d';
        c.beginPath();
        c.ellipse(0, 1, 4.8, 7.2, -0.18, 0, Math.PI * 2);
        c.fill();

        c.fillStyle = '#1d4ed8';
        c.beginPath();
        c.ellipse(2.8, -5.2, 3.2, 3.4, 0.2, 0, Math.PI * 2);
        c.fill();

        c.fillStyle = '#dc2626';
        c.beginPath();
        c.moveTo(5.2, -5.4);
        c.lineTo(8.6, -4.1);
        c.lineTo(5.5, -2.8);
        c.closePath();
        c.fill();

        c.strokeStyle = '#15803d';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(-3.8, 5.4);
        c.quadraticCurveTo(-7, 8.8, -4.8, 11);
        c.moveTo(0, 6.2);
        c.quadraticCurveTo(-1.5, 10, 1.8, 11.4);
        c.stroke();

        c.fillStyle = '#111827';
        c.beginPath();
        c.arc(3.6, -6.2, 0.7, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    function drawTile(c: CanvasRenderingContext2D, tile: Tile, x: number, y: number, w = 18, h = 30) {
        const disp = getTileDisplay(tile);

        if (disp.jianType) {
            if (disp.jianType === 3) {
                // 白 - blue rectangular frame
                drawTileBase(c, x, y, w, h);
                c.strokeStyle = '#3366cc';
                c.lineWidth = 2;
                c.strokeRect(x + 2, y + 2, w - 4, h - 4);
                c.lineWidth = 0.5;
            } else {
                // 中 or 發
                drawTileBase(c, x, y, w, h);

                const text = disp.jianType === 1 ? '中' : '發';
                c.fillStyle = disp.jianType === 1 ? '#cc2222' : '#228822';
                const mainSize = w <= 18 ? 12 : 16;
                c.font = `bold ${mainSize}px sans-serif`;
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.fillText(text, x + w / 2, y + h / 2);
                c.textBaseline = 'alphabetic';
            }
            return;
        }

        drawTileBase(c, x, y, w, h);

        // 索子 - 绿色竖条，每行最多3个
        if (tile.suit === 'suo') {
            drawBambooSuit(c, tile.value, x, y, w, h);
            return;
        }

        // 筒子 - 蓝色圆点，每行最多3个
        if (tile.suit === 'tong') {
            drawCircleSuit(c, tile.value, x, y, w, h);
            return;
        }

        c.fillStyle = '#333';
        if (!disp.sub) {
            const len = disp.main.length;
            const fs = len <= 2 ? 14 : len <= 4 ? 12 : len <= 6 ? 10 : 8;
            c.font = `bold ${fs}px sans-serif`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(disp.main, x + w / 2, y + h / 2);
            c.textBaseline = 'alphabetic';
        } else {
            const mainSize = w <= 18 ? 11 : 14;
            c.font = `bold ${mainSize}px sans-serif`;
            c.textAlign = 'center';
            c.fillText(disp.main, x + w / 2, y + h * 0.5 + 2);

            const subSize = w <= 18 ? 7 : 9;
            c.font = `${subSize}px sans-serif`;
            if (tile.suit === 'wan') c.fillStyle = '#cc2222';
            c.fillText(disp.sub, x + w / 2, y + h - 5);
        }
    }

    function drawDiscardedTile(c: CanvasRenderingContext2D, tile: Tile, x: number, y: number) {
        drawTile(c, tile, x, y, DISCARD_TILE_WIDTH, DISCARD_TILE_HEIGHT);

        if (lastDiscard.value?.id !== tile.id) return;
        c.save();
        c.strokeStyle = '#facc15';
        c.lineWidth = 2;
        c.shadowColor = 'rgba(250, 204, 21, 0.65)';
        c.shadowBlur = 8;
        c.beginPath();
        c.roundRect(x - 2, y - 2, DISCARD_TILE_WIDTH + 4, DISCARD_TILE_HEIGHT + 4, 6);
        c.stroke();
        c.restore();
    }

    function drawTileSmall(c: CanvasRenderingContext2D, tile: Tile, x: number, y: number) {
        const disp = getTileDisplay(tile);

        if (disp.jianType) {
            if (disp.jianType === 3) {
                drawTileBase(c, x, y, 14, 22);
                c.strokeStyle = '#3366cc';
                c.lineWidth = 1.5;
                c.strokeRect(x + 1, y + 1, 12, 20);
                c.lineWidth = 0.5;
            } else {
                drawTileBase(c, x, y, 14, 22);

                const text = disp.jianType === 1 ? '中' : '發';
                c.fillStyle = disp.jianType === 1 ? '#cc2222' : '#228822';
                c.font = 'bold 10px sans-serif';
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.fillText(text, x + 7, y + 11);
                c.textBaseline = 'alphabetic';
            }
            return;
        }

        drawTileBase(c, x, y, 14, 22);

        // 索子 - 绿色竖条，每行最多3个
        if (tile.suit === 'suo') {
            drawBambooSuit(c, tile.value, x, y, 14, 22);
            return;
        }

        // 筒子 - 蓝色圆点，每行最多3个
        if (tile.suit === 'tong') {
            drawCircleSuit(c, tile.value, x, y, 14, 22);
            return;
        }

        c.fillStyle = '#333';
        if (!disp.sub) {
            const len = disp.main.length;
            const fs = len <= 2 ? 11 : len <= 4 ? 9 : len <= 6 ? 8 : 7;
            c.font = `bold ${fs}px sans-serif`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(disp.main, x + 7, y + 11);
            c.textBaseline = 'alphabetic';
        } else {
            c.font = 'bold 8px sans-serif';
            c.textAlign = 'center';
            c.fillText(disp.main, x + 7, y + 12);

            c.font = '6px sans-serif';
            if (tile.suit === 'wan') c.fillStyle = '#cc2222';
            c.fillText(disp.sub, x + 7, y + 19);
        }
    }

    // --- Player actions ---
    function handleClick(x: number, y: number) {
        if (gameStatus.value !== 'playing') return;
        if (actionPending.value) {
            handleActionClick(x, y);
            return;
        }
        if (!isPlayerTurn.value) return;

        const hand = players.value[1].hand;
        const startX = 400 - (hand.length * SELF_TILE_GAP) / 2;
        const py = SELF_HAND_Y;

        for (let i = 0; i < hand.length; i++) {
            const tx = startX + i * SELF_TILE_GAP;
            if (x >= tx && x <= tx + SELF_TILE_WIDTH && y >= py - 10 && y <= py + SELF_TILE_HEIGHT) {
                if (selectedTile.value === i) {
                    doDiscard(i);
                } else {
                    selectedTile.value = i;
                }
                return;
            }
        }
        selectedTile.value = -1;
    }

    function handleActionClick(x: number, y: number) {
        const totalWidth =
            pendingActions.value.length * ACTION_BUTTON_WIDTH + (pendingActions.value.length - 1) * ACTION_BUTTON_GAP;
        const bx = 400 - totalWidth / 2;
        for (let i = 0; i < pendingActions.value.length; i++) {
            const ax = bx + i * (ACTION_BUTTON_WIDTH + ACTION_BUTTON_GAP);
            if (
                x >= ax &&
                x <= ax + ACTION_BUTTON_WIDTH &&
                y >= ACTION_BUTTON_Y &&
                y <= ACTION_BUTTON_Y + ACTION_BUTTON_HEIGHT
            ) {
                const act = pendingActions.value[i];
                if (act === ACTION_CHI) doChi(1);
                else if (act === ACTION_PENG) doPeng(1);
                else if (act === ACTION_GANG) doPlayerGang();
                else if (act === ACTION_WIN) doWin(1);
                else if (act === ACTION_PASS) passPendingAction();
                return;
            }
        }
    }

    function clearPendingAction() {
        actionPending.value = false;
        pendingActions.value = [];
        pendingActionTile.value = null;
        pendingActionMode.value = 'claim';
        afterPlayerPass = null;
    }

    function drawTileFromWall(seat: number): Tile | null {
        if (deck.value.length === 0) {
            gameStatus.value = 'draw';
            message.value = '流局';
            isPlayerTurn.value = false;
            clearPendingAction();
            return null;
        }

        const drawn = deck.value.shift()!;
        players.value[seat].hand.push(drawn);
        players.value[seat].hand = sortHand(players.value[seat].hand);
        return drawn;
    }

    function continueAfterDiscard(seat: number) {
        if (gameStatus.value !== 'playing') return;
        currentTurn.value = getNextSeat(seat);
        if (currentTurn.value !== 1) {
            setTimeout(() => aiTurn(currentTurn.value), 500);
        } else {
            playerDrawAndTurn();
        }
    }

    function passPendingAction() {
        const resume = afterPlayerPass;
        const mode = pendingActionMode.value;
        clearPendingAction();
        if (resume) {
            resume();
            return;
        }

        if (mode === 'self') {
            isPlayerTurn.value = true;
            return;
        }

        continueAfterDiscard(lastDiscardSeat.value);
    }

    function doDiscard(idx: number) {
        const hand = players.value[1].hand;
        if (idx < 0 || idx >= hand.length) return;
        const tile = hand.splice(idx, 1)[0];
        players.value[1].hand = sortHand(hand);
        players.value[1].discarded.push(tile);
        lastDiscard.value = tile;
        lastDiscardSeat.value = 1;
        selectedTile.value = -1;
        isPlayerTurn.value = false;
        clearPendingAction();
        message.value = getWindLabel(1) + '打出 ' + tile.name;

        resolveDiscardReactions(1);
    }

    function orderedSeatsAfter(seat: number): number[] {
        return [1, 2, 3].map(offset => (seat + offset) % 4);
    }

    function resolveDiscardReactions(discardSeat: number) {
        const tile = lastDiscard.value;
        if (!tile || gameStatus.value !== 'playing') return;

        const aiWinner = orderedSeatsAfter(discardSeat).find(seat => {
            if (seat === 1 || seat === discardSeat) return false;
            return canWin([...players.value[seat].hand, tile]);
        });

        if (discardSeat !== 1) {
            const canPlayerWin = canWin([...players.value[1].hand, tile]);
            const actions =
                aiWinner !== undefined && canPlayerWin ? [ACTION_WIN] : getPlayerClaimActions(tile, discardSeat);
            if (actions.length > 0) {
                pendingActionTile.value = tile;
                pendingActionMode.value = 'claim';
                pendingActions.value = [...actions, ACTION_PASS];
                actionPending.value = true;
                afterPlayerPass = aiWinner !== undefined ? () => doWin(aiWinner) : () => resolveAiClaims(discardSeat);
                message.value = getWindLabel(discardSeat) + '打出 ' + tile.name + '，请选择';
                return;
            }
        }

        if (aiWinner !== undefined) {
            doWin(aiWinner);
            return;
        }

        resolveAiClaims(discardSeat);
    }

    function getPlayerClaimActions(tile: Tile, discardSeat: number): string[] {
        const hand = players.value[1].hand;
        const actions: string[] = [];
        if (canWin([...hand, tile])) actions.push(ACTION_WIN);
        if (canPeng(hand, tile)) actions.push(ACTION_PENG);
        if (canMingGang(hand, tile)) actions.push(ACTION_GANG);
        if (getNextSeat(discardSeat) === 1 && canChi(hand, tile, discardSeat)) actions.push(ACTION_CHI);
        return actions;
    }

    function resolveAiClaims(discardSeat: number) {
        const tile = lastDiscard.value;
        if (!tile || gameStatus.value !== 'playing') return;

        const seats = orderedSeatsAfter(discardSeat).filter(seat => seat !== 1);
        for (const seat of seats) {
            const hand = players.value[seat].hand;
            if (canMingGang(hand, tile) && Math.random() < 0.35) {
                doMingGang(seat);
                return;
            }
            if (canPeng(hand, tile) && Math.random() < 0.6) {
                doPeng(seat);
                return;
            }
        }

        const nextSeat = getNextSeat(discardSeat);
        if (nextSeat !== 1 && canChi(players.value[nextSeat].hand, tile, discardSeat) && Math.random() < 0.45) {
            doChi(nextSeat);
            return;
        }

        continueAfterDiscard(discardSeat);
    }

    function removeClaimedDiscard() {
        const tile = lastDiscard.value;
        const seat = lastDiscardSeat.value;
        if (!tile || seat < 0) return;

        const discarded = players.value[seat].discarded;
        for (let i = discarded.length - 1; i >= 0; i--) {
            if (discarded[i].id === tile.id) {
                discarded.splice(i, 1);
                return;
            }
        }
    }

    function doChi(seat: number) {
        const tile = lastDiscard.value;
        if (!tile || seat !== getNextSeat(lastDiscardSeat.value)) return;

        const hand = players.value[seat].hand;
        const tiles = chooseChiTiles(hand, tile);
        if (!tiles) return;

        players.value[seat].hand = sortHand(withoutTiles(hand, tiles));
        players.value[seat].melds.push({ type: 'chi', tiles: sortHand([tile, ...tiles]) });
        removeClaimedDiscard();
        lastDiscard.value = null;
        clearPendingAction();
        currentTurn.value = seat;
        message.value = getWindLabel(seat) + ' 吃！';

        if (seat === 1) {
            isPlayerTurn.value = true;
            checkSelfActions();
        } else {
            setTimeout(() => aiDiscard(seat), 600);
        }
    }

    function doPeng(seat: number) {
        const tile = lastDiscard.value!;
        const hand = players.value[seat].hand;
        const matches = hand.filter(t => t.suit === tile.suit && t.value === tile.value).slice(0, 2);
        players.value[seat].hand = hand.filter(t => !matches.includes(t));
        players.value[seat].melds.push({ type: 'peng', tiles: [tile, ...matches] });
        players.value[seat].hand = sortHand(players.value[seat].hand);
        removeClaimedDiscard();
        lastDiscard.value = null;
        clearPendingAction();
        currentTurn.value = seat;
        message.value = getWindLabel(seat) + ' 碰！';

        if (seat === 1) {
            isPlayerTurn.value = true;
            checkSelfActions();
        } else {
            setTimeout(() => aiDiscard(seat), 600);
        }
    }

    function doMingGang(seat: number) {
        const tile = lastDiscard.value!;
        const hand = players.value[seat].hand;
        const matches = hand.filter(t => t.suit === tile.suit && t.value === tile.value).slice(0, 3);
        players.value[seat].hand = hand.filter(t => !matches.includes(t));
        players.value[seat].melds.push({ type: 'minggang', tiles: [tile, ...matches] });
        players.value[seat].hand = sortHand(players.value[seat].hand);
        removeClaimedDiscard();
        const drawn = drawTileFromWall(seat);
        if (!drawn) return;
        lastDiscard.value = null;
        clearPendingAction();
        currentTurn.value = seat;
        message.value = getWindLabel(seat) + ' 杠！';

        if (seat === 1) {
            if (canWin(players.value[seat].hand)) {
                pendingActionTile.value = drawn;
                pendingActionMode.value = 'self';
                pendingActions.value = [ACTION_WIN, ACTION_PASS];
                actionPending.value = true;
                afterPlayerPass = null;
                return;
            }
            isPlayerTurn.value = true;
            checkSelfActions();
        } else {
            setTimeout(() => aiDiscard(seat), 600);
        }
    }

    function doWin(seat: number) {
        gameStatus.value = 'won';
        message.value = getWindLabel(seat) + ' 胡了！';
        clearPendingAction();
        isPlayerTurn.value = false;
    }

    function doPlayerGang() {
        if (pendingActionMode.value === 'claim') {
            doMingGang(1);
            return;
        }

        const hand = players.value[1].hand;
        const jiaGangTile = canJiaGang(hand, players.value[1].melds);
        if (jiaGangTile) {
            players.value[1].hand = hand.filter(t => t !== jiaGangTile);
            const meld = players.value[1].melds.find(
                m =>
                    m.type === 'peng' && m.tiles[0].suit === jiaGangTile.suit && m.tiles[0].value === jiaGangTile.value,
            );
            if (meld) {
                meld.tiles.push(jiaGangTile);
                meld.type = 'minggang';
            }
            afterGangDraw(1);
            return;
        }

        const anGangTile = canAnGang(hand);
        if (!anGangTile) return;
        const matches = hand.filter(t => t.suit === anGangTile.suit && t.value === anGangTile.value).slice(0, 4);
        players.value[1].hand = sortHand(hand.filter(t => !matches.includes(t)));
        players.value[1].melds.push({ type: 'angang', tiles: matches });
        afterGangDraw(1);
    }

    function afterGangDraw(seat: number) {
        const drawn = drawTileFromWall(seat);
        if (!drawn) return;
        lastDiscard.value = null;
        clearPendingAction();
        currentTurn.value = seat;
        message.value = getWindLabel(seat) + ' 杠！';

        if (seat === 1) {
            if (canWin(players.value[1].hand)) {
                pendingActionTile.value = drawn;
                pendingActionMode.value = 'self';
                pendingActions.value = [ACTION_WIN, ACTION_PASS];
                actionPending.value = true;
                isPlayerTurn.value = false;
                return;
            }
            isPlayerTurn.value = true;
            checkSelfActions();
        } else {
            if (canWin(players.value[seat].hand)) {
                doWin(seat);
                return;
            }
            setTimeout(() => aiDiscard(seat), 600);
        }
    }

    function checkSelfActions() {
        const canGang = Boolean(
            canAnGang(players.value[1].hand) || canJiaGang(players.value[1].hand, players.value[1].melds),
        );
        if (!canGang || actionPending.value) return;
        pendingActionMode.value = 'self';
        pendingActions.value = [ACTION_GANG, ACTION_PASS];
        actionPending.value = true;
        afterPlayerPass = null;
        isPlayerTurn.value = false;
    }

    function playerDrawAndTurn() {
        const drawn = drawTileFromWall(1);
        if (!drawn) return;

        message.value = '摸到 ' + drawn.name + '，请出牌';
        if (canWin(players.value[1].hand)) {
            pendingActionTile.value = drawn;
            pendingActionMode.value = 'self';
            pendingActions.value = [ACTION_WIN, ACTION_PASS];
            actionPending.value = true;
            afterPlayerPass = null;
            isPlayerTurn.value = false;
            return;
        }

        isPlayerTurn.value = true;
        checkSelfActions();
    }

    // --- AI ---
    function aiTurn(seat: number) {
        if (gameStatus.value !== 'playing' || currentTurn.value !== seat) return;

        const drawn = drawTileFromWall(seat);
        if (!drawn) return;
        if (canWin(players.value[seat].hand)) {
            doWin(seat);
            return;
        }

        const ag = canAnGang(players.value[seat].hand);
        if (ag && Math.random() < 0.7) {
            const hand = players.value[seat].hand;
            const matches = hand.filter(t => t.suit === ag.suit && t.value === ag.value).slice(0, 4);
            players.value[seat].hand = sortHand(hand.filter(t => !matches.includes(t)));
            players.value[seat].melds.push({ type: 'angang', tiles: matches });
            afterGangDraw(seat);
            return;
        }

        const jg = canJiaGang(players.value[seat].hand, players.value[seat].melds);
        if (jg && Math.random() < 0.6) {
            players.value[seat].hand = players.value[seat].hand.filter(t => t !== jg);
            const meld = players.value[seat].melds.find(
                m => m.type === 'peng' && m.tiles[0].suit === jg.suit && m.tiles[0].value === jg.value,
            );
            if (meld) {
                meld.tiles.push(jg);
                meld.type = 'minggang';
            }
            afterGangDraw(seat);
            return;
        }

        setTimeout(() => aiDiscard(seat), 500);
    }

    function aiDiscard(seat: number) {
        if (gameStatus.value !== 'playing') return;
        const hand = players.value[seat].hand;
        if (hand.length === 0) return;
        if (canWin(hand)) {
            doWin(seat);
            return;
        }

        const idx = chooseDiscardIndex(hand);
        const tile = hand.splice(idx, 1)[0];
        players.value[seat].hand = sortHand(hand);
        players.value[seat].discarded.push(tile);
        lastDiscard.value = tile;
        lastDiscardSeat.value = seat;
        clearPendingAction();
        message.value = getWindLabel(seat) + '打出 ' + tile.name;

        resolveDiscardReactions(seat);
    }

    // --- Input ---
    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && gameStatus.value === 'idle') {
            startGame();
        }
    }

    function handleKeyup(_e: KeyboardEvent) {}

    function handleCanvasClick(e: MouseEvent) {
        const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
        const scaleX = 800 / rect.width;
        const scaleY = 600 / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        handleClick(x, y);
    }

    onUnmounted(() => {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    });

    return {
        gameStatus,
        currentTurn,
        deck,
        players,
        lastDiscard,
        lastDiscardSeat,
        selectedTile,
        message,
        pendingActions,
        actionPending,
        isPlayerTurn,
        startGame,
        handleCanvasClick,
        handleKeydown,
        handleKeyup,
        setCanvas,
        width: 800,
        height: 600,
    };
}
