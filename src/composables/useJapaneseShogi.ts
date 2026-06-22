import { computed, onUnmounted, ref } from 'vue';

const BOARD_SIZE = 9;
const CELL_SIZE = 62;
const PADDING = 18;
const CANVAS_SIZE = PADDING * 2 + BOARD_SIZE * CELL_SIZE;

type Side = 'black' | 'white';
type PieceKind = 'K' | 'R' | 'B' | 'G' | 'S' | 'N' | 'L' | 'P';
type GameStatus = 'idle' | 'playing' | 'ended';

interface Piece {
    side: Side;
    kind: PieceKind;
    promoted: boolean;
}

interface Square {
    row: number;
    col: number;
}

interface PieceAnimation {
    type: 'move' | 'drop';
    piece: Piece;
    from?: Square;
    to: Square;
    startedAt: number;
    duration: number;
}

interface MoveRecord {
    text: string;
    side: Side;
}

type Board = (Piece | null)[][];

interface YaneuraOuBestMoveResponse {
    ok?: boolean;
    bestmove?: string | null;
    error?: string;
}

const PIECE_LABEL: Record<PieceKind, string> = {
    K: '王',
    R: '飛',
    B: '角',
    G: '金',
    S: '銀',
    N: '桂',
    L: '香',
    P: '歩',
};

const PROMOTED_LABEL: Partial<Record<PieceKind, string>> = {
    R: '龍',
    B: '馬',
    S: '全',
    N: '圭',
    L: '杏',
    P: 'と',
};

const PIECE_NAME: Record<PieceKind, string> = {
    K: '玉将',
    R: '飞车',
    B: '角行',
    G: '金将',
    S: '银将',
    N: '桂马',
    L: '香车',
    P: '步兵',
};

const START_ROWS: (PieceKind | null)[][] = [
    ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L'],
    [null, 'R', null, null, null, null, null, 'B', null],
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
];

const SFEN_HAND_ORDER: PieceKind[] = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];
const RANK_LABELS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

function opponent(side: Side): Side {
    return side === 'black' ? 'white' : 'black';
}

function sideName(side: Side) {
    return side === 'black' ? '先手' : '后手';
}

function createEmptyBoard(): Board {
    return Array.from({ length: BOARD_SIZE }, () => Array<Piece | null>(BOARD_SIZE).fill(null));
}

function createInitialBoard(): Board {
    const board = createEmptyBoard();
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const kind = START_ROWS[row][col];
            if (kind) board[row][col] = { side: 'white', kind, promoted: false };
        }
    }
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const source = START_ROWS[row][BOARD_SIZE - 1 - col];
            if (source) board[BOARD_SIZE - 1 - row][col] = { side: 'black', kind: source, promoted: false };
        }
    }
    return board;
}

function cloneBoard(board: Board): Board {
    return board.map(row => row.map(piece => (piece ? { ...piece } : null)));
}

function inBounds(row: number, col: number) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function sameSquare(a: Square | null, b: Square | null) {
    return Boolean(a && b && a.row === b.row && a.col === b.col);
}

function key(square: Square) {
    return `${square.row},${square.col}`;
}

function canPromote(kind: PieceKind) {
    return kind !== 'K' && kind !== 'G';
}

function inPromotionZone(side: Side, row: number) {
    return side === 'black' ? row <= 2 : row >= 6;
}

function mustPromote(piece: Piece, toRow: number) {
    if (piece.kind === 'P' || piece.kind === 'L') return piece.side === 'black' ? toRow === 0 : toRow === 8;
    if (piece.kind === 'N') return piece.side === 'black' ? toRow <= 1 : toRow >= 7;
    return false;
}

function demote(kind: PieceKind) {
    return kind;
}

function addStepMoves(board: Board, from: Square, piece: Piece, deltas: number[][], moves: Square[]) {
    const dir = piece.side === 'black' ? 1 : -1;
    for (const [dr, dc] of deltas) {
        const row = from.row + dr * dir;
        const col = from.col + dc;
        if (!inBounds(row, col)) continue;
        const target = board[row][col];
        if (!target || target.side !== piece.side) moves.push({ row, col });
    }
}

