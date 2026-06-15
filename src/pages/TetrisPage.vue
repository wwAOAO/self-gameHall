<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import {
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    CornerUpLeft,
    Pause,
    Play,
    RotateCcw,
    RotateCw,
    Save,
    Zap,
} from 'lucide-vue-next';
import { useTetris } from '@/composables/useTetris';

const router = useRouter();
const game = useTetris();

const CELL_SIZE = 26;
const CELL_GAP = 2;
const CELL_PITCH = CELL_SIZE + CELL_GAP;

interface CellRender {
    x: number;
    y: number;
    color: string;
    id?: string;
    opacity?: number;
    ghost?: boolean;
}

const boardStyle = computed(() => ({
    '--cols': game.COLS,
    '--rows': game.ROWS,
    '--cell': `${CELL_SIZE}px`,
    '--gap': `${CELL_GAP}px`,
    '--pitch': `${CELL_PITCH}px`,
    width: `${game.COLS * CELL_PITCH}px`,
    height: `${game.ROWS * CELL_PITCH}px`,
}));

const boardCells = computed<CellRender[]>(() => {
    const cells: CellRender[] = [];
    for (let row = 0; row < game.ROWS; row++) {
        for (let col = 0; col < game.COLS; col++) {
            const color = game.board.value[row][col];
            if (color) {
                cells.push({ x: col, y: row, color, id: `${col}-${row}` });
            }
        }
    }
    return cells;
});

function cellsFromShape(shape: number[][], color: string, offsetX = 0, offsetY = 0): CellRender[] {
    const cells: CellRender[] = [];
    for (let row = 0; row < shape.length; row++) {
        for (let col = 0; col < shape[row].length; col++) {
            if (shape[row][col]) {
                cells.push({ x: col + offsetX, y: row + offsetY, color });
            }
        }
    }
    return cells;
}

const currentCells = computed<CellRender[]>(() => {
    return cellsFromShape(
        game.currentPiece.value,
        game.currentColor.value,
        game.currentPos.value.x,
        game.currentPos.value.y,
    );
});

const ghostCells = computed<CellRender[]>(() => {
    if (game.gameStatus.value === 'idle' || game.currentPiece.value.length === 0) return [];

    return cellsFromShape(game.currentPiece.value, game.currentColor.value, game.currentPos.value.x, game.ghostY()).map(
        cell => ({ ...cell, opacity: 0.35, ghost: true }),
    );
});

const statusText = computed(() => {
    switch (game.gameStatus.value) {
        case 'playing':
            return '进行中';
        case 'paused':
            return '已暂停';
        case 'gameover':
            return '游戏结束';
        default:
            return '待开始';
    }
});

const fillPercent = computed(() => Math.round(game.cellsFilled.value * 100));

function cellStyle(cell: CellRender) {
    return {
        '--x': `${cell.x * CELL_PITCH}px`,
        '--y': `${cell.y * CELL_PITCH}px`,
        '--cell-color': cell.color,
        '--cell-opacity': cell.opacity ?? 1,
        width: `${CELL_SIZE}px`,
        height: `${CELL_SIZE}px`,
    };
}

function previewStyle(shape: number[][]) {
    const width = Math.max(4, shape[0]?.length || 4) * 18;
    const height = Math.max(3, shape.length || 3) * 18;
    return {
        width: `${width}px`,
        height: `${height}px`,
    };
}

function previewCellStyle(cell: CellRender) {
    return {
        '--x': `${cell.x * 18}px`,
        '--y': `${cell.y * 18}px`,
        '--cell-color': cell.color,
        width: '16px',
        height: '16px',
    };
}

