<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Play, RotateCcw, Shield, Swords } from 'lucide-vue-next';
import { useMilitaryChess } from '@/composables/useMilitaryChess';

const router = useRouter();
const game = useMilitaryChess();
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

function handleCanvasClick(event: MouseEvent) {
    const canvas = canvasRef.value;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (event.clientX - rect.left) * scaleX;
    const my = (event.clientY - rect.top) * scaleY;
    game.handleClick(mx, my);
}
</script>

<template>
    <div class="military-page min-h-screen flex flex-col select-none overflow-hidden" style="height: 100dvh">
        <header class="shrink-0 w-full max-w-7xl mx-auto px-3 pt-3 pb-2">
            <div class="flex items-center gap-3">
                <button class="icon-text-button" @click="router.push('/')"><ArrowLeft class="w-4 h-4" /> 返回</button>
                <h1 class="flex-1 text-center text-lg sm:text-xl font-black tracking-tight mr-10">
                    <span class="text-sky-100">四人军棋</span>
                    <span class="text-slate-500 text-base ml-2">3 AI 混战</span>
                </h1>
            </div>
        </header>

        <main
            class="flex-1 min-h-0 w-full max-w-7xl mx-auto px-3 pb-3 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-3"
        >
            <section class="min-h-0 flex items-center justify-center">
                <div class="board-shell relative">
                    <canvas
                        ref="canvasRef"
                        :width="game.getWidth()"
                        :height="game.getHeight()"
                        class="war-canvas"
                        @click="handleCanvasClick"
                    ></canvas>

                    <div
                        v-if="game.gameStatus.value === 'idle'"
                        class="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-950/58 backdrop-blur-sm"
                    >
                        <div class="start-panel">
                            <Shield class="w-9 h-9 text-sky-200 mx-auto mb-3" />
                            <p class="text-slate-200 text-sm mb-4">你执蓝方，红绿黄三方由 AI 控制</p>
                            <button class="primary-button" @click="game.startGame()">
                                <Play class="w-4 h-4" /> 开始混战
                            </button>
                        </div>
                    </div>

                    <div
                        v-if="game.gameStatus.value === 'ended'"
                        class="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-950/62 backdrop-blur-sm"
                    >
                        <div class="start-panel">
                            <Swords
                                class="w-9 h-9 mx-auto mb-3"
                                :class="game.winner.value === 'blue' ? 'text-emerald-300' : 'text-rose-300'"
                            />
                            <p
                                class="text-lg font-black mb-4"
                                :class="game.winner.value === 'blue' ? 'text-emerald-300' : 'text-rose-300'"
                            >
                                {{ game.message.value }}
                            </p>
                            <button class="primary-button" @click="game.startGame()">
                                <RotateCcw class="w-4 h-4" /> 再来一局
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <aside class="info-panel">
                <div class="status-card">
                    <p class="eyebrow">当前局势</p>
                    <p class="status-text">{{ game.message.value }}</p>
                </div>

                <div class="side-grid">
                    <div
                        v-for="side in game.sides.value"
                        :key="side.side"
                        class="side-cell"
                        :class="[
                            { active: game.currentSide.value === side.side, eliminated: side.eliminated },
                            side.side,
                        ]"
                    >
                        <span class="side-dot" :style="{ backgroundColor: side.color }"></span>
                        <div>
                            <strong>{{ side.name }}</strong>
                            <small>{{ side.eliminated ? '出局' : `${side.pieces} 子` }}</small>
                        </div>
                    </div>
                </div>

                <button v-if="game.gameStatus.value !== 'idle'" class="secondary-button" @click="game.startGame()">
                    <RotateCcw class="w-4 h-4" /> 重新开始
                </button>

                <div class="history-box">
                    <p class="eyebrow">战报</p>
                    <div v-if="game.history.value.length === 0" class="empty-history">暂无交战</div>
                    <div v-for="(item, index) in game.history.value" :key="index" class="history-item">
                        {{ item }}
                    </div>
                </div>
            </aside>
        </main>
    </div>
</template>

<style scoped>
.military-page {
    background:
        linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(18, 48, 39, 0.96) 48%, rgba(56, 36, 38, 0.94)),
        radial-gradient(circle at 50% 18%, rgba(14, 165, 233, 0.14), transparent 34%);
    color: #e5edf5;
}

.icon-text-button,
.primary-button,
.secondary-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    transition:
        transform 0.16s ease,
        background 0.16s ease,
        color 0.16s ease,
        border-color 0.16s ease;
}

