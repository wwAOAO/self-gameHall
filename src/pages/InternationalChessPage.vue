<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Flag, Play, RotateCcw, RotateCcwSquare, Undo2 } from 'lucide-vue-next';
import { useInternationalChess } from '@/composables/useInternationalChess';

const router = useRouter();
const game = useInternationalChess();
const canvasRef = ref<HTMLCanvasElement | null>(null);

let renderRaf: number | null = null;

function renderLoop() {
    const canvas = canvasRef.value;
    const ctx = canvas?.getContext('2d');
    if (ctx) game.draw(ctx);
    renderRaf = requestAnimationFrame(renderLoop);
}

onMounted(() => {
    renderLoop();
});

onUnmounted(() => {
    if (renderRaf) cancelAnimationFrame(renderRaf);
    game.clearAITimer();
});

function toCanvasPoint(event: MouseEvent) {
    const canvas = canvasRef.value;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
}

function handleCanvasClick(event: MouseEvent) {
    const point = toCanvasPoint(event);
    if (!point) return;
    game.handleClick(point.x, point.y);
}

function handleCanvasMove(event: MouseEvent) {
    const point = toCanvasPoint(event);
    if (!point) return;
    game.handleHover(point.x, point.y);
}

function handleCanvasLeave() {
    game.handleHover(-999, -999);
}

const recentMoves = computed(() => game.moveHistory.value.slice(-10));
</script>

