import { computed, onUnmounted, ref, shallowRef } from 'vue';
import { Chess, type Color, type Move, type Piece, type PieceSymbol, type Square } from 'chess.js';

const BOARD_SIZE = 8;
const CELL_SIZE = 76;
const CANVAS_SIZE = BOARD_SIZE * CELL_SIZE;
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const PIECE_LABEL: Record<Color, Record<PieceSymbol, string>> = {
    w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
    b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};
const PIECE_NAME: Record<PieceSymbol, string> = {
    k: '王',
    q: '后',
    r: '车',
    b: '象',
    n: '马',
    p: '兵',
};

type GameStatus = 'idle' | 'playing' | 'ended';

interface MoveAnimation {
    piece: Piece;
    from: Square;
    to: Square;
    startedAt: number;
    duration: number;
}

interface CaptureAnimation {
    piece: Piece;
    square: Square;
    startedAt: number;
    duration: number;
}

interface StockfishBestMoveResponse {
    ok?: boolean;
    bestmove?: string | null;
    error?: string;
}

function opposite(color: Color): Color {
    return color === 'w' ? 'b' : 'w';
}

function isInside(row: number, col: number) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function colorName(color: Color) {
    return color === 'w' ? '白方' : '黑方';
}

function displayToSquare(row: number, col: number, perspective: Color): Square {
    const file = perspective === 'w' ? FILES[col] : FILES[BOARD_SIZE - 1 - col];
    const rank = perspective === 'w' ? BOARD_SIZE - row : row + 1;
    return `${file}${rank}` as Square;
}

function squareToDisplay(square: Square, perspective: Color) {
    const file = square[0];
    const rank = Number(square[1]);
    const fileIndex = FILES.indexOf(file);
    if (perspective === 'w') {
        return { row: BOARD_SIZE - rank, col: fileIndex };
    }
    return { row: rank - 1, col: BOARD_SIZE - 1 - fileIndex };
}

async function findStockfishMove(fen: string, movetime = 850): Promise<{ move: string | null; error?: string }> {
    try {
        const response = await fetch('/api/stockfish/bestmove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen, movetime }),
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return { move: null, error: text || `HTTP ${response.status}` };
        }
        const data = (await response.json()) as StockfishBestMoveResponse;
        return data.ok && data.bestmove
            ? { move: data.bestmove }
            : { move: null, error: data.error || 'AI 没有返回走法' };
    } catch (error) {
        return { move: null, error: error instanceof Error ? error.message : String(error) };
    }
}

function moveFromUci(game: Chess, uci: string): Move | null {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const promotion = uci.slice(4, 5) || 'q';
    return (
        (game.moves({ square: from, verbose: true }) as Move[]).find(
            move => move.to === to && (!move.promotion || move.promotion === promotion),
        ) ?? null
    );
}

function pulse(min: number, max: number, speed = 1) {
    const t = (Math.sin((performance.now() / 420) * speed) + 1) / 2;
    return min + (max - min) * t;
}

function easeOutCubic(t: number) {
    return 1 - Math.pow(1 - t, 3);
}

function easeOutBack(t: number) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function squareCenter(square: Square, perspective: Color) {
    const { row, col } = squareToDisplay(square, perspective);
    return {
        x: col * CELL_SIZE + CELL_SIZE / 2,
        y: row * CELL_SIZE + CELL_SIZE / 2,
        row,
        col,
    };
}

