import { computed, onUnmounted, ref } from 'vue';

const BOARD_SIZE = 8;
const CELL_SIZE = 70;
const PADDING = 18;
const CANVAS_SIZE = PADDING * 2 + BOARD_SIZE * CELL_SIZE;

type Piece = 0 | 1 | 2 | 3 | 4;
type Player = 1 | 2;
type GameStatus = 'idle' | 'playing' | 'ended';
type Difficulty = 'easy' | 'hard';

interface Move {
    from: [number, number];
    to: [number, number];
    path: [number, number][];
    captures: [number, number][];
}

interface PieceAnimation {
    from: [number, number];
    to: [number, number];
    piece: Piece;
    start: number;
}

const EMPTY = 0;
const RED_MAN = 1;
const RED_KING = 3;
const BLACK_MAN = 2;
const BLACK_KING = 4;

function createInitialBoard(): Piece[][] {
    const board = Array.from({ length: BOARD_SIZE }, () => Array<Piece>(BOARD_SIZE).fill(EMPTY));
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if ((row + col) % 2 === 1) board[row][col] = BLACK_MAN;
        }
    }
    for (let row = 5; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if ((row + col) % 2 === 1) board[row][col] = RED_MAN;
        }
    }
    return board;
}

function cloneBoard(board: Piece[][]): Piece[][] {
    return board.map(row => [...row]);
}

function owner(piece: Piece): Player | null {
    if (piece === RED_MAN || piece === RED_KING) return 1;
    if (piece === BLACK_MAN || piece === BLACK_KING) return 2;
    return null;
}

function opponent(player: Player): Player {
    return player === 1 ? 2 : 1;
}

function isKing(piece: Piece): boolean {
    return piece === RED_KING || piece === BLACK_KING;
}

function isInside(row: number, col: number): boolean {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function moveDirections(piece: Piece): [number, number][] {
    if (isKing(piece)) {
        return [
            [-1, -1],
            [-1, 1],
            [1, -1],
            [1, 1],
        ];
    }
    return owner(piece) === 1
        ? [
              [-1, -1],
              [-1, 1],
          ]
        : [
              [1, -1],
              [1, 1],
          ];
}

function promoteIfNeeded(piece: Piece, row: number): Piece {
    if (piece === RED_MAN && row === 0) return RED_KING;
    if (piece === BLACK_MAN && row === BOARD_SIZE - 1) return BLACK_KING;
    return piece;
}

function collectCaptures(
    board: Piece[][],
    row: number,
    col: number,
    piece: Piece,
    start: [number, number],
    path: [number, number][],
    captures: [number, number][],
): Move[] {
    const player = owner(piece);
    if (!player) return [];

    const moves: Move[] = [];
    for (const [dr, dc] of moveDirections(piece)) {
        const midRow = row + dr;
        const midCol = col + dc;
        const landingRow = row + dr * 2;
        const landingCol = col + dc * 2;
        if (!isInside(landingRow, landingCol) || !isInside(midRow, midCol)) continue;
        const jumped = board[midRow][midCol];
        if (owner(jumped) !== opponent(player) || board[landingRow][landingCol] !== EMPTY) continue;

        const nextBoard = cloneBoard(board);
        nextBoard[row][col] = EMPTY;
        nextBoard[midRow][midCol] = EMPTY;
        const nextPiece = promoteIfNeeded(piece, landingRow);
        nextBoard[landingRow][landingCol] = nextPiece;
        const nextPath: [number, number][] = [...path, [landingRow, landingCol]];
        const nextCaptures: [number, number][] = [...captures, [midRow, midCol]];
        const continuations = collectCaptures(
            nextBoard,
            landingRow,
            landingCol,
            nextPiece,
            start,
            nextPath,
            nextCaptures,
        );

        if (continuations.length > 0) moves.push(...continuations);
        else moves.push({ from: start, to: [landingRow, landingCol], path: nextPath, captures: nextCaptures });
    }

    return moves;
}

function getMovesForPiece(board: Piece[][], row: number, col: number): Move[] {
    const piece = board[row][col];
    const player = owner(piece);
    if (!player) return [];

    const captures = collectCaptures(board, row, col, piece, [row, col], [], []);
    if (captures.length > 0) return captures;

    const moves: Move[] = [];
    for (const [dr, dc] of moveDirections(piece)) {
        const nextRow = row + dr;
        const nextCol = col + dc;
        if (isInside(nextRow, nextCol) && board[nextRow][nextCol] === EMPTY) {
            moves.push({ from: [row, col], to: [nextRow, nextCol], path: [[nextRow, nextCol]], captures: [] });
        }
    }
    return moves;
}

function getAllMoves(board: Piece[][], player: Player): Move[] {
    const captures: Move[] = [];
    const quietMoves: Move[] = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (owner(board[row][col]) !== player) continue;
            const moves = getMovesForPiece(board, row, col);
            for (const move of moves) {
                if (move.captures.length > 0) captures.push(move);
                else quietMoves.push(move);
            }
        }
    }
    return captures.length > 0 ? captures : quietMoves;
}