function onKeydown(e: KeyboardEvent) {
    game.handleKeydown(e);
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
    <div class="min-h-screen select-none bg-[#101316] text-white">
        <div
            class="min-h-screen bg-[radial-gradient(circle_at_16%_12%,rgba(45,212,191,0.14),transparent_32%),radial-gradient(circle_at_86%_18%,rgba(251,113,133,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0)_38%)]"
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
                        <h1 class="text-xl font-bold tracking-normal text-white sm:text-2xl">俄罗斯方块</h1>
                        <p class="mt-0.5 text-xs text-slate-400 sm:text-sm">旋转、暂存、硬降与连消节奏都已升级</p>
                    </div>

                    <div
                        class="hidden items-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100 sm:flex"
                    >
                        <Zap class="h-4 w-4" />
                        <span class="font-medium">Lv.{{ game.level.value }}</span>
                    </div>
                </header>

                <section class="grid flex-1 items-center gap-5 py-5 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
                    <aside class="order-2 grid gap-3 lg:order-1">
                        <div class="panel">
                            <div class="panel-title">
                                <span>暂存</span>
                                <span :class="game.canHold.value ? 'text-teal-300' : 'text-slate-500'">
                                    {{ game.canHold.value ? '可用' : '已锁定' }}
                                </span>
                            </div>
                            <div class="preview-box h-[86px]">
                                <div
                                    v-if="game.holdShape.value.length"
                                    class="relative"
                                    :style="previewStyle(game.holdShape.value)"
                                >
                                    <div
                                        v-for="(cell, index) in cellsFromShape(
                                            game.holdShape.value,
                                            game.holdColor.value,
                                        )"
                                        :key="`hold-${index}`"
                                        class="preview-cell"
                                        :style="previewCellStyle(cell)"
                                    />
                                </div>
                                <Save v-else class="h-7 w-7 text-slate-600" />
                            </div>
                        </div>

                        <div class="panel">
                            <div class="panel-title">
                                <span>操作</span>
                                <span>键盘 / 触控</span>
                            </div>
                            <div class="grid grid-cols-3 grid-rows-3 gap-2">
                                <button
                                    class="touch-button col-start-2"
                                    aria-label="旋转"
                                    :disabled="game.gameStatus.value !== 'playing'"
                                    @click="game.rotate()"
                                >
                                    <RotateCw class="h-5 w-5" />
                                </button>
                                <button
                                    class="touch-button row-start-2"
                                    aria-label="左移"
                                    :disabled="game.gameStatus.value !== 'playing'"
                                    @click="game.moveLeft()"
                                >
                                    <ArrowLeft class="h-5 w-5" />
                                </button>
                                <button
                                    class="touch-button row-start-2"
                                    aria-label="软降"
                                    :disabled="game.gameStatus.value !== 'playing'"
                                    @click="game.softDrop()"
                                >
                                    <ArrowDown class="h-5 w-5" />
                                </button>
                                <button
                                    class="touch-button row-start-2"
                                    aria-label="右移"
                                    :disabled="game.gameStatus.value !== 'playing'"
                                    @click="game.moveRight()"
                                >
                                    <ArrowRight class="h-5 w-5" />
                                </button>
                                <button
                                    class="touch-button col-span-2 row-start-3"
                                    aria-label="硬降"
                                    :disabled="game.gameStatus.value !== 'playing'"
                                    @click="game.hardDrop()"
                                >
                                    <ArrowUp class="h-5 w-5" />
                                    <span>硬降</span>
                                </button>
                                <button
                                    class="touch-button row-start-3"
                                    aria-label="暂存"
                                    :disabled="game.gameStatus.value !== 'playing' || !game.canHold.value"
                                    @click="game.holdCurrentPiece()"
                                >
                                    <Save class="h-5 w-5" />
                                </button>
                            </div>
                            <p class="mt-3 text-xs leading-5 text-slate-500">
                                方向键 / WASD 移动，空格硬降，C 或 Shift 暂存，Esc 暂停。
                            </p>
                        </div>
                    </aside>

                    <div class="order-1 flex min-w-0 justify-center lg:order-2">
                        <div class="game-frame">
                            <div class="board-shell">
                                <div class="board-grid" :style="boardStyle">
                                    <div
                                        v-for="(cell, index) in boardCells"
                                        :key="`board-${cell.id}`"
                                        class="block-cell locked-cell"
                                        :style="cellStyle(cell)"
                                    />

                                    <div
                                        v-for="(cell, index) in ghostCells"
                                        :key="`ghost-${index}`"
                                        class="block-cell ghost-cell"
                                        :style="cellStyle(cell)"
                                    />

                                    <div
                                        v-for="(cell, index) in currentCells"
                                        :key="`current-${game.pieceSerial.value}-${index}`"
                                        class="block-cell active-cell"
                                        :style="cellStyle(cell)"
                                    />

                                    <div v-if="game.gameStatus.value === 'idle'" class="state-layer">
                                        <div class="state-panel">
                                            <Play class="mx-auto mb-2 h-8 w-8 fill-current text-teal-300" />
                                            <p class="text-base font-semibold text-white">准备开始</p>
                                            <p class="mt-1 text-sm text-slate-300">按空格或 Enter 开始</p>
                                        </div>
                                    </div>

                                    <div v-if="game.gameStatus.value === 'paused'" class="state-layer backdrop-blur-sm">
                                        <div class="state-panel">
                                            <Pause class="mx-auto mb-2 h-8 w-8 text-amber-300" />
                                            <p class="text-base font-semibold text-white">已暂停</p>
                                            <p class="mt-1 text-sm text-slate-300">按 Esc 继续</p>
                                        </div>
                                    </div>

                                    <div
                                        v-if="game.gameStatus.value === 'gameover'"
                                        class="state-layer backdrop-blur-sm"
                                    >
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
                    </div>

                    <aside class="order-3 grid gap-3">
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
                                <span>消行</span>
                                <strong class="text-cyan-300">{{ game.lines.value }}</strong>
                            </div>
                        </div>

                        <div class="panel">
                            <div class="panel-title">
                                <span>状态</span>
                                <span>{{ statusText }}</span>
                            </div>
                            <div class="mb-2 flex items-center justify-between text-xs text-slate-400">
                                <span>堆叠高度</span>
                                <span>{{ fillPercent }}%</span>
                            </div>
                            <div class="h-2 overflow-hidden rounded-full bg-black/35">
                                <div
                                    class="h-full rounded-full bg-gradient-to-r from-teal-300 via-cyan-300 to-rose-300 transition-all duration-300"
                                    :style="{ width: `${fillPercent}%` }"
                                />
                            </div>
                        </div>

                        <div class="panel">
                            <div class="panel-title">
                                <span>下一个</span>
                                <span>7-bag</span>
                            </div>
                            <div class="grid gap-2">
                                <div
                                    v-for="(piece, pieceIndex) in game.nextPieces.value"
                                    :key="`next-${pieceIndex}`"
                                    class="preview-row"
                                >
                                    <div class="relative" :style="previewStyle(piece.shape)">
                                        <div
                                            v-for="(cell, cellIndex) in cellsFromShape(piece.shape, piece.color)"
                                            :key="`next-${pieceIndex}-${cellIndex}`"
                                            class="preview-cell"
                                            :style="previewCellStyle(cell)"
                                        />
                                    </div>
                                </div>
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
                                v-if="game.gameStatus.value === 'playing'"
                                class="control-button bg-amber-400 text-slate-950 hover:bg-amber-300"
                                @click="game.togglePause()"
                            >
                                <Pause class="h-4 w-4" />
                                暂停
                            </button>
                            <button
                                v-if="game.gameStatus.value === 'paused'"
                                class="control-button bg-teal-400 text-slate-950 hover:bg-teal-300"
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
                            <button
                                v-if="game.gameStatus.value === 'playing'"
                                class="control-button bg-white/10 text-slate-200 hover:bg-white/15"
                                :disabled="!game.canHold.value"
                                @click="game.holdCurrentPiece()"
                            >
                                <CornerUpLeft class="h-4 w-4" />
                                暂存
                            </button>
                        </div>
                    </aside>
                </section>
            </main>
        </div>
    </div>
