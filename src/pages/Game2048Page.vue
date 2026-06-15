<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, History, Play, RotateCcw, Trophy } from 'lucide-vue-next';
import { use2048, type MoveDirection, type Tile2048 } from '@/composables/use2048';

const router = useRouter();
const game = use2048();

const touchStart = ref<{ x: number; y: number } | null>(null);

const tileColors: Record<number, string> = {
    2: 'tile-2',
    4: 'tile-4',
    8: 'tile-8',
    16: 'tile-16',
    32: 'tile-32',
    64: 'tile-64',
    128: 'tile-128',
    256: 'tile-256',
    512: 'tile-512',
    1024: 'tile-1024',
    2048: 'tile-2048',
};

const directionIcon = {
    up: ArrowUp,
    down: ArrowDown,
    left: ArrowLeft,
    right: ArrowRight,
};

const directionControls: Array<{ dir: MoveDirection; label: string; class: string }> = [
    { dir: 'up', label: '上移', class: 'col-start-2 row-start-1' },
    { dir: 'left', label: '左移', class: 'col-start-1 row-start-2' },
    { dir: 'down', label: '下移', class: 'col-start-2 row-start-2' },
    { dir: 'right', label: '右移', class: 'col-start-3 row-start-2' },
];

const statusText = computed(() => {
    if (game.gameStatus.value === 'playing') return '进行中';
    if (game.gameStatus.value === 'won') return '已达成';
    if (game.gameStatus.value === 'gameover') return '无路可走';
    return '待开始';
});

const gridCells = computed(() => Array.from({ length: game.SIZE * game.SIZE }, (_, index) => index));

function tileClass(tile: Tile2048) {
    return tileColors[tile.value] ?? 'tile-super';
}

function tileStyle(tile: Tile2048) {
    return {
        '--row': tile.row,
        '--col': tile.col,
    };
}

function onKeydown(event: KeyboardEvent) {
    game.handleKeydown(event);
}

function onTouchStart(event: TouchEvent) {
    const touch = event.touches[0];
    touchStart.value = { x: touch.clientX, y: touch.clientY };
}

