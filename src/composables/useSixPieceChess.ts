import { computed, onUnmounted, ref } from 'vue';

const CANVAS_W = 520;
const CANVAS_H = 460;
const POINT_RADIUS = 18;
const PIECE_RADIUS = 24;
const PLAYER = 1;
const AI = 2;

type Piece = 0 | 1 | 2;
type GameStatus = 'idle' | 'playing' | 'ended';
type Difficulty = 'easy' | 'hard';
type MoveKind = 'step' | 'capture';

interface BoardPoint {
    id: number;
    row: number;
    col: number;
    x: number;
    y: number;
}

export interface SixPieceMove {
    from: number;
    to: number;
    kind: MoveKind;
    jumped?: number;
}

interface PieceAnimation {
    from: number;
    to: number;
    player: Piece;
    start: number;
    kind: MoveKind;
}

interface SearchResult {
    score: number;
    move: SixPieceMove | null;
}

const POINTS: BoardPoint[] = [
    { id: 0, row: 0, col: 1, x: 200, y: 52 },
    { id: 1, row: 0, col: 2, x: 320, y: 52 },
    { id: 2, row: 1, col: 0, x: 80, y: 172 },
    { id: 3, row: 1, col: 1, x: 200, y: 172 },
    { id: 4, row: 1, col: 2, x: 320, y: 172 },
    { id: 5, row: 1, col: 3, x: 440, y: 172 },
    { id: 6, row: 2, col: 0, x: 80, y: 292 },
    { id: 7, row: 2, col: 1, x: 200, y: 292 },
    { id: 8, row: 2, col: 2, x: 320, y: 292 },
    { id: 9, row: 2, col: 3, x: 440, y: 292 },
    { id: 10, row: 3, col: 1, x: 200, y: 412 },
    { id: 11, row: 3, col: 2, x: 320, y: 412 },
];

const INITIAL_BOARD: Piece[] = [AI, AI, AI, AI, AI, AI, PLAYER, PLAYER, PLAYER, PLAYER, PLAYER, PLAYER];
const LINES = [
    [0, 3, 7, 10],
    [1, 4, 8, 11],
    [2, 3, 4, 5],
    [6, 7, 8, 9],
];

const NEIGHBORS = buildNeighbors();
const JUMPS = buildJumps();

function buildNeighbors(): Map<number, number[]> {
    const neighbors = new Map<number, Set<number>>();
    for (const point of POINTS) neighbors.set(point.id, new Set());

    for (const line of LINES) {
        for (let i = 0; i < line.length - 1; i++) {
            neighbors.get(line[i])?.add(line[i + 1]);
            neighbors.get(line[i + 1])?.add(line[i]);
        }
    }

    return new Map([...neighbors.entries()].map(([id, set]) => [id, [...set]]));
}

function buildJumps(): Map<number, { over: number; to: number }[]> {
    const jumps = new Map<number, { over: number; to: number }[]>();
    for (const point of POINTS) jumps.set(point.id, []);

    for (const line of LINES) {
        for (let i = 0; i < line.length - 2; i++) {
            jumps.get(line[i])?.push({ over: line[i + 1], to: line[i + 2] });
            jumps.get(line[i + 2])?.push({ over: line[i + 1], to: line[i] });
        }
    }

    return jumps;
}

function opponent(player: Piece): Piece {
    return player === PLAYER ? AI : PLAYER;
}

function countPieces(board: Piece[], player: Piece): number {
    return board.filter(piece => piece === player).length;
}

function getMoves(board: Piece[], player: Piece): SixPieceMove[] {
    const moves: SixPieceMove[] = [];
    const enemy = opponent(player);

    for (let from = 0; from < board.length; from++) {
        if (board[from] !== player) continue;

        for (const to of NEIGHBORS.get(from) ?? []) {
            if (board[to] === 0) moves.push({ from, to, kind: 'step' });
        }

        for (const jump of JUMPS.get(from) ?? []) {
            if (board[jump.over] === player && board[jump.to] === enemy) {
                moves.push({ from, to: jump.to, jumped: jump.over, kind: 'capture' });
            }
        }
    }

    return moves.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'capture' ? -1 : 1;
        return a.from - b.from || a.to - b.to;
    });
}