</template>

<style scoped>
.game-frame {
    width: min(100%, calc((var(--cols, 10) * var(--pitch, 28px)) + 32px));
    overflow: auto;
    border-radius: 8px;
    border: 1px solid rgb(255 255 255 / 0.12);
    background: linear-gradient(145deg, rgb(255 255 255 / 0.12), rgb(255 255 255 / 0.035)), #15191e;
    box-shadow: 0 26px 70px rgb(0 0 0 / 0.42);
}

.board-shell {
    width: max-content;
    padding: 16px;
}

.board-grid {
    position: relative;
    overflow: hidden;
    border-radius: 6px;
    background-color: #141820;
    background-image:
        linear-gradient(rgb(255 255 255 / 0.055) 1px, transparent 1px),
        linear-gradient(90deg, rgb(255 255 255 / 0.055) 1px, transparent 1px),
        radial-gradient(circle at 50% 18%, rgb(45 212 191 / 0.11), transparent 58%);
    background-size:
        var(--pitch) var(--pitch),
        var(--pitch) var(--pitch),
        100% 100%;
    box-shadow:
        inset 0 0 0 1px rgb(255 255 255 / 0.08),
        inset 0 0 44px rgb(0 0 0 / 0.55);
}

.block-cell,
.preview-cell {
    position: absolute;
    transform: translate3d(var(--x), var(--y), 0);
    opacity: var(--cell-opacity, 1);
}