function onTouchEnd(event: TouchEvent) {
    if (!touchStart.value) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.value.x;
    const dy = touch.clientY - touchStart.value.y;
    touchStart.value = null;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
    game.move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
    <div class="min-h-screen select-none bg-[#101316] text-white">
        <div
            class="min-h-screen bg-[radial-gradient(circle_at_16%_14%,rgba(20,184,166,0.14),transparent_32%),radial-gradient(circle_at_86%_20%,rgba(251,191,36,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0)_36%)]"
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
                        <h1 class="text-xl font-bold tracking-normal text-white sm:text-2xl">2048</h1>
                        <p class="mt-0.5 text-xs text-slate-400 sm:text-sm">滑动合并数字方块，冲击 2048 与更高分</p>
                    </div>

                    <div
                        class="hidden items-center gap-2 rounded-lg border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-100 sm:flex"
                    >
                        <Trophy class="h-4 w-4" />
                        <span class="font-medium">{{ game.bestTile.value || 2 }}</span>
                    </div>
                </header>

                <section class="grid flex-1 items-center gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div class="flex min-w-0 justify-center">
                        <div class="game-frame">
                            <div class="board-grid" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
                                <div v-for="cell in gridCells" :key="cell" class="grid-cell" />

                                <div
                                    v-for="tile in game.tiles.value"
                                    :key="tile.id"
                                    class="tile"
                                    :class="tileClass(tile)"
                                    :style="tileStyle(tile)"
                                >
                                    {{ tile.value }}
                                </div>

                                <div v-if="game.gameStatus.value === 'idle'" class="state-layer">
                                    <div class="state-panel">
                                        <Play class="mx-auto mb-2 h-8 w-8 fill-current text-teal-300" />
                                        <p class="text-base font-semibold text-white">准备开始</p>
                                        <p class="mt-1 text-sm text-slate-300">按 Enter 或点击开始</p>
                                    </div>
                                </div>

                                <div v-if="game.gameStatus.value === 'won'" class="state-layer backdrop-blur-sm">
                                    <div class="state-panel">
                                        <Trophy class="mx-auto mb-2 h-8 w-8 text-amber-300" />
                                        <p class="text-lg font-bold text-amber-200">合成 2048</p>
                                        <p class="mt-1 text-sm text-slate-300">本局得分 {{ game.score.value }}</p>
                                        <div class="mt-4 flex justify-center gap-2">
                                            <button
                                                class="inline-flex h-9 items-center gap-2 rounded-md bg-amber-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 active:scale-95"
                                                @click="game.continueGame()"
                                            >
                                                继续
                                            </button>
                                            <button
                                                class="inline-flex h-9 items-center gap-2 rounded-md bg-white/10 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/15 active:scale-95"
                                                @click="game.startGame()"
                                            >
                                                重开
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div v-if="game.gameStatus.value === 'gameover'" class="state-layer backdrop-blur-sm">
                                    <div class="state-panel">
                                        <p class="text-lg font-bold text-rose-300">游戏结束</p>
                                        <p class="mt-1 text-sm text-slate-300">本局得分 {{ game.score.value }}</p>
                                        <button
                                            class="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-teal-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 active:scale-95"
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

                    <aside class="grid gap-3">
                        <div class="grid grid-cols-2 gap-2">
                            <div class="stat-tile col-span-2">
                                <span>分数</span>
                                <strong>{{ game.score.value }}</strong>
                            </div>
                            <div class="stat-tile">
                                <span>最高</span>
                                <strong class="text-amber-300">{{ game.highScore.value }}</strong>
                            </div>
                            <div class="stat-tile">
                                <span>步数</span>
                                <strong class="text-cyan-300">{{ game.moves.value }}</strong>
                            </div>
                        </div>

                        <div class="panel">
                            <div class="panel-title">
                                <span>状态</span>
                                <span>{{ statusText }}</span>
                            </div>
                            <div class="mb-2 flex items-center justify-between text-xs text-slate-400">
                                <span>目标进度</span>
                                <span>{{ game.progress.value }}%</span>
                            </div>
                            <div class="h-2 overflow-hidden rounded-full bg-black/30">
                                <div
                                    class="h-full rounded-full bg-gradient-to-r from-teal-300 via-cyan-300 to-amber-300 transition-all duration-300"
                                    :style="{ width: `${game.progress.value}%` }"
                                />
                            </div>
                        </div>

                        <div class="flex flex-wrap gap-2">
                            <button
                                v-if="game.gameStatus.value === 'idle' || game.gameStatus.value === 'gameover'"
                                class="control-button bg-teal-400 text-slate-950 hover:bg-teal-300"
                                @click="game.startGame()"
                            >
                                <Play class="h-4 w-4 fill-current" />
                                开始
                            </button>
                            <button
                                v-if="game.gameStatus.value === 'playing' || game.gameStatus.value === 'won'"
                                class="control-button bg-white/10 text-slate-200 hover:bg-white/15"
                                @click="game.startGame()"
                            >
                                <RotateCcw class="h-4 w-4" />
                                重开
                            </button>
                            <button
                                class="control-button bg-white/10 text-slate-200 hover:bg-white/15 disabled:opacity-45"
                                :disabled="!game.canUndo.value"
                                @click="game.undo()"
                            >
                                <History class="h-4 w-4" />
                                撤销
                            </button>
                        </div>

                        <div class="panel">
                            <div class="grid grid-cols-3 grid-rows-2 gap-2">
                                <button
                                    v-for="control in directionControls"
                                    :key="control.dir"
                                    class="touch-button"
                                    :class="control.class"
                                    :aria-label="control.label"
                                    :disabled="game.gameStatus.value !== 'playing'"
                                    @click="game.move(control.dir)"
                                >
                                    <component :is="directionIcon[control.dir]" class="h-5 w-5" />
                                </button>
                            </div>
                            <p class="mt-3 text-center text-xs leading-5 text-slate-500">
                                方向键 / WASD / 滑动控制，U 或退格撤销
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
    width: min(100%, 456px);
    border-radius: 8px;
    border: 1px solid rgb(255 255 255 / 0.12);
    background: linear-gradient(145deg, rgb(255 255 255 / 0.11), rgb(255 255 255 / 0.035)), #171a1f;
    padding: clamp(10px, 3vw, 16px);
    box-shadow: 0 26px 70px rgb(0 0 0 / 0.42);
}

.board-grid {
    --gap: clamp(8px, 2.2vw, 12px);
    --tile-size: calc((min(100vw - 52px, 424px) - (var(--gap) * 5)) / 4);
    position: relative;
    display: grid;
    grid-template-columns: repeat(4, var(--tile-size));
    grid-template-rows: repeat(4, var(--tile-size));
    gap: var(--gap);
    width: calc((var(--tile-size) * 4) + (var(--gap) * 5));
    max-width: 100%;
    padding: var(--gap);
    overflow: hidden;
    touch-action: none;
    border-radius: 7px;
    background: radial-gradient(circle at 50% 18%, rgb(20 184 166 / 0.12), transparent 62%), #1f242b;
    box-shadow:
        inset 0 0 0 1px rgb(255 255 255 / 0.08),
        inset 0 0 42px rgb(0 0 0 / 0.5);
}