function addSlideMoves(board: Board, from: Square, piece: Piece, deltas: number[][], moves: Square[]) {
    const dir = piece.side === 'black' ? 1 : -1;
    for (const [dr, dc] of deltas) {
        let row = from.row + dr * dir;
        let col = from.col + dc;
        while (inBounds(row, col)) {
            const target = board[row][col];
            if (!target) {
                moves.push({ row, col });
            } else {
                if (target.side !== piece.side) moves.push({ row, col });
                break;
            }
            row += dr * dir;
            col += dc;
        }
    }
}

function rawMoves(board: Board, from: Square): Square[] {
    const piece = board[from.row][from.col];
    if (!piece) return [];
    const moves: Square[] = [];
    const gold = [
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [0, -1],
        [0, 1],
        [1, 0],
    ];
    const king = [
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 0],
        [1, 1],
    ];

    if (piece.promoted && ['S', 'N', 'L', 'P'].includes(piece.kind)) {
        addStepMoves(board, from, piece, gold, moves);
        return moves;
    }

    switch (piece.kind) {
        case 'K':
            addStepMoves(board, from, piece, king, moves);
            break;
        case 'G':
            addStepMoves(board, from, piece, gold, moves);
            break;
        case 'S':
            addStepMoves(
                board,
                from,
                piece,
                [
                    [-1, -1],
                    [-1, 0],
                    [-1, 1],
                    [1, -1],
                    [1, 1],
                ],
                moves,
            );
            break;
        case 'N':
            addStepMoves(
                board,
                from,
                piece,
                [
                    [-2, -1],
                    [-2, 1],
                ],
                moves,
            );
            break;
        case 'L':
            addSlideMoves(board, from, piece, [[-1, 0]], moves);
            break;
        case 'P':
            addStepMoves(board, from, piece, [[-1, 0]], moves);
            break;
        case 'R':
            addSlideMoves(
                board,
                from,
                piece,
                [
                    [-1, 0],
                    [1, 0],
                    [0, -1],
                    [0, 1],
                ],
                moves,
            );
            if (piece.promoted) {
                addStepMoves(
                    board,
                    from,
                    piece,
                    [
                        [-1, -1],
                        [-1, 1],
                        [1, -1],
                        [1, 1],
                    ],
                    moves,
                );
            }
            break;
        case 'B':
            addSlideMoves(
                board,
                from,
                piece,
                [
                    [-1, -1],
                    [-1, 1],
                    [1, -1],
                    [1, 1],
                ],
                moves,
            );
            if (piece.promoted) {
                addStepMoves(
                    board,
                    from,
                    piece,
                    [
                        [-1, 0],
                        [1, 0],
                        [0, -1],
                        [0, 1],
                    ],
                    moves,
                );
            }
            break;
    }
    return moves;
}

function findKing(board: Board, side: Side): Square | null {
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const piece = board[row][col];
            if (piece?.side === side && piece.kind === 'K') return { row, col };
        }
    }
    return null;
}

function isKingAttacked(board: Board, side: Side) {
    const king = findKing(board, side);
    if (!king) return true;
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const piece = board[row][col];
            if (!piece || piece.side === side) continue;
            if (rawMoves(board, { row, col }).some(move => sameSquare(move, king))) return true;
        }
    }
    return false;
}

function legalMoves(board: Board, from: Square) {
    const piece = board[from.row][from.col];
    if (!piece) return [];
    return rawMoves(board, from).filter(to => {
        const next = cloneBoard(board);
        const moving = next[from.row][from.col];
        if (!moving) return false;
        next[to.row][to.col] = moving;
        next[from.row][from.col] = null;
        return !isKingAttacked(next, piece.side);
    });
}

function hasLegalMove(board: Board, side: Side) {
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const piece = board[row][col];
            if (piece?.side === side && legalMoves(board, { row, col }).length > 0) return true;
        }
    }
    return false;
}

function canDrop(board: Board, side: Side, kind: PieceKind, to: Square) {
    if (board[to.row][to.col]) return false;
    if ((kind === 'P' || kind === 'L') && (side === 'black' ? to.row === 0 : to.row === 8)) return false;
    if (kind === 'N' && (side === 'black' ? to.row <= 1 : to.row >= 7)) return false;
    if (kind === 'P') {
        for (let row = 0; row < BOARD_SIZE; row++) {
            const piece = board[row][to.col];
            if (piece?.side === side && piece.kind === 'P' && !piece.promoted) return false;
        }
    }
    const next = cloneBoard(board);
    next[to.row][to.col] = { side, kind, promoted: false };
    return !isKingAttacked(next, side);
}