function applyMove(board: Piece[], move: SixPieceMove, player: Piece): Piece[] {
    const next = [...board];
    next[move.from] = 0;
    next[move.to] = player;
    return next;
}

function mobilityScore(board: Piece[], player: Piece): number {
    return getMoves(board, player).length;
}

function captureScore(board: Piece[], player: Piece): number {
    return getMoves(board, player).filter(move => move.kind === 'capture').length;
}

function centerScore(board: Piece[], player: Piece): number {
    const centerIds = new Set([3, 4, 7, 8]);
    return board.reduce((sum, piece, index) => sum + (piece === player && centerIds.has(index) ? 1 : 0), 0);
}

function evaluateBoard(board: Piece[], player: Piece): number {
    const enemy = opponent(player);
    const myPieces = countPieces(board, player);
    const enemyPieces = countPieces(board, enemy);

    if (enemyPieces <= 1) return 100000;
    if (myPieces <= 1) return -100000;

    return (
        (myPieces - enemyPieces) * 160 +
        (captureScore(board, player) - captureScore(board, enemy)) * 54 +
        (mobilityScore(board, player) - mobilityScore(board, enemy)) * 8 +
        (centerScore(board, player) - centerScore(board, enemy)) * 6
    );
}

function boardKey(board: Piece[], player: Piece, depth: number): string {
    return `${player}:${depth}:${board.join('')}`;
}

function minimax(
    board: Piece[],
    player: Piece,
    maximizingPlayer: Piece,
    depth: number,
    alpha: number,
    beta: number,
    table: Map<string, number>,
): SearchResult {
    const moves = getMoves(board, player);
    const enemy = opponent(player);

    if (countPieces(board, PLAYER) <= 1 || countPieces(board, AI) <= 1) {
        return { score: evaluateBoard(board, maximizingPlayer), move: null };
    }

    if (moves.length === 0) {
        return {
            score: player === maximizingPlayer ? -90000 - depth * 10 : 90000 + depth * 10,
            move: null,
        };
    }

    if (depth === 0) {
        return { score: evaluateBoard(board, maximizingPlayer), move: null };
    }

    const key = boardKey(board, player, depth);
    const cached = table.get(key);
    if (cached !== undefined) return { score: cached, move: null };

    let bestMove: SixPieceMove | null = null;

    if (player === maximizingPlayer) {
        let bestScore = -Infinity;
        for (const move of moves) {
            const next = applyMove(board, move, player);
            const result = minimax(next, enemy, maximizingPlayer, depth - 1, alpha, beta, table);
            const score = result.score + (move.kind === 'capture' ? 12 : 0);
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
            alpha = Math.max(alpha, bestScore);
            if (alpha >= beta) break;
        }
        table.set(key, bestScore);
        return { score: bestScore, move: bestMove };
    }

    let bestScore = Infinity;
    for (const move of moves) {
        const next = applyMove(board, move, player);
        const result = minimax(next, enemy, maximizingPlayer, depth - 1, alpha, beta, table);
        const score = result.score - (move.kind === 'capture' ? 12 : 0);
        if (score < bestScore) {
            bestScore = score;
            bestMove = move;
        }
        beta = Math.min(beta, bestScore);
        if (alpha >= beta) break;
    }
    table.set(key, bestScore);
    return { score: bestScore, move: bestMove };
}

