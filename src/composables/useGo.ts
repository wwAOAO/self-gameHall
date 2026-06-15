import { computed, onUnmounted, ref } from 'vue';

const BOARD_SIZE = 19;
const CELL_SIZE = 34;
const PADDING = 38;
const CANVAS_W = PADDING * 2 + (BOARD_SIZE - 1) * CELL_SIZE;
const CANVAS_H = CANVAS_W;

type Stone = 0 | 1 | 2;
type GameStatus = 'idle' | 'playing' | 'ended';
type ScoreOwner = Stone | 3;

interface MoveRecord {
    row: number;
    col: number;
    player: Stone;
    pass?: boolean;
}

interface KataGoBestMoveResponse {
    ok?: boolean;
    bestmove?: {
        row?: number;
        col?: number;
        pass?: boolean;
    } | null;
    error?: string;
}

interface KataGoMoveResult {
    move: [number, number] | 'pass' | null;
    error?: string;
}

interface GroupInfo {
    stones: [number, number][];
    liberties: Set<string>;
}

interface MoveResult {
    board: Stone[][];
    captured: number;
    reason?: string;
}

interface ScoreResult {
    black: number;
    white: number;
    blackTerritory: number;
    whiteTerritory: number;
    neutral: number;
}

interface StoneAnimation {
    row: number;
    col: number;
    color: Stone;
    start: number;
}

const STONE_DROP_MS = 220;

function createEmptyBoard(): Stone[][] {
    return Array.from({ length: BOARD_SIZE }, () => Array<Stone>(BOARD_SIZE).fill(0));
}

function cloneBoard(board: Stone[][]): Stone[][] {
    return board.map(row => [...row]);
}

function isInside(row: number, col: number): boolean {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function opponent(player: Stone): Stone {
    return player === 1 ? 2 : 1;
}

function pointKey(row: number, col: number): string {
    return `${row},${col}`;
}

function boardKey(board: Stone[][]): string {
    return board.map(row => row.join('')).join('');
}

function neighbors(row: number, col: number): [number, number][] {
    return [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
    ].filter(([r, c]) => isInside(r, c)) as [number, number][];
}

function collectGroup(board: Stone[][], row: number, col: number): GroupInfo {
    const color = board[row][col];
    const seen = new Set<string>();
    const stack: [number, number][] = [[row, col]];
    const stones: [number, number][] = [];
    const liberties = new Set<string>();

    while (stack.length > 0) {
        const [r, c] = stack.pop()!;
        const key = pointKey(r, c);
        if (seen.has(key)) continue;
        seen.add(key);
        stones.push([r, c]);

        for (const [nr, nc] of neighbors(r, c)) {
            if (board[nr][nc] === 0) {
                liberties.add(pointKey(nr, nc));
            } else if (board[nr][nc] === color && !seen.has(pointKey(nr, nc))) {
                stack.push([nr, nc]);
            }
        }
    }

    return { stones, liberties };
}

function tryMove(board: Stone[][], row: number, col: number, player: Stone, history: Set<string>): MoveResult | null {
    if (!isInside(row, col) || board[row][col] !== 0) return null;

    const next = cloneBoard(board);
    next[row][col] = player;
    let captured = 0;
    const checked = new Set<string>();

    for (const [nr, nc] of neighbors(row, col)) {
        if (next[nr][nc] !== opponent(player)) continue;
        const key = pointKey(nr, nc);
        if (checked.has(key)) continue;

        const group = collectGroup(next, nr, nc);
        group.stones.forEach(([gr, gc]) => checked.add(pointKey(gr, gc)));
        if (group.liberties.size === 0) {
            for (const [gr, gc] of group.stones) next[gr][gc] = 0;
            captured += group.stones.length;
        }
    }

    const ownGroup = collectGroup(next, row, col);
    if (ownGroup.liberties.size === 0) {
        return { board: next, captured, reason: '不能自杀落子' };
    }

    if (history.has(boardKey(next))) {
        return { board: next, captured, reason: '打劫限制：不能重复局面' };
    }

    return { board: next, captured };
}

function floodEmpty(board: Stone[][], row: number, col: number, seen: Set<string>) {
    const queue: [number, number][] = [[row, col]];
    const points: [number, number][] = [];
    const borders = new Set<Stone>();

    while (queue.length > 0) {
        const [r, c] = queue.shift()!;
        const key = pointKey(r, c);
        if (seen.has(key)) continue;
        seen.add(key);
        points.push([r, c]);

        for (const [nr, nc] of neighbors(r, c)) {
            const cell = board[nr][nc];
            if (cell === 0 && !seen.has(pointKey(nr, nc))) queue.push([nr, nc]);
            if (cell === 1 || cell === 2) borders.add(cell);
        }
    }

    let owner: ScoreOwner = 3;
    if (borders.size === 1) owner = [...borders][0];
    return { points, owner };
}

function scoreBoard(board: Stone[][]): ScoreResult {
    let black = 0;
    let white = 0;
    let blackTerritory = 0;
    let whiteTerritory = 0;
    let neutral = 0;
    const seen = new Set<string>();

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] === 1) black++;
            if (board[r][c] === 2) white++;
            if (board[r][c] !== 0 || seen.has(pointKey(r, c))) continue;

            const region = floodEmpty(board, r, c, seen);
            if (region.owner === 1) {
                black += region.points.length;
                blackTerritory += region.points.length;
            } else if (region.owner === 2) {
                white += region.points.length;
                whiteTerritory += region.points.length;
            } else {
                neutral += region.points.length;
            }
        }
    }

    return { black, white, blackTerritory, whiteTerritory, neutral };
}