function pieceText(piece: Piece) {
    return piece.promoted ? (PROMOTED_LABEL[piece.kind] ?? PIECE_LABEL[piece.kind]) : PIECE_LABEL[piece.kind];
}

function sfenPiece(piece: Piece) {
    const symbol = piece.side === 'black' ? piece.kind : piece.kind.toLowerCase();
    return piece.promoted ? `+${symbol}` : symbol;
}

function handToSfen(blackHand: PieceKind[], whiteHand: PieceKind[]) {
    let text = '';
    for (const side of ['black', 'white'] as Side[]) {
        const hand = side === 'black' ? blackHand : whiteHand;
        for (const kind of SFEN_HAND_ORDER) {
            const count = hand.filter(item => item === kind).length;
            if (count === 0) continue;
            const symbol = side === 'black' ? kind : kind.toLowerCase();
            text += `${count > 1 ? count : ''}${symbol}`;
        }
    }
    return text || '-';
}

function usiToSquare(text: string): Square | null {
    if (!/^[1-9][a-i]$/.test(text)) return null;
    return { col: 9 - Number(text[0]), row: RANK_LABELS.indexOf(text[1]) };
}

async function findYaneuraOuMove(sfen: string, movetime = 900): Promise<{ move: string | null; error?: string }> {
    try {
        const response = await fetch('/api/yaneuraou/bestmove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sfen, movetime }),
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            try {
                const data = JSON.parse(text) as YaneuraOuBestMoveResponse;
                return { move: null, error: data.error || `HTTP ${response.status}` };
            } catch {
                return { move: null, error: text || `HTTP ${response.status}` };
            }
        }
        const data = (await response.json()) as YaneuraOuBestMoveResponse;
        return data.ok && data.bestmove
            ? { move: data.bestmove }
            : { move: null, error: data.error || 'YaneuraOu did not return a move' };
    } catch (error) {
        return { move: null, error: error instanceof Error ? error.message : String(error) };
    }
}

