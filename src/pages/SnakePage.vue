<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSnake, type Direction } from '@/composables/useSnake';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Play, RotateCcw } from 'lucide-vue-next';

const router = useRouter();
const game = useSnake();

const CELL_SIZE = 22;
const CELL_GAP = 2;
const CELL_PITCH = CELL_SIZE + CELL_GAP;

const boardStyle = computed(() => ({
    '--grid-size': game.GRID_SIZE,
    '--cell': `${CELL_SIZE}px`,
    '--gap': `${CELL_GAP}px`,
    '--pitch': `${CELL_PITCH}px`,
    width: `${game.GRID_SIZE * CELL_PITCH}px`,
    height: `${game.GRID_SIZE * CELL_PITCH}px`,
}));

const directionIcon = {
    up: ArrowUp,
    down: ArrowDown,
    left: ArrowLeft,
    right: ArrowRight,
};

const directionControls: Array<{ dir: Direction; label: string; class: string }> = [
    { dir: 'up', label: '上', class: 'col-start-2 row-start-1' },
    { dir: 'left', label: '左', class: 'col-start-1 row-start-2' },
    { dir: 'down', label: '下', class: 'col-start-2 row-start-2' },
    { dir: 'right', label: '右', class: 'col-start-3 row-start-2' },
];

function onKeydown(e: KeyboardEvent) {
    game.handleKeydown(e);
}

function segmentStyle(x: number, y: number, index = 0) {
    return {
        width: `${CELL_SIZE}px`,
        height: `${CELL_SIZE}px`,
        '--x': `${x * CELL_PITCH}px`,
        '--y': `${y * CELL_PITCH}px`,
        '--move-duration': `${Math.max(48, game.speed.value - 12)}ms`,
        '--segment-index': index,
        '--segment-scale': 1 - Math.min(index, 10) * 0.012,
    };
}

function foodStyle(x: number, y: number) {
    return {
        left: `${x * CELL_PITCH}px`,
        top: `${y * CELL_PITCH}px`,
        width: `${CELL_SIZE}px`,
        height: `${CELL_SIZE}px`,
    };
}

function segmentClass(index: number) {
    if (index === 0) return ['snake-segment', 'snake-head', `snake-head-${game.direction.value}`];
    if (index === game.snake.value.length - 1) return ['snake-segment', 'snake-tail'];
    return ['snake-segment', 'snake-body'];
}

