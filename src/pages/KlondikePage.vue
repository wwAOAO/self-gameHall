<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useKlondike } from '@/composables/useKlondike';
import { ArrowLeft, Clock3, Footprints, Layers, Play, RotateCcw, Sparkles, Zap } from 'lucide-vue-next';

const router = useRouter();
const game = useKlondike();
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

    game.handleClick(mx, my);
}

function handleCanvasDoubleClick(e: MouseEvent) {
    const canvas = canvasRef.value;
    if (!canvas || game.gameStatus.value !== 'playing') return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    game.handleDoubleClick(mx, my);
}
</script>

<template>
    <div class="klondike-page min-h-screen flex flex-col items-center select-none">
        <header class="w-full max-w-5xl px-4 pt-4 pb-3">
            <div class="game-topbar">
                <button class="nav-button" @click="router.push('/')"><ArrowLeft class="w-4 h-4" /> 返回</button>
                <div class="title-block">
                    <h1>经典接龙</h1>
                    <span>Klondike Solitaire</span>
                </div>
                <div class="topbar-spacer"></div>
            </div>
        </header>

        <main class="flex-1 w-full max-w-5xl flex flex-col items-center gap-3 pb-8 px-3">
            <div class="score-strip">
                <div class="score-item">
                    <Footprints class="score-icon text-emerald-300" />
                    <span class="score-label">步数</span>
                    <span class="score-value text-emerald-200">{{ game.moves.value }}</span>
                </div>
                <div class="score-divider"></div>
                <div class="score-item">
                    <Clock3 class="score-icon text-sky-300" />
                    <span class="score-label">用时</span>
                    <span class="score-value text-sky-200">{{ game.getFormattedTime() }}</span>
                </div>
            </div>

            <div class="board-shell">
                <canvas
                    ref="canvasRef"
                    :width="game.getWidth()"
                    :height="game.getHeight()"
                    class="game-canvas"
                    @click="handleCanvasClick"
                    @dblclick="handleCanvasDoubleClick"
                ></canvas>
            </div>

            <div class="action-bar">
                <button v-if="game.gameStatus.value === 'idle'" class="primary-action" @click="game.startGame()">
                    <Play class="w-4 h-4" /> 开始游戏
                </button>
                <button v-if="game.gameStatus.value === 'playing'" class="primary-action" @click="game.autoMoveAll()">
                    <Zap class="w-4 h-4" /> 自动收牌
                </button>
                <button v-if="game.gameStatus.value === 'playing'" class="secondary-action" @click="game.drawStock()">
                    <Layers class="w-4 h-4" /> 发牌
                </button>
                <button v-if="game.gameStatus.value !== 'idle'" class="ghost-action" @click="game.startGame()">
                    <RotateCcw class="w-4 h-4" /> 重新开始
                </button>
                <button v-if="game.gameStatus.value === 'won'" class="primary-action" @click="game.startGame()">
                    <Sparkles class="w-4 h-4" /> 再来一局
                </button>
            </div>
        </main>
    </div>
</template>

<style scoped>
.klondike-page {
    background:
        radial-gradient(circle at 18% 8%, rgba(20, 184, 166, 0.2), transparent 30%),
        radial-gradient(circle at 86% 16%, rgba(245, 158, 11, 0.14), transparent 28%),
        linear-gradient(135deg, #08111f 0%, #0f172a 46%, #111827 100%);
    color: #e5e7eb;
}

.game-topbar {
    display: grid;
    grid-template-columns: 120px 1fr 120px;
    align-items: center;
    gap: 12px;
}

.nav-button,
.primary-action,
.secondary-action,
.ghost-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 650;
    transition:
        transform 160ms ease,
        border-color 160ms ease,
        background 160ms ease,
        color 160ms ease;
}

.nav-button {
    width: max-content;
    padding: 8px 10px;
    color: #a7b0c0;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.52);
}

.nav-button:hover,
.ghost-action:hover {
    color: #ffffff;
    border-color: rgba(226, 232, 240, 0.34);
}

.title-block {
    text-align: center;
}

.title-block h1 {
    margin: 0;
    font-size: clamp(24px, 4vw, 36px);
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: 0;
    color: #f8fafc;
    text-shadow: 0 10px 32px rgba(16, 185, 129, 0.2);
}

.title-block span {
    display: block;
    margin-top: 4px;
    color: #8ea1b7;
    font-size: 13px;
    letter-spacing: 0;
}

.score-strip {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    padding: 9px 14px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.62);
    box-shadow: 0 16px 40px rgba(2, 6, 23, 0.28);
    backdrop-filter: blur(12px);
}

.score-item {
    display: inline-grid;
    grid-template-columns: 16px auto auto;
    align-items: center;
    gap: 7px;
    min-width: 104px;
}

.score-icon {
    width: 16px;
    height: 16px;
}

.score-label {
    color: #94a3b8;
    font-size: 13px;
}

.score-value {
    min-width: 42px;
    text-align: right;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
    font-size: 18px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
}

.score-divider {
    width: 1px;
    height: 26px;
    background: rgba(148, 163, 184, 0.24);
}

.board-shell {
    position: relative;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid rgba(226, 232, 240, 0.14);
    background: linear-gradient(135deg, rgba(248, 250, 252, 0.1), rgba(148, 163, 184, 0.03)), rgba(15, 23, 42, 0.56);
    box-shadow:
        0 24px 70px rgba(2, 6, 23, 0.42),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.game-canvas {
    display: block;
    width: min(96vw, 610px);
    height: auto;
    max-height: 76vh;
    border-radius: 8px;
    cursor: pointer;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.action-bar {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
}

.primary-action,
.secondary-action,
.ghost-action {
    min-height: 36px;
    padding: 8px 13px;
}

.primary-action {
    color: #052e1a;
    border: 1px solid rgba(134, 239, 172, 0.68);
    background: linear-gradient(180deg, #a7f3d0, #34d399);
    box-shadow: 0 12px 28px rgba(16, 185, 129, 0.22);
}

.secondary-action {
    color: #dff7ff;
    border: 1px solid rgba(125, 211, 252, 0.36);
    background: rgba(14, 116, 144, 0.5);
}

.ghost-action {
    color: #cbd5e1;
    border: 1px solid rgba(148, 163, 184, 0.22);
    background: rgba(30, 41, 59, 0.62);
}

.primary-action:hover,
.secondary-action:hover,
.ghost-action:hover,
.nav-button:hover {
    transform: translateY(-1px);
}

.primary-action:active,
.secondary-action:active,
.ghost-action:active,
.nav-button:active {
    transform: translateY(0);
}

@media (max-width: 640px) {
    .game-topbar {
        grid-template-columns: auto 1fr;
    }

    .topbar-spacer {
        display: none;
    }

    .title-block {
        text-align: right;
    }

    .board-shell {
        padding: 6px;
    }

    .score-strip {
        width: min(96vw, 360px);
        justify-content: center;
    }
}
</style>