export function useJapaneseShogi() {
    const board = ref<Board>(createInitialBoard());
    const currentSide = ref<Side>('black');
    const playerSide = ref<Side>('black');
    const aiEnabled = ref(true);
    const aiThinking = ref(false);
    const gameStatus = ref<GameStatus>('idle');
    const message = ref('点击开始，先手在下方行棋');
    const selected = ref<Square | null>(null);
    const legalTargets = ref<Square[]>([]);
    const selectedHand = ref<PieceKind | null>(null);
    const hover = ref<Square | null>(null);
    const lastMove = ref<{ from?: Square; to: Square } | null>(null);
    const moveHistory = ref<MoveRecord[]>([]);
    const blackHand = ref<PieceKind[]>([]);
    const whiteHand = ref<PieceKind[]>([]);
    const promoteChoice = ref<{ from: Square; to: Square; piece: Piece } | null>(null);
    const pieceAnimation = ref<PieceAnimation | null>(null);

    let aiTimer: ReturnType<typeof setTimeout> | null = null;

    const moveCount = computed(() => moveHistory.value.length);
    const sideLabel = computed(() => sideName(currentSide.value));
    const aiSide = computed<Side>(() => (playerSide.value === 'black' ? 'white' : 'black'));
    const isAITurn = computed(
        () => aiEnabled.value && gameStatus.value === 'playing' && currentSide.value === aiSide.value,
    );
    const handForTurn = computed(() => (currentSide.value === 'black' ? blackHand.value : whiteHand.value));

    function clearAITimer() {
        if (aiTimer !== null) {
            clearTimeout(aiTimer);
            aiTimer = null;
        }
        aiThinking.value = false;
    }

    function toSfen() {
        const rows: string[] = [];
        for (let row = 0; row < BOARD_SIZE; row++) {
            let empty = 0;
            let text = '';
            for (let col = 0; col < BOARD_SIZE; col++) {
                const piece = board.value[row][col];
                if (!piece) {
                    empty++;
                    continue;
                }
                if (empty > 0) {
                    text += empty;
                    empty = 0;
                }
                text += sfenPiece(piece);
            }
            if (empty > 0) text += empty;
            rows.push(text);
        }
        return `${rows.join('/')} ${currentSide.value === 'black' ? 'b' : 'w'} ${handToSfen(blackHand.value, whiteHand.value)} ${moveCount.value + 1}`;
    }

    function scheduleAIMove() {
        clearAITimer();
        if (!isAITurn.value) return;
        aiThinking.value = true;
        message.value = 'YaneuraOu thinking';
        aiTimer = setTimeout(makeAIMove, 350);
    }

    function startGame() {
        board.value = createInitialBoard();
        currentSide.value = 'black';
        gameStatus.value = 'playing';
        message.value = '先手行棋';
        selected.value = null;
        legalTargets.value = [];
        selectedHand.value = null;
        hover.value = null;
        lastMove.value = null;
        moveHistory.value = [];
        blackHand.value = [];
        whiteHand.value = [];
        promoteChoice.value = null;
        pieceAnimation.value = null;
        clearAITimer();
        scheduleAIMove();
    }

    function endTurn() {
        selected.value = null;
        selectedHand.value = null;
        legalTargets.value = [];
        aiThinking.value = false;
        const nextSide = opponent(currentSide.value);
        currentSide.value = nextSide;
        if (isKingAttacked(board.value, nextSide)) {
            if (!hasLegalMove(board.value, nextSide)) {
                gameStatus.value = 'ended';
                message.value = `${sideName(opponent(nextSide))} ????`;
                clearAITimer();
            } else {
                message.value = `${sideName(nextSide)} ???`;
                scheduleAIMove();
            }
            return;
        }
        message.value = isAITurn.value ? 'YaneuraOu thinking' : `${sideName(nextSide)} to move`;
        scheduleAIMove();
    }

    function selectBoardSquare(square: Square) {
        const piece = board.value[square.row][square.col];
        if (!piece || piece.side !== currentSide.value) {
            selected.value = null;
            legalTargets.value = [];
            return;
        }
        selected.value = square;
        selectedHand.value = null;
        legalTargets.value = legalMoves(board.value, square);
    }

    function commitMove(from: Square, to: Square, promote: boolean) {
        const moving = board.value[from.row][from.col];
        if (!moving) return;
        const captured = board.value[to.row][to.col];
        const animatedPiece = { ...moving, promoted: moving.promoted || promote };
        const next = cloneBoard(board.value);
        next[to.row][to.col] = animatedPiece;
        next[from.row][from.col] = null;
        board.value = next;
        pieceAnimation.value = {
            type: 'move',
            piece: animatedPiece,
            from: { ...from },
            to: { ...to },
            startedAt: performance.now(),
            duration: 220,
        };

        if (captured) {
            const hand = moving.side === 'black' ? blackHand.value : whiteHand.value;
            hand.push(demote(captured.kind));
            hand.sort();
        }

        lastMove.value = { from, to };
        moveHistory.value.push({
            side: moving.side,
            text: `${sideName(moving.side)} ${PIECE_LABEL[moving.kind]} ${9 - to.col}${to.row + 1}${promote ? '成' : ''}`,
        });
        endTurn();
    }

    function requestOrCommitMove(from: Square, to: Square) {
        const piece = board.value[from.row][from.col];
        if (!piece) return;
        const promotionAvailable =
            !piece.promoted &&
            canPromote(piece.kind) &&
            (inPromotionZone(piece.side, from.row) || inPromotionZone(piece.side, to.row));
        if (promotionAvailable && !mustPromote(piece, to.row)) {
            promoteChoice.value = { from, to, piece: { ...piece } };
            message.value = '是否升变？';
            return;
        }
        commitMove(from, to, promotionAvailable && mustPromote(piece, to.row));
    }

    function commitDrop(kind: PieceKind, to: Square) {
        if (!canDrop(board.value, currentSide.value, kind, to)) {
            message.value = '这里不能打入这枚棋子';
            return;
        }
        const hand = handForTurn.value;
        const index = hand.indexOf(kind);
        if (index < 0) return;
        hand.splice(index, 1);
        const droppedPiece = { side: currentSide.value, kind, promoted: false };
        const next = cloneBoard(board.value);
        next[to.row][to.col] = droppedPiece;
        board.value = next;
        pieceAnimation.value = {
            type: 'drop',
            piece: droppedPiece,
            to: { ...to },
            startedAt: performance.now(),
            duration: 180,
        };
        lastMove.value = { to };
        moveHistory.value.push({
            side: currentSide.value,
            text: `${sideName(currentSide.value)} ${PIECE_LABEL[kind]} 打入 ${9 - to.col}${to.row + 1}`,
        });
        endTurn();
    }

    function handleClick(mx: number, my: number) {
        if (gameStatus.value !== 'playing' || promoteChoice.value || isAITurn.value) return;
        const col = Math.floor((mx - PADDING) / CELL_SIZE);
        const row = Math.floor((my - PADDING) / CELL_SIZE);
        if (!inBounds(row, col)) return;
        const square = { row, col };

        if (selectedHand.value) {
            commitDrop(selectedHand.value, square);
            return;
        }

        const active = selected.value;
        if (!active) {
            selectBoardSquare(square);
            return;
        }
        if (sameSquare(active, square)) {
            selected.value = null;
            legalTargets.value = [];
            return;
        }
        if (!legalTargets.value.some(move => sameSquare(move, square))) {
            selectBoardSquare(square);
            return;
        }
        requestOrCommitMove(active, square);
    }

    function handleHover(mx: number, my: number) {
        const col = Math.floor((mx - PADDING) / CELL_SIZE);
        const row = Math.floor((my - PADDING) / CELL_SIZE);
        hover.value = inBounds(row, col) ? { row, col } : null;
    }

    function selectHand(kind: PieceKind) {
        if (gameStatus.value !== 'playing' || promoteChoice.value || isAITurn.value) return;
        selectedHand.value = selectedHand.value === kind ? null : kind;
        selected.value = null;
        legalTargets.value = selectedHand.value
            ? Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => ({
                  row: Math.floor(index / BOARD_SIZE),
                  col: index % BOARD_SIZE,
              })).filter(square => canDrop(board.value, currentSide.value, selectedHand.value!, square))
            : [];
    }

    function choosePromotion(promote: boolean) {
        const choice = promoteChoice.value;
        if (!choice) return;
        promoteChoice.value = null;
        commitMove(choice.from, choice.to, promote);
    }

    function applyUsiMove(usi: string) {
        if (/^[RBGSNLP]\*[1-9][a-i]$/.test(usi)) {
            const kind = usi[0] as PieceKind;
            const to = usiToSquare(usi.slice(2, 4));
            if (!to) return false;
            commitDrop(kind, to);
            return true;
        }
        if (!/^[1-9][a-i][1-9][a-i]\+?$/.test(usi)) return false;
        const from = usiToSquare(usi.slice(0, 2));
        const to = usiToSquare(usi.slice(2, 4));
        if (!from || !to) return false;
        const piece = board.value[from.row][from.col];
        if (!piece || piece.side !== currentSide.value) return false;
        if (!legalMoves(board.value, from).some(move => sameSquare(move, to))) return false;
        const promotionAvailable =
            !piece.promoted &&
            canPromote(piece.kind) &&
            (inPromotionZone(piece.side, from.row) || inPromotionZone(piece.side, to.row));
        commitMove(from, to, usi.endsWith('+') || (promotionAvailable && mustPromote(piece, to.row)));
        return true;
    }

    async function makeAIMove() {
        if (!isAITurn.value) return;
        const sfen = toSfen();
        const sideSnapshot = currentSide.value;
        const result = await findYaneuraOuMove(sfen, 1000);
        if (!isAITurn.value || currentSide.value !== sideSnapshot || sfen !== toSfen()) return;
        if (!result.move || !applyUsiMove(result.move)) {
            aiThinking.value = false;
            message.value = result.error
                ? `YaneuraOu unavailable: ${result.error.slice(0, 90)}`
                : `YaneuraOu returned illegal move: ${result.move ?? 'none'}`;
        }
    }

    function resign() {
        if (gameStatus.value !== 'playing') return;
        gameStatus.value = 'ended';
        clearAITimer();
        message.value = `${sideName(opponent(currentSide.value))} 获胜`;
    }

    function cellCenter(square: Square) {
        return {
            x: PADDING + square.col * CELL_SIZE + CELL_SIZE / 2,
            y: PADDING + square.row * CELL_SIZE + CELL_SIZE / 2,
        };
    }

    function easeOutCubic(progress: number) {
        return 1 - Math.pow(1 - progress, 3);
    }

    function drawPieceAt(
        ctx: CanvasRenderingContext2D,
        piece: Piece,
        x: number,
        y: number,
        scale = 1,
        lift = 0,
        opacity = 1,
    ) {
        const angle = piece.side === 'white' ? Math.PI : 0;
        const label = pieceText(piece);
        ctx.save();
        ctx.translate(x, y + lift);
        ctx.rotate(angle);
        ctx.scale(scale, scale);
        ctx.globalAlpha = opacity;

        const pieceGradient = ctx.createLinearGradient(0, -28, 0, 29);
        pieceGradient.addColorStop(0, piece.promoted ? '#ffe7a6' : '#f8dc98');
        pieceGradient.addColorStop(0.48, piece.promoted ? '#efc36f' : '#dfaa54');
        pieceGradient.addColorStop(1, piece.promoted ? '#bd7c2f' : '#b7742d');

        ctx.beginPath();
        ctx.moveTo(0, -29);
        ctx.lineTo(24, -17);
        ctx.lineTo(20, 28);
        ctx.lineTo(-20, 28);
        ctx.lineTo(-24, -17);
        ctx.closePath();
        ctx.fillStyle = pieceGradient;
        ctx.strokeStyle = piece.side === 'black' ? '#4b2b13' : '#6f1d12';
        ctx.lineWidth = 1.8;
        ctx.shadowColor = 'rgba(42, 20, 5, 0.34)';
        ctx.shadowBlur = 7;
        ctx.shadowOffsetY = 3;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, -24);
        ctx.lineTo(18, -15);
        ctx.lineTo(15, 22);
        ctx.lineTo(-15, 22);
        ctx.lineTo(-18, -15);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255, 244, 203, 0.42)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = piece.promoted ? '#a01810' : '#201108';
        ctx.font = `${label.length > 1 ? 18 : 25}px \"Yu Mincho\", \"Noto Serif CJK SC\", \"Microsoft YaHei\", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(255, 237, 182, 0.35)';
        ctx.shadowBlur = 1;
        ctx.fillText(label, 0, 4);
        ctx.restore();
    }

    function drawPiece(ctx: CanvasRenderingContext2D, piece: Piece, row: number, col: number) {
        const center = cellCenter({ row, col });
        drawPieceAt(ctx, piece, center.x, center.y);
    }
    function draw(ctx: CanvasRenderingContext2D) {
        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        const boardGradient = ctx.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        boardGradient.addColorStop(0, '#f1cf83');
        boardGradient.addColorStop(0.42, '#d7a456');
        boardGradient.addColorStop(1, '#9a5f28');
        ctx.fillStyle = boardGradient;
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        ctx.save();
        ctx.globalAlpha = 0.16;
        for (let i = 0; i < 18; i++) {
            const y = 12 + i * 33 + ((i * 11) % 17);
            const grain = ctx.createLinearGradient(0, y, CANVAS_SIZE, y + 18);
            grain.addColorStop(0, 'rgba(91, 46, 18, 0)');
            grain.addColorStop(0.45, 'rgba(91, 46, 18, 0.55)');
            grain.addColorStop(1, 'rgba(91, 46, 18, 0)');
            ctx.strokeStyle = grain;
            ctx.lineWidth = i % 3 === 0 ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(6, y);
            ctx.bezierCurveTo(150, y - 10, 300, y + 22, CANVAS_SIZE - 6, y + 2);
            ctx.stroke();
        }
        ctx.restore();

        ctx.strokeStyle = 'rgba(68, 35, 12, 0.82)';
        ctx.lineWidth = 3.2;
        ctx.strokeRect(PADDING - 1, PADDING - 1, BOARD_SIZE * CELL_SIZE + 2, BOARD_SIZE * CELL_SIZE + 2);

        ctx.strokeStyle = 'rgba(70, 38, 16, 0.78)';
        ctx.lineWidth = 1.15;
        for (let i = 0; i <= BOARD_SIZE; i++) {
            const offset = PADDING + i * CELL_SIZE;
            ctx.beginPath();
            ctx.moveTo(PADDING, offset);
            ctx.lineTo(PADDING + BOARD_SIZE * CELL_SIZE, offset);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(offset, PADDING);
            ctx.lineTo(offset, PADDING + BOARD_SIZE * CELL_SIZE);
            ctx.stroke();
        }

        ctx.fillStyle = 'rgba(69, 36, 13, 0.86)';
        [3, 6].forEach(rowLine => {
            [3, 6].forEach(colLine => {
                ctx.beginPath();
                ctx.arc(PADDING + colLine * CELL_SIZE, PADDING + rowLine * CELL_SIZE, 3.3, 0, Math.PI * 2);
                ctx.fill();
            });
        });

        const legal = new Set(legalTargets.value.map(key));
        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                const x = PADDING + col * CELL_SIZE;
                const y = PADDING + row * CELL_SIZE;
                if (sameSquare(selected.value, { row, col })) {
                    ctx.fillStyle = 'rgba(37, 99, 235, 0.22)';
                    ctx.fillRect(x + 3, y + 3, CELL_SIZE - 6, CELL_SIZE - 6);
                }
                if (lastMove.value && sameSquare(lastMove.value.to, { row, col })) {
                    ctx.fillStyle = 'rgba(250, 204, 21, 0.24)';
                    ctx.fillRect(x + 3, y + 3, CELL_SIZE - 6, CELL_SIZE - 6);
                }
                if (legal.has(`${row},${col}`)) {
                    ctx.beginPath();
                    if (board.value[row][col]) {
                        ctx.arc(x + CELL_SIZE / 2, y + CELL_SIZE / 2, 23, 0, Math.PI * 2);
                        ctx.strokeStyle = 'rgba(185, 28, 28, 0.58)';
                        ctx.lineWidth = 3;
                        ctx.stroke();
                    } else {
                        ctx.arc(x + CELL_SIZE / 2, y + CELL_SIZE / 2, 6, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(32, 17, 8, 0.42)';
                        ctx.fill();
                    }
                }
            }
        }

        if (hover.value) {
            ctx.strokeStyle = 'rgba(255, 250, 230, 0.82)';
            ctx.lineWidth = 2;
            ctx.strokeRect(
                PADDING + hover.value.col * CELL_SIZE + 3,
                PADDING + hover.value.row * CELL_SIZE + 3,
                CELL_SIZE - 6,
                CELL_SIZE - 6,
            );
        }

        const animation = pieceAnimation.value;
        const animatedTo = animation?.to;
        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                const piece = board.value[row][col];
                if (!piece) continue;
                if (animatedTo && animatedTo.row === row && animatedTo.col === col) continue;
                drawPiece(ctx, piece, row, col);
            }
        }

        if (animation) {
            const rawProgress = Math.min(1, (performance.now() - animation.startedAt) / animation.duration);
            const progress = easeOutCubic(rawProgress);
            const to = cellCenter(animation.to);
            if (animation.type === 'move' && animation.from) {
                const from = cellCenter(animation.from);
                const x = from.x + (to.x - from.x) * progress;
                const y = from.y + (to.y - from.y) * progress;
                drawPieceAt(
                    ctx,
                    animation.piece,
                    x,
                    y,
                    1 + Math.sin(progress * Math.PI) * 0.05,
                    -10 * Math.sin(progress * Math.PI),
                );
            } else {
                const scale = 0.72 + 0.28 * progress;
                drawPieceAt(ctx, animation.piece, to.x, to.y, scale, -16 * (1 - progress), 0.45 + 0.55 * progress);
            }
            if (rawProgress >= 1) pieceAnimation.value = null;
        }

        ctx.fillStyle = 'rgba(54, 28, 10, 0.72)';
        ctx.font = '700 11px "Yu Mincho", ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < BOARD_SIZE; i++) {
            ctx.fillText(`${9 - i}`, PADDING + i * CELL_SIZE + CELL_SIZE / 2, 9);
            ctx.fillText(`${i + 1}`, 9, PADDING + i * CELL_SIZE + CELL_SIZE / 2);
        }
    }
    function getWidth() {
        return CANVAS_SIZE;
    }

    function getHeight() {
        return CANVAS_SIZE;
    }

    function handSummary(side: Side) {
        const hand = side === 'black' ? blackHand.value : whiteHand.value;
        return hand.reduce(
            (counts, kind) => {
                counts[kind] = (counts[kind] ?? 0) + 1;
                return counts;
            },
            {} as Partial<Record<PieceKind, number>>,
        );
    }

    function getPieceName(kind: PieceKind) {
        return PIECE_NAME[kind];
    }

    onUnmounted(clearAITimer);

    return {
        board,
        currentSide,
        playerSide,
        aiSide,
        aiEnabled,
        aiThinking,
        isAITurn,
        gameStatus,
        message,
        selected,
        legalTargets,
        selectedHand,
        blackHand,
        whiteHand,
        promoteChoice,
        moveHistory,
        moveCount,
        sideLabel,
        startGame,
        handleClick,
        handleHover,
        selectHand,
        choosePromotion,
        resign,
        draw,
        getWidth,
        getHeight,
        handSummary,
        getPieceName,
        pieceLabel: PIECE_LABEL,
        toSfen,
        clearAITimer,
    };
}
