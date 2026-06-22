import { computed, onUnmounted, ref } from 'vue';

const BOARD_SIZE = 8;
const CELL_SIZE = 68;
const PADDING = 24;
const CANVAS_SIZE = PADDING * 2 + BOARD_SIZE * CELL_SIZE;

type Disc = 0 | 1 | 2;
type GameStatus = 'idle' | 'playing' | 'ended';
type Difficulty = 'easy' | 'hard';

interface Move {
    row: number;
    col: number;
    flips: [number, number][];
}

interface DiscAnimation {
    row: number;
    col: number;
    player: Disc;
    start: number;
    placed?: boolean;
}

const DIRECTIONS = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
];

const POSITION_WEIGHTS = [
    [120, -24, 18, 6, 6, 18, -24, 120],
    [-24, -42, -6, -4, -4, -6, -42, -24],
    [18, -6, 14, 5, 5, 14, -6, 18],
    [6, -4, 5, 3, 3, 5, -4, 6],
    [6, -4, 5, 3, 3, 5, -4, 6],
    [18, -6, 14, 5, 5, 14, -6, 18],
    [-24, -42, -6, -4, -4, -6, -42, -24],
    [120, -24, 18, 6, 6, 18, -24, 120],
];

function createInitialBoard(): Disc[][] {
    const board = Array.from({ length: BOARD_SIZE }, () => Array<Disc>(BOARD_SIZE).fill(0));
    board[3][3] = 2;
    board[3][4] = 1;
    board[4][3] = 1;
    board[4][4] = 2;
    return board;
}

function cloneBoard(board: Disc[][]): Disc[][] {
    return board.map(row => [...row]);
}

function opponent(player: Disc): Disc {
    return player === 1 ? 2 : 1;
}

function isInside(row: number, col: number): boolean {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function getFlips(board: Disc[][], row: number, col: number, player: Disc): [number, number][] {
    if (!isInside(row, col) || board[row][col] !== 0) return [];
    const other = opponent(player);
    const flips: [number, number][] = [];

    for (const [dr, dc] of DIRECTIONS) {
        const line: [number, number][] = [];
        let r = row + dr;
        let c = col + dc;

        while (isInside(r, c) && board[r][c] === other) {
            line.push([r, c]);
            r += dr;
            c += dc;
        }

        if (line.length > 0 && isInside(r, c) && board[r][c] === player) {
            flips.push(...line);
        }
    }

    return flips;
}

function getValidMoves(board: Disc[][], player: Disc): Move[] {
    const moves: Move[] = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const flips = getFlips(board, r, c, player);
            if (flips.length > 0) moves.push({ row: r, col: c, flips });
        }
    }
    return moves;
}

function applyMove(board: Disc[][], move: Move, player: Disc): Disc[][] {
    const next = cloneBoard(board);
    next[move.row][move.col] = player;
    for (const [r, c] of move.flips) next[r][c] = player;
    return next;
}

function countDiscs(board: Disc[][]) {
    let black = 0;
    let white = 0;
    for (const row of board) {
        for (const cell of row) {
            if (cell === 1) black++;
            if (cell === 2) white++;
        }
    }
    return { black, white, empty: BOARD_SIZE * BOARD_SIZE - black - white };
}

function evaluateBoard(board: Disc[][], player: Disc): number {
    const other = opponent(player);
    const counts = countDiscs(board);
    const playerCount = player === 1 ? counts.black : counts.white;
    const otherCount = other === 1 ? counts.black : counts.white;
    const playerMoves = getValidMoves(board, player).length;
    const otherMoves = getValidMoves(board, other).length;
    let score = 0;

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] === player) score += POSITION_WEIGHTS[r][c];
            if (board[r][c] === other) score -= POSITION_WEIGHTS[r][c];
        }
    }

    score += (playerMoves - otherMoves) * 8;
    score += (playerCount - otherCount) * (counts.empty < 14 ? 6 : 1);
    return score;
}

