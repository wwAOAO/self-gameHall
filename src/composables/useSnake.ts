import { ref, computed, onUnmounted } from 'vue';

export type Direction = 'up' | 'down' | 'left' | 'right';

interface Point {
    x: number;
    y: number;
}

const GRID_SIZE = 20;
const INITIAL_SPEED = 160;
const MIN_SPEED = 70;
const START_SNAKE: Point[] = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
];

const opposites: Record<Direction, Direction> = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left',
};

const directionDelta: Record<Direction, Point> = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
};

function isSamePoint(a: Point, b: Point) {
    return a.x === b.x && a.y === b.y;
}

function pointKey(point: Point) {
    return `${point.x},${point.y}`;
}

export function useSnake() {
    const snake = ref<Point[]>([...START_SNAKE]);
    const direction = ref<Direction>('right');
    const directionQueue = ref<Direction[]>([]);
    const food = ref<Point>({ x: 15, y: 10 });
    const score = ref(0);
    const highScore = ref(Number(localStorage.getItem('snake-high-score') || 0));
    const gameStatus = ref<'idle' | 'playing' | 'paused' | 'gameover'>('idle');
    const speed = ref(INITIAL_SPEED);
    const lastMove = ref<Direction>('right');

    let gameLoop: ReturnType<typeof setTimeout> | null = null;

    const snakePositions = computed(() => {
        const set = new Set<string>();
        snake.value.forEach(p => set.add(pointKey(p)));
        return set;
    });

    const level = computed(() => Math.floor(score.value / 5) + 1);
    const cellsFilled = computed(() => snake.value.length / (GRID_SIZE * GRID_SIZE));

    function clearLoop() {
        if (gameLoop) {
            clearTimeout(gameLoop);
            gameLoop = null;
        }
    }

    function getSpeed(nextScore = score.value) {
        const levelBoost = Math.floor(nextScore / 5) * 10;
        const steadyBoost = nextScore * 2;
        return Math.max(MIN_SPEED, INITIAL_SPEED - levelBoost - steadyBoost);
    }

    function spawnFood() {
        const freeCells: Point[] = [];

        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const point = { x, y };
                if (!snakePositions.value.has(pointKey(point))) {
                    freeCells.push(point);
                }
            }
        }

        if (!freeCells.length) {
            endGame();
            return;
        }

        food.value = freeCells[Math.floor(Math.random() * freeCells.length)];
    }

    function tick() {
        const nextQueuedDirection = directionQueue.value.shift();
        if (nextQueuedDirection) {
            direction.value = nextQueuedDirection;
        }

        lastMove.value = direction.value;
        const head = snake.value[0];
        const delta = directionDelta[direction.value];
        const nextHead = {
            x: head.x + delta.x,
            y: head.y + delta.y,
        };

        if (nextHead.x < 0 || nextHead.x >= GRID_SIZE || nextHead.y < 0 || nextHead.y >= GRID_SIZE) {
            endGame();
            return;
        }

        const ateFood = isSamePoint(nextHead, food.value);
        const bodyToCheck = ateFood ? snake.value : snake.value.slice(0, -1);

        if (bodyToCheck.some(segment => isSamePoint(segment, nextHead))) {
            endGame();
            return;
        }

        const nextSnake = [nextHead, ...snake.value];

        if (ateFood) {
            score.value++;
            if (score.value > highScore.value) {
                highScore.value = score.value;
                localStorage.setItem('snake-high-score', String(highScore.value));
            }
            snake.value = nextSnake;
            speed.value = getSpeed();
            spawnFood();
        } else {
            nextSnake.pop();
            snake.value = nextSnake;
        }

        scheduleNext();
    }

    function scheduleNext() {
        clearLoop();
        if (gameStatus.value !== 'playing') return;
        gameLoop = setTimeout(tick, speed.value);
    }

    function startGame() {
        clearLoop();
        snake.value = START_SNAKE.map(segment => ({ ...segment }));
        direction.value = 'right';
        directionQueue.value = [];
        score.value = 0;
        lastMove.value = 'right';
        speed.value = getSpeed(0);
        gameStatus.value = 'playing';
        spawnFood();
        scheduleNext();
    }

    function endGame() {
        gameStatus.value = 'gameover';
        directionQueue.value = [];
        clearLoop();
    }

    function togglePause() {
        if (gameStatus.value === 'playing') {
            gameStatus.value = 'paused';
            clearLoop();
        } else if (gameStatus.value === 'paused') {
            gameStatus.value = 'playing';
            scheduleNext();
        }
    }

    function setDirection(dir: Direction) {
        if (gameStatus.value !== 'playing') return;

        const queued = directionQueue.value;
        const lastPlannedDirection = queued[queued.length - 1] ?? direction.value;

        if (dir === lastPlannedDirection || opposites[dir] === lastPlannedDirection) return;

        directionQueue.value = [...queued.slice(-1), dir];
    }

    function handleKeydown(e: KeyboardEvent) {
        if (gameStatus.value === 'gameover' || gameStatus.value === 'idle') {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                startGame();
            }
            return;
        }

        if (e.key === ' ') {
            e.preventDefault();
            togglePause();
            return;
        }

        const keyMap: Record<string, Direction> = {
            ArrowUp: 'up',
            ArrowDown: 'down',
            ArrowLeft: 'left',
            ArrowRight: 'right',
            w: 'up',
            s: 'down',
            a: 'left',
            d: 'right',
            W: 'up',
            S: 'down',
            A: 'left',
            D: 'right',
        };

        const dir = keyMap[e.key];
        if (dir) {
            e.preventDefault();
            setDirection(dir);
        }
    }

    onUnmounted(() => {
        clearLoop();
    });

    return {
        snake,
        food,
        score,
        highScore,
        gameStatus,
        speed,
        direction,
        lastMove,
        level,
        cellsFilled,
        GRID_SIZE,
        handleKeydown,
        startGame,
        togglePause,
        setDirection,
    };
}
