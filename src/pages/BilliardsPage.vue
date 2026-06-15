<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Play, RotateCcw } from 'lucide-vue-next';
import { useBilliards } from '@/composables/useBilliards';

const router = useRouter();
const game = useBilliards();
const canvasRef = ref<HTMLCanvasElement | null>(null);

let renderRaf: number | null = null;

function renderLoop() {
    const canvas = canvasRef.value;
    const ctx = canvas?.getContext('2d');
    if (ctx) game.draw(ctx);
    renderRaf = requestAnimationFrame(renderLoop);
}

function handlePointerDown(event: PointerEvent) {
    const canvas = canvasRef.value;
    if (!canvas) return;
    game.pointerDown(canvas, event);
}

function handlePointerMove(event: PointerEvent) {
    const canvas = canvasRef.value;
    if (!canvas) return;
    game.pointerMove(canvas, event);
}

function handlePointerUp(event: PointerEvent) {
    const canvas = canvasRef.value;
    if (!canvas) return;
    game.pointerUp(canvas, event);
}

onMounted(() => {
    game.startGame();
    renderLoop();
});

onUnmounted(() => {
    if (renderRaf) cancelAnimationFrame(renderRaf);
});
</script>

<template>
    <div
        class="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-emerald-950 flex flex-col items-center select-none"
    >
        <header class="pt-4 pb-1 w-full max-w-5xl px-4">
            <div class="flex items-center gap-3">
                <button
                    class="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors duration-200 text-sm"
                    @click="router.push('/')"
                >
                    <ArrowLeft class="w-4 h-4" /> 返回
                </button>
                <h1 class="text-xl sm:text-2xl font-bold tracking-tight flex-1 text-center mr-10">
                    <span class="bg-gradient-to-r from-emerald-300 to-lime-300 bg-clip-text text-transparent"
                        >台球</span
                    >
                    <span class="text-gray-600 text-base ml-2">Billiards</span>
                </h1>
            </div>
        </header>

        <main class="flex-1 flex flex-col items-center gap-3 pb-8 px-2 w-full">
            <div
                class="flex flex-wrap items-center justify-center gap-4 bg-gray-900/70 rounded-xl px-5 py-2.5 border border-emerald-700/30"
            >
                <div class="flex items-center gap-1.5">
                    <span class="text-gray-400 text-sm">回合</span>
                    <span
                        class="font-bold text-sm"
                        :class="game.isPlayerTurn.value ? 'text-emerald-300' : 'text-blue-300'"
                    >
                        {{ game.turnLabel.value }}
                    </span>
                </div>
                <div class="w-px h-6 bg-gray-700/70"></div>
                <div class="flex items-center gap-1.5">
                    <span class="text-gray-400 text-sm">玩家</span>
                    <span class="font-mono text-lg font-bold text-emerald-300 tabular-nums">{{
                        game.playerScore.value
                    }}</span>
                </div>
                <div class="text-gray-500 text-sm">:</div>
                <div class="flex items-center gap-1.5">
                    <span class="text-gray-400 text-sm">AI</span>
                    <span class="font-mono text-lg font-bold text-blue-300 tabular-nums">{{ game.aiScore.value }}</span>
                </div>
                <div class="w-px h-6 bg-gray-700/70"></div>
                <div class="flex items-center gap-1.5">
                    <span class="text-gray-400 text-sm">玩家杆</span>
                    <span class="font-mono text-lg font-bold text-lime-300 tabular-nums">{{ game.shots.value }}</span>
                </div>
                <div class="w-px h-6 bg-gray-700/70"></div>
                <div class="flex items-center gap-1.5">
                    <span class="text-gray-400 text-sm">AI杆</span>
                    <span class="font-mono text-lg font-bold text-sky-300 tabular-nums">{{ game.aiShots.value }}</span>
                </div>
                <div class="w-px h-6 bg-gray-700/70"></div>
                <div class="flex items-center gap-1.5">
                    <span class="text-gray-400 text-sm">犯规</span>
                    <span class="font-mono text-lg font-bold text-rose-300 tabular-nums">{{ game.fouls.value }}</span>
                </div>
                <div class="w-px h-6 bg-gray-700/70"></div>
                <div class="flex items-center gap-1.5">
                    <span class="text-gray-400 text-sm">最高</span>
                    <span class="font-mono text-lg font-bold text-yellow-300 tabular-nums">{{
                        game.highScore.value
                    }}</span>
                </div>
            </div>

            <div
                class="relative w-full max-w-5xl rounded-lg border border-emerald-700/30 bg-gray-950/70 p-2 shadow-lg shadow-black/30"
            >
                <canvas
                    ref="canvasRef"
                    :width="game.width"
                    :height="game.height"
                    class="block w-full rounded touch-none"
                    :class="game.isPlayerTurn.value && !game.moving.value ? 'cursor-crosshair' : 'cursor-wait'"
                    @pointerdown="handlePointerDown"
                    @pointermove="handlePointerMove"
                    @pointerup="handlePointerUp"
                    @pointercancel="handlePointerUp"
                ></canvas>

                <div
                    v-if="game.gameStatus.value === 'won'"
                    class="absolute inset-2 flex items-center justify-center bg-black/55 rounded backdrop-blur-sm"
                >
                    <div class="text-center">
                        <p class="text-emerald-200 font-bold text-xl mb-1">
                            {{ game.winner.value === 'player' ? '玩家获胜' : 'AI 获胜' }}
                        </p>
                        <p class="text-gray-300 text-sm mb-3">
                            玩家 {{ game.playerScore.value }} : {{ game.aiScore.value }} AI
                        </p>
                        <button
                            class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-all duration-200 active:scale-95"
                            @click="game.startGame()"
                        >
                            <RotateCcw class="w-4 h-4" /> 再来一局
                        </button>
                    </div>
                </div>
            </div>

            <div class="flex gap-2">
                <button
                    class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-emerald-700 hover:bg-emerald-600 text-emerald-50 transition-all duration-200 active:scale-95"
                    @click="game.startGame()"
                >
                    <RotateCcw class="w-4 h-4" /> 重新开局
                </button>
                <button
                    v-if="game.gameStatus.value !== 'playing'"
                    class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-lime-600 hover:bg-lime-500 text-white transition-all duration-200 active:scale-95"
                    @click="game.startGame()"
                >
                    <Play class="w-4 h-4" /> 开始
                </button>
            </div>

            <div class="text-gray-500 text-xs text-center leading-relaxed">
                <p>玩家回合按住白球附近拖拽瞄准，松手击球。进球可继续出杆，未进球或白球入袋换 AI。</p>
            </div>
        </main>
    </div>
</template>