<template>
    <div class="min-h-screen select-none overflow-hidden bg-[#101417] text-white" style="height: 100dvh">
        <div
            class="flex h-full flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0,rgba(255,255,255,0)_34%),linear-gradient(135deg,rgba(127,143,109,0.16)_0,rgba(127,143,109,0)_36%,rgba(216,195,159,0.16)_100%)]"
        >
            <header class="mx-auto w-full max-w-6xl shrink-0 px-3 pb-2 pt-3">
                <div class="flex items-center gap-3">
                    <button class="nav-button" @click="router.push('/')"><ArrowLeft class="h-4 w-4" /> 返回</button>
                    <h1 class="mr-10 flex-1 text-center text-lg font-bold tracking-normal sm:text-xl">
                        <span class="text-stone-100">国际象棋</span>
                        <span class="ml-2 text-base text-stone-500">Chess</span>
                    </h1>
                </div>
            </header>

            <main
                class="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 overflow-hidden px-3 pb-3 lg:flex-row lg:items-center"
            >
                <section class="flex min-h-0 flex-1 items-center justify-center">
                    <div
                        class="board-shell relative rounded-lg border border-white/10 bg-black/20 p-2 shadow-[0_24px_70px_rgba(0,0,0,0.36)]"
                    >
                        <canvas
                            ref="canvasRef"
                            :width="game.getWidth()"
                            :height="game.getHeight()"
                            class="canvas-board aspect-square w-[min(94vw,calc(100dvh-108px),608px)] rounded-md cursor-pointer"
                            @click="handleCanvasClick"
                            @mousemove="handleCanvasMove"
                            @mouseleave="handleCanvasLeave"
                        />

                        <div
                            v-if="game.gameStatus.value === 'idle'"
                            class="absolute inset-2 grid place-items-center rounded-md bg-black/45 backdrop-blur-sm"
                        >
                            <div class="flex w-[min(86%,340px)] flex-col items-center gap-4 text-center">
                                <div>
                                    <p class="text-xl font-black text-stone-100">标准国际象棋</p>
                                    <p class="mt-1 text-sm leading-6 text-stone-300">
                                        {{ game.playerColor.value === 'w' ? '你执白先行' : '你执黑后行' }}
                                    </p>
                                </div>

                                <div class="grid grid-cols-2 gap-2">
                                    <button
                                        class="color-button"
                                        :class="{ active: game.playerColor.value === 'w' }"
                                        @click="game.playerColor.value = 'w'"
                                    >
                                        <span class="piece-dot white-piece">♔</span> 执白
                                    </button>
                                    <button
                                        class="color-button"
                                        :class="{ active: game.playerColor.value === 'b' }"
                                        @click="game.playerColor.value = 'b'"
                                    >
                                        <span class="piece-dot black-piece">♚</span> 执黑
                                    </button>
                                </div>

                                <button class="primary-button" @click="game.startGame()">
                                    <Play class="h-4 w-4" /> 开始对局
                                </button>
                            </div>
                        </div>

                        <div
                            v-if="game.gameStatus.value === 'ended'"
                            class="absolute inset-2 grid place-items-center rounded-md bg-black/55 backdrop-blur-sm"
                        >
                            <div
                                class="w-[min(86%,360px)] rounded-lg border border-white/10 bg-slate-950/82 p-5 text-center shadow-xl"
                            >
                                <p class="text-xl font-black text-stone-100">
                                    {{ game.resultLabel.value || game.message.value }}
                                </p>
                                <p class="mt-2 text-sm text-stone-400">共 {{ game.moveCount.value }} 手</p>
                                <button class="primary-button mt-4" @click="game.startGame()">
                                    <RotateCcw class="h-4 w-4" /> 再来一局
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <aside class="side-panel">
                    <div
                        class="status-line"
                        :class="{ thinking: game.gameStatus.value === 'playing' && !game.isPlayerTurn.value }"
                    >
                        <span
                            class="turn-icon"
                            :class="game.currentColor.value === 'w' ? 'white-piece' : 'black-piece'"
                        >
                            {{ game.currentColor.value === 'w' ? '♔' : '♚' }}
                        </span>
                        <div class="min-w-0">
                            <p class="truncate">{{ game.message.value }}</p>
                            <span class="turn-subtitle">{{ game.turnLabel.value }}</span>
                        </div>
                    </div>

                    <div class="stat-grid">
                        <div class="stat-card">
                            <span>手数</span>
                            <strong>{{ game.moveCount.value }}</strong>
                        </div>
                        <div class="stat-card">
                            <span>执棋</span>
                            <strong>{{ game.playerColor.value === 'w' ? '白' : '黑' }}</strong>
                        </div>
                        <div class="stat-card">
                            <span>你吃子</span>
                            <strong>{{ game.capturedByPlayer.value.length }}</strong>
                        </div>
                        <div class="stat-card">
                            <span>电脑吃子</span>
                            <strong>{{ game.capturedByAI.value.length }}</strong>
                        </div>
                    </div>

                    <div class="capture-row">
                        <span>你的战利品</span>
                        <div class="piece-list">
                            <span
                                v-for="(piece, index) in game.capturedByPlayer.value"
                                :key="`p-${index}`"
                                :title="game.getPieceName(piece)"
                            >
                                {{ game.getPieceSymbol(piece) }}
                            </span>
                        </div>
                    </div>

                    <div class="capture-row">
                        <span>电脑战利品</span>
                        <div class="piece-list">
                            <span
                                v-for="(piece, index) in game.capturedByAI.value"
                                :key="`a-${index}`"
                                :title="game.getPieceName(piece)"
                            >
                                {{ game.getPieceSymbol(piece) }}
                            </span>
                        </div>
                    </div>

                    <div class="controls">
                        <button
                            v-if="game.gameStatus.value === 'idle'"
                            class="secondary-button"
                            @click="game.switchColor()"
                        >
                            <RotateCcwSquare class="h-4 w-4" /> 换先后
                        </button>
                        <button
                            v-if="game.gameStatus.value !== 'idle'"
                            class="secondary-button"
                            @click="game.startGame()"
                        >
                            <RotateCcw class="h-4 w-4" /> 重开
                        </button>
                        <button
                            v-if="game.gameStatus.value === 'playing'"
                            class="secondary-button"
                            @click="game.undoPair()"
                        >
                            <Undo2 class="h-4 w-4" /> 悔棋
                        </button>
                        <button v-if="game.gameStatus.value === 'playing'" class="danger-button" @click="game.resign()">
                            <Flag class="h-4 w-4" /> 认输
                        </button>
                    </div>

                    <div class="move-panel">
                        <div class="panel-title">最近棋步</div>
                        <div v-if="recentMoves.length" class="move-list">
                            <span v-for="(move, index) in recentMoves" :key="`${move}-${index}`">{{ move }}</span>
                        </div>
                        <div v-else class="empty-moves">开局后显示棋谱</div>
                    </div>
                </aside>
            </main>
        </div>
    </div>
</template>

<style scoped>
.nav-button,
.primary-button,
.secondary-button,
.danger-button,
.color-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 700;
    transition:
        transform 180ms ease,
        background-color 180ms ease,
        border-color 180ms ease,
        color 180ms ease,
        box-shadow 180ms ease;
}

.nav-button {
    color: rgb(168 162 158);
}

.nav-button:hover {
    color: white;
    transform: translateX(-2px);
}

.primary-button {
    min-width: 8.5rem;
    background: rgb(87 83 78);
    color: white;
    padding: 0.65rem 1.1rem;
    box-shadow: 0 14px 34px rgba(87, 83, 78, 0.34);
}

.primary-button:hover {
    background: rgb(120 113 108);
    transform: translateY(-1px);
    box-shadow: 0 18px 42px rgba(87, 83, 78, 0.42);
}

.secondary-button,
.danger-button {
    min-height: 2.5rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.08);
    color: rgb(231 229 228);
    padding: 0.55rem 0.8rem;
}

.secondary-button:hover {
    background: rgba(255, 255, 255, 0.14);
    transform: translateY(-1px);
}

.danger-button {
    color: rgb(254 202 202);
}

.danger-button:hover {
    border-color: rgba(248, 113, 113, 0.38);
    background: rgba(127, 29, 29, 0.55);
    transform: translateY(-1px);
}