function applyMove(board: Piece[][], move: Move): Piece[][] {
    const next = cloneBoard(board);
    const [fromRow, fromCol] = move.from;
    let piece = next[fromRow][fromCol];
    next[fromRow][fromCol] = EMPTY;
    for (const [row, col] of move.captures) next[row][col] = EMPTY;
    piece = promoteIfNeeded(piece, move.to[0]);
    next[move.to[0]][move.to[1]] = piece;
    return next;
}

function countPieces(board: Piece[][]) {
    let red = 0;
    let black = 0;
    let redKings = 0;
    let blackKings = 0;
    for (const row of board) {
        for (const piece of row) {
            if (piece === RED_MAN) red++;
            if (piece === BLACK_MAN) black++;
            if (piece === RED_KING) {
                red++;
                redKings++;
            }
            if (piece === BLACK_KING) {
                black++;
                blackKings++;
            }
        }
    }
    return { red, black, redKings, blackKings };
}

function evaluateBoard(board: Piece[][], player: Player): number {
    let score = 0;
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const piece = board[row][col];
            const pieceOwner = owner(piece);
            if (!pieceOwner) continue;
            const directionScore = pieceOwner === 1 ? BOARD_SIZE - 1 - row : row;
            const centerScore = 4 - Math.abs(3.5 - col);
            const value = (isKing(piece) ? 170 : 100) + directionScore * 4 + centerScore * 3;
            score += pieceOwner === player ? value : -value;
        }
    }
    score += (getAllMoves(board, player).length - getAllMoves(board, opponent(player)).length) * 7;
    return score;
}

function minimax(board: Piece[][], player: Player, maximizingPlayer: Player, depth: number, alpha: number, beta: number): number {
    const moves = getAllMoves(board, player);
    if (depth === 0 || moves.length === 0) {
        if (moves.length === 0) return player === maximizingPlayer ? -10000 - depth : 10000 + depth;
        return evaluateBoard(board, maximizingPlayer);
    }

    if (player === maximizingPlayer) {
        let value = -Infinity;
        for (const move of moves) {
            value = Math.max(value, minimax(applyMove(board, move), opponent(player), maximizingPlayer, depth - 1, alpha, beta));
            alpha = Math.max(alpha, value);
            if (alpha >= beta) break;
        }
        return value;
    }

    let value = Infinity;
    for (const move of moves) {
        value = Math.min(value, minimax(applyMove(board, move), opponent(player), maximizingPlayer, depth - 1, alpha, beta));
        beta = Math.min(beta, value);
        if (alpha >= beta) break;
    }
    return value;
}

