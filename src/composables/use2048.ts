import { computed, ref } from 'vue';

export type MoveDirection = 'up' | 'down' | 'left' | 'right';
export type Game2048Status = 'idle' | 'playing' | 'won' | 'gameover';

export interface Tile2048 {
    id: number;
    value: number;
    row: number;
    col: number;
}

interface GameSnapshot {
    tiles: Tile2048[];
    score: number;
    moves: number;
    status: Game2048Status;
    hasWon: boolean;
}

const SIZE = 4;
const WIN_TILE = 2048;
const HIGH_SCORE_STORAGE_KEY = 'gamehall-2048-high-score';

const directionKeys: Record<string, MoveDirection> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up',
    W: 'up',
    s: 'down',
    S: 'down',
    a: 'left',
    A: 'left',
    d: 'right',
    D: 'right',
};

function cloneTiles(tiles: Tile2048[]) {
    return tiles.map(tile => ({ ...tile }));
}

function getInitialHighScore() {
    if (typeof localStorage === 'undefined') return 0;
    return Number(localStorage.getItem(HIGH_SCORE_STORAGE_KEY) || 0);
}

export function use2048() {
    const tiles = ref<Tile2048[]>([]);
    const score = ref(0);
    const highScore = ref(getInitialHighScore());
    const moves = ref(0);
    const gameStatus = ref<Game2048Status>('idle');
    const lastMove = ref<MoveDirection | null>(null);
    const hasWon = ref(false);
    const snapshots = ref<GameSnapshot[]>([]);
    let tileId = 1;

    const board = computed(() => {
        const cells: Array<Tile2048 | null> = Array.from({ length: SIZE * SIZE }, () => null);
        tiles.value.forEach(tile => {
            cells[tile.row * SIZE + tile.col] = tile;
        });
        return cells;
    });

    const bestTile = computed(() => {
        return tiles.value.reduce((best, tile) => Math.max(best, tile.value), 0);
    });

    const emptyCells = computed(() => {
        const occupied = new Set(tiles.value.map(tile => `${tile.row},${tile.col}`));
        const cells: Array<{ row: number; col: number }> = [];

        for (let row = 0; row < SIZE; row++) {
            for (let col = 0; col < SIZE; col++) {
                if (!occupied.has(`${row},${col}`)) cells.push({ row, col });
            }
        }

        return cells;
    });

    const canUndo = computed(() => snapshots.value.length > 0 && gameStatus.value !== 'idle');
    const isBoardFull = computed(() => emptyCells.value.length === 0);
    const progress = computed(() => Math.min(100, Math.round((bestTile.value / WIN_TILE) * 100)));

    function saveHighScore() {
        if (score.value <= highScore.value) return;
        highScore.value = score.value;
        localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(highScore.value));
    }

    function saveSnapshot() {
        snapshots.value = [
            ...snapshots.value.slice(-7),
            {
                tiles: cloneTiles(tiles.value),
                score: score.value,
                moves: moves.value,
                status: gameStatus.value,
                hasWon: hasWon.value,
            },
        ];
    }

    function addRandomTile() {
        const cells = emptyCells.value;
        if (!cells.length) return;

        const cell = cells[Math.floor(Math.random() * cells.length)];
        tiles.value = [
            ...tiles.value,
            {
                id: tileId++,
                value: Math.random() < 0.9 ? 2 : 4,
                row: cell.row,
                col: cell.col,
            },
        ];
    }

    function hasAvailableMove() {
        if (emptyCells.value.length > 0) return true;

        for (let row = 0; row < SIZE; row++) {
            for (let col = 0; col < SIZE; col++) {
                const tile = board.value[row * SIZE + col];
                const right = col < SIZE - 1 ? board.value[row * SIZE + col + 1] : null;
                const down = row < SIZE - 1 ? board.value[(row + 1) * SIZE + col] : null;
                if (tile && (tile.value === right?.value || tile.value === down?.value)) return true;
            }
        }

        return false;
    }

    function startGame() {
        tileId = 1;
        tiles.value = [];
        score.value = 0;
        moves.value = 0;
        lastMove.value = null;
        hasWon.value = false;
        snapshots.value = [];
        gameStatus.value = 'playing';
        addRandomTile();
        addRandomTile();
    }

    function continueGame() {
        if (gameStatus.value === 'won') {
            gameStatus.value = 'playing';
        }
    }

    function buildLine(index: number, direction: MoveDirection) {
        const line: Tile2048[] = [];

        for (let offset = 0; offset < SIZE; offset++) {
            const row = direction === 'left' || direction === 'right' ? index : offset;
            const col = direction === 'left' || direction === 'right' ? offset : index;
            const tile = board.value[row * SIZE + col];
            if (tile) line.push(tile);
        }

        if (direction === 'right' || direction === 'down') line.reverse();
        return line;
    }

    function targetPosition(lineIndex: number, offset: number, direction: MoveDirection) {
        if (direction === 'left') return { row: lineIndex, col: offset };
        if (direction === 'right') return { row: lineIndex, col: SIZE - 1 - offset };
        if (direction === 'up') return { row: offset, col: lineIndex };
        return { row: SIZE - 1 - offset, col: lineIndex };
    }

    function move(direction: MoveDirection) {
        if (gameStatus.value !== 'playing') return false;

        saveSnapshot();
        let changed = false;
        let gained = 0;
        const nextTiles: Tile2048[] = [];

        for (let lineIndex = 0; lineIndex < SIZE; lineIndex++) {
            const line = buildLine(lineIndex, direction);
            let offset = 0;

            for (let index = 0; index < line.length; index++) {
                const tile = { ...line[index] };
                const nextTile = line[index + 1];
                const target = targetPosition(lineIndex, offset, direction);

                if (nextTile && nextTile.value === tile.value) {
                    tile.value *= 2;
                    gained += tile.value;
                    index++;
                }

                if (tile.row !== target.row || tile.col !== target.col || tile.value !== line[index]?.value) {
                    changed = true;
                }

                tile.row = target.row;
                tile.col = target.col;
                nextTiles.push(tile);
                offset++;
            }
        }

        if (!changed) {
            snapshots.value = snapshots.value.slice(0, -1);
            return false;
        }

        tiles.value = nextTiles;
        score.value += gained;
        moves.value++;
        lastMove.value = direction;
        saveHighScore();
        addRandomTile();

        if (!hasWon.value && bestTile.value >= WIN_TILE) {
            hasWon.value = true;
            gameStatus.value = 'won';
        } else if (!hasAvailableMove()) {
            gameStatus.value = 'gameover';
        }

        return true;
    }

    function undo() {
        const snapshot = snapshots.value[snapshots.value.length - 1];
        if (!snapshot) return;

        tiles.value = cloneTiles(snapshot.tiles);
        score.value = snapshot.score;
        moves.value = snapshot.moves;
        gameStatus.value = snapshot.status === 'won' ? 'playing' : snapshot.status;
        hasWon.value = snapshot.hasWon;
        snapshots.value = snapshots.value.slice(0, -1);
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === ' ' || event.key === 'Enter') {
            if (gameStatus.value === 'idle' || gameStatus.value === 'gameover') {
                event.preventDefault();
                startGame();
            } else if (gameStatus.value === 'won') {
                event.preventDefault();
                continueGame();
            }
            return;
        }

        if ((event.key === 'Backspace' || event.key === 'u' || event.key === 'U') && canUndo.value) {
            event.preventDefault();
            undo();
            return;
        }

        const direction = directionKeys[event.key];
        if (direction) {
            event.preventDefault();
            move(direction);
        }
    }

    return {
        SIZE,
        WIN_TILE,
        tiles,
        board,
        score,
        highScore,
        moves,
        gameStatus,
        lastMove,
        bestTile,
        canUndo,
        isBoardFull,
        progress,
        startGame,
        continueGame,
        move,
        undo,
        handleKeydown,
    };
}