function chooseAIMove(board: Piece[], difficulty: Difficulty): SixPieceMove | null {
    const moves = getMoves(board, AI);
    if (moves.length === 0) return null;

    if (difficulty === 'easy') {
        const captures = moves.filter(move => move.kind === 'capture');
        const pool = captures.length > 0 ? captures : moves;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    const table = new Map<string, number>();
    const depth = countPieces(board, PLAYER) + countPieces(board, AI) <= 7 ? 12 : 9;
    const result = minimax(board, AI, AI, depth, -Infinity, Infinity, table);
    if (result.move) return result.move;
    return moves[Math.floor(Math.random() * moves.length)];
}

function pointAt(x: number, y: number): number | null {
    for (const point of POINTS) {
        const distance = Math.hypot(point.x - x, point.y - y);
        if (distance <= PIECE_RADIUS + 12) return point.id;
    }
    return null;
}

function moveLabel(move: SixPieceMove | null): string {
    if (!move) return '';
    const from = POINTS[move.from];
    const to = POINTS[move.to];
    return `${String.fromCharCode(65 + from.col)}${4 - from.row} -> ${String.fromCharCode(65 + to.col)}${4 - to.row}`;
}

export function useSixPieceChess() {
    const board = ref<Piece[]>([...INITIAL_BOARD]);
    const currentPlayer = ref<Piece>(PLAYER);
    const gameStatus = ref<GameStatus>('idle');
    const difficulty = ref<Difficulty>('hard');
    const message = ref('双方各六子，跳过己子吃敌子');
    const selectedPoint = ref<number | null>(null);
    const hoverPoint = ref<number | null>(null);
    const lastMove = ref<SixPieceMove | null>(null);
    const animation = ref<PieceAnimation | null>(null);

    let aiTimer: ReturnType<typeof setTimeout> | null = null;

    const playerCount = computed(() => countPieces(board.value, PLAYER));
    const aiCount = computed(() => countPieces(board.value, AI));
    const playerMoves = computed(() => getMoves(board.value, PLAYER));
    const legalMoves = computed(() =>
        gameStatus.value === 'playing' && currentPlayer.value === PLAYER ? getMoves(board.value, PLAYER) : [],
    );
    const selectedMoves = computed(() =>
        selectedPoint.value === null ? [] : legalMoves.value.filter(move => move.from === selectedPoint.value),
    );

    function clearAITimer() {
        if (aiTimer !== null) {
            clearTimeout(aiTimer);
            aiTimer = null;
        }
    }

    function startGame() {
        board.value = [...INITIAL_BOARD];
        currentPlayer.value = PLAYER;
        gameStatus.value = 'playing';
        selectedPoint.value = null;
        hoverPoint.value = null;
        lastMove.value = null;
        animation.value = null;
        clearAITimer();
        message.value = '轮到你走棋。先选棋子，再点目标点';
    }

    function switchDifficulty() {
        if (gameStatus.value !== 'idle') return;
        difficulty.value = difficulty.value === 'easy' ? 'hard' : 'easy';
        message.value = difficulty.value === 'easy' ? '已切换为轻松 AI' : '已切换为标准 AI';
    }

    function finishIfNeeded(nextPlayer: Piece): boolean {
        const humanLeft = countPieces(board.value, PLAYER);
        const aiLeft = countPieces(board.value, AI);
        if (aiLeft <= 1) {
            gameStatus.value = 'ended';
            message.value = '你赢了！对方只剩一子';
            clearAITimer();
            return true;
        }
        if (humanLeft <= 1) {
            gameStatus.value = 'ended';
            message.value = '电脑获胜，你只剩一子';
            clearAITimer();
            return true;
        }

        const moves = getMoves(board.value, nextPlayer);
        if (moves.length === 0) {
            gameStatus.value = 'ended';
            message.value = nextPlayer === PLAYER ? '你无棋可走，电脑获胜' : '电脑无棋可走，你赢了';
            clearAITimer();
            return true;
        }

        return false;
    }

    function commitMove(move: SixPieceMove, player: Piece) {
        board.value = applyMove(board.value, move, player);
        lastMove.value = move;
        animation.value = { from: move.from, to: move.to, player, kind: move.kind, start: performance.now() };
        selectedPoint.value = null;
        hoverPoint.value = null;

        const nextPlayer = opponent(player);
        currentPlayer.value = nextPlayer;
        if (finishIfNeeded(nextPlayer)) return;

        if (nextPlayer === AI) {
            message.value = `你走了 ${move.kind === 'capture' ? '吃子' : '移子'}：${moveLabel(move)}，电脑思考中`;
            scheduleAIMove();
        } else {
            message.value = `电脑走了 ${move.kind === 'capture' ? '吃子' : '移子'}：${moveLabel(move)}，轮到你`;
        }
    }

    function handleClick(x: number, y: number) {
        if (gameStatus.value !== 'playing' || currentPlayer.value !== PLAYER) return;
        const pointId = pointAt(x, y);
        if (pointId === null) {
            selectedPoint.value = null;
            return;
        }

        const moveToPoint = selectedMoves.value.find(move => move.to === pointId);
        if (moveToPoint) {
            commitMove(moveToPoint, PLAYER);
            return;
        }

        if (board.value[pointId] === PLAYER) {
            const moves = legalMoves.value.filter(move => move.from === pointId);
            selectedPoint.value = moves.length > 0 ? pointId : null;
            message.value = moves.length > 0 ? '选择目标点完成走棋' : '这枚棋子暂时没有合法走法';
            return;
        }

        if (selectedPoint.value !== null) {
            message.value = '不能走到这里。移到相邻空点，或隔着己方棋子跳吃敌子';
        }
    }

    function handleHover(x: number, y: number) {
        if (gameStatus.value !== 'playing' || currentPlayer.value !== PLAYER) {
            hoverPoint.value = null;
            return;
        }
        hoverPoint.value = pointAt(x, y);
    }

    function scheduleAIMove() {
        clearAITimer();
        aiTimer = setTimeout(
            () => {
                if (gameStatus.value !== 'playing' || currentPlayer.value !== AI) return;
                const move = chooseAIMove(board.value, difficulty.value);
                if (!move) {
                    finishIfNeeded(AI);
                    return;
                }
                commitMove(move, AI);
            },
            520 + Math.random() * 280,
        );
    }

    function drawBoard(ctx: CanvasRenderingContext2D) {
        const boardGradient = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
        boardGradient.addColorStop(0, '#e8c878');
        boardGradient.addColorStop(0.5, '#c7903f');
        boardGradient.addColorStop(1, '#8f5f2d');
        ctx.fillStyle = boardGradient;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        ctx.save();
        ctx.strokeStyle = 'rgba(71, 38, 12, 0.74)';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        for (const line of LINES) {
            ctx.beginPath();
            const first = POINTS[line[0]];
            ctx.moveTo(first.x, first.y);
            for (const id of line.slice(1)) {
                const point = POINTS[id];
                ctx.lineTo(point.x, point.y);
            }
            ctx.stroke();
        }
        ctx.restore();

        for (const point of POINTS) {
            ctx.beginPath();
            ctx.arc(point.x, point.y, POINT_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(70, 36, 13, 0.18)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(72, 38, 12, 0.48)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    function drawPiece(ctx: CanvasRenderingContext2D, x: number, y: number, piece: Piece, options: { alpha?: number; scale?: number } = {}) {
        if (piece === 0) return;
        const alpha = options.alpha ?? 1;
        const scale = options.scale ?? 1;
        const radius = PIECE_RADIUS * scale;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.ellipse(x, y + radius * 0.38, radius * 0.82, radius * 0.28, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(30, 15, 6, 0.25)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(x - 7, y - 8, 4, x, y, radius * 1.15);
        if (piece === PLAYER) {
            gradient.addColorStop(0, '#fff7ed');
            gradient.addColorStop(0.5, '#ef4444');
            gradient.addColorStop(1, '#7f1d1d');
        } else {
            gradient.addColorStop(0, '#dbeafe');
            gradient.addColorStop(0.5, '#2563eb');
            gradient.addColorStop(1, '#172554');
        }
        ctx.fillStyle = gradient;
        ctx.shadowColor = piece === PLAYER ? 'rgba(248, 113, 113, 0.25)' : 'rgba(96, 165, 250, 0.25)';
        ctx.shadowBlur = 12 * scale;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = piece === PLAYER ? '#7f1d1d' : '#0f172a';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        ctx.font = `${Math.max(13, 15 * scale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(piece === PLAYER ? '红' : '蓝', x, y + 1);
        ctx.restore();
    }

    function draw(ctx: CanvasRenderingContext2D) {
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        drawBoard(ctx);

        const now = performance.now();
        const activeAnimation = animation.value;
        const movingPoint = activeAnimation && now - activeAnimation.start < 360 ? activeAnimation : null;
        const moveTargets = new Set(selectedMoves.value.map(move => move.to));
        const moveSources = new Set(legalMoves.value.map(move => move.from));

        if (gameStatus.value === 'playing' && currentPlayer.value === PLAYER) {
            for (const pointId of moveSources) {
                const point = POINTS[pointId];
                ctx.beginPath();
                ctx.arc(point.x, point.y, PIECE_RADIUS + 5, 0, Math.PI * 2);
                ctx.strokeStyle = pointId === selectedPoint.value ? '#fef08a' : 'rgba(254, 240, 138, 0.42)';
                ctx.lineWidth = pointId === selectedPoint.value ? 4 : 2;
                ctx.stroke();
            }

            for (const move of selectedMoves.value) {
                const point = POINTS[move.to];
                const pulse = (Math.sin(now / 230) + 1) / 2;
                ctx.beginPath();
                ctx.arc(point.x, point.y, POINT_RADIUS + 6 + pulse * 3, 0, Math.PI * 2);
                ctx.fillStyle = move.kind === 'capture' ? 'rgba(248, 113, 113, 0.32)' : 'rgba(250, 204, 21, 0.27)';
                ctx.fill();
                ctx.strokeStyle = move.kind === 'capture' ? 'rgba(254, 202, 202, 0.9)' : 'rgba(254, 240, 138, 0.82)';
                ctx.lineWidth = 3;
                ctx.stroke();
            }
        }

        if (lastMove.value) {
            const from = POINTS[lastMove.value.from];
            const to = POINTS[lastMove.value.to];
            ctx.save();
            ctx.strokeStyle = lastMove.value.kind === 'capture' ? 'rgba(248,113,113,0.72)' : 'rgba(250,204,21,0.62)';
            ctx.lineWidth = 4;
            ctx.setLineDash([9, 8]);
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.stroke();
            ctx.restore();
        }

        for (const point of POINTS) {
            const piece = board.value[point.id];
            if (piece === 0) continue;
            if (movingPoint && movingPoint.to === point.id) continue;
            drawPiece(ctx, point.x, point.y, piece);
        }

        if (movingPoint) {
            const progress = Math.min(1, (now - movingPoint.start) / 360);
            const eased = 1 - Math.pow(1 - progress, 3);
            const from = POINTS[movingPoint.from];
            const to = POINTS[movingPoint.to];
            drawPiece(ctx, from.x + (to.x - from.x) * eased, from.y + (to.y - from.y) * eased, movingPoint.player, {
                scale: movingPoint.kind === 'capture' ? 1.08 : 1,
            });
        } else if (animation.value) {
            animation.value = null;
        }

        if (hoverPoint.value !== null && moveTargets.has(hoverPoint.value)) {
            const point = POINTS[hoverPoint.value];
            ctx.beginPath();
            ctx.arc(point.x, point.y, PIECE_RADIUS + 10, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.68)';
            ctx.lineWidth = 2;
            ctx.stroke();
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
        gameStatus,
        difficulty,
        message,
        selectedPoint,
        hoverPoint,
        lastMove,
        playerCount,
        aiCount,
        playerMoves,
        legalMoves,
        selectedMoves,
        startGame,
        switchDifficulty,
        handleClick,
        handleHover,
        draw,
        getWidth,
        getHeight,
        clearAITimer,
    };
}