.block-cell {
    border-radius: 5px;
    background:
        linear-gradient(145deg, rgb(255 255 255 / 0.48), transparent 26%),
        linear-gradient(315deg, rgb(0 0 0 / 0.34), transparent 32%), var(--cell-color);
    box-shadow:
        inset 0 -4px 7px rgb(0 0 0 / 0.28),
        inset 0 0 0 1px rgb(255 255 255 / 0.18),
        0 4px 12px rgb(0 0 0 / 0.28);
    transition:
        transform 80ms linear,
        opacity 120ms ease;
    will-change: transform;
}

.locked-cell {
    filter: saturate(0.9) brightness(0.92);
    transition: none;
}

.active-cell {
    z-index: 3;
    box-shadow:
        inset 0 -4px 7px rgb(0 0 0 / 0.28),
        inset 0 0 0 1px rgb(255 255 255 / 0.22),
        0 0 18px color-mix(in srgb, var(--cell-color), transparent 42%);
}

.ghost-cell {
    z-index: 2;
    border: 1px dashed color-mix(in srgb, var(--cell-color), white 14%);
    background: color-mix(in srgb, var(--cell-color), transparent 78%);
    box-shadow: none;
}

.preview-cell {
    border-radius: 4px;
    background: linear-gradient(145deg, rgb(255 255 255 / 0.5), transparent 28%), var(--cell-color);
    box-shadow: inset 0 -2px 5px rgb(0 0 0 / 0.28);
}

.panel {
    border-radius: 8px;
    border: 1px solid rgb(255 255 255 / 0.1);
    background: rgb(255 255 255 / 0.055);
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

.preview-box,
.preview-row {
    display: grid;
    min-height: 58px;
    place-items: center;
    border-radius: 7px;
    background: rgb(0 0 0 / 0.2);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06);
}

.preview-box {
    min-height: 86px;
}

.stat-tile {
    min-height: 74px;
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
    margin-top: 7px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    font-size: 26px;
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
    min-height: 46px;
    gap: 6px;
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

.state-layer {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: grid;
    place-items: center;
    background: rgb(2 6 23 / 0.64);
}

.state-panel {
    width: min(78%, 230px);
    border-radius: 8px;
    border: 1px solid rgb(255 255 255 / 0.12);
    background: rgb(15 23 42 / 0.82);
    padding: 18px;
    text-align: center;
    box-shadow: 0 16px 40px rgb(0 0 0 / 0.36);
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
