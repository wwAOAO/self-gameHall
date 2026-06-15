import { computed, onUnmounted, ref } from 'vue';

type Side = 'blue' | 'red' | 'green' | 'yellow';
type PieceKind = 'rank' | 'engineer' | 'bomb' | 'mine' | 'flag';
type GameStatus = 'idle' | 'playing' | 'ended';

interface PieceSpec {
    kind: PieceKind;
    label: string;
    short: string;
    rank: number;
    count: number;
}

interface Piece {
    id: string;
    side: Side;
    kind: PieceKind;
    label: string;
    short: string;
    rank: number;
    revealed: boolean;
}

interface Pos {
    row: number;
    col: number;
}

interface SideInfo {
    side: Side;
    name: string;
    color: string;
    fill: string;
    stroke: string;
}

interface MoveOption {
    from: Pos;
    to: Pos;
    score: number;
}

interface BattleResult {
    score: number;
    message: string;
    wins: boolean;
}

const BOARD_SIZE = 13;
const CELL = 52;
const PADDING = 28;
const CANVAS_SIZE = PADDING * 2 + BOARD_SIZE * CELL;
const PLAYER_SIDE: Side = 'blue';
const TURN_ORDER: Side[] = ['blue', 'red', 'green', 'yellow'];

const SIDES: Record<Side, SideInfo> = {
    blue: { side: 'blue', name: '蓝方', color: '#38bdf8', fill: '#165aa7', stroke: '#8fd3ff' },
    red: { side: 'red', name: '红方', color: '#fb7185', fill: '#a83232', stroke: '#fecaca' },
    green: { side: 'green', name: '绿方', color: '#4ade80', fill: '#247a49', stroke: '#bbf7d0' },
    yellow: { side: 'yellow', name: '黄方', color: '#facc15', fill: '#9a6a12', stroke: '#fde68a' },
};

const PIECES: PieceSpec[] = [
    { kind: 'rank', label: '司令', short: '司', rank: 9, count: 1 },
    { kind: 'rank', label: '军长', short: '军', rank: 8, count: 1 },
    { kind: 'rank', label: '师长', short: '师', rank: 7, count: 1 },
    { kind: 'rank', label: '旅长', short: '旅', rank: 6, count: 1 },
    { kind: 'rank', label: '团长', short: '团', rank: 5, count: 2 },
    { kind: 'rank', label: '营长', short: '营', rank: 4, count: 2 },
    { kind: 'rank', label: '连长', short: '连', rank: 3, count: 2 },
    { kind: 'rank', label: '排长', short: '排', rank: 2, count: 2 },
    { kind: 'engineer', label: '工兵', short: '工', rank: 1, count: 2 },
    { kind: 'bomb', label: '炸弹', short: '炸', rank: 0, count: 2 },
    { kind: 'mine', label: '地雷', short: '雷', rank: 0, count: 2 },
    { kind: 'flag', label: '军旗', short: '旗', rank: 0, count: 1 },
];

const START_CELLS: Record<Side, Pos[]> = {
    red: blockCells(0, 4, 4, 8),
    blue: blockCells(9, 12, 4, 8).reverse(),
    green: blockCells(4, 8, 0, 3),
    yellow: blockCells(4, 8, 9, 12),
};

function blockCells(rowStart: number, rowEnd: number, colStart: number, colEnd: number): Pos[] {
    const cells: Pos[] = [];
    for (let row = rowStart; row <= rowEnd; row++) {
        for (let col = colStart; col <= colEnd; col++) {
            cells.push({ row, col });
        }
    }
    return cells;
}

function emptyBoard(): (Piece | null)[][] {
    return Array.from({ length: BOARD_SIZE }, () => Array<Piece | null>(BOARD_SIZE).fill(null));
}

