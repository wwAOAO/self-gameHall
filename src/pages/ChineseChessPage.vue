<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useChineseChess } from '@/composables/useChineseChess';
import { ArrowLeft, Play, RotateCcw } from 'lucide-vue-next';

const router = useRouter();
const game = useChineseChess();
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
    game.clearAITimer();
});

function handleCanvasClick(e: MouseEvent) {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    if (game.gameStatus.value === 'idle') return;

    game.handleClick(mx, my);
}

function getLastMoves() {
    return game.moveHistory.value.slice(-8);
}
</script>

<template>
    <div class="chess-screen min-h-screen flex flex-col select-none overflow-hidden" style="height: 100dvh">
        <header class="shrink-0 pt-3 pb-2 w-full max-w-5xl mx-auto px-3">
            <div class="flex items-center gap-3">
                <button class="nav-button" @click="router.push('/')"><ArrowLeft class="w-4 h-4" /> 返回</button>
                <h1 class="flex-1 text-center mr-10 text-xl sm:text-2xl font-black tracking-normal">
                    <span class="text-[#f6d28a]">中国象棋</span>
                    <span class="text-[#9b8a70] text-sm sm:text-base ml-2 font-semibold">Chinese Chess</span>
                </h1>
            </div>
        </header>

        <main
            class="flex-1 flex flex-col items-center overflow-hidden px-2"
            style="max-width: 940px; margin: 0 auto; width: 100%"
        >
            <div class="status-bar shrink-0">
                <div class="turn-chip" :class="game.currentSide.value === 'red' ? 'is-red' : 'is-black'">
                    <span class="turn-dot"></span>
                    <span>{{ game.currentSide.value === 'red' ? '红方' : '黑方' }}</span>
                </div>
                <span class="status-text">{{ game.message.value || '准备开局' }}</span>
            </div>

            <div class="difficulty-switch shrink-0" role="group" aria-label="AI 难度">
                <button
                    class="difficulty-option"
                    :class="{ active: game.difficulty.value === 'easy' }"
                    @click="game.setDifficulty('easy')"
                >
                    简单
                </button>
                <button
                    class="difficulty-option"
                    :class="{ active: game.difficulty.value === 'hard' }"
                    @click="game.setDifficulty('hard')"
                >
                    困难
                </button>
            </div>

            <div class="flex-1 flex items-start gap-3 min-h-0 w-full justify-center">
                <div class="board-shell relative shrink-0">
                    <canvas
                        ref="canvasRef"
                        :width="game.getWidth()"
                        :height="game.getHeight()"
                        class="chess-canvas cursor-pointer"
                        @click="handleCanvasClick"
                    ></canvas>

                    <div
                        v-if="game.gameStatus.value === 'idle'"
                        class="absolute inset-0 flex items-center justify-center bg-[#120d09]/55 rounded-lg pointer-events-none backdrop-blur-[2px]"
                    >
                        <div class="start-panel pointer-events-auto">
                            <p class="text-[#f7dca3] text-lg font-bold mb-1">红先黑后</p>
                            <button class="primary-button" @click="game.startGame()">
                                <Play class="w-4 h-4" /> 开始
                            </button>
                        </div>
                    </div>

                    <div
                        v-if="game.gameStatus.value === 'ended'"
                        class="absolute inset-0 flex items-center justify-center bg-[#120d09]/65 rounded-lg backdrop-blur-sm"
                    >
                        <div class="start-panel">
                            <p
                                class="text-xl font-black mb-3"
                                :class="game.message.value.includes('你') ? 'text-emerald-300' : 'text-[#ffb45f]'"
                            >
                                {{ game.message.value }}
                            </p>
                            <button class="primary-button" @click="game.startGame()">
                                <RotateCcw class="w-4 h-4" /> 再来
                            </button>
                        </div>
                    </div>
                </div>

                <div v-if="game.gameStatus.value !== 'idle'" class="move-panel shrink-0 hidden sm:block">
                    <p class="text-[#b99c72] text-xs font-bold mb-2 text-center">棋谱</p>
                    <div
                        v-for="(entry, i) in getLastMoves()"
                        :key="i"
                        class="move-entry"
                        :class="entry.startsWith('红') ? 'is-red' : 'is-black'"
                    >
                        {{ entry }}
                    </div>
                </div>
            </div>

            <div class="shrink-0 pb-3 pt-2 flex gap-2">
                <button v-if="game.gameStatus.value !== 'idle'" class="secondary-button" @click="game.startGame()">
                    <RotateCcw class="w-4 h-4" /> 重开
                </button>
            </div>
        </main>
    </div>
</template>

<style scoped>
.chess-screen {
    background:
        linear-gradient(135deg, rgba(49, 23, 16, 0.42), transparent 36%),
        linear-gradient(225deg, rgba(16, 54, 48, 0.32), transparent 40%), #15120f;
    color: #f4dfbd;
}