function chooseMove(board: Piece[][], player: Player, difficulty: Difficulty): Move | null {
    const moves = getAllMoves(board, player);
    if (moves.length === 0) return null;

    if (difficulty === 'easy') {
        const ranked = [...moves].sort((a, b) => b.captures.length - a.captures.length);
        const pool = ranked.slice(0, Math.min(4, ranked.length));
        return pool[Math.floor(Math.random() * pool.length)];
    }

    const pieceCount = countPieces(board).red + countPieces(board).black;
    const depth = pieceCount <= 10 ? 6 : 4;
    let bestScore = -Infinity;
    let bestMoves: Move[] = [];

    for (const move of moves) {
        const score =
            minimax(applyMove(board, move), opponent(player), player, depth - 1, -Infinity, Infinity) +
            move.captures.length * 18;
        if (score > bestScore) {
            bestScore = score;
            bestMoves = [move];
        } else if (score === bestScore) {
            bestMoves.push(move);
        }
    }

    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

function pieceLabel(piece: Piece): string {
    if (piece === RED_KING || piece === BLACK_KING) return 'K';
    return '';
}

export function useCheckers() {
    const board = ref<Piece[][]>(createInitialBoard());
    const currentPlayer = ref<Player>(1);
    const playerColor = ref<Player>(1);
    const gameStatus = ref<GameStatus>('idle');
    const difficulty = ref<Difficulty>('hard');
    const message = ref('选择阵营后开始');
    const selected = ref<[number, number] | null>(null);
    const hoverPos = ref<[number, number] | null>(null);
    const lastMove = ref<Move | null>(null);
    const animations = ref<PieceAnimation[]>([]);

    let aiTimer: ReturnType<typeof setTimeout> | null = null;

    const aiColor = computed<Player>(() => (playerColor.value === 1 ? 2 : 1));
    const score = computed(() => countPieces(board.value));
    const legalMoves = computed(() => (gameStatus.value === 'playing' ? getAllMoves(board.value, currentPlayer.value) : []));
    const selectedMoves = computed(() => {
        if (!selected.value) return [];
        const [row, col] = selected.value;
        return legalMoves.value.filter(move => move.from[0] === row && move.from[1] === col);
    });
    const mustCapture = computed(() => legalMoves.value.some(move => move.captures.length > 0));

    function clearAITimer() {
        if (aiTimer !== null) {
            clearTimeout(aiTimer);
            aiTimer = null;
        }
    }

    function sideName(player: Player): string {
        return player === 1 ? '红方' : '黑方';
    }

    function startGame() {
        const selectedColor = playerColor.value;
        board.value = createInitialBoard();
        playerColor.value = selectedColor;
        currentPlayer.value = 1;
        gameStatus.value = 'playing';
        selected.value = null;
        hoverPos.value = null;
        lastMove.value = null;
        animations.value = [];
        clearAITimer();
        message.value = currentPlayer.value === playerColor.value ? '红方先行，请走棋' : '电脑执红思考中';
        if (currentPlayer.value === aiColor.value) scheduleAIMove();
    }

    function switchColor() {
        if (gameStatus.value !== 'idle') return;
        playerColor.value = playerColor.value === 1 ? 2 : 1;
        message.value = playerColor.value === 1 ? '你执红，先手开局' : '你执黑，电脑先手';
    }

    function boardToCanvas(idx: number): number {
        return PADDING + idx * CELL_SIZE + CELL_SIZE / 2;
    }

    function canvasToBoard(pos: number): number {
        return Math.floor((pos - PADDING) / CELL_SIZE);
    }

    function finishIfNeeded() {
        const redMoves = getAllMoves(board.value, 1);
        const blackMoves = getAllMoves(board.value, 2);
        const counts = countPieces(board.value);
        const redLost = counts.red === 0 || redMoves.length === 0;
        const blackLost = counts.black === 0 || blackMoves.length === 0;
        if (!redLost && !blackLost) return false;

        gameStatus.value = 'ended';
        clearAITimer();
        if (redLost && blackLost) {
            message.value = '平局';
        } else {
            const winner: Player = redLost ? 2 : 1;
            message.value = winner === playerColor.value ? `${sideName(winner)}获胜，你赢了` : `${sideName(winner)}获胜，电脑赢了`;
        }
        return true;
    }

    function continueTurn() {
        if (finishIfNeeded()) return;
        const moves = getAllMoves(board.value, currentPlayer.value);
        if (currentPlayer.value === playerColor.value) {
            message.value = `${sideName(currentPlayer.value)}走棋${moves.some(move => move.captures.length > 0) ? '，必须吃子' : ''}`;
        } else {
            message.value = '电脑思考中';
            scheduleAIMove();
        }
    }

    function commitMove(move: Move) {
        const [fromRow, fromCol] = move.from;
        const piece = board.value[fromRow][fromCol];
        board.value = applyMove(board.value, move);
        animations.value = [{ from: move.from, to: move.to, piece, start: performance.now() }];
        lastMove.value = move;
        selected.value = null;
        hoverPos.value = null;
        currentPlayer.value = opponent(currentPlayer.value);
        continueTurn();
    }

    function handleClick(mx: number, my: number) {
        if (gameStatus.value !== 'playing' || currentPlayer.value !== playerColor.value) return;
        const row = canvasToBoard(my);
        const col = canvasToBoard(mx);
        if (!isInside(row, col)) return;

        const destinationMove = selectedMoves.value.find(move => move.to[0] === row && move.to[1] === col);
        if (destinationMove) {
            commitMove(destinationMove);
            return;
        }

        if (owner(board.value[row][col]) === playerColor.value) {
            const moves = legalMoves.value.filter(move => move.from[0] === row && move.from[1] === col);
            if (moves.length > 0) {
                selected.value = [row, col];
                message.value = moves.some(move => move.captures.length > 0) ? '选择落点完成跳吃' : '选择落点移动棋子';
            } else {
                message.value = mustCapture.value ? '当前必须吃子，请选择能跳吃的棋子' : '这枚棋子暂时不能移动';
            }
            return;
        }

        message.value = selected.value ? '请选择高亮落点' : '请选择可移动的己方棋子';
    }

    function handleHover(mx: number, my: number) {
        if (gameStatus.value !== 'playing' || currentPlayer.value !== playerColor.value) {
            hoverPos.value = null;
            return;
        }
        const row = canvasToBoard(my);
        const col = canvasToBoard(mx);
        hoverPos.value = isInside(row, col) ? [row, col] : null;
    }

    function scheduleAIMove() {
        clearAITimer();
        aiTimer = setTimeout(
            () => {
                if (gameStatus.value !== 'playing' || currentPlayer.value !== aiColor.value) return;
                const move = chooseMove(board.value, aiColor.value, difficulty.value);
                if (move) commitMove(move);
                else finishIfNeeded();
            },
            420 + Math.random() * 360,
        );
    }

    function drawPiece(ctx: CanvasRenderingContext2D, row: number, col: number, piece: Piece, alpha = 1, xOffset = 0, yOffset = 0) {
        if (piece === EMPTY) return;
        const x = boardToCanvas(col) + xOffset;
        const y = boardToCanvas(row) + yOffset;
        const radius = CELL_SIZE * 0.35;
        const red = owner(piece) === 1;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.ellipse(x, y + radius * 0.45, radius * 0.86, radius * 0.28, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fill();

        const gradient = ctx.createRadialGradient(x - 7, y - 9, 4, x, y, radius * 1.12);
        if (red) {
            gradient.addColorStop(0, '#fecaca');
            gradient.addColorStop(0.44, '#dc2626');
            gradient.addColorStop(1, '#7f1d1d');
        } else {
            gradient.addColorStop(0, '#94a3b8');
            gradient.addColorStop(0.46, '#1f2937');
            gradient.addColorStop(1, '#020617');
        }
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.shadowColor = red ? 'rgba(248,113,113,0.28)' : 'rgba(15,23,42,0.44)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = red ? '#fee2e2' : '#475569';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, radius * 0.64, 0, Math.PI * 2);
        ctx.strokeStyle = red ? 'rgba(254,226,226,0.45)' : 'rgba(203,213,225,0.26)';
        ctx.lineWidth = 2;
        ctx.stroke();

        const label = pieceLabel(piece);
        if (label) {
            ctx.fillStyle = red ? '#fff7ed' : '#f8fafc';
            ctx.font = '900 20px ui-sans-serif, system-ui';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x, y + 1);
        }
        ctx.restore();
    }

    function draw(ctx: CanvasRenderingContext2D) {
        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        const frame = ctx.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        frame.addColorStop(0, '#9a5f2a');
        frame.addColorStop(0.5, '#633b1d');
        frame.addColorStop(1, '#2d1b10');
        ctx.fillStyle = frame;
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        const boardX = PADDING;
        const boardY = PADDING;
        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                const x = boardX + col * CELL_SIZE;
                const y = boardY + row * CELL_SIZE;
                const dark = (row + col) % 2 === 1;
                ctx.fillStyle = dark ? '#7c4a26' : '#e8c891';
                ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
                if (dark) {
                    ctx.fillStyle = 'rgba(0,0,0,0.08)';
                    ctx.fillRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);
                }
            }
        }

        const now = performance.now();
        const active = animations.value;
        const moving = active.find(item => now - item.start < 340);
        const selectedKey = selected.value ? `${selected.value[0]},${selected.value[1]}` : '';
        const legalFrom = new Set(legalMoves.value.map(move => `${move.from[0]},${move.from[1]}`));

        if (gameStatus.value === 'playing' && currentPlayer.value === playerColor.value) {
            const pulse = (Math.sin(now / 250) + 1) / 2;
            for (const key of legalFrom) {
                const [row, col] = key.split(',').map(Number);
                ctx.save();
                ctx.beginPath();
                ctx.arc(boardToCanvas(col), boardToCanvas(row), CELL_SIZE * (0.39 + pulse * 0.025), 0, Math.PI * 2);
                ctx.strokeStyle = key === selectedKey ? 'rgba(250,204,21,0.92)' : 'rgba(253,224,71,0.55)';
                ctx.lineWidth = key === selectedKey ? 4 : 2;
                ctx.stroke();
                ctx.restore();
            }

            for (const move of selectedMoves.value) {
                const [row, col] = move.to;
                ctx.save();
                ctx.beginPath();
                ctx.arc(boardToCanvas(col), boardToCanvas(row), CELL_SIZE * 0.28, 0, Math.PI * 2);
                ctx.fillStyle = move.captures.length > 0 ? 'rgba(248,113,113,0.34)' : 'rgba(34,197,94,0.3)';
                ctx.fill();
                ctx.strokeStyle = move.captures.length > 0 ? 'rgba(254,202,202,0.9)' : 'rgba(187,247,208,0.86)';
                ctx.lineWidth = 3;
                ctx.stroke();
                ctx.restore();
            }
        }

        if (lastMove.value) {
            const [row, col] = lastMove.value.to;
            ctx.fillStyle = 'rgba(251,191,36,0.26)';
            ctx.fillRect(PADDING + col * CELL_SIZE + 5, PADDING + row * CELL_SIZE + 5, CELL_SIZE - 10, CELL_SIZE - 10);
        }

        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                const piece = board.value[row][col];
                if (piece === EMPTY) continue;
                if (moving && moving.to[0] === row && moving.to[1] === col) continue;
                drawPiece(ctx, row, col, piece);
            }
        }

        if (moving) {
            const progress = Math.min(1, (now - moving.start) / 340);
            const ease = 1 - Math.pow(1 - progress, 3);
            const row = moving.from[0] + (moving.to[0] - moving.from[0]) * ease;
            const col = moving.from[1] + (moving.to[1] - moving.from[1]) * ease;
            const hop = -Math.sin(progress * Math.PI) * CELL_SIZE * 0.18;
            drawPiece(ctx, row, col, moving.piece, 1, 0, hop);
        }

        if (hoverPos.value) {
            const [row, col] = hoverPos.value;
            if (isInside(row, col)) {
                ctx.strokeStyle = 'rgba(255,255,255,0.42)';
                ctx.lineWidth = 2;
                ctx.strokeRect(PADDING + col * CELL_SIZE + 4, PADDING + row * CELL_SIZE + 4, CELL_SIZE - 8, CELL_SIZE - 8);
            }
        }

        animations.value = active.filter(item => now - item.start < 360);
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
        selected,
        hoverPos,
        lastMove,
        score,
        legalMoves,
        selectedMoves,
        mustCapture,
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