function turn(dir: Direction) {
    game.setDirection(dir);
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
    <div class="min-h-screen select-none bg-[#101415] text-white">
        <div
            class="min-h-screen bg-[radial-gradient(circle_at_20%_15%,rgba(132,204,22,0.16),transparent_34%),radial-gradient(circle_at_78%_20%,rgba(20,184,166,0.13),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0)_34%)]"
        >
            <main class="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-6 lg:px-8">
                <header class="flex items-center gap-3 border-b border-white/10 pb-4">
                    <button
                        class="grid h-9 w-9 place-items-center rounded-md border border-white/10 bg-white/[0.06] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.1] hover:text-white"
                        aria-label="返回"
                        @click="router.push('/')"
                    >
                        <ArrowLeft class="h-4 w-4" />
                    </button>

                    <div class="min-w-0 flex-1">
                        <h1 class="text-xl font-bold tracking-normal text-white sm:text-2xl">贪吃蛇</h1>
                        <p class="mt-0.5 text-xs text-slate-400 sm:text-sm">吃掉能量果，避开边界和自己的身体</p>
                    </div>

                    <div
                        class="hidden items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100 sm:flex"
                    >
                        <component :is="directionIcon[game.lastMove.value]" class="h-4 w-4" />
                        <span class="font-medium">Lv.{{ game.level.value }}</span>
                    </div>
                </header>

                <section class="grid flex-1 items-center gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_270px]">
                    <div class="flex min-w-0 justify-center">
                        <div class="game-frame">
                            <div class="board-shell">
                                <div class="board-grid" :style="boardStyle">
                                    <div
                                        v-for="(seg, index) in game.snake.value"
                                        :key="`snake-${index}`"
                                        :class="segmentClass(index)"
                                        :style="segmentStyle(seg.x, seg.y, index)"
                                    >
                                        <template v-if="index === 0">
                                            <span class="snake-eye snake-eye-left" />
                                            <span class="snake-eye snake-eye-right" />
                                        </template>
                                    </div>

                                    <div class="food-core" :style="foodStyle(game.food.value.x, game.food.value.y)">
                                        <span class="food-leaf" />
                                        <span class="food-shine" />
                                    </div>

                                    <div v-if="game.gameStatus.value === 'idle'" class="state-layer">
                                        <div class="state-panel">
                                            <Play class="mx-auto mb-2 h-8 w-8 fill-current text-lime-300" />
                                            <p class="text-base font-semibold text-white">准备开始</p>
                                            <p class="mt-1 text-sm text-slate-300">按空格或 Enter 开始</p>
                                        </div>
                                    </div>

                                    <div v-if="game.gameStatus.value === 'paused'" class="state-layer backdrop-blur-sm">
                                        <div class="state-panel">
                                            <Pause class="mx-auto mb-2 h-8 w-8 text-amber-300" />
                                            <p class="text-base font-semibold text-white">已暂停</p>
                                            <p class="mt-1 text-sm text-slate-300">按空格继续</p>
                                        </div>
                                    </div>

                                    <div
                                        v-if="game.gameStatus.value === 'gameover'"
                                        class="state-layer backdrop-blur-sm"
                                    >
                                        <div class="state-panel">
                                            <p class="text-lg font-bold text-red-300">游戏结束</p>
                                            <p class="mt-1 text-sm text-slate-300">本局得分 {{ game.score.value }}</p>
                                            <button
                                                class="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-lime-500 px-4 text-sm font-semibold text-slate-950 transition hover:bg-lime-400 active:scale-95"
                                                @click="game.startGame()"
                                            >
                                                <RotateCcw class="h-4 w-4" />
                                                重新开始
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <aside class="grid gap-3">
                        <div class="grid grid-cols-3 gap-2">
                            <div class="stat-tile">
                                <span>得分</span>
                                <strong>{{ game.score.value }}</strong>
                            </div>
                            <div class="stat-tile">
                                <span>最高</span>
                                <strong class="text-amber-300">{{ game.highScore.value }}</strong>
                            </div>
                            <div class="stat-tile">
                                <span>等级</span>
                                <strong class="text-cyan-300">{{ game.level.value }}</strong>
                            </div>
                        </div>

                        <div class="rounded-lg border border-white/10 bg-white/[0.055] p-3">
                            <div class="mb-2 flex items-center justify-between text-xs text-slate-400">
                                <span>占领度</span>
                                <span>{{ Math.round(game.cellsFilled.value * 100) }}%</span>
                            </div>
                            <div class="h-2 overflow-hidden rounded-full bg-black/30">
                                <div
                                    class="h-full rounded-full bg-gradient-to-r from-lime-300 via-emerald-400 to-cyan-300 transition-all duration-300"
                                    :style="{ width: `${Math.round(game.cellsFilled.value * 100)}%` }"
                                />
                            </div>
                        </div>

                        <div class="flex flex-wrap gap-2">
                            <button
                                v-if="game.gameStatus.value === 'idle' || game.gameStatus.value === 'gameover'"
                                class="control-button bg-lime-500 text-slate-950 hover:bg-lime-400"
                                @click="game.startGame()"
                            >
                                <Play class="h-4 w-4 fill-current" />
                                开始
                            </button>
                            <button
                                v-if="game.gameStatus.value === 'playing'"
                                class="control-button bg-amber-500 text-slate-950 hover:bg-amber-400"
                                @click="game.togglePause()"
                            >
                                <Pause class="h-4 w-4" />
                                暂停
                            </button>
                            <button
                                v-if="game.gameStatus.value === 'paused'"
                                class="control-button bg-lime-500 text-slate-950 hover:bg-lime-400"
                                @click="game.togglePause()"
                            >
                                <Play class="h-4 w-4 fill-current" />
                                继续
                            </button>
                            <button
                                v-if="game.gameStatus.value === 'playing' || game.gameStatus.value === 'paused'"
                                class="control-button bg-white/10 text-slate-200 hover:bg-white/15"
                                @click="game.startGame()"
                            >
                                <RotateCcw class="h-4 w-4" />
                                重开
                            </button>
                        </div>

                        <div class="rounded-lg border border-white/10 bg-white/[0.055] p-3">
                            <div class="grid grid-cols-3 grid-rows-2 gap-2">
                                <button
                                    v-for="control in directionControls"
                                    :key="control.dir"
                                    class="grid h-12 place-items-center rounded-md border border-white/10 bg-black/20 text-slate-200 transition hover:bg-white/10 active:scale-95 disabled:opacity-45"
                                    :class="control.class"
                                    :aria-label="control.label"
                                    :disabled="game.gameStatus.value !== 'playing'"
                                    @click="turn(control.dir)"
                                >
                                    <component :is="directionIcon[control.dir]" class="h-5 w-5" />
                                </button>
                            </div>
                            <p class="mt-3 text-center text-xs leading-5 text-slate-500">
                                方向键 / WASD 控制，空格暂停
                            </p>
                        </div>
                    </aside>
                </section>
            </main>
        </div>
    </div>
</template>

<style scoped>
.game-frame {
    width: min(100%, calc((var(--grid-size, 20) * var(--pitch, 24px)) + 28px));
    overflow: auto;
    border-radius: 8px;
    border: 1px solid rgb(255 255 255 / 0.1);
    background: linear-gradient(145deg, rgb(255 255 255 / 0.1), rgb(255 255 255 / 0.035));
    box-shadow: 0 24px 70px rgb(0 0 0 / 0.35);
}

.board-shell {
    width: max-content;
    padding: 14px;
}

.board-grid {
    position: relative;
    border-radius: 6px;
    overflow: hidden;
    background-color: #102018;
    background-image:
        linear-gradient(rgb(255 255 255 / 0.055) 1px, transparent 1px),
        linear-gradient(90deg, rgb(255 255 255 / 0.055) 1px, transparent 1px),
        radial-gradient(circle at 50% 50%, rgb(132 204 22 / 0.1), transparent 62%);
    background-size:
        var(--pitch) var(--pitch),
        var(--pitch) var(--pitch),
        100% 100%;
    box-shadow:
        inset 0 0 0 1px rgb(255 255 255 / 0.08),
        inset 0 0 34px rgb(0 0 0 / 0.42);
}

.snake-segment,
.food-core {
    position: absolute;
}

.snake-segment {
    border-radius: 7px;
    transform: translate3d(var(--x), var(--y), 0) rotate(var(--head-rotation, 0deg)) scale(var(--segment-scale));
    transition:
        transform var(--move-duration) linear,
        opacity 120ms ease;
    will-change: transform;
}

.snake-head {
    z-index: 3;
    border-radius: 9px;
    background:
        radial-gradient(circle at 35% 28%, rgb(255 255 255 / 0.55), transparent 20%),
        linear-gradient(145deg, #b8f250, #34d399 58%, #0f9f78);
    box-shadow:
        0 0 16px rgb(132 204 22 / 0.5),
        inset 0 -3px 5px rgb(7 89 64 / 0.45);
}

.snake-head-up {
    --head-rotation: -90deg;
}

.snake-head-down {
    --head-rotation: 90deg;
}

.snake-head-left {
    --head-rotation: 180deg;
}

.snake-head-right {
    --head-rotation: 0deg;
}

.snake-body {
    z-index: 2;
    background:
        radial-gradient(circle at 32% 28%, rgb(255 255 255 / 0.34), transparent 20%),
        linear-gradient(145deg, #86efac, #22c55e 56%, #15803d);
    box-shadow:
        inset 0 -3px 5px rgb(20 83 45 / 0.5),
        0 2px 8px rgb(0 0 0 / 0.22);
}

.snake-tail {
    z-index: 1;
    border-radius: 6px 10px 10px 6px;
    background: linear-gradient(145deg, #6ee7b7, #16a34a);
    box-shadow: inset 0 -2px 5px rgb(20 83 45 / 0.45);
}

.snake-eye {
    position: absolute;
    right: 4px;
    width: 4px;
    height: 4px;
    border-radius: 999px;
    background: #062a1f;
    box-shadow: 0 0 0 1px rgb(255 255 255 / 0.4);
}

.snake-eye-left {
    top: 5px;
}

.snake-eye-right {
    bottom: 5px;
}

.food-core {
    z-index: 2;
    transition:
        left 120ms ease,
        top 120ms ease,
        opacity 120ms ease;
    border-radius: 50%;
    background:
        radial-gradient(circle at 36% 30%, rgb(255 255 255 / 0.75), transparent 17%),
        radial-gradient(circle at 50% 62%, #fb7185, #e11d48 66%, #9f1239);
    box-shadow:
        0 0 18px rgb(244 63 94 / 0.55),
        inset 0 -3px 6px rgb(127 29 29 / 0.5);
    animation: food-pulse 1.15s ease-in-out infinite;
}

.food-leaf {
    position: absolute;
    left: 11px;
    top: -4px;
    width: 10px;
    height: 7px;
    border-radius: 999px 0 999px 0;
    background: #bef264;
    transform: rotate(-22deg);
}

.food-shine {
    position: absolute;
    left: 6px;
    top: 5px;
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.8);
}

.state-layer {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: grid;
    place-items: center;
    background: rgb(3 7 18 / 0.62);
}

.state-panel {
    width: min(78%, 220px);
    border-radius: 8px;
    border: 1px solid rgb(255 255 255 / 0.12);
    background: rgb(15 23 42 / 0.78);
    padding: 18px;
    text-align: center;
    box-shadow: 0 16px 40px rgb(0 0 0 / 0.35);
}

.stat-tile {
    min-height: 72px;
    border-radius: 8px;
    border: 1px solid rgb(255 255 255 / 0.1);
    background: rgb(255 255 255 / 0.055);
    padding: 10px;
}

.stat-tile span {
    display: block;
    font-size: 12px;
    color: rgb(148 163 184);
}

.stat-tile strong {
    display: block;
    margin-top: 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    font-size: 24px;
    line-height: 1;
    color: rgb(163 230 53);
}

.control-button {
    display: inline-flex;
    height: 38px;
    align-items: center;
    gap: 8px;
    border-radius: 6px;
    padding: 0 14px;
    font-size: 14px;
    font-weight: 700;
    transition:
        transform 160ms ease,
        background-color 160ms ease;
}

.control-button:active {
    transform: scale(0.96);
}

@keyframes food-pulse {
    0%,
    100% {
        transform: scale(0.94);
    }

    50% {
        transform: scale(1.08);
    }
}

@media (max-width: 560px) {
    .game-frame {
        width: 100%;
    }

    .board-shell {
        padding: 10px;
    }
}
</style>