function isInside(row: number, col: number): boolean {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function clonePos(pos: Pos): Pos {
    return { row: pos.row, col: pos.col };
}

function isMovable(piece: Piece): boolean {
    return piece.kind !== 'mine' && piece.kind !== 'flag';
}

function sideName(side: Side): string {
    return SIDES[side].name;
}

function shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function makeArmy(side: Side): Piece[] {
    const pieces: Piece[] = [];
    for (const spec of PIECES) {
        for (let i = 0; i < spec.count; i++) {
            pieces.push({
                id: `${side}-${spec.label}-${i}-${Math.random().toString(36).slice(2)}`,
                side,
                kind: spec.kind,
                label: spec.label,
                short: spec.short,
                rank: spec.rank,
                revealed: side === PLAYER_SIDE,
            });
        }
    }
    return shuffle(pieces);
}

function setupArmy(board: (Piece | null)[][], side: Side) {
    const army = makeArmy(side);
    const cells = [...START_CELLS[side]];
    const preferredFlag = flagCell(side);
    cells.sort((a, b) => {
        const aFlag = a.row === preferredFlag.row && a.col === preferredFlag.col ? -1 : 0;
        const bFlag = b.row === preferredFlag.row && b.col === preferredFlag.col ? -1 : 0;
        return aFlag - bFlag;
    });

    const flagIndex = army.findIndex(piece => piece.kind === 'flag');
    const flag = army.splice(flagIndex, 1)[0];
    const mines = army.filter(piece => piece.kind === 'mine');
    const others = army.filter(piece => piece.kind !== 'mine');
    const orderedArmy = [flag, ...shuffle(mines), ...shuffle(others)];

    for (let i = 0; i < orderedArmy.length && i < cells.length; i++) {
        const cell = cells[i];
        board[cell.row][cell.col] = orderedArmy[i];
    }
}

function flagCell(side: Side): Pos {
    if (side === 'blue') return { row: 12, col: 6 };
    if (side === 'red') return { row: 0, col: 6 };
    if (side === 'green') return { row: 6, col: 0 };
    return { row: 6, col: 12 };
}

function battleResult(attacker: Piece, defender: Piece): BattleResult {
    attacker.revealed = true;
    defender.revealed = true;

    if (defender.kind === 'flag') {
        return {
            score: 10000,
            message: `${sideName(attacker.side)}${attacker.label}夺取${sideName(defender.side)}军旗`,
            wins: true,
        };
    }

    if (attacker.kind === 'bomb' || defender.kind === 'bomb') {
        return {
            score: 30 + pieceValue(defender) * 0.35,
            message: `${sideName(attacker.side)}${attacker.label}与${sideName(defender.side)}${defender.label}同归于尽`,
            wins: false,
        };
    }

    if (defender.kind === 'mine') {
        if (attacker.kind === 'engineer') {
            return {
                score: 80,
                message: `${sideName(attacker.side)}工兵排除${sideName(defender.side)}地雷`,
                wins: false,
            };
        }
        return {
            score: -80 - attacker.rank * 5,
            message: `${sideName(attacker.side)}${attacker.label}撞上${sideName(defender.side)}地雷`,
            wins: false,
        };
    }

    if (attacker.rank > defender.rank) {
        return {
            score: 30 + defender.rank * 8 - attacker.rank,
            message: `${sideName(attacker.side)}${attacker.label}吃掉${sideName(defender.side)}${defender.label}`,
            wins: false,
        };
    }

    if (attacker.rank < defender.rank) {
        return {
            score: -35 - attacker.rank * 6,
            message: `${sideName(attacker.side)}${attacker.label}不敌${sideName(defender.side)}${defender.label}`,
            wins: false,
        };
    }

    return {
        score: 8,
        message: `${sideName(attacker.side)}${attacker.label}与${sideName(defender.side)}${defender.label}同归于尽`,
        wins: false,
    };
}

function pieceValue(piece: Piece): number {
    if (piece.kind === 'flag') return 130;
    if (piece.kind === 'mine') return 34;
    if (piece.kind === 'bomb') return 58;
    if (piece.kind === 'engineer') return 42;
    return piece.rank * 13;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
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

export function useMilitaryChess() {
    const board = ref<(Piece | null)[][]>(emptyBoard());
    const selected = ref<Pos | null>(null);
    const currentSide = ref<Side>(PLAYER_SIDE);
    const gameStatus = ref<GameStatus>('idle');
    const message = ref('准备开局');
    const history = ref<string[]>([]);
    const lastMove = ref<{ from: Pos; to: Pos } | null>(null);
    const winner = ref<Side | null>(null);
    const eliminated = ref<Side[]>([]);

    let aiTimer: ReturnType<typeof setTimeout> | null = null;

    const sides = computed(() =>
        TURN_ORDER.map(side => ({
            ...SIDES[side],
            pieces: countPieces(side),
            eliminated: eliminated.value.includes(side),
        })),
    );
    const activeSides = computed(() =>
        TURN_ORDER.filter(side => !eliminated.value.includes(side) && countPieces(side) > 0),
    );
    const legalTargets = computed(() => (selected.value ? getLegalTargets(selected.value) : []));

    function startGame() {
        clearAITimer();
        const next = emptyBoard();
        for (const side of TURN_ORDER) setupArmy(next, side);

        board.value = next;
        selected.value = null;
        currentSide.value = PLAYER_SIDE;
        gameStatus.value = 'playing';
        winner.value = null;
        eliminated.value = [];
        lastMove.value = null;
        history.value = [];
        message.value = '蓝方行动';
    }

    function countPieces(side: Side): number {
        return board.value.flat().filter(piece => piece?.side === side).length;
    }

    function addHistory(text: string) {
        history.value = [text, ...history.value].slice(0, 10);
    }

    function boardToCanvas(row: number, col: number) {
        return {
            x: PADDING + col * CELL,
            y: PADDING + row * CELL,
        };
    }

    function canvasToBoard(mx: number, my: number): Pos | null {
        const col = Math.floor((mx - PADDING) / CELL);
        const row = Math.floor((my - PADDING) / CELL);
        if (!isInside(row, col)) return null;
        return { row, col };
    }

    function handleClick(mx: number, my: number) {
        if (gameStatus.value !== 'playing' || currentSide.value !== PLAYER_SIDE) return;

        const pos = canvasToBoard(mx, my);
        if (!pos) {
            selected.value = null;
            return;
        }

        const piece = board.value[pos.row][pos.col];
        if (piece?.side === PLAYER_SIDE) {
            if (!isMovable(piece)) {
                message.value = `${piece.label}不能移动`;
                selected.value = null;
                return;
            }

            selected.value = pos;
            message.value = `选择了${piece.label}`;
            return;
        }

        if (!selected.value) return;
        if (!isLegalMove(selected.value, pos)) {
            message.value = '只能向相邻格移动或进攻';
            return;
        }

        movePiece(selected.value, pos);
    }

    function getLegalTargets(from: Pos): Pos[] {
        const piece = board.value[from.row][from.col];
        if (!piece || !isMovable(piece) || eliminated.value.includes(piece.side)) return [];

        const dirs = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
        ];
        const targets: Pos[] = [];
        for (const [dr, dc] of dirs) {
            const row = from.row + dr;
            const col = from.col + dc;
            if (!isInside(row, col)) continue;

            const target = board.value[row][col];
            if (!target || target.side !== piece.side) {
                targets.push({ row, col });
            }
        }
        return targets;
    }

    function isLegalMove(from: Pos, to: Pos): boolean {
        return getLegalTargets(from).some(pos => pos.row === to.row && pos.col === to.col);
    }

    function movePiece(from: Pos, to: Pos) {
        const attacker = board.value[from.row][from.col];
        if (!attacker || gameStatus.value !== 'playing') return;

        const defender = board.value[to.row][to.col];
        selected.value = null;
        lastMove.value = { from: clonePos(from), to: clonePos(to) };

        if (!defender) {
            board.value[to.row][to.col] = attacker;
            board.value[from.row][from.col] = null;
            attacker.revealed = true;
            addHistory(`${sideName(attacker.side)}${attacker.label}前进`);
            afterMove(attacker.side);
            return;
        }

        const result = battleResult(attacker, defender);
        applyBattle(from, to, attacker, defender, result);
    }

    function applyBattle(from: Pos, to: Pos, attacker: Piece, defender: Piece, result: BattleResult) {
        if (result.wins) {
            board.value[to.row][to.col] = attacker;
            board.value[from.row][from.col] = null;
            eliminateSide(defender.side, result.message);
            if (gameStatus.value === 'playing') afterMove(attacker.side);
            return;
        }

        const bothDie =
            attacker.kind === 'bomb' ||
            defender.kind === 'bomb' ||
            (attacker.rank === defender.rank && defender.kind !== 'mine');
        if (bothDie) {
            board.value[to.row][to.col] = null;
            board.value[from.row][from.col] = null;
        } else if (defender.kind === 'mine' && attacker.kind !== 'engineer') {
            board.value[from.row][from.col] = null;
            board.value[to.row][to.col] = defender;
        } else if (defender.kind === 'mine' && attacker.kind === 'engineer') {
            board.value[to.row][to.col] = attacker;
            board.value[from.row][from.col] = null;
        } else if (attacker.rank > defender.rank) {
            board.value[to.row][to.col] = attacker;
            board.value[from.row][from.col] = null;
        } else {
            board.value[from.row][from.col] = null;
            board.value[to.row][to.col] = defender;
        }

        addHistory(result.message);
        checkBoardEnd();
        if (gameStatus.value === 'playing') afterMove(attacker.side);
    }

    function eliminateSide(side: Side, reason: string) {
        if (!eliminated.value.includes(side)) {
            eliminated.value = [...eliminated.value, side];
            removeSidePieces(side);
            addHistory(`${reason}，${sideName(side)}出局`);
        }
        checkBoardEnd();
    }

    function removeSidePieces(side: Side) {
        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                if (board.value[row][col]?.side === side) {
                    board.value[row][col] = null;
                }
            }
        }
    }

    function afterMove(side: Side) {
        currentSide.value = getNextSide(side);
        message.value = `${sideName(currentSide.value)}行动`;
        if (currentSide.value !== PLAYER_SIDE) scheduleAI();
    }

    function getNextSide(side: Side): Side {
        const start = TURN_ORDER.indexOf(side);
        for (let offset = 1; offset <= TURN_ORDER.length; offset++) {
            const next = TURN_ORDER[(start + offset) % TURN_ORDER.length];
            if (!eliminated.value.includes(next) && countPieces(next) > 0 && getAllMoves(next).length > 0) {
                return next;
            }
        }
        return side;
    }

    function checkBoardEnd() {
        for (const side of TURN_ORDER) {
            if (!eliminated.value.includes(side) && countPieces(side) > 0 && getAllMoves(side).length === 0) {
                eliminated.value = [...eliminated.value, side];
                removeSidePieces(side);
                addHistory(`${sideName(side)}无棋可走，自动出局`);
            }
        }

        const alive = activeSides.value;
        if (alive.length <= 1) {
            const side = alive[0] ?? PLAYER_SIDE;
            finish(side, side === PLAYER_SIDE ? '你成为最后存活的一方' : `${sideName(side)}获得胜利`);
        }
    }

    function finish(side: Side, text: string) {
        clearAITimer();
        winner.value = side;
        currentSide.value = side;
        gameStatus.value = 'ended';
        message.value = side === PLAYER_SIDE ? `胜利：${text}` : `失败：${text}`;
        addHistory(text);
    }

    function getAllMoves(side: Side): MoveOption[] {
        if (eliminated.value.includes(side)) return [];

        const moves: MoveOption[] = [];
        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                const piece = board.value[row][col];
                if (!piece || piece.side !== side || !isMovable(piece)) continue;

                for (const to of getLegalTargets({ row, col })) {
                    moves.push({ from: { row, col }, to, score: scoreMove({ row, col }, to) });
                }
            }
        }
        return moves;
    }

    function scoreMove(from: Pos, to: Pos): number {
        const attacker = board.value[from.row][from.col];
        const defender = board.value[to.row][to.col];
        if (!attacker) return -Infinity;

        let score = Math.random() * 18;
        score += centerScore(to) * 2.2;
        score += forwardScore(attacker.side, from, to);

        if (!defender) {
            if (attacker.kind === 'engineer') score += 4;
            return score;
        }

        const result = battleResult({ ...attacker }, { ...defender });
        score += result.score;
        score += pieceValue(defender) * 0.4;
        if (defender.side === PLAYER_SIDE) score += 12;
        if (defender.kind === 'flag') score += 10000;
        if (attacker.kind !== 'bomb' && result.score < 0) score -= pieceValue(attacker) * 0.32;
        return score;
    }

    function centerScore(pos: Pos): number {
        return 7 - (Math.abs(6 - pos.row) + Math.abs(6 - pos.col)) * 0.5;
    }

    function forwardScore(side: Side, from: Pos, to: Pos): number {
        if (side === 'red') return (to.row - from.row) * 6;
        if (side === 'blue') return (from.row - to.row) * 6;
        if (side === 'green') return (to.col - from.col) * 6;
        return (from.col - to.col) * 6;
    }

    function scheduleAI() {
        clearAITimer();
        message.value = `${sideName(currentSide.value)}思考中...`;
        aiTimer = setTimeout(
            () => {
                if (gameStatus.value !== 'playing' || currentSide.value === PLAYER_SIDE) return;

                const side = currentSide.value;
                const moves = getAllMoves(side);
                if (moves.length === 0) {
                    eliminateSide(side, `${sideName(side)}无棋可走`);
                    if (gameStatus.value === 'playing') afterMove(side);
                    return;
                }

                moves.sort((a, b) => b.score - a.score);
                const topScore = moves[0].score;
                const pool = moves.filter(move => move.score >= topScore - 15).slice(0, 6);
                const move = pool[Math.floor(Math.random() * pool.length)];
                movePiece(move.from, move.to);
            },
            460 + Math.random() * 320,
        );
    }

    function clearAITimer() {
        if (aiTimer !== null) {
            clearTimeout(aiTimer);
            aiTimer = null;
        }
    }

    function draw(ctx: CanvasRenderingContext2D) {
        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        drawBoard(ctx);
        drawHighlights(ctx);

        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                const piece = board.value[row][col];
                if (piece) drawPiece(ctx, piece, row, col);
            }
        }
    }

    function drawBoard(ctx: CanvasRenderingContext2D) {
        const grad = ctx.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        grad.addColorStop(0, '#3b1f1f');
        grad.addColorStop(0.35, '#163d32');
        grad.addColorStop(0.72, '#17385f');
        grad.addColorStop(1, '#4a3a15');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        drawCamp(ctx, START_CELLS.red, 'rgba(248,113,113,0.13)');
        drawCamp(ctx, START_CELLS.blue, 'rgba(56,189,248,0.14)');
        drawCamp(ctx, START_CELLS.green, 'rgba(74,222,128,0.13)');
        drawCamp(ctx, START_CELLS.yellow, 'rgba(250,204,21,0.14)');

        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        roundedRect(ctx, PADDING + 4 * CELL, PADDING + 4 * CELL, CELL * 5, CELL * 5, 12);
        ctx.fill();

        ctx.strokeStyle = 'rgba(232,217,174,0.28)';
        ctx.lineWidth = 1;
        for (let row = 0; row <= BOARD_SIZE; row++) {
            const y = PADDING + row * CELL;
            ctx.beginPath();
            ctx.moveTo(PADDING, y);
            ctx.lineTo(PADDING + BOARD_SIZE * CELL, y);
            ctx.stroke();
        }
        for (let col = 0; col <= BOARD_SIZE; col++) {
            const x = PADDING + col * CELL;
            ctx.beginPath();
            ctx.moveTo(x, PADDING);
            ctx.lineTo(x, PADDING + BOARD_SIZE * CELL);
            ctx.stroke();
        }

        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.font = '800 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('红方', CANVAS_SIZE / 2, PADDING / 2);
        ctx.fillText('蓝方', CANVAS_SIZE / 2, CANVAS_SIZE - PADDING / 2);
        ctx.save();
        ctx.translate(PADDING / 2, CANVAS_SIZE / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('绿方', 0, 0);
        ctx.restore();
        ctx.save();
        ctx.translate(CANVAS_SIZE - PADDING / 2, CANVAS_SIZE / 2);
        ctx.rotate(Math.PI / 2);
        ctx.fillText('黄方', 0, 0);
        ctx.restore();
    }

    function drawCamp(ctx: CanvasRenderingContext2D, cells: Pos[], color: string) {
        ctx.fillStyle = color;
        for (const cell of cells) {
            const { x, y } = boardToCanvas(cell.row, cell.col);
            ctx.fillRect(x, y, CELL, CELL);
        }
    }

    function drawHighlights(ctx: CanvasRenderingContext2D) {
        if (lastMove.value) {
            for (const pos of [lastMove.value.from, lastMove.value.to]) {
                const { x, y } = boardToCanvas(pos.row, pos.col);
                ctx.strokeStyle = 'rgba(250,204,21,0.78)';
                ctx.lineWidth = 2;
                roundedRect(ctx, x + 5, y + 5, CELL - 10, CELL - 10, 9);
                ctx.stroke();
            }
        }

        if (!selected.value) return;

        const selectedCell = boardToCanvas(selected.value.row, selected.value.col);
        ctx.fillStyle = 'rgba(56,189,248,0.22)';
        roundedRect(ctx, selectedCell.x + 4, selectedCell.y + 4, CELL - 8, CELL - 8, 9);
        ctx.fill();

        for (const target of legalTargets.value) {
            const { x, y } = boardToCanvas(target.row, target.col);
            ctx.beginPath();
            ctx.arc(x + CELL / 2, y + CELL / 2, 6, 0, Math.PI * 2);
            ctx.fillStyle = board.value[target.row][target.col] ? 'rgba(248,113,113,0.92)' : 'rgba(125,211,252,0.9)';
            ctx.fill();
        }
    }

    function drawPiece(ctx: CanvasRenderingContext2D, piece: Piece, row: number, col: number) {
        const { x, y } = boardToCanvas(row, col);
        const hidden = piece.side !== PLAYER_SIDE && !piece.revealed && gameStatus.value !== 'ended';
        const info = SIDES[piece.side];
        const fill = hidden ? '#242834' : info.fill;

        ctx.shadowColor = 'rgba(0,0,0,0.34)';
        ctx.shadowBlur = 7;
        ctx.shadowOffsetY = 2;
        roundedRect(ctx, x + 6, y + 6, CELL - 12, CELL - 12, 8);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = hidden ? '#6b7280' : info.stroke;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = hidden ? '#cbd5e1' : '#ffffff';
        ctx.font = hidden ? '800 17px sans-serif' : '900 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hidden ? '?' : piece.short, x + CELL / 2, y + CELL / 2 - 2);

        if (!hidden && (piece.kind === 'mine' || piece.kind === 'bomb' || piece.kind === 'flag')) {
            ctx.font = '700 8px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.78)';
            ctx.fillText(
                piece.kind === 'flag' ? 'FLAG' : piece.kind === 'mine' ? 'MINE' : 'BOMB',
                x + CELL / 2,
                y + CELL - 10,
            );
        }
    }

    function getWidth() {
        return CANVAS_SIZE;
    }

    function getHeight() {
        return CANVAS_SIZE;
    }

    onUnmounted(() => {
        clearAITimer();
    });

    return {
        board,
        selected,
        currentSide,
        gameStatus,
        message,
        history,
        lastMove,
        winner,
        eliminated,
        sides,
        activeSides,
        startGame,
        handleClick,
        draw,
        getWidth,
        getHeight,
        clearAITimer,
    };
}
