import { computed, onUnmounted, ref } from 'vue';

const COLS = 10;
const ROWS = 20;
const INITIAL_INTERVAL = 760;
const MIN_INTERVAL = 90;
const LOCK_DELAY = 420;
const MAX_LOCK_RESETS = 15;
const PREVIEW_COUNT = 4;

type GameStatus = 'idle' | 'playing' | 'paused' | 'gameover';
type PieceType = 'I' | 'O' | 'T' | 'J' | 'L' | 'S' | 'Z';

interface Position {
    x: number;
    y: number;
}

export interface TetrisPiece {
    type: PieceType;
    color: string;
    shape: number[][];
}

const PIECES: TetrisPiece[] = [
    { type: 'I', color: '#22d3ee', shape: [[1, 1, 1, 1]] },
    {
        type: 'O',
        color: '#facc15',
        shape: [
            [1, 1],
            [1, 1],
        ],
    },
    {
        type: 'T',
        color: '#c084fc',
        shape: [
            [0, 1, 0],
            [1, 1, 1],
        ],
    },
    {
        type: 'J',
        color: '#60a5fa',
        shape: [
            [1, 0, 0],
            [1, 1, 1],
        ],
    },
    {
        type: 'L',
        color: '#fb923c',
        shape: [
            [0, 0, 1],
            [1, 1, 1],
        ],
    },
    {
        type: 'S',
        color: '#34d399',
        shape: [
            [0, 1, 1],
            [1, 1, 0],
        ],
    },
    {
        type: 'Z',
        color: '#fb7185',
        shape: [
            [1, 1, 0],
            [0, 1, 1],
        ],
    },
];

function createEmptyBoard(): string[][] {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(''));
}

function cloneShape(shape: number[][]): number[][] {
    return shape.map(row => [...row]);
}

function clonePiece(piece: TetrisPiece): TetrisPiece {
    return {
        type: piece.type,
        color: piece.color,
        shape: cloneShape(piece.shape),
    };
}

function shufflePieces(pieces: TetrisPiece[]): TetrisPiece[] {
    const next = pieces.map(clonePiece);
    for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
}

function rotateMatrix(shape: number[][], direction: 1 | -1): number[][] {
    if (direction === 1) {
        return shape[0].map((_, i) => shape.map(row => row[i]).reverse());
    }

    return shape[0].map((_, i) => shape.map(row => row[row.length - 1 - i]));
}

function getHighScore(): number {
    return Number(localStorage.getItem('tetris-high-score') || 0);
}