async function findKataGoMove(moves: MoveRecord[], side: Stone, timeMs = 1200): Promise<KataGoMoveResult> {
    try {
        const response = await fetch('/api/katago/bestmove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                moves,
                side,
                timeMs,
                boardSize: BOARD_SIZE,
                komi: 0,
            }),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return { move: null, error: text || `HTTP ${response.status}` };
        }
        const data = (await response.json()) as KataGoBestMoveResponse;
        if (!data.ok || !data.bestmove) return { move: null, error: data.error };
        if (data.bestmove.pass) return { move: 'pass' };

        const row = data.bestmove.row;
        const col = data.bestmove.col;
        if (row === undefined || col === undefined) return { move: null, error: 'KataGo 没有返回坐标' };
        if (!isInside(row, col)) return { move: null, error: `KataGo 返回了无效坐标 ${row},${col}` };
        return { move: [row, col] };
    } catch (error) {
        return { move: null, error: error instanceof Error ? error.message : String(error) };
    }
}

export function useGo() {
    const board = ref<Stone[][]>(createEmptyBoard());
    const currentPlayer = ref<Stone>(1);
    const playerColor = ref<Stone>(1);
    const gameStatus = ref<GameStatus>('idle');
    const message = ref('选择执黑或执白开始');
    const lastMove = ref<[number, number] | null>(null);
    const hoverPos = ref<[number, number] | null>(null);
    const moveCount = ref(0);
    const blackCaptures = ref(0);
    const whiteCaptures = ref(0);
    const consecutivePasses = ref(0);
    const finalScore = ref<ScoreResult | null>(null);
    const invalidHint = ref('');
    const history = ref(new Set<string>([boardKey(createEmptyBoard())]));
    const moveHistory = ref<MoveRecord[]>([]);
    const placingStone = ref<StoneAnimation | null>(null);

    let aiTimer: ReturnType<typeof setTimeout> | null = null;

    const aiColor = computed<Stone>(() => (playerColor.value === 1 ? 2 : 1));
    const playerCaptures = computed(() => (playerColor.value === 1 ? blackCaptures.value : whiteCaptures.value));
    const aiCaptures = computed(() => (aiColor.value === 1 ? blackCaptures.value : whiteCaptures.value));

    function clearAITimer() {
        if (aiTimer !== null) {
            clearTimeout(aiTimer);
            aiTimer = null;
        }
    }

    function startGame() {
        const selectedColor = playerColor.value;
        board.value = createEmptyBoard();
        currentPlayer.value = 1;
        playerColor.value = selectedColor;
        gameStatus.value = 'playing';
        message.value = selectedColor === 1 ? '黑先，请落子' : '电脑执黑思考中';
        lastMove.value = null;
        hoverPos.value = null;
        moveCount.value = 0;
        blackCaptures.value = 0;
        whiteCaptures.value = 0;
        consecutivePasses.value = 0;
        finalScore.value = null;
        invalidHint.value = '';
        history.value = new Set<string>([boardKey(board.value)]);
        moveHistory.value = [];
        placingStone.value = null;
        clearAITimer();
        if (currentPlayer.value === aiColor.value) scheduleAIMove();
    }

    function switchColor() {
        if (gameStatus.value !== 'idle') return;
        playerColor.value = playerColor.value === 1 ? 2 : 1;
        message.value = playerColor.value === 1 ? '你执黑，先手开局' : '你执白，电脑先手';
    }

    function boardToCanvas(idx: number): number {
        return PADDING + idx * CELL_SIZE;
    }

    function canvasToBoard(pos: number): number {
        return Math.round((pos - PADDING) / CELL_SIZE);
    }

    function commitMove(row: number, col: number, player: Stone, result: MoveResult) {
        board.value = result.board;
        lastMove.value = [row, col];
        placingStone.value = { row, col, color: player, start: performance.now() };
        moveHistory.value.push({ row, col, player });
        moveCount.value++;
        consecutivePasses.value = 0;
        invalidHint.value = '';
        history.value.add(boardKey(result.board));

        if (player === 1) blackCaptures.value += result.captured;
        if (player === 2) whiteCaptures.value += result.captured;

        currentPlayer.value = opponent(player);
        if (currentPlayer.value === playerColor.value) {
            message.value = result.captured > 0 ? `提掉 ${result.captured} 子，轮到你` : '轮到你落子';
        } else {
            message.value = result.captured > 0 ? `电脑被提 ${result.captured} 子，正在应手` : '电脑思考中';
            scheduleAIMove();
        }
    }

    function handleClick(mx: number, my: number) {
        if (gameStatus.value !== 'playing') return;
        if (currentPlayer.value !== playerColor.value) return;

        const row = canvasToBoard(my);
        const col = canvasToBoard(mx);
        const result = tryMove(board.value, row, col, playerColor.value, history.value);

        if (!result || result.reason) {
            invalidHint.value = result?.reason ?? '这里不能落子';
            message.value = invalidHint.value;
            return;
        }

        commitMove(row, col, playerColor.value, result);
    }

    function handleHover(mx: number, my: number) {
        if (gameStatus.value !== 'playing' || currentPlayer.value !== playerColor.value) {
            hoverPos.value = null;
            return;
        }

        const row = canvasToBoard(my);
        const col = canvasToBoard(mx);
        if (!isInside(row, col) || board.value[row][col] !== 0) {
            hoverPos.value = null;
            return;
        }
        hoverPos.value = [row, col];
    }

    function passTurn() {
        if (gameStatus.value !== 'playing') return;
        if (currentPlayer.value !== playerColor.value) return;
        applyPass(playerColor.value);
    }

    function applyPass(player: Stone) {
        consecutivePasses.value++;
        moveHistory.value.push({ row: -1, col: -1, player, pass: true });
        lastMove.value = null;
        hoverPos.value = null;
        placingStone.value = null;
        invalidHint.value = '';

        if (consecutivePasses.value >= 2) {
            endByScore();
            return;
        }

        currentPlayer.value = opponent(player);
        if (currentPlayer.value === playerColor.value) {
            message.value = '电脑停一手，轮到你';
        } else {
            message.value = '你停一手，电脑思考中';
            scheduleAIMove();
        }
    }

    function endByScore() {
        finalScore.value = scoreBoard(board.value);
        gameStatus.value = 'ended';
        clearAITimer();
        const score = finalScore.value;
        const playerScore = playerColor.value === 1 ? score.black : score.white;
        const aiScore = aiColor.value === 1 ? score.black : score.white;
        if (playerScore > aiScore) {
            message.value = `你赢了 ${playerScore} : ${aiScore}`;
        } else if (aiScore > playerScore) {
            message.value = `电脑获胜 ${aiScore} : ${playerScore}`;
        } else {
            message.value = `平局 ${playerScore} : ${aiScore}`;
        }
    }

    function scheduleAIMove() {
        clearAITimer();
        aiTimer = setTimeout(
            async () => {
                if (gameStatus.value !== 'playing' || currentPlayer.value !== aiColor.value) return;
                const positionSnapshot = boardKey(board.value);
                const historySnapshot = [...moveHistory.value];
                message.value = 'KataGo 思考中，首次启动可能需要调校 GPU...';
                const engineResult = await findKataGoMove(historySnapshot, aiColor.value, 1200);
                const engineMove = engineResult.move;
                if (gameStatus.value !== 'playing' || currentPlayer.value !== aiColor.value) return;
                if (boardKey(board.value) !== positionSnapshot) {
                    scheduleAIMove();
                    return;
                }

                if (engineMove === 'pass') {
                    applyPass(aiColor.value);
                    return;
                }

                if (!engineMove) {
                    message.value = engineResult.error
                        ? `KataGo 不可用：${engineResult.error.slice(0, 90)}`
                        : 'KataGo 不可用，请检查引擎、模型和配置';
                    gameStatus.value = 'ended';
                    return;
                }

                const move = engineMove;
                const result = tryMove(board.value, move[0], move[1], aiColor.value, history.value);
                if (!result || result.reason) {
                    applyPass(aiColor.value);
                    return;
                }
                commitMove(move[0], move[1], aiColor.value, result);
            },
            550 + Math.random() * 350,
        );
    }

    function drawStone(
        ctx: CanvasRenderingContext2D,
        row: number,
        col: number,
        color: Stone,
        alpha = 1,
        scale = 1,
        yOffset = 0,
    ) {
        const x = boardToCanvas(col);
        const y = boardToCanvas(row) + yOffset;
        const radius = CELL_SIZE * 0.42 * scale;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(x - 6 * scale, y - 7 * scale, 3 * scale, x, y, radius * 1.1);
        if (color === 1) {
            gradient.addColorStop(0, '#4b5563');
            gradient.addColorStop(0.45, '#151922');
            gradient.addColorStop(1, '#030712');
            ctx.fillStyle = gradient;
        } else {
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(0.55, '#f7f0dd');
            gradient.addColorStop(1, '#c9bda2');
            ctx.fillStyle = gradient;
        }
        ctx.fill();
        ctx.strokeStyle = color === 1 ? '#020617' : '#9a8f78';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    }

    function getDropAnimation(animation: StoneAnimation) {
        const progress = Math.min(1, (performance.now() - animation.start) / STONE_DROP_MS);
        const eased = 1 - Math.pow(1 - progress, 3);
        const overshoot = progress < 0.78 ? 0 : Math.sin(((progress - 0.78) / 0.22) * Math.PI) * 0.08;

        return {
            done: progress >= 1,
            yOffset: -CELL_SIZE * 0.72 * (1 - eased),
            scale: 0.72 + eased * 0.28 + overshoot,
            alpha: 0.35 + eased * 0.65,
        };
    }

    function draw(ctx: CanvasRenderingContext2D) {
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

        const wood = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
        wood.addColorStop(0, '#deb96b');
        wood.addColorStop(0.5, '#c99343');
        wood.addColorStop(1, '#ad7330');
        ctx.fillStyle = wood;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        ctx.strokeStyle = 'rgba(83, 49, 22, 0.72)';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < BOARD_SIZE; i++) {
            const p = boardToCanvas(i);
            ctx.beginPath();
            ctx.moveTo(PADDING, p);
            ctx.lineTo(PADDING + (BOARD_SIZE - 1) * CELL_SIZE, p);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(p, PADDING);
            ctx.lineTo(p, PADDING + (BOARD_SIZE - 1) * CELL_SIZE);
            ctx.stroke();
        }

        const starPoints = [
            [3, 3],
            [3, 9],
            [3, 15],
            [9, 3],
            [9, 9],
            [9, 15],
            [15, 3],
            [15, 9],
            [15, 15],
        ];
        ctx.fillStyle = '#593315';
        for (const [r, c] of starPoints) {
            ctx.beginPath();
            ctx.arc(boardToCanvas(c), boardToCanvas(r), 4.5, 0, Math.PI * 2);
            ctx.fill();
        }

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const stone = board.value[r][c];
                const animating = placingStone.value && placingStone.value.row === r && placingStone.value.col === c;
                if (stone !== 0 && animating) continue;
                if (stone !== 0) drawStone(ctx, r, c, stone);
            }
        }

        if (placingStone.value) {
            const animation = placingStone.value;
            const state = getDropAnimation(animation);
            drawStone(ctx, animation.row, animation.col, animation.color, state.alpha, state.scale, state.yOffset);
            if (state.done) placingStone.value = null;
        }

        if (lastMove.value) {
            const [r, c] = lastMove.value;
            const x = boardToCanvas(c);
            const y = boardToCanvas(r);
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fillStyle = board.value[r][c] === 1 ? '#f8fafc' : '#111827';
            ctx.fill();
        }

        if (hoverPos.value && gameStatus.value === 'playing') {
            drawStone(ctx, hoverPos.value[0], hoverPos.value[1], playerColor.value, 0.45);
        }

        ctx.fillStyle = 'rgba(83, 49, 22, 0.85)';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < BOARD_SIZE; i++) {
            ctx.fillText(String.fromCharCode(65 + i), boardToCanvas(i), 13);
            ctx.fillText(`${BOARD_SIZE - i}`, 13, boardToCanvas(i));
        }
    }

    function getWidth() {
        return CANVAS_W;
    }
    function getHeight() {
        return CANVAS_H;
    }

    onUnmounted(clearAITimer);

    return {
        board,
        currentPlayer,
        playerColor,
        aiColor,
        gameStatus,
        message,
        lastMove,
        moveCount,
        blackCaptures,
        whiteCaptures,
        playerCaptures,
        aiCaptures,
        consecutivePasses,
        finalScore,
        invalidHint,
        moveHistory,
        startGame,
        switchColor,
        handleClick,
        handleHover,
        passTurn,
        draw,
        getWidth,
        getHeight,
        clearAITimer,
    };
}
