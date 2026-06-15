import { computed, ref } from 'vue';

const TILE_SIZE = 48;
const MAX_HISTORY = 1000;

const LEVEL_STRINGS = [
    [
        '#############',
        '#@    #     #',
        '# ### # ### #',
        '# $      .  #',
        '# ### ## #  #',
        '#   $    .  #',
        '#  # ## ### #',
        '# $      .  #',
        '#############',
    ],
    [
        '#############',
        '#@   #      #',
        '# $$     .. #',
        '#    #      #',
        '### ### ## ##',
        '#     $  .  #',
        '#  ##   ##  #',
        '#  .  $     #',
        '#############',
    ],
    [
        '#############',
        '#@          #',
        '#  ### ###  #',
        '# $$    .. #',
        '#  # $ #   #',
        '#  #   # . #',
        '#  ###   # #',
        '#    $  .  #',
        '#############',
    ],
    [
        '#############',
        '#@   #      #',
        '# $$ #  ..  #',
        '#    #      #',
        '# ## ### ## #',
        '# $     .   #',
        '#   ## ##   #',
        '# $   $ ..  #',
        '#############',
    ],
    [
        '#############',
        '#@     #    #',
        '# ###  # ## #',
        '# $$     .. #',
        '#   # ##    #',
        '### #  $ .###',
        '#   ## #    #',
        '# $    $ .. #',
        '#############',
    ],
    [
        '##############',
        '#@     #     #',
        '# $$   # ..  #',
        '#  #   #     #',
        '#  ### ### ###',
        '# $     .    #',
        '#   ## ## #  #',
        '#  $  $  ..  #',
        '#        #   #',
        '##############',
    ],
    [
        '##############',
        '#@    #      #',
        '# $$  #  ..  #',
        '#   #        #',
        '### # #### # #',
        '# $     .  # #',
        '#   ### ##   #',
        '# $   $  ..  #',
        '#     #      #',
        '##############',
    ],
    [
        '##############',
        '#@     #     #',
        '# $$$    ... #',
        '#   ## #     #',
        '# #    ### # #',
        '# $      . # #',
        '#   ### ##   #',
        '# $   $  ..  #',
        '#      #     #',
        '##############',
    ],
    [
        '###############',
        '#@      #     #',
        '# $$$   # ... #',
        '#   #   #     #',
        '### # ### ## ##',
        '# $      .    #',
        '#   ## # ###  #',
        '# $  $    ..  #',
        '#    #        #',
        '###############',
    ],
    [
        '###############',
        '#@     #      #',
        '# $$$     ... #',
        '#  #  ###     #',
        '#  #      # # #',
        '## ### ## # # #',
        '# $      .    #',
        '#   $ $  ..   #',
        '#      #      #',
        '###############',
    ],
    [
        '################',
        '#@      #      #',
        '# $$$   #  ... #',
        '#   #      #   #',
        '### # #### # ###',
        '# $     .      #',
        '#   ## ## ###  #',
        '# $   $   ..   #',
        '#   #     #    #',
        '################',
    ],
    [
        '################',
        '#@      #      #',
        '# $$$$     ....#',
        '#   ## ###     #',
        '# #      # # # #',
        '# # #### # # # #',
        '# $      .     #',
        '#   $ $   ..   #',
        '# $    .#      #',
        '################',
    ],
];

enum Tile {
    Floor = 0,
    Wall = 1,
    Player = 2,
    Box = 3,
    Target = 4,
    BoxOnTarget = 5,
    PlayerOnTarget = 6,
}

type GameStatus = 'idle' | 'playing' | 'won';
type DirectionName = 'up' | 'down' | 'left' | 'right';

interface Position {
    row: number;
    col: number;
}

interface Level {
    grid: Tile[][];
    rows: number;
    cols: number;
    boxes: number;
    targets: number;
}

interface HistoryEntry {
    grid: Tile[][];
    moves: number;
    pushes: number;
}

const DIRECTIONS: Record<DirectionName, Position> = {
    up: { row: -1, col: 0 },
    down: { row: 1, col: 0 },
    left: { row: 0, col: -1 },
    right: { row: 0, col: 1 },
};