export function useTetris() {
    const board = ref<string[][]>(createEmptyBoard());
    const currentPiece = ref<number[][]>([]);
    const currentPos = ref<Position>({ x: 0, y: 0 });
    const currentColor = ref('');
    const currentType = ref<PieceType>('I');
    const score = ref(0);
    const highScore = ref(getHighScore());
    const lines = ref(0);
    const level = ref(1);
    const nextQueue = ref<TetrisPiece[]>([]);
    const holdPiece = ref<TetrisPiece | null>(null);
    const canHold = ref(true);
    const gameStatus = ref<GameStatus>('idle');
    const pieceSerial = ref(0);

    let gameLoop: ReturnType<typeof setTimeout> | null = null;
    let lockTimer: ReturnType<typeof setTimeout> | null = null;
    let bag: TetrisPiece[] = [];
    let lockResetCount = 0;

    const nextPieces = computed(() => nextQueue.value.slice(0, 3).map(clonePiece));
    const holdShape = computed(() => (holdPiece.value ? cloneShape(holdPiece.value.shape) : []));
    const holdColor = computed(() => holdPiece.value?.color || '');
    const cellsFilled = computed(() => {
        const filled = board.value.reduce((total, row) => total + row.filter(Boolean).length, 0);
        return filled / (COLS * ROWS);
    });

    function clearGameLoop() {
        if (gameLoop) {
            clearTimeout(gameLoop);
            gameLoop = null;
        }
    }

    function clearLockTimer() {
        if (lockTimer) {
            clearTimeout(lockTimer);
            lockTimer = null;
        }
    }

    function drawPiece(): TetrisPiece {
        if (bag.length === 0) {
            bag = shufflePieces(PIECES);
        }
        return clonePiece(bag.pop() as TetrisPiece);
    }

    function ensureNextQueue(size = PREVIEW_COUNT) {
        const queue = [...nextQueue.value];
        while (queue.length < size) {
            queue.push(drawPiece());
        }
        nextQueue.value = queue;
    }

    function takeNextPiece(): TetrisPiece {
        ensureNextQueue();
        const [piece, ...rest] = nextQueue.value;
        nextQueue.value = rest;
        ensureNextQueue();
        return clonePiece(piece);
    }

    function setCurrentPiece(piece: TetrisPiece) {
        pieceSerial.value += 1;
        currentPiece.value = cloneShape(piece.shape);
        currentColor.value = piece.color;
        currentType.value = piece.type;
        currentPos.value = {
            x: Math.floor((COLS - piece.shape[0].length) / 2),
            y: 0,
        };
    }

    function spawnPiece(piece = takeNextPiece()) {
        setCurrentPiece(piece);
        canHold.value = true;
        lockResetCount = 0;

        if (collides(currentPos.value.x, currentPos.value.y, currentPiece.value)) {
            endGame();
        }
    }

    function collides(x: number, y: number, shape: number[][]): boolean {
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (!shape[r][c]) continue;

                const bx = x + c;
                const by = y + r;
                if (bx < 0 || bx >= COLS || by >= ROWS) return true;
                if (by >= 0 && board.value[by][bx]) return true;
            }
        }
        return false;
    }

    function isGrounded(): boolean {
        return collides(currentPos.value.x, currentPos.value.y + 1, currentPiece.value);
    }

    function merge() {
        const newBoard = board.value.map(row => [...row]);
        for (let r = 0; r < currentPiece.value.length; r++) {
            for (let c = 0; c < currentPiece.value[r].length; c++) {
                if (!currentPiece.value[r][c]) continue;

                const by = currentPos.value.y + r;
                const bx = currentPos.value.x + c;
                if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) {
                    newBoard[by][bx] = currentColor.value;
                }
            }
        }
        board.value = newBoard;
    }

    function updateHighScore() {
        if (score.value > highScore.value) {
            highScore.value = score.value;
            localStorage.setItem('tetris-high-score', String(highScore.value));
        }
    }

    function clearLines() {
        const remainingRows = board.value.filter(row => row.some(cell => !cell));
        const cleared = ROWS - remainingRows.length;

        if (cleared === 0) return;

        while (remainingRows.length < ROWS) {
            remainingRows.unshift(Array(COLS).fill(''));
        }

        board.value = remainingRows;
        lines.value += cleared;
        level.value = Math.floor(lines.value / 10) + 1;

        const lineScores = [0, 100, 300, 500, 800];
        score.value += (lineScores[cleared] || 0) * level.value;
        updateHighScore();
    }

    function nudgeLockDelay() {
        if (!lockTimer || lockResetCount >= MAX_LOCK_RESETS) return;

        clearLockTimer();
        lockResetCount += 1;
        if (isGrounded()) {
            scheduleLock();
        } else {
            scheduleNext();
        }
    }

    function moveLeft() {
        if (gameStatus.value !== 'playing') return;

        if (!collides(currentPos.value.x - 1, currentPos.value.y, currentPiece.value)) {
            currentPos.value.x -= 1;
            nudgeLockDelay();
        }
    }

    function moveRight() {
        if (gameStatus.value !== 'playing') return;

        if (!collides(currentPos.value.x + 1, currentPos.value.y, currentPiece.value)) {
            currentPos.value.x += 1;
            nudgeLockDelay();
        }
    }

    function moveDown(addScore = false): boolean {
        if (!collides(currentPos.value.x, currentPos.value.y + 1, currentPiece.value)) {
            currentPos.value.y += 1;
            clearLockTimer();
            if (addScore) {
                score.value += 1;
                updateHighScore();
            }
            return true;
        }
        return false;
    }

    function rotate(direction: 1 | -1 = 1) {
        if (gameStatus.value !== 'playing' || currentType.value === 'O') return;

        const rotated = rotateMatrix(currentPiece.value, direction);
        const kickTests: Position[] = [
            { x: 0, y: 0 },
            { x: -1, y: 0 },
            { x: 1, y: 0 },
            { x: -2, y: 0 },
            { x: 2, y: 0 },
            { x: 0, y: -1 },
        ];

        for (const kick of kickTests) {
            const x = currentPos.value.x + kick.x;
            const y = currentPos.value.y + kick.y;
            if (!collides(x, y, rotated)) {
                currentPiece.value = rotated;
                currentPos.value = { x, y };
                nudgeLockDelay();
                return;
            }
        }
    }

    function softDrop() {
        if (gameStatus.value !== 'playing') return;

        if (!moveDown(true)) {
            scheduleLock();
        }
    }

    function hardDrop() {
        if (gameStatus.value !== 'playing') return;

        let dropped = 0;
        while (!collides(currentPos.value.x, currentPos.value.y + 1, currentPiece.value)) {
            currentPos.value.y += 1;
            dropped += 1;
        }
        score.value += dropped * 2;
        updateHighScore();
        lockPiece();
    }

    function holdCurrentPiece() {
        if (gameStatus.value !== 'playing' || !canHold.value) return;

        clearGameLoop();
        clearLockTimer();

        const current: TetrisPiece = {
            type: currentType.value,
            color: currentColor.value,
            shape: cloneShape(currentPiece.value),
        };

        if (holdPiece.value) {
            const held = clonePiece(holdPiece.value);
            holdPiece.value = current;
            setCurrentPiece(held);
            if (collides(currentPos.value.x, currentPos.value.y, currentPiece.value)) {
                endGame();
                return;
            }
        } else {
            holdPiece.value = current;
            spawnPiece();
        }

        canHold.value = false;
        scheduleNext();
    }

    function getGhostY(): number {
        if (currentPiece.value.length === 0) return currentPos.value.y;

        let gy = currentPos.value.y;
        while (!collides(currentPos.value.x, gy + 1, currentPiece.value)) {
            gy += 1;
        }
        return gy;
    }

    function lockPiece() {
        if (gameStatus.value !== 'playing') return;

        clearGameLoop();
        clearLockTimer();
        merge();
        clearLines();
        spawnPiece();

        if (gameStatus.value === 'playing') {
            scheduleNext();
        }
    }

    function tick() {
        if (gameStatus.value !== 'playing') return;

        if (moveDown(false)) {
            if (isGrounded()) {
                scheduleLock();
            } else {
                scheduleNext();
            }
        } else {
            scheduleLock();
        }
    }

    function getInterval(): number {
        return Math.max(MIN_INTERVAL, INITIAL_INTERVAL - (level.value - 1) * 55);
    }

    function scheduleLock() {
        if (gameStatus.value !== 'playing' || lockTimer) return;

        clearGameLoop();
        lockTimer = setTimeout(() => {
            lockTimer = null;
            lockPiece();
        }, LOCK_DELAY);
    }

    function scheduleNext() {
        clearGameLoop();
        if (gameStatus.value === 'playing') {
            gameLoop = setTimeout(tick, getInterval());
        }
    }

    function startGame() {
        clearGameLoop();
        clearLockTimer();
        bag = [];
        board.value = createEmptyBoard();
        score.value = 0;
        lines.value = 0;
        level.value = 1;
        nextQueue.value = [];
        holdPiece.value = null;
        canHold.value = true;
        gameStatus.value = 'playing';
        ensureNextQueue();
        spawnPiece();
        scheduleNext();
    }

    function endGame() {
        gameStatus.value = 'gameover';
        clearGameLoop();
        clearLockTimer();
        updateHighScore();
    }

    function togglePause() {
        if (gameStatus.value === 'playing') {
            gameStatus.value = 'paused';
            clearGameLoop();
            clearLockTimer();
        } else if (gameStatus.value === 'paused') {
            gameStatus.value = 'playing';
            if (isGrounded()) {
                scheduleLock();
            } else {
                scheduleNext();
            }
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (gameStatus.value === 'idle' || gameStatus.value === 'gameover') {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                startGame();
            }
            return;
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            togglePause();
            return;
        }

        if (gameStatus.value !== 'playing') return;

        switch (e.key) {
            case 'ArrowLeft':
            case 'a':
            case 'A':
                e.preventDefault();
                moveLeft();
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                e.preventDefault();
                moveRight();
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                e.preventDefault();
                softDrop();
                break;
            case 'ArrowUp':
            case 'w':
            case 'W':
            case 'x':
            case 'X':
                e.preventDefault();
                rotate(1);
                break;
            case 'z':
            case 'Z':
                e.preventDefault();
                rotate(-1);
                break;
            case ' ':
                e.preventDefault();
                hardDrop();
                break;
            case 'c':
            case 'C':
            case 'Shift':
                e.preventDefault();
                holdCurrentPiece();
                break;
        }
    }

    onUnmounted(() => {
        clearGameLoop();
        clearLockTimer();
    });

    return {
        board,
        currentPiece,
        currentPos,
        currentColor,
        currentType,
        nextPieces,
        holdShape,
        holdColor,
        canHold,
        pieceSerial,
        score,
        highScore,
        lines,
        level,
        cellsFilled,
        gameStatus,
        ghostY: getGhostY,
        handleKeydown,
        startGame,
        togglePause,
        moveLeft,
        moveRight,
        softDrop,
        hardDrop,
        rotate,
        holdCurrentPiece,
        COLS,
        ROWS,
    };
}