function minimax(board: Disc[][], player: Disc, maximizingPlayer: Disc, depth: number, alpha: number, beta: number): number {
    const moves = getValidMoves(board, player);
    const other = opponent(player);
    const otherMoves = getValidMoves(board, other);

    if (depth === 0 || (moves.length === 0 && otherMoves.length === 0)) {
        return evaluateBoard(board, maximizingPlayer);
    }

    if (moves.length === 0) {
        return minimax(board, other, maximizingPlayer, depth - 1, alpha, beta);
    }

    if (player === maximizingPlayer) {
        let value = -Infinity;
        for (const move of moves) {
            value = Math.max(value, minimax(applyMove(board, move, player), other, maximizingPlayer, depth - 1, alpha, beta));
            alpha = Math.max(alpha, value);
            if (alpha >= beta) break;
        }
        return value;
    }

    let value = Infinity;
    for (const move of moves) {
        value = Math.min(value, minimax(applyMove(board, move, player), other, maximizingPlayer, depth - 1, alpha, beta));
        beta = Math.min(beta, value);
        if (alpha >= beta) break;
    }
    return value;
}

function chooseMove(board: Disc[][], player: Disc, difficulty: Difficulty): Move | null {
    const moves = getValidMoves(board, player);
    if (moves.length === 0) return null;

    if (difficulty === 'easy') {
        const ranked = [...moves].sort((a, b) => b.flips.length - a.flips.length);
        const pool = ranked.slice(0, Math.min(3, ranked.length));
        return pool[Math.floor(Math.random() * pool.length)];
    }

    const depth = countDiscs(board).empty <= 14 ? 6 : 4;
    let bestScore = -Infinity;
    let bestMoves: Move[] = [];

    for (const move of moves) {
        const next = applyMove(board, move, player);
        const score = minimax(next, opponent(player), player, depth - 1, -Infinity, Infinity) + move.flips.length * 2;
        if (score > bestScore) {
            bestScore = score;
            bestMoves = [move];
        } else if (score === bestScore) {
            bestMoves.push(move);
        }
    }

    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

export function useReversi() {
    const board = ref<Disc[][]>(createInitialBoard());
    const currentPlayer = ref<Disc>(1);
    const playerColor = ref<Disc>(1);
    const gameStatus = ref<GameStatus>('idle');
    const difficulty = ref<Difficulty>('hard');
    const message = ref('选择执黑或执白开始');
    const lastMove = ref<[number, number] | null>(null);
    const hoverPos = ref<[number, number] | null>(null);
    const flippedDiscs = ref<[number, number][]>([]);
    const animations = ref<DiscAnimation[]>([]);
    const passCount = ref(0);

    let aiTimer: ReturnType<typeof setTimeout> | null = null;

    const aiColor = computed<Disc>(() => (playerColor.value === 1 ? 2 : 1));
    const score = computed(() => countDiscs(board.value));
    const validMoves = computed(() => (gameStatus.value === 'playing' ? getValidMoves(board.value, currentPlayer.value) : []));
    const playerCanMove = computed(() => getValidMoves(board.value, playerColor.value).length > 0);

    function clearAITimer() {
        if (aiTimer !== null) {
            clearTimeout(aiTimer);
            aiTimer = null;
        }
    }

    function startGame() {
        const selectedColor = playerColor.value;
        board.value = createInitialBoard();
        playerColor.value = selectedColor;
        currentPlayer.value = 1;
        gameStatus.value = 'playing';
        lastMove.value = null;
        hoverPos.value = null;
        flippedDiscs.value = [];
        animations.value = [];
        passCount.value = 0;
        clearAITimer();
        message.value = selectedColor === 1 ? '黑棋先行，请落子' : '电脑执黑思考中';
        if (currentPlayer.value === aiColor.value) scheduleAIMove();
    }

    function switchColor() {
        if (gameStatus.value !== 'idle') return;
        playerColor.value = playerColor.value === 1 ? 2 : 1;
        message.value = playerColor.value === 1 ? '你执黑，先手开局' : '你执白，电脑先手';
    }

    function boardToCanvas(idx: number): number {
        return PADDING + idx * CELL_SIZE + CELL_SIZE / 2;
    }

    function canvasToBoard(pos: number): number {
        return Math.floor((pos - PADDING) / CELL_SIZE);
    }

    function finishIfNeeded() {
        const blackMoves = getValidMoves(board.value, 1);
        const whiteMoves = getValidMoves(board.value, 2);
        const counts = countDiscs(board.value);
        if (blackMoves.length > 0 || whiteMoves.length > 0) return false;

        gameStatus.value = 'ended';
        clearAITimer();
        if (counts.black > counts.white) {
            message.value = playerColor.value === 1 ? `你赢了 ${counts.black} : ${counts.white}` : `电脑获胜 ${counts.black} : ${counts.white}`;
        } else if (counts.white > counts.black) {
            message.value = playerColor.value === 2 ? `你赢了 ${counts.white} : ${counts.black}` : `电脑获胜 ${counts.white} : ${counts.black}`;
        } else {
            message.value = `平局 ${counts.black} : ${counts.white}`;
        }
        return true;
    }

    function continueTurn() {
        if (finishIfNeeded()) return;

        const moves = getValidMoves(board.value, currentPlayer.value);
        if (moves.length === 0) {
            const skipped = currentPlayer.value;
            currentPlayer.value = opponent(currentPlayer.value);
            passCount.value++;
            message.value = skipped === playerColor.value ? '你无棋可下，自动跳过' : '电脑无棋可下，轮到你';
            if (currentPlayer.value === aiColor.value) scheduleAIMove();
            return;
        }

        passCount.value = 0;
        if (currentPlayer.value === playerColor.value) {
            message.value = `轮到你落子，可选 ${moves.length} 处`;
        } else {
            message.value = '电脑思考中';
            scheduleAIMove();
        }
    }

    function commitMove(move: Move, player: Disc) {
        board.value = applyMove(board.value, move, player);
        lastMove.value = [move.row, move.col];
        flippedDiscs.value = move.flips;
        animations.value = [
            { row: move.row, col: move.col, player, start: performance.now(), placed: true },
            ...move.flips.map(([row, col]) => ({ row, col, player, start: performance.now() })),
        ];
        currentPlayer.value = opponent(player);
        hoverPos.value = null;
        continueTurn();
    }

    function handleClick(mx: number, my: number) {
        if (gameStatus.value !== 'playing' || currentPlayer.value !== playerColor.value) return;
        const row = canvasToBoard(my);
        const col = canvasToBoard(mx);
        const move = getValidMoves(board.value, playerColor.value).find(item => item.row === row && item.col === col);
        if (!move) {
            message.value = '这里不能落子，需要夹住至少一枚对方棋子';
            return;
        }
        commitMove(move, playerColor.value);
    }

    function handleHover(mx: number, my: number) {
        if (gameStatus.value !== 'playing' || currentPlayer.value !== playerColor.value) {
            hoverPos.value = null;
            return;
        }
        const row = canvasToBoard(my);
        const col = canvasToBoard(mx);
        const canMove = getValidMoves(board.value, playerColor.value).some(move => move.row === row && move.col === col);
        hoverPos.value = canMove ? [row, col] : null;
    }

    function scheduleAIMove() {
        clearAITimer();
        aiTimer = setTimeout(
            () => {
                if (gameStatus.value !== 'playing' || currentPlayer.value !== aiColor.value) return;
                const move = chooseMove(board.value, aiColor.value, difficulty.value);
                if (move) commitMove(move, aiColor.value);
                else continueTurn();
            },
            450 + Math.random() * 300,
        );
    }

    function drawDisc(
        ctx: CanvasRenderingContext2D,
        row: number,
        col: number,
        player: Disc,
        alpha = 1,
        scaleX = 1,
        scaleY = 1,
        yOffset = 0,
    ) {
        const x = boardToCanvas(col);
        const y = boardToCanvas(row) + yOffset;
        const radius = CELL_SIZE * 0.38;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.ellipse(x, y + radius * 0.3, radius * 0.82 * scaleX, radius * 0.34 * scaleY, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(37, 22, 10, ${0.2 * alpha})`;
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(x, y, radius * scaleX, radius * scaleY, 0, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(x - 6, y - 7, 3, x, y, radius * 1.08);
        if (player === 1) {
            gradient.addColorStop(0, '#666');
            gradient.addColorStop(0.48, '#262626');
            gradient.addColorStop(1, '#050505');
        } else {
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(0.52, '#ececec');
            gradient.addColorStop(1, '#bdbdbd');
        }
        ctx.fillStyle = gradient;
        ctx.shadowColor = player === 1 ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.22)';
        ctx.shadowBlur = 6 * Math.max(scaleX, scaleY);
        ctx.shadowOffsetY = 2;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = player === 1 ? '#000' : '#999';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    }

    function draw(ctx: CanvasRenderingContext2D) {
        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        const wood = ctx.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        wood.addColorStop(0, '#deb96b');
        wood.addColorStop(0.5, '#c99343');
        wood.addColorStop(1, '#ad7330');
        ctx.fillStyle = wood;
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        ctx.strokeStyle = 'rgba(83, 49, 22, 0.72)';
        ctx.lineWidth = 1.2;
        for (let i = 0; i <= BOARD_SIZE; i++) {
            const p = PADDING + i * CELL_SIZE;
            ctx.beginPath();
            ctx.moveTo(PADDING, p);
            ctx.lineTo(PADDING + BOARD_SIZE * CELL_SIZE, p);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(p, PADDING);
            ctx.lineTo(p, PADDING + BOARD_SIZE * CELL_SIZE);
            ctx.stroke();
        }


        const now = performance.now();
        const activeAnimations = animations.value;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const disc = board.value[r][c];
                if (disc === 0) continue;
                const animation = activeAnimations.find(item => item.row === r && item.col === c);
                if (animation) {
                    const progress = Math.min(1, (now - animation.start) / 360);
                    if (animation.placed) {
                        const drop = 1 - Math.pow(1 - progress, 3);
                        const impact = progress > 0.72 ? Math.sin(((progress - 0.72) / 0.28) * Math.PI) : 0;
                        drawDisc(
                            ctx,
                            r,
                            c,
                            disc,
                            0.55 + progress * 0.45,
                            1 + impact * 0.08,
                            1 - impact * 0.12,
                            -CELL_SIZE * 0.9 * (1 - drop),
                        );
                    } else {
                        const flip = Math.max(0.12, Math.abs(1 - progress * 2));
                        drawDisc(ctx, r, c, disc, 0.45 + progress * 0.55, flip, 1);
                    }
                } else {
                    drawDisc(ctx, r, c, disc);
                }
            }
        }
        animations.value = activeAnimations.filter(item => now - item.start < 380);

        if (gameStatus.value === 'playing' && currentPlayer.value === playerColor.value) {
            const moves = getValidMoves(board.value, playerColor.value);
            const pulse = (Math.sin(now / 260) + 1) / 2;
            for (const move of moves) {
                const x = boardToCanvas(move.col);
                const y = boardToCanvas(move.row);
                const isHover = hoverPos.value && hoverPos.value[0] === move.row && hoverPos.value[1] === move.col;
                const radius = isHover ? CELL_SIZE * 0.35 : CELL_SIZE * (0.24 + pulse * 0.03);

                ctx.save();
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fillStyle = isHover ? 'rgba(251, 191, 36, 0.34)' : 'rgba(251, 191, 36, 0.22)';
                ctx.fill();
                ctx.lineWidth = isHover ? 4 : 3;
                ctx.strokeStyle = isHover ? 'rgba(255, 247, 237, 0.9)' : 'rgba(254, 240, 138, 0.78)';
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(x, y, radius + 6 + pulse * 3, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(251, 191, 36, ${isHover ? 0.42 : 0.24})`;
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.restore();
            }
        }

        if (hoverPos.value) {
            drawDisc(ctx, hoverPos.value[0], hoverPos.value[1], playerColor.value, 0.48);
        }

        if (lastMove.value) {
            const [r, c] = lastMove.value;
            ctx.beginPath();
            ctx.arc(boardToCanvas(c), boardToCanvas(r), 5, 0, Math.PI * 2);
            ctx.fillStyle = board.value[r][c] === 1 ? '#f8fafc' : '#0f172a';
            ctx.fill();
        }
    }

    function getWidth() {
        return CANVAS_SIZE;
    }

    function getHeight() {
        return CANVAS_SIZE;
    }

    onUnmounted(clearAITimer);

    return {
        board,
        currentPlayer,
        playerColor,
        aiColor,
        gameStatus,
        difficulty,
        message,
        lastMove,
        hoverPos,
        flippedDiscs,
        passCount,
        score,
        validMoves,
        playerCanMove,
        startGame,
        switchColor,
        handleClick,
        handleHover,
        draw,
        getWidth,
        getHeight,
        clearAITimer,
    };
}