function parseLevel(rows: string[], index: number): Level {
    const maxCols = Math.max(...rows.map(row => row.length));
    const grid: Tile[][] = [];
    let boxes = 0;
    let targets = 0;
    let players = 0;

    for (const row of rows) {
        const gridRow: Tile[] = [];

        for (let col = 0; col < maxCols; col++) {
            const char = col < row.length ? row[col] : ' ';

            switch (char) {
                case '#':
                    gridRow.push(Tile.Wall);
                    break;
                case '@':
                    players++;
                    gridRow.push(Tile.Player);
                    break;
                case '$':
                    boxes++;
                    gridRow.push(Tile.Box);
                    break;
                case '.':
                    targets++;
                    gridRow.push(Tile.Target);
                    break;
                case '*':
                    boxes++;
                    targets++;
                    gridRow.push(Tile.BoxOnTarget);
                    break;
                case '+':
                    players++;
                    targets++;
                    gridRow.push(Tile.PlayerOnTarget);
                    break;
                default:
                    gridRow.push(Tile.Floor);
                    break;
            }
        }

        grid.push(gridRow);
    }

    if (players !== 1) {
        console.warn(`Sokoban level ${index + 1} has ${players} players.`);
    }

    if (boxes !== targets) {
        console.warn(`Sokoban level ${index + 1} has ${boxes} boxes and ${targets} targets.`);
    }

    return {
        grid,
        rows: grid.length,
        cols: maxCols,
        boxes,
        targets,
    };
}

function cloneGrid(grid: Tile[][]): Tile[][] {
    return grid.map(row => [...row]);
}

function isBox(tile: Tile): boolean {
    return tile === Tile.Box || tile === Tile.BoxOnTarget;
}

function isTarget(tile: Tile): boolean {
    return tile === Tile.Target || tile === Tile.BoxOnTarget || tile === Tile.PlayerOnTarget;
}

function isWalkable(tile: Tile): boolean {
    return tile === Tile.Floor || tile === Tile.Target;
}

function samePosition(a: Position, b: Position): boolean {
    return a.row === b.row && a.col === b.col;
}

