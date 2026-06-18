<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useGomoku } from '@/composables/useGomoku';
import { ArrowLeft, Play, RotateCcw } from 'lucide-vue-next';

const router = useRouter();
const game = useGomoku();
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

function handleCanvasMove(e: MouseEvent) {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    game.handleHover(mx, my);
}

function handleCanvasLeave() {
    game.handleHover(-999, -999);
}
</script>

<template>
    <div
        class="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800 flex flex-col select-none overflow-hidden"
        style="height: 100dvh"
    >
        <header class="shrink-0 pt-3 pb-1 w-full max-w-3xl mx-auto px-3">
            <div class="flex items-center gap-3">
                <button
                    class="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors duration-200 text-sm"
                    @click="router.push('/')"
                >
                    <ArrowLeft class="w-4 h-4" /> 返回
                </button>
                <h1 class="text-lg sm:text-xl font-bold tracking-tight flex-1 text-center mr-10">
                    <span class="bg-gradient-to-r from-amber-500 to-yellow-600 bg-clip-text text-transparent"
                        >五子棋</span
                    >
                    <span class="text-gray-600 text-base ml-2">Gomoku</span>
                </h1>
            </div>
        </header>

        <main
            class="flex-1 flex flex-col items-center overflow-hidden px-2"
            style="max-width: 600px; margin: 0 auto; width: 100%"
        >
            <div
                class="shrink-0 flex items-center gap-4 bg-gray-800/60 rounded-xl px-4 py-1.5 border border-gray-700/50 text-sm mb-1"
            >
                <div class="flex items-center gap-1.5">
                    <div
                        class="w-3 h-3 rounded-full"
                        :class="
                            game.currentPlayer.value === 1
                                ? 'bg-gray-900 border border-gray-600'
                                : 'bg-white border border-gray-500'
                        "
                    ></div>
                    <span class="text-gray-300 font-medium">{{ game.message.value }}</span>
                </div>
                <div class="h-4 w-px bg-gray-700/80"></div>
                <span
                    class="text-xs font-medium"
                    :class="game.difficulty.value === 'hard' ? 'text-amber-300' : 'text-emerald-300'"
                >
                    {{ game.difficulty.value === 'hard' ? '困难' : '简单' }}
                </span>
            </div>

            <div class="flex-1 flex items-center min-h-0">
                <div
                    class="relative bg-gray-800/60 rounded-lg border border-gray-700/50 p-1.5 shadow-lg shadow-black/20"
                >
                    <canvas
                        ref="canvasRef"
                        :width="game.getWidth()"
                        :height="game.getHeight()"
                        class="rounded cursor-pointer"
                        @click="handleCanvasClick"
                        @mousemove="handleCanvasMove"
                        @mouseleave="handleCanvasLeave"
                    ></canvas>

                    <div
                        v-if="game.gameStatus.value === 'idle'"
                        class="absolute inset-0 flex items-center justify-center bg-black/40 rounded pointer-events-none"
                    >
                        <div class="text-center pointer-events-auto">
                            <p v-if="game.playerColor.value === 1" class="text-gray-300 text-sm mb-1">
                                你选择先手（黑棋）
                            </p>
                            <p v-else class="text-gray-300 text-sm mb-1">你选择后手（白棋）</p>
                            <div class="flex gap-2 mb-3 justify-center">
                                <button
                                    class="px-3 py-1 rounded text-xs font-medium"
                                    :class="
                                        game.playerColor.value === 1
                                            ? 'bg-gray-900 text-white ring-2 ring-amber-400'
                                            : 'bg-gray-700 text-gray-400'
                                    "
                                    @click="game.playerColor.value = 1"
                                >
                                    先手 · 黑棋
                                </button>
                                <button
                                    class="px-3 py-1 rounded text-xs font-medium"
                                    :class="
                                        game.playerColor.value === 2
                                            ? 'bg-white text-gray-900 ring-2 ring-amber-400'
                                            : 'bg-gray-700 text-gray-400'
                                    "
                                    @click="game.playerColor.value = 2"
                                >
                                    后手 · 白棋
                                </button>
                            </div>
                            <div class="flex gap-2 mb-3 justify-center">
                                <button
                                    class="px-3 py-1 rounded text-xs font-medium"
                                    :class="
                                        game.difficulty.value === 'easy'
                                            ? 'bg-emerald-700 text-white ring-2 ring-emerald-300'
                                            : 'bg-gray-700 text-gray-400'
                                    "
                                    @click="game.difficulty.value = 'easy'"
                                >
                                    简单
                                </button>
                                <button
                                    class="px-3 py-1 rounded text-xs font-medium"
                                    :class="
                                        game.difficulty.value === 'hard'
                                            ? 'bg-amber-700 text-white ring-2 ring-amber-300'
                                            : 'bg-gray-700 text-gray-400'
                                    "
                                    @click="game.difficulty.value = 'hard'"
                                >
                                    困难
                                </button>
                            </div>
                            <button
                                class="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-sm font-medium bg-amber-700 hover:bg-amber-600 text-white transition-all duration-200 active:scale-95 shadow-lg shadow-amber-700/30"
                                @click="game.startGame()"
                            >
                                <Play class="w-4 h-4" /> 开始游戏
                            </button>
                        </div>
                    </div>

                    <div
                        v-if="game.gameStatus.value === 'ended'"
                        class="absolute inset-0 flex items-center justify-center bg-black/50 rounded backdrop-blur-sm"
                    >
                        <div class="text-center">
                            <p
                                class="text-lg font-bold mb-1"
                                :class="game.message.value.includes('你赢了') ? 'text-green-400' : 'text-red-400'"
                            >
                                {{ game.message.value }}
                            </p>
                            <button
                                class="px-4 py-1.5 rounded-lg text-sm font-medium bg-amber-700 hover:bg-amber-600 text-white transition-all duration-200 active:scale-95 mt-3"
                                @click="game.startGame()"
                            >
                                <RotateCcw class="w-4 h-4 inline-block mr-1" /> 再来一局
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="shrink-0 pb-2 pt-1 flex gap-2">
                <button
                    v-if="game.gameStatus.value !== 'idle'"
                    class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 transition-all duration-200 active:scale-95"
                    @click="game.startGame()"
                >
                    <RotateCcw class="w-4 h-4" /> 重新开始
                </button>
            </div>

            <div
                v-if="game.gameStatus.value === 'idle'"
                class="shrink-0 text-gray-500 text-xs text-center leading-relaxed pb-3"
            >
                <p>💡 点击棋盘交叉点落子</p>
                <p>横竖斜任意方向连成五子即获胜</p>
            </div>
        </main>
    </div>
</template>
