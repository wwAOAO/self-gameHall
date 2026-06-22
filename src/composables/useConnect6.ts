import { ref, onUnmounted } from 'vue';

const BOARD_SIZE = 19;
const CELL_SIZE = 28;
const PADDING = 24;
const CANVAS_W = PADDING * 2 + (BOARD_SIZE - 1) * CELL_SIZE;
const CANVAS_H = CANVAS_W;
const WIN_LENGTH = 6;

type CellState = 0 | 1 | 2;
type GameResult = 'playing' | 'black_win' | 'white_win' | 'draw';
type AIDifficulty = 'easy' | 'hard';

const DIRECTIONS = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
];

const SCORE_SIX = 10000000;
const SCORE_OPEN_FIVE = 900000;
const SCORE_RUSH_FIVE = 150000;
const SCORE_OPEN_FOUR = 50000;
const SCORE_RUSH_FOUR = 8000;
const SCORE_OPEN_THREE = 1300;
const SCORE_RUSH_THREE = 180;
const STONE_ANIMATION_MS = 280;

interface StoneAnimation {
    row: number;
    col: number;
    player: CellState;
    startedAt: number;
}

interface MoveRecord {
    row: number;
    col: number;
    player: CellState;
}

interface Connect6KataGoBestMovesResponse {
    ok?: boolean;
    bestmoves?: { row?: number; col?: number }[] | null;
}

function createEmptyBoard(): CellState[][] {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
}

function getOpponent(player: CellState): CellState {
    return player === 1 ? 2 : 1;
}

function isInside(row: number, col: number): boolean {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function checkWin(board: CellState[][], row: number, col: number, player: CellState): boolean {
    if (player === 0) return false;
    for (const [dr, dc] of DIRECTIONS) {
        let count = 1;
        for (let i = 1; i < WIN_LENGTH; i++) {
            const r = row + dr * i;
            const c = col + dc * i;
            if (!isInside(r, c) || board[r][c] !== player) break;
            count++;
        }
        for (let i = 1; i < WIN_LENGTH; i++) {
            const r = row - dr * i;
            const c = col - dc * i;
            if (!isInside(r, c) || board[r][c] !== player) break;
            count++;
        }
        if (count >= WIN_LENGTH) return true;
    }
    return false;
}

function findWinLine(board: CellState[][], row: number, col: number, player: CellState): [number, number][] {
    for (const [dr, dc] of DIRECTIONS) {
        const line: [number, number][] = [[row, col]];
        for (let i = 1; i < WIN_LENGTH; i++) {
            const r = row + dr * i;
            const c = col + dc * i;
            if (!isInside(r, c) || board[r][c] !== player) break;
            line.push([r, c]);
        }
        for (let i = 1; i < WIN_LENGTH; i++) {
            const r = row - dr * i;
            const c = col - dc * i;
            if (!isInside(r, c) || board[r][c] !== player) break;
            line.unshift([r, c]);
        }
        if (line.length >= WIN_LENGTH) return line.slice(0, WIN_LENGTH);
    }
    return [];
}

function hasNeighbor(board: CellState[][], row: number, col: number, radius = 2): boolean {
    for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr;
            const nc = col + dc;
            if (isInside(nr, nc) && board[nr][nc] !== 0) return true;
        }
    }
    return false;
}

function countLine(board: CellState[][], row: number, col: number, dr: number, dc: number, player: CellState) {
    let count = 1;
    let openEnds = 0;
    let r = row + dr;
    let c = col + dc;
    while (isInside(r, c) && board[r][c] === player) {
        count++;
        r += dr;
        c += dc;
    }
    if (isInside(r, c) && board[r][c] === 0) openEnds++;
    r = row - dr;
    c = col - dc;
    while (isInside(r, c) && board[r][c] === player) {
        count++;
        r -= dr;
        c -= dc;
    }
    if (isInside(r, c) && board[r][c] === 0) openEnds++;
    return { count, openEnds };
}

