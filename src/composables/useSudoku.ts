import { computed, ref, onUnmounted } from 'vue';

const CELL_SIZE = 54;
const PADDING = 20;
const CANVAS_SIZE = PADDING * 2 + CELL_SIZE * 9;
const MAX_MISTAKES = 3;

const DIFFICULTY_RANGES: Record<Difficulty, [number, number]> = {
    easy: [42, 46],
    medium: [34, 38],
    hard: [28, 32],
};

type Difficulty = 'easy' | 'medium' | 'hard';
type GameStatus = 'idle' | 'playing' | 'won' | 'lost';
type CellPosition = { row: number; col: number };

function shuffleArray<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function cloneGrid(grid: number[][]): number[][] {
    return grid.map(r => [...r]);
}

function createEmptyGrid(): number[][] {
    return Array.from({ length: 9 }, () => Array(9).fill(0));
}

function createEmptyNotes(): number[][][] {
    return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => []));
}

function isValid(grid: number[][], row: number, col: number, num: number): boolean {
    for (let i = 0; i < 9; i++) {
        if (grid[row][i] === num) return false;
        if (grid[i][col] === num) return false;
    }

    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    for (let r = boxRow; r < boxRow + 3; r++) {
        for (let c = boxCol; c < boxCol + 3; c++) {
            if (grid[r][c] === num) return false;
        }
    }
    return true;
}

function getCandidates(grid: number[][], row: number, col: number): number[] {
    if (grid[row][col] !== 0) return [];
    const candidates: number[] = [];
    for (let num = 1; num <= 9; num++) {
        if (isValid(grid, row, col, num)) candidates.push(num);
    }
    return candidates;
}

function findBestEmptyCell(grid: number[][]): (CellPosition & { candidates: number[] }) | null {
    let best: (CellPosition & { candidates: number[] }) | null = null;

    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            if (grid[row][col] !== 0) continue;

            const candidates = getCandidates(grid, row, col);
            if (candidates.length === 0) return { row, col, candidates };
            if (!best || candidates.length < best.candidates.length) {
                best = { row, col, candidates };
            }
        }
    }

    return best;
}

function solve(grid: number[][]): boolean {
    const cell = findBestEmptyCell(grid);
    if (!cell) return true;
    if (cell.candidates.length === 0) return false;

    for (const num of shuffleArray(cell.candidates)) {
        grid[cell.row][cell.col] = num;
        if (solve(grid)) return true;
        grid[cell.row][cell.col] = 0;
    }
    return false;
}

function generateSolvedGrid(): number[][] {
    const grid = createEmptyGrid();
    solve(grid);
    return grid;
}

function countSolutions(grid: number[][], limit: number = 2): number {
    let count = 0;

    function dfs(g: number[][]): boolean {
        const cell = findBestEmptyCell(g);
        if (!cell) {
            count++;
            return count >= limit;
        }
        if (cell.candidates.length === 0) return false;

        for (const num of cell.candidates) {
            g[cell.row][cell.col] = num;
            if (dfs(g)) return true;
            g[cell.row][cell.col] = 0;
        }
        return false;
    }

    dfs(cloneGrid(grid));
    return count;
}

function removeCells(grid: number[][], clues: number): number[][] {
    const puzzle = cloneGrid(grid);
    const pairs: [number, number][][] = [];

    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            const mirrorR = 8 - r;
            const mirrorC = 8 - c;
            if (r > mirrorR || (r === mirrorR && c > mirrorC)) continue;
            pairs.push(
                r === mirrorR && c === mirrorC
                    ? [[r, c]]
                    : [
                          [r, c],
                          [mirrorR, mirrorC],
                      ],
            );
        }
    }

    let removed = 0;
    const toRemove = 81 - clues;
    for (const pair of shuffleArray(pairs)) {
        if (removed >= toRemove) break;

        const removable = pair.filter(([r, c]) => puzzle[r][c] !== 0);
        if (removable.length === 0 || removed + removable.length > toRemove) continue;

        const backups = removable.map(([r, c]) => [r, c, puzzle[r][c]] as [number, number, number]);
        for (const [r, c] of removable) puzzle[r][c] = 0;

        if (countSolutions(puzzle) === 1) {
            removed += removable.length;
        } else {
            for (const [r, c, value] of backups) puzzle[r][c] = value;
        }
    }

    return puzzle;
}

function isSameUnit(a: CellPosition, b: CellPosition): boolean {
    return (
        a.row === b.row ||
        a.col === b.col ||
        (Math.floor(a.row / 3) === Math.floor(b.row / 3) && Math.floor(a.col / 3) === Math.floor(b.col / 3))
    );
}