.grid-cell {
    border-radius: 6px;
    background: rgb(255 255 255 / 0.075);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.045);
}

.tile {
    position: absolute;
    top: var(--gap);
    left: var(--gap);
    display: grid;
    width: var(--tile-size);
    height: var(--tile-size);
    place-items: center;
    transform: translate3d(
        calc(var(--col) * (var(--tile-size) + var(--gap))),
        calc(var(--row) * (var(--tile-size) + var(--gap))),
        0
    );
    border-radius: 6px;
    font-size: clamp(1.35rem, 7.2vw, 2.85rem);
    font-weight: 900;
    letter-spacing: 0;
    line-height: 1;
    color: #f8fafc;
    text-shadow: 0 1px 0 rgb(0 0 0 / 0.18);
    transition:
        transform 130ms ease,
        background 130ms ease,
        color 130ms ease;
    box-shadow:
        inset 0 -7px 16px rgb(0 0 0 / 0.18),
        inset 0 0 0 1px rgb(255 255 255 / 0.16),
        0 8px 20px rgb(0 0 0 / 0.24);
    will-change: transform;
}

.tile-2,
.tile-4 {
    color: #263238;
    text-shadow: none;
}

.tile-2 {
    background: linear-gradient(145deg, #f8fafc, #c7d2fe);
}

.tile-4 {
    background: linear-gradient(145deg, #fde68a, #a7f3d0);
}

.tile-8 {
    background: linear-gradient(145deg, #67e8f9, #0891b2);
}

.tile-16 {
    background: linear-gradient(145deg, #34d399, #047857);
}

.tile-32 {
    background: linear-gradient(145deg, #f59e0b, #ea580c);
}

.tile-64 {
    background: linear-gradient(145deg, #fb7185, #be123c);
}

.tile-128 {
    background: linear-gradient(145deg, #a78bfa, #6d28d9);
    font-size: clamp(1.2rem, 6.2vw, 2.35rem);
}

.tile-256 {
    background: linear-gradient(145deg, #38bdf8, #1d4ed8);
    font-size: clamp(1.2rem, 6.2vw, 2.35rem);
}

.tile-512 {
    background: linear-gradient(145deg, #facc15, #ca8a04);
    font-size: clamp(1.2rem, 6.2vw, 2.35rem);
}

.tile-1024,
.tile-2048,
.tile-super {
    font-size: clamp(1rem, 5.1vw, 2rem);
}

.tile-1024 {
    background: linear-gradient(145deg, #2dd4bf, #0f766e);
}

.tile-2048,
.tile-super {
    background: linear-gradient(145deg, #fef08a, #f97316 54%, #be123c);
    box-shadow:
        inset 0 -7px 16px rgb(0 0 0 / 0.2),
        inset 0 0 0 1px rgb(255 255 255 / 0.22),
        0 0 26px rgb(251 191 36 / 0.38),
        0 8px 20px rgb(0 0 0 / 0.24);
}

.state-layer {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: grid;
    place-items: center;
    background: rgb(3 7 18 / 0.64);
}

.state-panel {
    width: min(78%, 240px);
    border-radius: 8px;
    border: 1px solid rgb(255 255 255 / 0.12);
    background: rgb(15 23 42 / 0.8);
    padding: 18px;
    text-align: center;
    box-shadow: 0 16px 40px rgb(0 0 0 / 0.35);
}

.panel,
.stat-tile {
    border-radius: 8px;
    border: 1px solid rgb(255 255 255 / 0.1);
    background: rgb(255 255 255 / 0.055);
}

.panel {
    padding: 12px;
}

.panel-title {
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
    color: rgb(148 163 184);
}

.stat-tile {
    min-height: 72px;
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
    color: rgb(94 234 212);
}

.control-button,
.touch-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 700;
    transition:
        transform 160ms ease,
        background-color 160ms ease,
        opacity 160ms ease;
}

.control-button {
    height: 38px;
    gap: 8px;
    padding: 0 14px;
}

.touch-button {
    min-height: 48px;
    border: 1px solid rgb(255 255 255 / 0.1);
    background: rgb(0 0 0 / 0.22);
    color: rgb(226 232 240);
}

.control-button:active,
.touch-button:active {
    transform: scale(0.96);
}

.control-button:disabled,
.touch-button:disabled {
    cursor: not-allowed;
    opacity: 0.42;
}

@media (max-width: 520px) {
    .game-frame {
        padding: 10px;
    }
}
</style>