function evaluateMove(board: CellState[][], row: number, col: number, player: CellState): number {
    if (board[row][col] !== 0) return -Infinity;
    board[row][col] = player;
    let score = 0;
    for (const [dr, dc] of DIRECTIONS) {
        const { count, openEnds } = countLine(board, row, col, dr, dc, player);
        if (count >= 6) score += SCORE_SIX;
        else if (count === 5 && openEnds >= 2) score += SCORE_OPEN_FIVE;
        else if (count === 5 && openEnds === 1) score += SCORE_RUSH_FIVE;
        else if (count === 4 && openEnds >= 2) score += SCORE_OPEN_FOUR;
        else if (count === 4 && openEnds === 1) score += SCORE_RUSH_FOUR;
        else if (count === 3 && openEnds >= 2) score += SCORE_OPEN_THREE;
        else if (count === 3 && openEnds === 1) score += SCORE_RUSH_THREE;
        else if (count === 2 && openEnds >= 1) score += 30;
    }
    const center = Math.floor(BOARD_SIZE / 2);
    score += Math.max(0, 28 - Math.abs(center - row) - Math.abs(center - col));
    board[row][col] = 0;
    return score;
}

function getCandidateMoves(board: CellState[][]): [number, number][] {
    const hasStone = board.some(row => row.some(cell => cell !== 0));
    if (!hasStone) return [[9, 9]];
    const moves: [number, number][] = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] === 0 && hasNeighbor(board, r, c, 2)) moves.push([r, c]);
        }
    }
    return moves;
}

function chooseRandomMove(moves: [number, number][]): [number, number] {
    return moves[Math.floor(Math.random() * moves.length)];
}

function findBestSingleMove(
    board: CellState[][],
    aiPlayer: CellState,
    difficulty: AIDifficulty,
): [number, number] | null {
    const opp = getOpponent(aiPlayer);
    const candidates = getCandidateMoves(board);
    if (candidates.length === 0) return null;
    if (difficulty === 'easy' && Math.random() < 0.24) {
        const nearby = candidates.filter(([r, c]) => hasNeighbor(board, r, c, 1));
        return chooseRandomMove(nearby.length ? nearby : candidates);
    }
    let bestMove = candidates[0];
    let bestScore = -Infinity;
    for (const [r, c] of candidates) {
        board[r][c] = aiPlayer;
        const winsNow = checkWin(board, r, c, aiPlayer);
        board[r][c] = 0;
        if (winsNow) return [r, c];

        board[r][c] = opp;
        const blocksWin = checkWin(board, r, c, opp);
        board[r][c] = 0;
        if (blocksWin) return [r, c];

        const attack = evaluateMove(board, r, c, aiPlayer);
        const defend = evaluateMove(board, r, c, opp);
        const noise = difficulty === 'easy' ? Math.random() * 550 : Math.random() * 60;
        const score = attack * 1.2 + defend * 1.35 + noise;
        if (score > bestScore) {
            bestScore = score;
            bestMove = [r, c];
        }
    }
    return bestMove;
}