function hasPeerDuplicate(grid: number[][], row: number, col: number): boolean {
    const value = grid[row][col];
    if (value === 0) return false;

    for (let i = 0; i < 9; i++) {
        if (i !== col && grid[row][i] === value) return true;
        if (i !== row && grid[i][col] === value) return true;
    }

    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    for (let r = boxRow; r < boxRow + 3; r++) {
        for (let c = boxCol; c < boxCol + 3; c++) {
            if ((r !== row || c !== col) && grid[r][c] === value) return true;
        }
    }

    return false;
}

export function useSudoku() {
    const selectedCell = ref<CellPosition | null>(null);
    const initialGrid = ref<number[][]>(createEmptyGrid());
    const solution = ref<number[][]>(createEmptyGrid());
    const playerGrid = ref<number[][]>(createEmptyGrid());
    const notes = ref<number[][][]>(createEmptyNotes());
    const notesMode = ref(false);
    const gameStatus = ref<GameStatus>('idle');
    const mistakes = ref(0);
    const difficulty = ref<Difficulty>('easy');

    const timerSeconds = ref(0);
    let timerInterval: ReturnType<typeof setInterval> | null = null;

    const remainingCells = computed(() => {
        let count = 0;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (playerGrid.value[r][c] !== solution.value[r][c]) count++;
            }
        }
        return count;
    });

    function startGame(diff: Difficulty) {
        difficulty.value = diff;
        const range = DIFFICULTY_RANGES[diff];
        const clues = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];

        const solved = generateSolvedGrid();
        solution.value = cloneGrid(solved);
        const puzzle = removeCells(solved, clues);
        initialGrid.value = cloneGrid(puzzle);
        playerGrid.value = cloneGrid(puzzle);
        notes.value = createEmptyNotes();
        selectedCell.value = null;
        notesMode.value = false;
        mistakes.value = 0;
        gameStatus.value = 'playing';

        stopTimer();
        timerSeconds.value = 0;
        startTimer();
    }

    function startTimer() {
        if (timerInterval !== null) return;
        timerInterval = setInterval(() => {
            timerSeconds.value++;
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval !== null) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function getTime(): string {
        const m = Math.floor(timerSeconds.value / 60);
        const s = timerSeconds.value % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function handleClick(mx: number, my: number): CellPosition | null {
        if (gameStatus.value !== 'playing') return null;

        const col = Math.floor((mx - PADDING) / CELL_SIZE);
        const row = Math.floor((my - PADDING) / CELL_SIZE);

        if (row < 0 || row >= 9 || col < 0 || col >= 9) return null;

        const x = PADDING + col * CELL_SIZE;
        const y = PADDING + row * CELL_SIZE;
        if (mx < x || mx > x + CELL_SIZE || my < y || my > y + CELL_SIZE) return null;

        selectedCell.value = { row, col };
        return { row, col };
    }

    function setCellNumber(num: number) {
        if (gameStatus.value !== 'playing') return;
        if (!selectedCell.value) return;

        const { row, col } = selectedCell.value;
        if (initialGrid.value[row][col] !== 0) return;

        if (playerGrid.value[row][col] === num) {
            playerGrid.value[row][col] = 0;
            return;
        }

        playerGrid.value[row][col] = num;
        notes.value[row][col] = [];

        if (num === solution.value[row][col]) {
            clearRelatedNotes(row, col, num);
            checkCompletion();
        } else {
            mistakes.value++;
            if (mistakes.value >= MAX_MISTAKES) {
                gameStatus.value = 'lost';
                stopTimer();
            }
        }
    }

    function toggleNote(num: number) {
        if (gameStatus.value !== 'playing') return;
        if (!selectedCell.value) return;

        const { row, col } = selectedCell.value;
        if (initialGrid.value[row][col] !== 0) return;
        if (playerGrid.value[row][col] !== 0) return;
        if (!isCandidateAllowed(row, col, num)) return;

        const cellNotes = notes.value[row][col];
        const idx = cellNotes.indexOf(num);
        if (idx >= 0) {
            cellNotes.splice(idx, 1);
        } else {
            cellNotes.push(num);
            cellNotes.sort();
        }
    }

    function toggleNotesMode() {
        notesMode.value = !notesMode.value;
    }

    function eraseCell() {
        if (gameStatus.value !== 'playing') return;
        if (!selectedCell.value) return;

        const { row, col } = selectedCell.value;
        if (initialGrid.value[row][col] !== 0) return;

        playerGrid.value[row][col] = 0;
        notes.value[row][col] = [];
    }

    function handleKeydown(e: KeyboardEvent) {
        if (gameStatus.value !== 'playing') return;

        const key = e.key;
        if (key >= '1' && key <= '9') {
            e.preventDefault();
            const num = parseInt(key);
            if (notesMode.value) {
                toggleNote(num);
            } else {
                setCellNumber(num);
            }
            return;
        }

        if (key === 'n' || key === 'N') {
            e.preventDefault();
            toggleNotesMode();
            return;
        }

        if (key === 'Delete' || key === 'Backspace' || key === '0') {
            e.preventDefault();
            eraseCell();
            return;
        }

        if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
            e.preventDefault();
            if (!selectedCell.value) {
                selectedCell.value = { row: 0, col: 0 };
                return;
            }

            let { row, col } = selectedCell.value;
            if (key === 'ArrowUp') row = row > 0 ? row - 1 : 8;
            if (key === 'ArrowDown') row = row < 8 ? row + 1 : 0;
            if (key === 'ArrowLeft') col = col > 0 ? col - 1 : 8;
            if (key === 'ArrowRight') col = col < 8 ? col + 1 : 0;
            selectedCell.value = { row, col };
            return;
        }

        if (key === 'h' || key === 'H') {
            e.preventDefault();
            hintCell();
        }
    }

    function checkCompletion() {
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (playerGrid.value[r][c] !== solution.value[r][c]) return;
            }
        }
        stopTimer();
        gameStatus.value = 'won';
    }

    function hintCell() {
        if (gameStatus.value !== 'playing') return;

        const target = findHintTarget();
        if (!target) return;

        selectedCell.value = target;
        playerGrid.value[target.row][target.col] = solution.value[target.row][target.col];
        notes.value[target.row][target.col] = [];
        clearRelatedNotes(target.row, target.col, solution.value[target.row][target.col]);
        checkCompletion();
    }

    function isCandidateAllowed(row: number, col: number, num: number): boolean {
        const current = playerGrid.value[row][col];
        playerGrid.value[row][col] = 0;
        const allowed = isValid(playerGrid.value, row, col, num);
        playerGrid.value[row][col] = current;
        return allowed;
    }

    function clearRelatedNotes(row: number, col: number, num: number) {
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if ((r === row && c === col) || !isSameUnit({ row, col }, { row: r, col: c })) continue;
                const idx = notes.value[r][c].indexOf(num);
                if (idx >= 0) notes.value[r][c].splice(idx, 1);
            }
        }
    }

    function findHintTarget(): CellPosition | null {
        if (selectedCell.value) {
            const { row, col } = selectedCell.value;
            if (initialGrid.value[row][col] === 0 && playerGrid.value[row][col] !== solution.value[row][col]) {
                return { row, col };
            }
        }

        let best: (CellPosition & { noteCount: number }) | null = null;
        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                if (initialGrid.value[row][col] !== 0 || playerGrid.value[row][col] === solution.value[row][col])
                    continue;
                const noteCount = notes.value[row][col].length || 9;
                if (!best || noteCount < best.noteCount) best = { row, col, noteCount };
            }
        }

        return best ? { row: best.row, col: best.col } : null;
    }

    function isCellIncorrect(row: number, col: number): boolean {
        const value = playerGrid.value[row][col];
        return initialGrid.value[row][col] === 0 && value !== 0 && value !== solution.value[row][col];
    }

    function isCellConflicted(row: number, col: number): boolean {
        return playerGrid.value[row][col] !== 0 && hasPeerDuplicate(playerGrid.value, row, col);
    }

    function getWidth(): number {
        return CANVAS_SIZE;
    }

    function getHeight(): number {
        return CANVAS_SIZE;
    }

    function draw(ctx: CanvasRenderingContext2D) {
        const w = CANVAS_SIZE;
        const h = CANVAS_SIZE;

        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, w, h);

        if (selectedCell.value) {
            const { row, col } = selectedCell.value;
            const boxRow = Math.floor(row / 3) * 3;
            const boxCol = Math.floor(col / 3) * 3;

            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.fillRect(PADDING, PADDING + row * CELL_SIZE, 9 * CELL_SIZE, CELL_SIZE);
            ctx.fillRect(PADDING + col * CELL_SIZE, PADDING, CELL_SIZE, 9 * CELL_SIZE);
            ctx.fillRect(PADDING + boxCol * CELL_SIZE, PADDING + boxRow * CELL_SIZE, 3 * CELL_SIZE, 3 * CELL_SIZE);

            const num = playerGrid.value[row][col] || initialGrid.value[row][col];
            if (num !== 0) {
                ctx.fillStyle = 'rgba(100, 180, 255, 0.12)';
                for (let r = 0; r < 9; r++) {
                    for (let c = 0; c < 9; c++) {
                        if (
                            (initialGrid.value[r][c] === num || playerGrid.value[r][c] === num) &&
                            !(r === row && c === col)
                        ) {
                            ctx.fillRect(PADDING + c * CELL_SIZE, PADDING + r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                        }
                    }
                }
            }

            ctx.fillStyle = 'rgba(100, 180, 255, 0.3)';
            ctx.fillRect(PADDING + col * CELL_SIZE, PADDING + row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }

        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (!isCellIncorrect(r, c) && !isCellConflicted(r, c)) continue;
                ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
                ctx.fillRect(PADDING + c * CELL_SIZE, PADDING + r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            }
        }

        for (let r = 0; r <= 9; r++) {
            const y = PADDING + r * CELL_SIZE;
            ctx.beginPath();
            ctx.moveTo(PADDING, y);
            ctx.lineTo(PADDING + 9 * CELL_SIZE, y);
            ctx.strokeStyle = r % 3 === 0 ? '#888' : '#444';
            ctx.lineWidth = r % 3 === 0 ? 2 : 1;
            ctx.stroke();
        }

        for (let c = 0; c <= 9; c++) {
            const x = PADDING + c * CELL_SIZE;
            ctx.beginPath();
            ctx.moveTo(x, PADDING);
            ctx.lineTo(x, PADDING + 9 * CELL_SIZE);
            ctx.strokeStyle = c % 3 === 0 ? '#888' : '#444';
            ctx.lineWidth = c % 3 === 0 ? 2 : 1;
            ctx.stroke();
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const x = PADDING + c * CELL_SIZE + CELL_SIZE / 2;
                const y = PADDING + r * CELL_SIZE + CELL_SIZE / 2;

                if (initialGrid.value[r][c] !== 0) {
                    ctx.fillStyle = '#e0e0e0';
                    ctx.font = 'bold 22px sans-serif';
                    ctx.fillText(String(initialGrid.value[r][c]), x, y);
                } else if (playerGrid.value[r][c] !== 0) {
                    ctx.fillStyle = isCellIncorrect(r, c) || isCellConflicted(r, c) ? '#f87171' : '#64b5f6';
                    ctx.font = 'bold 22px sans-serif';
                    ctx.fillText(String(playerGrid.value[r][c]), x, y);
                } else if (notes.value[r][c].length > 0) {
                    ctx.fillStyle = '#888';
                    ctx.font = '12px sans-serif';
                    for (const n of notes.value[r][c]) {
                        const nx = x + (((n - 1) % 3) - 1) * 8;
                        const ny = y + (Math.floor((n - 1) / 3) - 1) * 8;
                        ctx.fillText(String(n), nx, ny);
                    }
                }
            }
        }

        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#888';
        ctx.fillText(`错误: ${mistakes.value}/${MAX_MISTAKES}`, w - 10, 4);

        ctx.textAlign = 'left';
        ctx.fillText(difficulty.value === 'easy' ? '简单' : difficulty.value === 'medium' ? '中等' : '困难', 10, 4);

        ctx.textAlign = 'center';
        ctx.fillText(getTime(), w / 2, 4);

        if (gameStatus.value === 'idle') {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 28px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('数独', w / 2, h / 2 - 30);
            ctx.font = '14px sans-serif';
            ctx.fillStyle = '#aaa';
            ctx.fillText('选择难度开始游戏', w / 2, h / 2 + 10);
        }

        if (gameStatus.value === 'won') {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 32px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('恭喜通关！', w / 2, h / 2 - 20);
            ctx.fillStyle = '#fff';
            ctx.font = '16px sans-serif';
            ctx.fillText(`用时: ${getTime()}`, w / 2, h / 2 + 30);
        }

        if (gameStatus.value === 'lost') {
            ctx.fillStyle = 'rgba(0,0,0,0.56)';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#f87171';
            ctx.font = 'bold 30px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('挑战失败', w / 2, h / 2 - 24);
            ctx.fillStyle = '#fff';
            ctx.font = '15px sans-serif';
            ctx.fillText('错误次数已用完', w / 2, h / 2 + 24);
        }
    }

    onUnmounted(() => {
        stopTimer();
    });

    return {
        selectedCell,
        initialGrid,
        solution,
        playerGrid,
        notes,
        notesMode,
        gameStatus,
        mistakes,
        difficulty,
        remainingCells,
        maxMistakes: MAX_MISTAKES,
        startGame,
        handleClick,
        setCellNumber,
        toggleNote,
        toggleNotesMode,
        eraseCell,
        handleKeydown,
        checkCompletion,
        hintCell,
        getTime,
        draw,
        getWidth,
        getHeight,
    };
}