.icon-text-button {
    color: #94a3b8;
    font-size: 0.875rem;
}

.icon-text-button:hover {
    color: #ffffff;
}

.primary-button {
    border-radius: 0.75rem;
    background: #0369a1;
    color: white;
    min-height: 2.5rem;
    padding: 0 1.1rem;
    font-weight: 800;
    box-shadow: 0 14px 34px rgba(2, 132, 199, 0.28);
}

.primary-button:hover {
    background: #0284c7;
}

.secondary-button {
    width: 100%;
    border-radius: 0.7rem;
    border: 1px solid rgba(148, 163, 184, 0.22);
    background: rgba(15, 23, 42, 0.64);
    color: #cbd5e1;
    min-height: 2.35rem;
    font-weight: 750;
}

.secondary-button:hover {
    border-color: rgba(125, 211, 252, 0.5);
    color: white;
}

.primary-button:active,
.secondary-button:active {
    transform: scale(0.97);
}

.board-shell {
    border-radius: 0.85rem;
    border: 1px solid rgba(148, 163, 184, 0.24);
    background: rgba(15, 23, 42, 0.54);
    padding: 0.45rem;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.34);
    max-height: 100%;
}

.war-canvas {
    display: block;
    width: min(100%, 734px);
    max-height: calc(100dvh - 6.8rem);
    aspect-ratio: 1 / 1;
    border-radius: 0.65rem;
    cursor: pointer;
}

.start-panel {
    width: min(78%, 280px);
    text-align: center;
    border-radius: 0.85rem;
    border: 1px solid rgba(148, 163, 184, 0.24);
    background: rgba(15, 23, 42, 0.78);
    padding: 1.25rem;
}

.info-panel {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.status-card,
.history-box {
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(15, 23, 42, 0.62);
    padding: 0.85rem;
}

.eyebrow {
    color: #7dd3fc;
    font-size: 0.72rem;
    font-weight: 850;
    letter-spacing: 0;
    margin-bottom: 0.35rem;
}

.status-text {
    min-height: 2.7rem;
    color: #f8fafc;
    font-weight: 850;
    line-height: 1.35;
}

.side-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.55rem;
}

.side-cell {
    min-height: 4rem;
    border-radius: 0.7rem;
    padding: 0.72rem;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.58);
    display: flex;
    align-items: center;
    gap: 0.62rem;
}

.side-cell.active {
    border-color: rgba(125, 211, 252, 0.74);
    box-shadow: inset 0 0 0 1px rgba(125, 211, 252, 0.22);
}

.side-cell.eliminated {
    opacity: 0.48;
}

.side-dot {
    width: 0.82rem;
    height: 0.82rem;
    border-radius: 999px;
    box-shadow: 0 0 18px currentColor;
    flex: 0 0 auto;
}

.side-cell strong,
.side-cell small {
    display: block;
}

.side-cell strong {
    color: #f8fafc;
    font-weight: 900;
    line-height: 1.2;
}

.side-cell small {
    color: #94a3b8;
    margin-top: 0.18rem;
    font-size: 0.76rem;
    font-weight: 750;
}

.history-box {
    flex: 1;
    min-height: 8rem;
    overflow: hidden;
}

.history-item,
.empty-history {
    border-top: 1px solid rgba(148, 163, 184, 0.12);
    color: #cbd5e1;
    font-size: 0.82rem;
    line-height: 1.35;
    padding: 0.48rem 0;
}

.empty-history {
    color: #64748b;
}

@media (max-width: 1023px) {
    .info-panel {
        display: grid;
        grid-template-columns: 1fr 1fr;
        align-items: start;
    }

    .side-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        grid-column: 1 / -1;
    }

    .history-box {
        grid-column: 1 / -1;
        max-height: 8.5rem;
        overflow: auto;
    }
}

@media (max-width: 640px) {
    .war-canvas {
        width: min(100%, calc(100vw - 2rem));
        max-height: calc(100dvh - 17rem);
    }

    .info-panel {
        grid-template-columns: 1fr;
        gap: 0.55rem;
    }

    .side-grid {
        grid-template-columns: 1fr 1fr;
    }

    .history-box {
        display: none;
    }

    .status-card {
        padding: 0.65rem;
    }

    .status-text {
        min-height: auto;
        font-size: 0.9rem;
    }
}
</style>