.color-button {
    min-width: 7rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(15, 23, 42, 0.72);
    color: rgb(214 211 209);
    padding: 0.55rem 0.8rem;
}

.color-button.active {
    border-color: rgba(214, 195, 159, 0.82);
    background: rgba(68, 64, 60, 0.88);
    color: white;
    box-shadow: 0 0 0 3px rgba(214, 195, 159, 0.12);
}

.piece-dot,
.turn-icon {
    display: inline-grid;
    place-items: center;
    font-family: 'Segoe UI Symbol', 'Noto Sans Symbols', serif;
    line-height: 1;
}

.piece-dot {
    height: 1.2rem;
    width: 1.2rem;
    font-size: 1rem;
}

.turn-icon {
    height: 2.35rem;
    width: 2.35rem;
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.08);
    font-size: 1.8rem;
    transition:
        transform 220ms ease,
        box-shadow 220ms ease,
        background-color 220ms ease;
}

.white-piece {
    color: #f8fafc;
    text-shadow: 0 1px 2px rgba(15, 23, 42, 0.8);
}

.black-piece {
    color: #111827;
    text-shadow: 0 1px 1px rgba(255, 255, 255, 0.4);
}

.side-panel {
    display: flex;
    width: 100%;
    flex-direction: column;
    gap: 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.5rem;
    background: rgba(15, 23, 42, 0.5);
    padding: 0.85rem;
    animation: panel-in 420ms ease both;
}

.status-line {
    display: flex;
    min-height: 3.2rem;
    align-items: center;
    gap: 0.65rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 0.75rem;
    color: rgb(231 229 228);
    font-size: 0.9rem;
    font-weight: 800;
    transition:
        border-color 220ms ease,
        background-color 220ms ease;
}

.status-line.thinking {
    border-color: rgba(214, 195, 159, 0.22);
}

.status-line.thinking .turn-icon {
    animation: thinking-pulse 1.4s ease-in-out infinite;
    background: rgba(214, 195, 159, 0.13);
}

.turn-subtitle {
    display: block;
    color: rgb(168 162 158);
    font-size: 0.74rem;
    font-weight: 700;
}

.stat-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.5rem;
}

.stat-card,
.move-panel,
.capture-row {
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.055);
    padding: 0.65rem;
    transition:
        transform 180ms ease,
        background-color 180ms ease,
        border-color 180ms ease;
}

.stat-card:hover,
.move-panel:hover,
.capture-row:hover {
    border-color: rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.075);
    transform: translateY(-1px);
}

.stat-card span,
.capture-row > span,
.panel-title {
    display: block;
    color: rgb(168 162 158);
    font-size: 0.72rem;
}

.stat-card strong {
    color: rgb(245 245 244);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 1.15rem;
}

.capture-row {
    min-height: 3.2rem;
}

.piece-list {
    display: flex;
    min-height: 1.45rem;
    flex-wrap: wrap;
    gap: 0.15rem;
    padding-top: 0.25rem;
    color: rgb(231 229 228);
    font-family: 'Segoe UI Symbol', 'Noto Sans Symbols', serif;
    font-size: 1.05rem;
}

.controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.move-list {
    display: flex;
    max-height: 7.5rem;
    flex-wrap: wrap;
    gap: 0.35rem;
    overflow: hidden;
    padding-top: 0.45rem;
}

.move-list span {
    border-radius: 0.35rem;
    background: rgba(0, 0, 0, 0.24);
    color: rgb(231 229 228);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.78rem;
    padding: 0.2rem 0.35rem;
    animation: move-chip-in 220ms ease both;
}

.empty-moves {
    padding-top: 0.45rem;
    color: rgb(120 113 108);
    font-size: 0.78rem;
}

.board-shell {
    animation: board-in 460ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    transition:
        border-color 220ms ease,
        box-shadow 220ms ease;
}

.board-shell:hover {
    border-color: rgba(255, 255, 255, 0.18);
    box-shadow: 0 28px 82px rgba(0, 0, 0, 0.44);
}

.canvas-board {
    transition: filter 220ms ease;
}

@keyframes board-in {
    from {
        opacity: 0;
        transform: translateY(10px) scale(0.985);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

@keyframes panel-in {
    from {
        opacity: 0;
        transform: translateX(12px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

@keyframes thinking-pulse {
    0%,
    100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(214, 195, 159, 0.22);
    }
    50% {
        transform: scale(1.04);
        box-shadow: 0 0 0 8px rgba(214, 195, 159, 0);
    }
}

@keyframes move-chip-in {
    from {
        opacity: 0;
        transform: translateY(4px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        animation-duration: 1ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-duration: 1ms !important;
    }
}

@media (min-width: 1024px) {
    .side-panel {
        width: 19rem;
    }

    .stat-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .controls {
        flex-direction: column;
    }
}
</style>