export function useSokoban() {
    const levels = LEVEL_STRINGS.map(parseLevel);
    const currentLevelIndex = ref(0);
    const grid = ref<Tile[][]>(cloneGrid(levels[0].grid));
    const gameStatus = ref<GameStatus>('idle');
    const moves = ref(0);
    const pushes = ref(0);
    const history = ref<HistoryEntry[]>([]);
    const lastPushedBox = ref<Position | null>(null);

    const currentLevel = computed(() => levels[currentLevelIndex.value]);
    const width = computed(() => currentLevel.value.cols * TILE_SIZE);
    const height = computed(() => currentLevel.value.rows * TILE_SIZE);
    const canUndo = computed(() => history.value.length > 0 && gameStatus.value !== 'idle');
    const boxesOnTargets = computed(() => countTiles(Tile.BoxOnTarget));
    const boxesLeft = computed(() => countTiles(Tile.Box));
    const isSolved = computed(() => currentLevel.value.boxes > 0 && boxesLeft.value === 0);
    const deadlockedBoxes = computed(() => findDeadlockedBoxes(grid.value));

    function countTiles(tile: Tile): number {
        let count = 0;

        for (const row of grid.value) {
            for (const cell of row) {
                if (cell === tile) count++;
            }
        }

        return count;
    }

    function getCell(board: Tile[][], row: number, col: number): Tile {
        if (row < 0 || row >= board.length || col < 0 || col >= board[row].length) {
            return Tile.Wall;
        }

        return board[row][col];
    }

    function findPlayer(board: Tile[][]): Position | null {
        for (let row = 0; row < board.length; row++) {
            for (let col = 0; col < board[row].length; col++) {
                if (board[row][col] === Tile.Player || board[row][col] === Tile.PlayerOnTarget) {
                    return { row, col };
                }
            }
        }

        return null;
    }

    function leavePlayerTile(tile: Tile): Tile {
        return tile === Tile.PlayerOnTarget ? Tile.Target : Tile.Floor;
    }

    function placePlayer(tile: Tile): Tile {
        return tile === Tile.Target ? Tile.PlayerOnTarget : Tile.Player;
    }

    function placeBox(tile: Tile): Tile {
        return tile === Tile.Target ? Tile.BoxOnTarget : Tile.Box;
    }

    function leaveBoxTile(tile: Tile): Tile {
        return tile === Tile.BoxOnTarget ? Tile.Target : Tile.Floor;
    }

    function saveHistory() {
        history.value.push({
            grid: cloneGrid(grid.value),
            moves: moves.value,
            pushes: pushes.value,
        });

        if (history.value.length > MAX_HISTORY) {
            history.value.shift();
        }
    }

    function setLevel(levelIndex: number, shouldStart = gameStatus.value === 'playing') {
        currentLevelIndex.value = Math.max(0, Math.min(levelIndex, levels.length - 1));
        grid.value = cloneGrid(currentLevel.value.grid);
        moves.value = 0;
        pushes.value = 0;
        history.value = [];
        lastPushedBox.value = null;
        gameStatus.value = shouldStart ? 'playing' : 'idle';
    }

    function startGame(levelIndex = currentLevelIndex.value) {
        setLevel(levelIndex, true);
    }

    function resetLevel() {
        setLevel(currentLevelIndex.value, true);
    }

    function move(direction: DirectionName): boolean {
        const delta = DIRECTIONS[direction];
        return movePlayer(delta.row, delta.col);
    }

    function movePlayer(dRow: number, dCol: number): boolean {
        if (gameStatus.value !== 'playing') return false;

        const player = findPlayer(grid.value);
        if (!player) return false;

        const next: Position = { row: player.row + dRow, col: player.col + dCol };
        const nextTile = getCell(grid.value, next.row, next.col);

        if (isWalkable(nextTile)) {
            saveHistory();

            const nextGrid = cloneGrid(grid.value);
            nextGrid[player.row][player.col] = leavePlayerTile(nextGrid[player.row][player.col]);
            nextGrid[next.row][next.col] = placePlayer(nextTile);

            grid.value = nextGrid;
            moves.value++;
            lastPushedBox.value = null;
            return true;
        }

        if (!isBox(nextTile)) return false;

        const boxTarget: Position = { row: next.row + dRow, col: next.col + dCol };
        const boxTargetTile = getCell(grid.value, boxTarget.row, boxTarget.col);
        if (!isWalkable(boxTargetTile)) return false;

        saveHistory();

        const nextGrid = cloneGrid(grid.value);
        nextGrid[player.row][player.col] = leavePlayerTile(nextGrid[player.row][player.col]);
        nextGrid[next.row][next.col] = placePlayer(leaveBoxTile(nextTile));
        nextGrid[boxTarget.row][boxTarget.col] = placeBox(boxTargetTile);

        grid.value = nextGrid;
        moves.value++;
        pushes.value++;
        lastPushedBox.value = boxTarget;

        if (isSolved.value) {
            gameStatus.value = 'won';
        }

        return true;
    }

    function undo() {
        if (!canUndo.value) return;

        const entry = history.value.pop();
        if (!entry) return;

        grid.value = cloneGrid(entry.grid);
        moves.value = entry.moves;
        pushes.value = entry.pushes;
        lastPushedBox.value = null;
        gameStatus.value = 'playing';
    }

    function nextLevel() {
        const nextIndex = (currentLevelIndex.value + 1) % levels.length;
        startGame(nextIndex);
    }

    function previousLevel() {
        const nextIndex = (currentLevelIndex.value - 1 + levels.length) % levels.length;
        startGame(nextIndex);
    }

    function handleKeydown(event: KeyboardEvent) {
        const target = event.target as HTMLElement | null;
        const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
        if (isTyping) return;

        if (event.key === 'z' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            undo();
            return;
        }

        if (gameStatus.value === 'won') {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                nextLevel();
            } else if (event.key === 'u' || event.key === 'U') {
                event.preventDefault();
                undo();
            }
            return;
        }

        if (gameStatus.value === 'idle') {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                startGame();
            }
            return;
        }

        switch (event.key) {
            case 'ArrowUp':
            case 'w':
            case 'W':
                event.preventDefault();
                move('up');
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                event.preventDefault();
                move('down');
                break;
            case 'ArrowLeft':
            case 'a':
            case 'A':
                event.preventDefault();
                move('left');
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                event.preventDefault();
                move('right');
                break;
            case 'u':
            case 'U':
                event.preventDefault();
                undo();
                break;
            case 'r':
            case 'R':
                event.preventDefault();
                resetLevel();
                break;
            case 'n':
            case 'N':
                event.preventDefault();
                nextLevel();
                break;
            case 'p':
            case 'P':
                event.preventDefault();
                previousLevel();
                break;
        }
    }

    function findDeadlockedBoxes(board: Tile[][]): Position[] {
        const stuck: Position[] = [];

        for (let row = 0; row < board.length; row++) {
            for (let col = 0; col < board[row].length; col++) {
                const tile = board[row][col];
                if (!isBox(tile) || isTarget(tile)) continue;

                const up = isBlockedForDeadlock(board, row - 1, col);
                const down = isBlockedForDeadlock(board, row + 1, col);
                const left = isBlockedForDeadlock(board, row, col - 1);
                const right = isBlockedForDeadlock(board, row, col + 1);

                if ((up && left) || (up && right) || (down && left) || (down && right)) {
                    stuck.push({ row, col });
                }
            }
        }

        return stuck;
    }

    function isBlockedForDeadlock(board: Tile[][], row: number, col: number): boolean {
        const tile = getCell(board, row, col);
        return tile === Tile.Wall || isBox(tile);
    }

    function isLastPushedBox(row: number, col: number): boolean {
        return lastPushedBox.value ? samePosition(lastPushedBox.value, { row, col }) : false;
    }

    function isDeadlockedBox(row: number, col: number): boolean {
        return deadlockedBoxes.value.some(box => box.row === row && box.col === col);
    }

    function draw(ctx: CanvasRenderingContext2D) {
        const board = grid.value;
        if (board.length === 0) return;

        const canvasWidth = width.value;
        const canvasHeight = height.value;

        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.fillStyle = '#18202a';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        for (let row = 0; row < board.length; row++) {
            for (let col = 0; col < board[row].length; col++) {
                drawTile(ctx, board[row][col], row, col);
            }
        }

        ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
        ctx.fillRect(8, 8, 118, 42);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`Level ${currentLevelIndex.value + 1}`, 16, 25);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(`Moves ${moves.value}`, 16, 43);
    }

    function drawTile(ctx: CanvasRenderingContext2D, tile: Tile, row: number, col: number) {
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;
        const centerX = x + TILE_SIZE / 2;
        const centerY = y + TILE_SIZE / 2;

        if (tile !== Tile.Wall) {
            drawFloor(ctx, x, y);
        }

        if (tile === Tile.Target || tile === Tile.BoxOnTarget || tile === Tile.PlayerOnTarget) {
            drawTarget(ctx, centerX, centerY);
        }

        switch (tile) {
            case Tile.Wall:
                drawWall(ctx, x, y);
                break;
            case Tile.Player:
            case Tile.PlayerOnTarget:
                drawPlayer(ctx, centerX, centerY);
                break;
            case Tile.Box:
            case Tile.BoxOnTarget:
                drawBox(ctx, x, y, tile === Tile.BoxOnTarget, isDeadlockedBox(row, col), isLastPushedBox(row, col));
                break;
        }
    }

    function drawFloor(ctx: CanvasRenderingContext2D, x: number, y: number) {
        ctx.fillStyle = '#d6ccb2';
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = '#c1b699';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
    }

    function drawWall(ctx: CanvasRenderingContext2D, x: number, y: number) {
        const inset = 4;

        ctx.fillStyle = '#3f342b';
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = '#5d4a3c';
        ctx.fillRect(x + inset, y + inset, TILE_SIZE - inset * 2, TILE_SIZE - inset * 2);
        ctx.strokeStyle = '#2d241e';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
    }

    function drawTarget(ctx: CanvasRenderingContext2D, centerX: number, centerY: number) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.strokeStyle = '#fee2e2';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fee2e2';
        ctx.fill();
    }

    function drawPlayer(ctx: CanvasRenderingContext2D, centerX: number, centerY: number) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, 17, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
        ctx.strokeStyle = '#075985';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#e0f2fe';
        ctx.beginPath();
        ctx.arc(centerX - 5, centerY - 4, 2.4, 0, Math.PI * 2);
        ctx.arc(centerX + 5, centerY - 4, 2.4, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawBox(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        onTarget: boolean,
        isDeadlocked: boolean,
        isLastPushed: boolean,
    ) {
        const inset = 6;
        const boxSize = TILE_SIZE - inset * 2;

        ctx.fillStyle = onTarget ? '#fbbf24' : '#f59e0b';
        ctx.fillRect(x + inset, y + inset, boxSize, boxSize);
        ctx.strokeStyle = isDeadlocked ? '#ef4444' : isLastPushed ? '#fef3c7' : '#b45309';
        ctx.lineWidth = isDeadlocked || isLastPushed ? 3 : 2;
        ctx.strokeRect(x + inset, y + inset, boxSize, boxSize);

        ctx.strokeStyle = 'rgba(120, 53, 15, 0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + inset + 8, y + inset + 8);
        ctx.lineTo(x + TILE_SIZE - inset - 8, y + TILE_SIZE - inset - 8);
        ctx.moveTo(x + TILE_SIZE - inset - 8, y + inset + 8);
        ctx.lineTo(x + inset + 8, y + TILE_SIZE - inset - 8);
        ctx.stroke();
    }

    return {
        gameStatus,
        moves,
        pushes,
        currentLevelIndex,
        width,
        height,
        TILE_SIZE,
        boxesOnTargets,
        boxesLeft,
        canUndo,
        deadlockedBoxes,
        levelsCount: levels.length,
        startGame,
        resetLevel,
        setLevel,
        nextLevel,
        previousLevel,
        move,
        movePlayer,
        undo,
        handleKeydown,
        draw,
    };
}
