<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSpiderSolitaire } from '@/composables/useSpiderSolitaire';
import { ArrowLeft, Clock3, Layers, Play, RotateCcw, Trophy } from 'lucide-vue-next';

const router = useRouter();
const game = useSpiderSolitaire();
const canvasRef = ref<HTMLCanvasElement | null>(null);

function renderLoop() {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    game.draw(ctx);
}

let renderRaf: number | null = null;

function startRender() {
    renderLoop();
    renderRaf = requestAnimationFrame(startRender);
}

onMounted(() => {
    startRender();
});

onUnmounted(() => {
    if (renderRaf) cancelAnimationFrame(renderRaf);
});

function handleCanvasClick(e: MouseEvent) {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    if (game.gameStatus.value === 'idle') {
        game.startGame();
        return;
    }

    if (game.findStockClick(mx, my)) {
        game.dealStock();
        return;
    }

    const target = game.findClickTarget(mx, my);
    if (target) {
        game.handleClick(target.col, target.card);
    }
}
</script>

<template>
    <div class="spider-page min-h-screen flex flex-col items-center select-none">
        <header class="w-full max-w-5xl px-4 pt-5 pb-3">
            <div class="flex items-center gap-3">
                <button class="nav-button" @click="router.push('/')"><ArrowLeft class="w-4 h-4" /> 返回</button>
                <h1 class="flex-1 text-center mr-10">
                    <span class="title-main">蜘蛛纸牌</span>
                    <span class="title-sub">Spider Solitaire</span>
                </h1>
            </div>
        </header>

        <main class="flex-1 flex flex-col items-center gap-3 pb-8 px-2 w-full">
            <div class="status-board">
                <div class="status-item">
                    <Trophy class="status-icon text-amber-300" />
                    <span class="status-label">已完成</span>
                    <span class="status-value text-amber-200">{{ game.completed.value }} / 8</span>
                </div>
                <div class="status-divider"></div>
                <div class="status-item">
                    <Layers class="status-icon text-cyan-300" />
                    <span class="status-label">发牌</span>
                    <span class="status-value text-cyan-200">{{ game.remainingDeals.value }}</span>
                </div>
                <div class="status-divider"></div>
                <div class="status-item">
                    <RotateCcw class="status-icon text-emerald-300" />
                    <span class="status-label">步数</span>
                    <span class="status-value text-slate-100">{{ game.moves.value }}</span>
                </div>
                <div class="status-divider"></div>
                <div class="status-item">
                    <Clock3 class="status-icon text-rose-300" />
                    <span class="status-label">用时</span>
                    <span class="status-value text-slate-100">{{ game.getFormattedTime() }}</span>
                </div>
            </div>

            <div class="spider-table-shell">
                <canvas
                    ref="canvasRef"
                    :width="game.getWidth()"
                    :height="game.getHeight()"
                    class="spider-canvas"
                    @click="handleCanvasClick"
                ></canvas>
            </div>

            <div class="action-row">
                <button v-if="game.gameStatus.value === 'idle'" class="primary-action" @click="game.startGame()">
                    <Play class="w-4 h-4" /> 开始游戏
                </button>
                <button
                    v-if="game.gameStatus.value === 'playing'"
                    class="primary-action"
                    :class="{ 'is-disabled': !game.canDealStock.value }"
                    :disabled="!game.canDealStock.value"
                    @click="game.dealStock()"
                >
                    <Layers class="w-4 h-4" /> 发牌
                </button>
                <button v-if="game.gameStatus.value !== 'idle'" class="secondary-action" @click="game.startGame()">
                    <RotateCcw class="w-4 h-4" /> 重新开始
                </button>
                <button v-if="game.gameStatus.value === 'won'" class="primary-action" @click="game.startGame()">
                    <Play class="w-4 h-4" /> 再来一局
                </button>
            </div>
        </main>
    </div>
</template>

<style scoped>
.spider-page {
    background: linear-gradient(135deg, #111827 0%, #14231f 48%, #1c2430 100%);
    color: #f8fafc;
}

.nav-button,
.primary-action,
.secondary-action {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    border: 1px solid rgba(148, 163, 184, 0.24);
    font-size: 0.875rem;
    font-weight: 600;
    transition:
        transform 160ms ease,
        background-color 160ms ease,
        border-color 160ms ease,
        box-shadow 160ms ease;
}

.nav-button {
    color: #cbd5e1;
    border-radius: 8px;
    padding: 0.375rem 0.625rem;
    background: rgba(15, 23, 42, 0.38);
}

.nav-button:hover,
.secondary-action:hover {
    color: #ffffff;
    border-color: rgba(203, 213, 225, 0.42);
    background: rgba(51, 65, 85, 0.72);
}

.title-main {
    display: inline-block;
    font-size: clamp(1.25rem, 2vw, 1.75rem);
    font-weight: 800;
    letter-spacing: 0;
    color: #f8fafc;
    text-shadow: 0 2px 20px rgba(45, 212, 191, 0.18);
}

.title-sub {
    margin-left: 0.625rem;
    color: #94a3b8;
    font-size: 0.95rem;
    font-weight: 600;
}

.status-board {
    width: min(96vw, 720px);
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.625rem;
    padding: 0.625rem 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.58);
    box-shadow:
        0 16px 38px rgba(0, 0, 0, 0.24),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(12px);
}

.status-item {
    min-width: 126px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
}

.status-icon {
    width: 1rem;
    height: 1rem;
}

.status-label {
    color: #94a3b8;
    font-size: 0.8rem;
}

.status-value {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
    font-size: 1.05rem;
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
}

.status-divider {
    width: 1px;
    height: 1.5rem;
    background: rgba(148, 163, 184, 0.2);
}

.spider-table-shell {
    max-width: min(98vw, 760px);
    overflow: auto;
    padding: 0.625rem;
    border-radius: 8px;
    border: 1px solid rgba(191, 219, 254, 0.16);
    background: linear-gradient(180deg, rgba(15, 23, 42, 0.78), rgba(15, 23, 42, 0.44));
    box-shadow:
        0 24px 70px rgba(0, 0, 0, 0.38),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.spider-canvas {
    display: block;
    max-width: 98vw;
    max-height: 78vh;
    border-radius: 8px;
    cursor: pointer;
}

.action-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
}

.primary-action,
.secondary-action {
    border-radius: 8px;
    padding: 0.5rem 0.875rem;
    color: #ffffff;
}

.primary-action {
    border-color: rgba(45, 212, 191, 0.42);
    background: linear-gradient(180deg, #0f766e, #115e59);
    box-shadow: 0 12px 28px rgba(15, 118, 110, 0.25);
}

.primary-action:hover {
    background: linear-gradient(180deg, #0d9488, #0f766e);
    box-shadow: 0 14px 32px rgba(20, 184, 166, 0.28);
}

.secondary-action {
    color: #dbeafe;
    background: rgba(30, 41, 59, 0.74);
}

.primary-action:active,
.secondary-action:active,
.nav-button:active {
    transform: scale(0.97);
}

.primary-action.is-disabled {
    cursor: not-allowed;
    opacity: 0.48;
    box-shadow: none;
}

@media (max-width: 640px) {
    .status-board {
        width: min(96vw, 360px);
        justify-content: flex-start;
    }

    .status-item {
        min-width: calc(50% - 0.625rem);
    }

    .status-divider {
        display: none;
    }

    .title-sub {
        display: none;
    }
}
</style>