.nav-button,
.secondary-button,
.primary-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    border-radius: 0.5rem;
    transition:
        transform 160ms ease,
        border-color 160ms ease,
        background 160ms ease,
        color 160ms ease;
}

.nav-button {
    color: #b9aa91;
    font-size: 0.875rem;
    padding: 0.375rem 0.625rem;
}

.nav-button:hover {
    color: #ffe2a1;
    background: rgba(255, 226, 161, 0.08);
}

.status-bar {
    width: min(100%, 560px);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    min-height: 2.35rem;
    margin-bottom: 0.45rem;
    padding: 0.35rem 0.7rem;
    border: 1px solid rgba(213, 161, 86, 0.28);
    border-radius: 0.5rem;
    background: rgba(34, 25, 19, 0.78);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.24);
}

.turn-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.38rem;
    min-width: 4.25rem;
    font-size: 0.8rem;
    font-weight: 800;
}

.turn-dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 999px;
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.07);
}

.turn-chip.is-red {
    color: #ffb0a0;
}

.turn-chip.is-red .turn-dot {
    background: #dd3e32;
}

.turn-chip.is-black {
    color: #d5c9b5;
}

.turn-chip.is-black .turn-dot {
    background: #24201d;
    border: 1px solid #7b6d5d;
}

.status-text {
    color: #f1d9ad;
    font-size: 0.875rem;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.difficulty-switch {
    display: inline-grid;
    grid-template-columns: repeat(2, 4.75rem);
    gap: 0.25rem;
    margin-bottom: 0.5rem;
    padding: 0.2rem;
    border: 1px solid rgba(213, 161, 86, 0.24);
    border-radius: 0.5rem;
    background: rgba(26, 21, 17, 0.82);
}

.difficulty-option {
    height: 2rem;
    border-radius: 0.375rem;
    color: #cdbb9e;
    font-size: 0.8rem;
    font-weight: 900;
    transition:
        background 160ms ease,
        color 160ms ease,
        transform 160ms ease;
}

.difficulty-option:hover {
    color: #ffe2a1;
    background: rgba(255, 226, 161, 0.08);
}

.difficulty-option.active {
    color: #25120a;
    background: linear-gradient(180deg, #ffd98a, #d99032);
    box-shadow: 0 6px 16px rgba(217, 144, 50, 0.24);
}

.board-shell {
    padding: 0.55rem;
    border-radius: 0.625rem;
    border: 1px solid rgba(246, 205, 132, 0.28);
    background: linear-gradient(180deg, #392216, #1c1714);
    box-shadow:
        0 26px 60px rgba(0, 0, 0, 0.48),
        inset 0 1px 0 rgba(255, 244, 206, 0.2);
}

.chess-canvas {
    display: block;
    width: min(100vw - 1.6rem, 512px);
    height: auto;
    border-radius: 0.45rem;
    box-shadow:
        inset 0 0 0 1px rgba(75, 35, 13, 0.6),
        0 12px 26px rgba(0, 0, 0, 0.28);
}

.start-panel {
    width: min(72%, 260px);
    padding: 1rem;
    border-radius: 0.625rem;
    border: 1px solid rgba(246, 205, 132, 0.28);
    background: rgba(31, 20, 14, 0.86);
    text-align: center;
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.36);
}

.primary-button {
    margin: 0.25rem auto 0;
    min-width: 7.25rem;
    padding: 0.6rem 1rem;
    color: #220c08;
    font-size: 0.925rem;
    font-weight: 900;
    background: linear-gradient(180deg, #ffd98a, #d99032);
    box-shadow: 0 8px 22px rgba(217, 144, 50, 0.3);
}

.primary-button:hover {
    transform: translateY(-1px);
    background: linear-gradient(180deg, #ffe4a4, #e7a142);
}

.secondary-button {
    padding: 0.45rem 0.85rem;
    border: 1px solid rgba(214, 168, 100, 0.28);
    color: #e8d1a9;
    font-size: 0.875rem;
    font-weight: 800;
    background: rgba(45, 34, 25, 0.86);
}

.secondary-button:hover {
    background: rgba(70, 49, 33, 0.92);
}

.move-panel {
    width: 146px;
    max-height: 500px;
    overflow-y: auto;
    padding: 0.65rem;
    border: 1px solid rgba(213, 161, 86, 0.25);
    border-radius: 0.5rem;
    background: rgba(29, 23, 19, 0.82);
    box-shadow: 0 16px 34px rgba(0, 0, 0, 0.32);
}

.move-entry {
    padding: 0.25rem 0.38rem;
    border-radius: 0.35rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.7rem;
    line-height: 1.35;
    margin-bottom: 0.25rem;
}

.move-entry.is-red {
    color: #ffb3a6;
    background: rgba(150, 37, 27, 0.24);
}

.move-entry.is-black {
    color: #d8cab4;
    background: rgba(255, 230, 182, 0.08);
}

@media (max-width: 640px) {
    .status-bar {
        width: min(100%, 512px);
    }

    .board-shell {
        padding: 0.35rem;
    }
}
</style>
