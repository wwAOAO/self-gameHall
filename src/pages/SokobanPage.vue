<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, ChevronLeft, ChevronRight, Play, RotateCcw, Undo2 } from 'lucide-vue-next';
import { useSokoban } from '@/composables/useSokoban';

const router = useRouter();
const game = useSokoban();
const canvasRef = ref<HTMLCanvasElement | null>(null);

let renderRaf: number | null = null;

function renderLoop() {
    const canvas = canvasRef.value;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    game.draw(ctx);
}

function startRender() {
    renderLoop();
    renderRaf = requestAnimationFrame(startRender);
}

function handleCanvasClick() {
    if (game.gameStatus.value === 'idle') {
        game.startGame();
    }
}

onMounted(() => {
    startRender();
    window.addEventListener('keydown', game.handleKeydown);
});

onUnmounted(() => {
    if (renderRaf !== null) cancelAnimationFrame(renderRaf);
    window.removeEventListener('keydown', game.handleKeydown);
});
</script>

<template>
    <div
        class="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800 flex flex-col items-center select-none"
    >
        <header class="pt-4 pb-1 w-full max-w-xl px-4">
            <div class="flex items-center gap-3">
                <button
                    class="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors duration-200 text-sm"
                    @click="router.push('/')"
                >
                    <ArrowLeft class="w-4 h-4" /> 返回
                </button>
                <h1 class="text-xl sm:text-2xl font-bold tracking-tight flex-1 text-center mr-10">
                    <span class="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent"
                        >推箱子</span
                    >
                    <span class="text-gray-600 text-base ml-2">Sokoban</span>
                </h1>
            </div>
        </header>

        <main class="flex-1 flex flex-col items-center gap-3 pb-8 px-2">
            <div
                class="flex flex-wrap items-center justify-center gap-4 bg-gray-800/60 rounded-xl px-5 py-2.5 border border-gray-700/50"
            >
                <button
                    class="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-all duration-200 active:scale-95"
                    title="上一关"
                    @click="game.previousLevel()"
                >
                    <ChevronLeft class="w-4 h-4" />
                </button>
                <div class="flex items-center gap-1.5">
                    <span class="text-gray-400 text-sm">关卡</span>
                    <span class="font-mono text-lg font-bold text-amber-400 tabular-nums">{{
                        game.currentLevelIndex.value + 1
                    }}</span>
                    <span class="text-gray-600 text-sm">/ {{ game.levelsCount }}</span>
                </div>
                <button
                    class="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-all duration-200 active:scale-95"
                    title="下一关"
                    @click="game.nextLevel()"
                >
                    <ChevronRight class="w-4 h-4" />
                </button>
                <div class="w-px h-6 bg-gray-700/50 hidden sm:block"></div>
                <div class="flex items-center gap-1.5">
                    <span class="text-gray-400 text-sm">步数</span>
                    <span class="font-mono text-lg font-bold text-orange-400 tabular-nums">{{ game.moves.value }}</span>
                </div>
                <div class="flex items-center gap-1.5">
                    <span class="text-gray-400 text-sm">推箱</span>
                    <span class="font-mono text-lg font-bold text-sky-400 tabular-nums">{{ game.pushes.value }}</span>
                </div>
                <div class="flex items-center gap-1.5">
                    <span class="text-gray-400 text-sm">剩余</span>
                    <span class="font-mono text-lg font-bold text-emerald-400 tabular-nums">{{
                        game.boxesLeft.value
                    }}</span>
                </div>
            </div>

            <div
                v-if="game.deadlockedBoxes.value.length > 0 && game.gameStatus.value === 'playing'"
                class="text-xs text-red-300 bg-red-950/40 border border-red-700/40 rounded-lg px-3 py-1.5"
            >
                有箱子可能卡在死角了，可以撤销调整路线。
            </div>

            <div class="relative bg-gray-800/60 rounded-lg border border-gray-700/50 p-2 shadow-lg shadow-black/20">
                <canvas
                    ref="canvasRef"
                    :width="game.width.value"
                    :height="game.height.value"
                    class="rounded cursor-pointer max-w-[94vw]"
                    @click="handleCanvasClick"
                ></canvas>

                <div
                    v-if="game.gameStatus.value === 'idle'"
                    class="absolute inset-0 flex items-center justify-center bg-black/40 rounded pointer-events-none"
                >
                    <div class="text-center pointer-events-auto">
                        <p class="text-gray-300 text-sm mb-3">点击棋盘或按 Enter 开始</p>
                        <button
                            class="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white transition-all duration-200 active:scale-95 shadow-lg shadow-amber-600/30"
                            @click="game.startGame()"
                        >
                            <Play class="w-4 h-4" /> 开始游戏
                        </button>
                    </div>
                </div>

                <div
                    v-if="game.gameStatus.value === 'won'"
                    class="absolute inset-0 flex items-center justify-center bg-black/50 rounded backdrop-blur-sm"
                >
                    <div class="text-center">
                        <p class="text-amber-400 font-bold text-lg mb-1">过关！</p>
                        <p class="text-gray-300 text-sm mb-1">
                            步数 {{ game.moves.value }}，推箱 {{ game.pushes.value }}
                        </p>
                        <p class="text-gray-500 text-xs mb-3">
                            关卡 {{ game.currentLevelIndex.value + 1 }} / {{ game.levelsCount }}
                        </p>
                        <div class="flex gap-2 justify-center">
                            <button
                                class="px-4 py-1.5 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-500 text-white transition-all duration-200 active:scale-95"
                                @click="game.nextLevel()"
                            >
                                下一关
                            </button>
                            <button
                                class="inline-flex items-center gap-1 px-4 py-1.5 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-200 transition-all duration-200 active:scale-95"
                                @click="game.undo()"
                            >
                                <Undo2 class="w-4 h-4" /> 撤销
                            </button>
                            <button
                                class="inline-flex items-center gap-1 px-4 py-1.5 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white transition-all duration-200 active:scale-95"
                                @click="game.resetLevel()"
                            >
                                <RotateCcw class="w-4 h-4" /> 重玩
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="flex flex-wrap justify-center gap-2">
                <button
                    class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 transition-all duration-200 active:scale-95"
                    :disabled="!game.canUndo.value"
                    @click="game.undo()"
                >
                    <Undo2 class="w-4 h-4" /> 撤销
                </button>
                <button
                    v-if="game.gameStatus.value !== 'idle'"
                    class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 transition-all duration-200 active:scale-95"
                    @click="game.resetLevel()"
                >
                    <RotateCcw class="w-4 h-4" /> 重置
                </button>
                <button
                    class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white transition-all duration-200 active:scale-95"
                    @click="game.startGame(game.currentLevelIndex.value)"
                >
                    <Play class="w-4 h-4" /> {{ game.gameStatus.value === 'idle' ? '开始' : '重新开始' }}
                </button>
            </div>

            <div class="text-gray-500 text-xs text-center leading-relaxed">
                <p>方向键 / WASD 移动，U / Ctrl+Z 撤销，R 重置，N / P 切换关卡。</p>
                <p>把所有箱子推到红色目标点即可过关。</p>
            </div>
        </main>
    </div>
</template>