export function useInternationalChess() {
    const chess = shallowRef(new Chess());
    const playerColor = ref<Color>('w');
    const gameStatus = ref<GameStatus>('idle');
    const message = ref('选择执白或执黑开始');
    const selectedSquare = ref<Square | null>(null);
    const legalTargets = ref<Square[]>([]);
    const hoverSquare = ref<Square | null>(null);
    const lastMove = ref<{ from: Square; to: Square } | null>(null);
    const positionFen = ref(chess.value.fen());
    const setupStartedAt = ref(performance.now());
    const moveAnimation = ref<MoveAnimation | null>(null);
    const captureAnimations = ref<CaptureAnimation[]>([]);
    const moveHistory = ref<string[]>([]);
    const capturedByPlayer = ref<Piece[]>([]);
    const capturedByAI = ref<Piece[]>([]);

    let aiTimer: ReturnType<typeof setTimeout> | null = null;

    const aiColor = computed<Color>(() => opposite(playerColor.value));
    const currentColor = computed<Color>(() => {
        positionFen.value;
        return chess.value.turn();
    });
    const isPlayerTurn = computed(() => gameStatus.value === 'playing' && currentColor.value === playerColor.value);
    const moveCount = computed(() => moveHistory.value.length);
    const turnLabel = computed(
        () => `${colorName(currentColor.value)}${currentColor.value === playerColor.value ? '行动' : '思考'}`,
    );
    const resultLabel = computed(() => {
        if (gameStatus.value !== 'ended') return '';
        if (chess.value.isCheckmate()) {
            return chess.value.turn() === playerColor.value ? '将死，电脑获胜' : '将死，你赢了';
        }
        if (chess.value.isStalemate()) return '无子可动，和棋';
        if (chess.value.isInsufficientMaterial()) return '子力不足，和棋';
        if (chess.value.isThreefoldRepetition()) return '三次重复，和棋';
        if (chess.value.isDrawByFiftyMoves()) return '五十回合规则，和棋';
        if (chess.value.isDraw()) return '和棋';
        return message.value;
    });

    function clearAITimer() {
        if (aiTimer !== null) {
            clearTimeout(aiTimer);
            aiTimer = null;
        }
    }

    function clearSelection() {
        selectedSquare.value = null;
        legalTargets.value = [];
    }

    function syncPosition() {
        positionFen.value = chess.value.fen();
    }

    function refreshMessage() {
        if (gameStatus.value !== 'playing') return;
        if (chess.value.isCheck()) {
            message.value = currentColor.value === playerColor.value ? '你被将军，请应将' : '电脑被将军';
            return;
        }
        message.value = currentColor.value === playerColor.value ? '轮到你走棋' : '电脑思考中';
    }

    function updateGameEnd() {
        if (!chess.value.isGameOver()) {
            refreshMessage();
            return false;
        }
        gameStatus.value = 'ended';
        clearSelection();
        clearAITimer();
        message.value = resultLabel.value || '本局结束';
        return true;
    }

    function syncHistoryAndCaptures() {
        moveHistory.value = chess.value.history();
        capturedByPlayer.value = [];
        capturedByAI.value = [];
        for (const move of chess.value.history({ verbose: true }) as Move[]) {
            if (!move.captured) continue;
            const piece = { color: opposite(move.color), type: move.captured };
            if (move.color === playerColor.value) capturedByPlayer.value.push(piece);
            else capturedByAI.value.push(piece);
        }
    }

    function recordMove(move: Move) {
        syncHistoryAndCaptures();
        lastMove.value = { from: move.from, to: move.to };
    }

    function applyMove(move: Move) {
        const movingPiece: Piece = { color: move.color, type: move.promotion ?? move.piece };
        moveAnimation.value = {
            piece: movingPiece,
            from: move.from,
            to: move.to,
            startedAt: performance.now(),
            duration: 280,
        };
        if (move.captured) {
            const capturedSquare = move.isEnPassant() ? (`${move.to[0]}${move.from[1]}` as Square) : move.to;
            captureAnimations.value.push({
                piece: { color: opposite(move.color), type: move.captured },
                square: capturedSquare,
                startedAt: performance.now(),
                duration: 260,
            });
        }
        recordMove(move);
        syncPosition();
        clearSelection();
        if (updateGameEnd()) return;
        if (currentColor.value === aiColor.value) scheduleAIMove();
    }

    function startGame() {
        const selectedColor = playerColor.value;
        chess.value = new Chess();
        syncPosition();
        playerColor.value = selectedColor;
        gameStatus.value = 'playing';
        selectedSquare.value = null;
        legalTargets.value = [];
        hoverSquare.value = null;
        lastMove.value = null;
        setupStartedAt.value = performance.now();
        moveAnimation.value = null;
        captureAnimations.value = [];
        moveHistory.value = [];
        capturedByPlayer.value = [];
        capturedByAI.value = [];
        clearAITimer();
        refreshMessage();
        if (currentColor.value === aiColor.value) scheduleAIMove();
    }

    function switchColor() {
        if (gameStatus.value !== 'idle') return;
        playerColor.value = opposite(playerColor.value);
        message.value = playerColor.value === 'w' ? '你执白，先手开局' : '你执黑，电脑执白先行';
    }

    function selectSquare(square: Square) {
        const piece = chess.value.get(square);
        if (!piece || piece.color !== playerColor.value) {
            clearSelection();
            return;
        }
        selectedSquare.value = square;
        legalTargets.value = (chess.value.moves({ square, verbose: true }) as Move[]).map(move => move.to);
    }

    function handleClick(mx: number, my: number) {
        if (!isPlayerTurn.value) return;
        const row = Math.floor(my / CELL_SIZE);
        const col = Math.floor(mx / CELL_SIZE);
        if (!isInside(row, col)) return;

        const square = displayToSquare(row, col, playerColor.value);
        const selected = selectedSquare.value;
        if (!selected) {
            selectSquare(square);
            return;
        }

        if (selected === square) {
            clearSelection();
            return;
        }

        const legalMove = (chess.value.moves({ square: selected, verbose: true }) as Move[]).find(
            move => move.to === square,
        );
        if (!legalMove) {
            selectSquare(square);
            return;
        }

        const move = chess.value.move({
            from: selected,
            to: square,
            promotion: legalMove.promotion ?? 'q',
        });
        applyMove(move);
    }

    function handleHover(mx: number, my: number) {
        if (gameStatus.value !== 'playing') {
            hoverSquare.value = null;
            return;
        }
        const row = Math.floor(my / CELL_SIZE);
        const col = Math.floor(mx / CELL_SIZE);
        hoverSquare.value = isInside(row, col) ? displayToSquare(row, col, playerColor.value) : null;
    }

    async function makeAIMove() {
        if (gameStatus.value !== 'playing' || currentColor.value !== aiColor.value) return;
        const fen = chess.value.fen();
        message.value = 'AI 思考中';
        const engineResult = await findStockfishMove(fen);

        if (gameStatus.value !== 'playing' || currentColor.value !== aiColor.value) return;
        if (fen !== chess.value.fen()) {
            scheduleAIMove();
            return;
        }

        const engineMove = engineResult.move ? moveFromUci(chess.value, engineResult.move) : null;
        if (!engineMove) {
            message.value = engineResult.error ? `AI 不可用：${engineResult.error.slice(0, 80)}` : 'AI 未返回合法走法';
            return;
        }

        const move = chess.value.move({
            from: engineMove.from,
            to: engineMove.to,
            promotion: engineMove.promotion ?? 'q',
        });
        applyMove(move);
    }

    function scheduleAIMove() {
        clearAITimer();
        aiTimer = setTimeout(makeAIMove, 450 + Math.random() * 450);
    }

    function undoPair() {
        if (gameStatus.value === 'idle') return;
        clearAITimer();
        chess.value.undo();
        if (chess.value.turn() !== playerColor.value) chess.value.undo();
        syncPosition();
        syncHistoryAndCaptures();
        lastMove.value = null;
        moveAnimation.value = null;
        captureAnimations.value = [];
        clearSelection();
        gameStatus.value = 'playing';
        refreshMessage();
    }

    function resign() {
        if (gameStatus.value !== 'playing') return;
        gameStatus.value = 'ended';
        clearAITimer();
        clearSelection();
        message.value = '你已认输，电脑获胜';
    }

    function getPieceName(piece: Piece) {
        return `${colorName(piece.color)}${PIECE_NAME[piece.type]}`;
    }

    function getPieceSymbol(piece: Piece) {
        return PIECE_LABEL[piece.color][piece.type];
    }

    function drawPiece(ctx: CanvasRenderingContext2D, piece: Piece, x: number, y: number, scale = 1, alpha = 1) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '54px "Segoe UI Symbol", "Noto Sans Symbols", serif';
        ctx.shadowColor = piece.color === 'w' ? 'rgba(15,23,42,0.26)' : 'rgba(255,255,255,0.18)';
        ctx.shadowBlur = 2;
        ctx.fillStyle = piece.color === 'w' ? '#f8fafc' : '#111827';
        ctx.strokeStyle = piece.color === 'w' ? 'rgba(15,23,42,0.58)' : 'rgba(248,250,252,0.42)';
        ctx.lineWidth = 1.4;
        const label = PIECE_LABEL[piece.color][piece.type];
        ctx.strokeText(label, 0, 2);
        ctx.fillText(label, 0, 2);
        ctx.restore();
    }

    function draw(ctx: CanvasRenderingContext2D) {
        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        const selected = selectedSquare.value;
        const targets = new Set(legalTargets.value);
        const last = lastMove.value;
        const targetAlpha = pulse(0.22, 0.38, 1);
        const selectedAlpha = pulse(0.28, 0.42, 0.85);
        const lastAlpha = pulse(0.26, 0.42, 0.7);
        const now = performance.now();
        const activeMove = moveAnimation.value;
        if (activeMove && now - activeMove.startedAt >= activeMove.duration) {
            moveAnimation.value = null;
        }
        captureAnimations.value = captureAnimations.value.filter(item => now - item.startedAt < item.duration);

        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                const x = col * CELL_SIZE;
                const y = row * CELL_SIZE;
                const square = displayToSquare(row, col, playerColor.value);
                const light = (row + col) % 2 === 0;
                ctx.fillStyle = light ? '#d8c39f' : '#7f8f6d';
                ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

                if (last && (last.from === square || last.to === square)) {
                    ctx.fillStyle = `rgba(250, 204, 21, ${lastAlpha})`;
                    ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
                }
                if (selected === square) {
                    ctx.fillStyle = `rgba(59, 130, 246, ${selectedAlpha})`;
                    ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
                    ctx.strokeStyle = 'rgba(191, 219, 254, 0.8)';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x + 3, y + 3, CELL_SIZE - 6, CELL_SIZE - 6);
                }
                if (targets.has(square)) {
                    const piece = chess.value.get(square);
                    ctx.beginPath();
                    ctx.fillStyle = piece
                        ? `rgba(239, 68, 68, ${targetAlpha + 0.08})`
                        : `rgba(15, 23, 42, ${targetAlpha})`;
                    ctx.arc(
                        x + CELL_SIZE / 2,
                        y + CELL_SIZE / 2,
                        piece ? 26 + pulse(0, 3, 1.2) : 8 + pulse(0, 2, 1.2),
                        0,
                        Math.PI * 2,
                    );
                    ctx.fill();
                }

                const piece = chess.value.get(square);
                if (piece && !(moveAnimation.value && moveAnimation.value.to === square)) {
                    const shouldAnimateSetup =
                        gameStatus.value === 'playing' &&
                        moveHistory.value.length === 0 &&
                        now - setupStartedAt.value < 1100;
                    const setupDelay = row * 28 + col * 10;
                    const setupProgress = shouldAnimateSetup
                        ? Math.min(1, Math.max(0, (now - setupStartedAt.value - setupDelay) / 360))
                        : 1;
                    const setupEase = easeOutBack(setupProgress);
                    const setupAlpha = shouldAnimateSetup ? setupProgress : 1;
                    const setupScale = shouldAnimateSetup ? 0.72 + 0.28 * setupEase : 1;
                    const setupLift = shouldAnimateSetup ? (1 - setupProgress) * 14 : 0;
                    drawPiece(ctx, piece, x + CELL_SIZE / 2, y + CELL_SIZE / 2 - setupLift, setupScale, setupAlpha);
                }

                if (row === BOARD_SIZE - 1) {
                    ctx.fillStyle = light ? 'rgba(15,23,42,0.62)' : 'rgba(248,250,252,0.62)';
                    ctx.font = '11px ui-monospace, monospace';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(square[0], x + 5, y + CELL_SIZE - 5);
                }
                if (col === 0) {
                    ctx.fillStyle = light ? 'rgba(15,23,42,0.62)' : 'rgba(248,250,252,0.62)';
                    ctx.font = '11px ui-monospace, monospace';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    ctx.fillText(square[1], x + 5, y + 5);
                }
            }
        }

        if (hoverSquare.value && isPlayerTurn.value) {
            const { row, col } = squareToDisplay(hoverSquare.value, playerColor.value);
            ctx.strokeStyle = `rgba(255,255,255,${pulse(0.42, 0.68, 1.15)})`;
            ctx.lineWidth = 2;
            ctx.strokeRect(col * CELL_SIZE + 4, row * CELL_SIZE + 4, CELL_SIZE - 8, CELL_SIZE - 8);
        }

        for (const animation of captureAnimations.value) {
            const elapsed = now - animation.startedAt;
            const progress = Math.min(1, elapsed / animation.duration);
            const center = squareCenter(animation.square, playerColor.value);
            drawPiece(ctx, animation.piece, center.x, center.y - progress * 10, 1 - progress * 0.42, 1 - progress);
        }

        if (moveAnimation.value) {
            const animation = moveAnimation.value;
            const elapsed = now - animation.startedAt;
            const progress = Math.min(1, elapsed / animation.duration);
            const eased = easeOutCubic(progress);
            const from = squareCenter(animation.from, playerColor.value);
            const to = squareCenter(animation.to, playerColor.value);
            const x = from.x + (to.x - from.x) * eased;
            const y = from.y + (to.y - from.y) * eased - Math.sin(progress * Math.PI) * 10;
            drawPiece(ctx, animation.piece, x, y, 1 + Math.sin(progress * Math.PI) * 0.05, 1);
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
        playerColor,
        aiColor,
        gameStatus,
        message,
        selectedSquare,
        legalTargets,
        hoverSquare,
        lastMove,
        moveHistory,
        capturedByPlayer,
        capturedByAI,
        currentColor,
        isPlayerTurn,
        moveCount,
        turnLabel,
        resultLabel,
        startGame,
        switchColor,
        handleClick,
        handleHover,
        undoPair,
        resign,
        draw,
        getWidth,
        getHeight,
        getPieceName,
        getPieceSymbol,
        clearAITimer,
    };
}
