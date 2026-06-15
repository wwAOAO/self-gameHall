import { ref, computed, type Ref } from 'vue';
import { type Cell, type GameStatus, type Difficulty, DIFFICULTIES } from '@/types/minesweeper';

function createEmptyBoard(rows: number, cols: number): Cell[][] {
    return Array.from({ length: rows }, (_, row) =>
        Array.from({ length: cols }, (_, col) => ({
            row,
            col,
            isMine: false,
            isRevealed: false,
            isFlagged: false,
            adjacentMines: 0,
            isDetonated: false,
        })),
    );
}

function getNeighbors(row: number, col: number, rows: number, cols: number): [number, number][] {
    const neighbors: [number, number][] = [];
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr;
            const nc = col + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                neighbors.push([nr, nc]);
            }
        }
    }
    return neighbors;
}

function placeMines(
    board: Cell[][],
    rows: number,
    cols: number,
    mines: number,
    safeRow: number,
    safeCol: number,
): Cell[][] {
    const newBoard = board.map(r => r.map(c => ({ ...c })));

    const safeSet = new Set<string>();
    safeSet.add(`${safeRow},${safeCol}`);
    for (const [nr, nc] of getNeighbors(safeRow, safeCol, rows, cols)) {
        safeSet.add(`${nr},${nc}`);
    }

    const candidates: [number, number][] = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!safeSet.has(`${r},${c}`)) {
                candidates.push([r, c]);
            }
        }
    }

    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    for (let i = 0; i < Math.min(mines, candidates.length); i++) {
        const [r, c] = candidates[i];
        newBoard[r][c].isMine = true;
    }

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!newBoard[r][c].isMine) {
                let count = 0;
                for (const [nr, nc] of getNeighbors(r, c, rows, cols)) {
                    if (newBoard[nr][nc].isMine) count++;
                }
                newBoard[r][c].adjacentMines = count;
            }
        }
    }

    return newBoard;
}

function floodFill(board: Cell[][], row: number, col: number, rows: number, cols: number): Cell[][] {
    const newBoard = board.map(r => r.map(c => ({ ...c })));
    const queue: [number, number][] = [[row, col]];
    const visited = new Set<string>();
    visited.add(`${row},${col}`);

    while (queue.length > 0) {
        const [r, c] = queue.shift()!;
        const cell = newBoard[r][c];
        cell.isRevealed = true;

        if (cell.adjacentMines === 0) {
            for (const [nr, nc] of getNeighbors(r, c, rows, cols)) {
                const key = `${nr},${nc}`;
                if (!visited.has(key) && !newBoard[nr][nc].isMine && !newBoard[nr][nc].isFlagged) {
                    visited.add(key);
                    queue.push([nr, nc]);
                }
            }
        }
    }

    return newBoard;
}

export function useMinesweeper() {
    const board: Ref<Cell[][]> = ref(createEmptyBoard(9, 9));
    const gameStatus: Ref<GameStatus> = ref('idle');
    const timer: Ref<number> = ref(0);
    const flagCount: Ref<number> = ref(0);
    const difficulty: Ref<Difficulty> = ref({ ...DIFFICULTIES.beginner });
    const difficultyKey: Ref<string> = ref('beginner');

    let timerInterval: ReturnType<typeof setInterval> | null = null;
    let firstClick = true;

    const totalMines = computed(() => difficulty.value.mines);
    const rows = computed(() => difficulty.value.rows);
    const cols = computed(() => difficulty.value.cols);
    const remainingMines = computed(() => difficulty.value.mines - flagCount.value);

    function startTimer() {
        if (timerInterval) return;
        timerInterval = setInterval(() => {
            timer.value++;
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    const allDifficulties = computed(() =>
        Object.entries(DIFFICULTIES).map(([key, diff]) => ({
            key,
            ...diff,
        })),
    );

    function initGame(diffKey?: string) {
        const key = diffKey || difficultyKey.value;
        const diff = DIFFICULTIES[key];
        if (!diff) return;

        difficultyKey.value = key;
        difficulty.value = { ...diff };
        board.value = createEmptyBoard(diff.rows, diff.cols);
        gameStatus.value = 'idle';
        timer.value = 0;
        flagCount.value = 0;
        firstClick = true;
        stopTimer();
    }

    function generateNewBoard(safeRow: number, safeCol: number) {
        board.value = placeMines(
            board.value,
            difficulty.value.rows,
            difficulty.value.cols,
            difficulty.value.mines,
            safeRow,
            safeCol,
        );
    }

    function revealCell(row: number, col: number) {
        if (gameStatus.value === 'won' || gameStatus.value === 'lost') return;

        const cell = board.value[row]?.[col];
        if (!cell || cell.isRevealed || cell.isFlagged) return;

        if (firstClick) {
            generateNewBoard(row, col);
            firstClick = false;
            gameStatus.value = 'playing';
            startTimer();
        }

        if (cell.isMine) {
            const newBoard = board.value.map(r => r.map(c => ({ ...c })));
            newBoard[row][col].isRevealed = true;
            newBoard[row][col].isDetonated = true;

            for (let r = 0; r < difficulty.value.rows; r++) {
                for (let c = 0; c < difficulty.value.cols; c++) {
                    if (newBoard[r][c].isMine) {
                        newBoard[r][c].isRevealed = true;
                    }
                }
            }

            board.value = newBoard;
            gameStatus.value = 'lost';
            stopTimer();
            return;
        }

        board.value = floodFill(board.value, row, col, difficulty.value.rows, difficulty.value.cols);

        const revealed = board.value.flat().filter(c => c.isRevealed).length;
        if (revealed === difficulty.value.rows * difficulty.value.cols - difficulty.value.mines) {
            for (let r = 0; r < difficulty.value.rows; r++) {
                for (let c = 0; c < difficulty.value.cols; c++) {
                    if (board.value[r][c].isMine && !board.value[r][c].isFlagged) {
                        board.value[r][c].isFlagged = true;
                    }
                }
            }
            flagCount.value = difficulty.value.mines;
            gameStatus.value = 'won';
            stopTimer();
        }
    }

    function toggleFlag(row: number, col: number) {
        if (gameStatus.value === 'won' || gameStatus.value === 'lost') return;

        const cell = board.value[row]?.[col];
        if (!cell || cell.isRevealed) return;

        const newBoard = board.value.map(r => r.map(c => ({ ...c })));
        newBoard[row][col].isFlagged = !newBoard[row][col].isFlagged;
        board.value = newBoard;
        flagCount.value += newBoard[row][col].isFlagged ? 1 : -1;
    }

    function chordClick(row: number, col: number) {
        if (gameStatus.value === 'won' || gameStatus.value === 'lost') return;

        const cell = board.value[row]?.[col];
        if (!cell || !cell.isRevealed || cell.adjacentMines === 0) return;

        const neighbors = getNeighbors(row, col, difficulty.value.rows, difficulty.value.cols);
        const adjacentFlags = neighbors.filter(([r, c]) => board.value[r][c].isFlagged).length;

        if (adjacentFlags === cell.adjacentMines) {
            for (const [nr, nc] of neighbors) {
                if (!board.value[nr][nc].isRevealed && !board.value[nr][nc].isFlagged) {
                    revealCell(nr, nc);
                }
            }
        }
    }

    initGame('beginner');

    return {
        board,
        gameStatus,
        timer,
        flagCount,
        difficulty,
        difficultyKey,
        totalMines,
        rows,
        cols,
        remainingMines,
        allDifficulties,
        initGame,
        revealCell,
        toggleFlag,
        chordClick,
    };
}

export type MinesweeperReturn = ReturnType<typeof useMinesweeper>;