async function findKataGoConnect6Moves(
    moves: MoveRecord[],
    side: CellState,
    stonesToMove: number,
    timeMs = 1600,
): Promise<[number, number][] | null> {
    try {
        const response = await fetch('/api/connect6-katago/bestmoves', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ moves, side, stonesToMove, timeMs, boardSize: BOARD_SIZE }),
        });

        if (!response.ok) return null;
        const data = (await response.json()) as Connect6KataGoBestMovesResponse;
        if (!data.ok || !Array.isArray(data.bestmoves)) return null;

        const parsed: [number, number][] = [];
        for (const move of data.bestmoves) {
            const row = Number(move.row);
            const col = Number(move.col);
            if (isInside(row, col)) parsed.push([row, col]);
        }
        return parsed.length > 0 ? parsed : null;
    } catch {
        return null;
    }
}
function easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function useConnect6() {
    const board = ref<CellState[][]>(createEmptyBoard());
    const currentPlayer = ref<CellState>(1);
    const gameStatus = ref<'idle' | 'playing' | 'ended'>('idle');
    const result = ref<GameResult>('playing');
    const message = ref('选择先后手后开始');
    const playerColor = ref<CellState>(1);
    const difficulty = ref<AIDifficulty>('hard');
    const lastMove = ref<[number, number] | null>(null);
    const lastTurnMoves = ref<[number, number][]>([]);
    const winLine = ref<[number, number][] | null>(null);
    const moveCount = ref(0);
    const stonesThisTurn = ref(0);
    const stonesRequiredThisTurn = ref(1);
    const hoverPos = ref<[number, number] | null>(null);
    const placeAnimation = ref<StoneAnimation | null>(null);
    const moveHistory = ref<MoveRecord[]>([]);
    let aiTimer: ReturnType<typeof setTimeout> | null = null;

    function clearAITimer() {
        if (aiTimer !== null) {
            clearTimeout(aiTimer);
            aiTimer = null;
        }
    }

    function requiredForTurn(player: CellState): number {
        return player === 1 && moveCount.value === 0 ? 1 : 2;
    }

    function updateTurnRequirement() {
        stonesRequiredThisTurn.value = requiredForTurn(currentPlayer.value);
    }

    function startGame() {
        const selectedColor = playerColor.value;
        board.value = createEmptyBoard();
        currentPlayer.value = 1;
        gameStatus.value = 'playing';
        result.value = 'playing';
        playerColor.value = selectedColor;
        lastMove.value = null;
        lastTurnMoves.value = [];
        winLine.value = null;
        moveCount.value = 0;
        stonesThisTurn.value = 0;
        stonesRequiredThisTurn.value = 1;
        hoverPos.value = null;
        placeAnimation.value = null;
        moveHistory.value = [];
        clearAITimer();
        if (playerColor.value === 2) {
            message.value = '电脑先手，黑棋第一手下一子';
            scheduleAIMove();
        } else {
            message.value = '黑棋先行，第一手下一子';
        }
    }

    function boardToCanvas(idx: number): number {
        return PADDING + idx * CELL_SIZE;
    }

    function canvasToBoard(pos: number): number {
        return Math.round((pos - PADDING) / CELL_SIZE);
    }

    function remainingText() {
        const remaining = stonesRequiredThisTurn.value - stonesThisTurn.value;
        return remaining > 1 ? `还需落 ${remaining} 子` : '还需落 1 子';
    }

    function finishStone(row: number, col: number, player: CellState) {
        if (stonesThisTurn.value === 0) lastTurnMoves.value = [];
        board.value[row][col] = player;
        moveHistory.value.push({ row, col, player });
        lastMove.value = [row, col];
        lastTurnMoves.value.push([row, col]);
        placeAnimation.value = { row, col, player, startedAt: performance.now() };
        moveCount.value++;
        stonesThisTurn.value++;
        if (checkWin(board.value, row, col, player)) {
            result.value = player === 1 ? 'black_win' : 'white_win';
            gameStatus.value = 'ended';
            winLine.value = findWinLine(board.value, row, col, player);
            message.value = player === playerColor.value ? '你赢了！' : '电脑赢了';
            return;
        }
        if (moveCount.value >= BOARD_SIZE * BOARD_SIZE) {
            result.value = 'draw';
            gameStatus.value = 'ended';
            message.value = '平局！';
            return;
        }
        if (stonesThisTurn.value < stonesRequiredThisTurn.value) {
            message.value = player === playerColor.value ? remainingText() : '电脑继续落子...';
            return;
        }
        currentPlayer.value = getOpponent(currentPlayer.value);
        stonesThisTurn.value = 0;
        updateTurnRequirement();
        if (currentPlayer.value !== playerColor.value) {
            message.value = `电脑思考中，本回合 ${stonesRequiredThisTurn.value} 子`;
            scheduleAIMove();
        } else {
            message.value = `轮到你，本回合 ${stonesRequiredThisTurn.value} 子`;
        }
    }

    function handleClick(mx: number, my: number) {
        if (gameStatus.value !== 'playing') return;
        if (currentPlayer.value !== playerColor.value) return;
        const row = canvasToBoard(my);
        const col = canvasToBoard(mx);
        if (!isInside(row, col) || board.value[row][col] !== 0) return;
        finishStone(row, col, playerColor.value);
    }

    function handleHover(mx: number, my: number) {
        if (gameStatus.value !== 'playing') return;
        if (currentPlayer.value !== playerColor.value) return;
        const row = canvasToBoard(my);
        const col = canvasToBoard(mx);
        if (!isInside(row, col) || board.value[row][col] !== 0) {
            hoverPos.value = null;
            return;
        }
        hoverPos.value = [row, col];
    }

    function scheduleAIMove() {
        clearAITimer();
        aiTimer = setTimeout(
            async () => {
                if (gameStatus.value !== 'playing') return;
                const aiColor = playerColor.value === 1 ? 2 : 1;
                if (currentPlayer.value !== aiColor) return;

                if (difficulty.value === 'hard') {
                    const placeEngineNext = async () => {
                        if (gameStatus.value !== 'playing' || currentPlayer.value !== aiColor) return;

                        const engineMoves = await findKataGoConnect6Moves(moveHistory.value, aiColor, 1);
                        const move = engineMoves?.find(([row, col]) => board.value[row]?.[col] === 0);

                        if (!move) {
                            message.value = 'Connect6 KataGomo 不可用或没有返回合法落子';
                            gameStatus.value = 'ended';
                            return;
                        }

                        finishStone(move[0], move[1], aiColor);
                        if (gameStatus.value === 'playing' && currentPlayer.value === aiColor) {
                            aiTimer = setTimeout(() => void placeEngineNext(), 260 + Math.random() * 180);
                        }
                    };
                    await placeEngineNext();
                    return;
                }

                const placeLocalNext = () => {
                    if (gameStatus.value !== 'playing' || currentPlayer.value !== aiColor) return;
                    const move = findBestSingleMove(board.value, aiColor, 'easy');
                    if (!move) return;
                    finishStone(move[0], move[1], aiColor);
                    if (gameStatus.value === 'playing' && currentPlayer.value === aiColor) {
                        aiTimer = setTimeout(placeLocalNext, 260 + Math.random() * 180);
                    }
                };
                placeLocalNext();
            },
            420 + Math.random() * 260,
        );
    }

    function switchColor() {
        if (gameStatus.value !== 'idle') return;
        playerColor.value = playerColor.value === 1 ? 2 : 1;
        message.value = playerColor.value === 1 ? '你选择先手（黑棋）' : '你选择后手（白棋）';
    }

    function draw(ctx: CanvasRenderingContext2D) {
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        const now = performance.now();
        ctx.fillStyle = '#d8aa5c';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        const boardGrad = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
        boardGrad.addColorStop(0, 'rgba(255,255,255,0.16)');
        boardGrad.addColorStop(0.45, 'rgba(255,255,255,0)');
        boardGrad.addColorStop(1, 'rgba(82,44,12,0.18)');
        ctx.fillStyle = boardGrad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.strokeStyle = '#6f4324';
        ctx.lineWidth = 1;
        for (let i = 0; i < BOARD_SIZE; i++) {
            const p = boardToCanvas(i);
            ctx.beginPath();
            ctx.moveTo(p, PADDING);
            ctx.lineTo(p, PADDING + (BOARD_SIZE - 1) * CELL_SIZE);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(PADDING, p);
            ctx.lineTo(PADDING + (BOARD_SIZE - 1) * CELL_SIZE, p);
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
        for (const [r, c] of starPoints) {
            ctx.beginPath();
            ctx.arc(boardToCanvas(c), boardToCanvas(r), 3.5, 0, Math.PI * 2);
            ctx.fillStyle = '#6f4324';
            ctx.fill();
        }
        if (winLine.value && winLine.value.length >= WIN_LENGTH) {
            const [fr, fc] = winLine.value[0];
            const [tr, tc] = winLine.value[WIN_LENGTH - 1];
            ctx.strokeStyle = 'rgba(250, 204, 21, 0.74)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(boardToCanvas(fc), boardToCanvas(fr));
            ctx.lineTo(boardToCanvas(tc), boardToCanvas(tr));
            ctx.stroke();
        }

        function drawStone(x: number, y: number, player: CellState, scale = 1, marker = false) {
            const radius = CELL_SIZE * 0.42 * scale;
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(x, y + radius * 0.3, radius * 0.8, radius * 0.35, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(45, 23, 6, 0.22)';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            const grad = ctx.createRadialGradient(x - 3, y - 4, 2, x, y, radius);
            if (player === 1) {
                grad.addColorStop(0, '#6b7280');
                grad.addColorStop(0.45, '#262626');
                grad.addColorStop(1, '#030303');
            } else {
                grad.addColorStop(0, '#ffffff');
                grad.addColorStop(0.55, '#eeeeee');
                grad.addColorStop(1, '#a8a29e');
            }
            ctx.fillStyle = grad;
            ctx.shadowColor = player === 1 ? 'rgba(0,0,0,0.38)' : 'rgba(255,255,255,0.18)';
            ctx.shadowBlur = 5;
            ctx.shadowOffsetY = 2;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = player === 1 ? '#050505' : '#888';
            ctx.lineWidth = 1;
            ctx.stroke();
            if (marker) {
                ctx.beginPath();
                ctx.arc(x, y, 3.2, 0, Math.PI * 2);
                ctx.fillStyle = '#ef4444';
                ctx.fill();
            }
            ctx.restore();
        }

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const cell = board.value[r][c];
                if (cell === 0) continue;
                const x = boardToCanvas(c);
                const y = boardToCanvas(r);
                const isMarked = lastTurnMoves.value.some(([mr, mc]) => mr === r && mc === c);
                const animation = placeAnimation.value;
                if (animation && animation.row === r && animation.col === c && animation.player === cell) {
                    const progress = Math.min(1, (now - animation.startedAt) / STONE_ANIMATION_MS);
                    const drop = easeOutBack(progress);
                    drawStone(
                        x,
                        y - (1 - drop) * CELL_SIZE * 1.2,
                        cell,
                        0.78 + progress * 0.22,
                        progress > 0.78 || isMarked,
                    );
                    if (progress >= 1) placeAnimation.value = null;
                } else {
                    drawStone(x, y, cell, 1, isMarked);
                }
            }
        }
        if (hoverPos.value) {
            const [hr, hc] = hoverPos.value;
            const x = boardToCanvas(hc);
            const y = boardToCanvas(hr);
            ctx.beginPath();
            ctx.arc(x, y, CELL_SIZE * 0.42, 0, Math.PI * 2);
            ctx.fillStyle = playerColor.value === 1 ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.28)';
            ctx.fill();
            ctx.strokeStyle = playerColor.value === 1 ? 'rgba(0,0,0,0.36)' : 'rgba(255,255,255,0.56)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        ctx.fillStyle = '#6f4324';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let i = 0; i < BOARD_SIZE; i++) {
            ctx.fillText(String.fromCharCode(65 + i), boardToCanvas(i), 3);
            ctx.fillText(`${BOARD_SIZE - i}`, 10, boardToCanvas(i) - 5);
        }
    }

    function getWidth() {
        return CANVAS_W;
    }

    function getHeight() {
        return CANVAS_H;
    }

    onUnmounted(() => {
        clearAITimer();
    });

    return {
        board,
        currentPlayer,
        gameStatus,
        result,
        message,
        playerColor,
        difficulty,
        lastMove,
        lastTurnMoves,
        winLine,
        moveCount,
        stonesThisTurn,
        stonesRequiredThisTurn,
        startGame,
        handleClick,
        handleHover,
        draw,
        getWidth,
        getHeight,
        switchColor,
        clearAITimer,
    };
}
