<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSudoku } from '@/composables/useSudoku';
import { ArrowLeft, Play, RotateCcw, Lightbulb, Pencil, Eraser } from 'lucide-vue-next';

const router = useRouter();
const game = useSudoku();
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
    window.addEventListener('keydown', game.handleKeydown);
});

onUnmounted(() => {
    if (renderRaf) cancelAnimationFrame(renderRaf);
    window.removeEventListener('keydown', game.handleKeydown);
});

function handleCanvasClick(e: MouseEvent) {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    game.handleClick(mx, my);
}

function onSetCellNumber(num: number) {
    if (game.notesMode.value) {
        game.toggleNote(num);
    } else {
        game.setCellNumber(num);
    }
}
</script>

<template>
    <div
        class="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800 flex flex-col items-center select-none"
    >
        <header class="pt-4 pb-1 w-full max-w-4xl px-4">
            <div class="flex items-center gap-3">
                <button
                    class="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors duration-200 text-sm"
                    @click="router.push('/')"
                >
                    <ArrowLeft class="w-4 h-4" /> 返回
                </button>
                <h1 class="text-xl sm:text-2xl font-bold tracking-tight flex-1 text-center mr-10">
                    <span class="bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent"
                        >数独</span
                    >
                    <span class="text-gray-600 text-base ml-2">Sudoku</span>
                </h1>
            </div>
        </header>

        <main class="flex-1 flex flex-col items-center gap-3 pb-8 px-2">
            <div class="flex items-center gap-4 bg-gray-800/60 rounded-xl px-5 py-2.5 border border-gray-700/50">
                <div class="flex items-center gap-1.5">
                    <span class="text-gray-400 text-sm">难度</span>
                    <span class="font-mono text-lg font-bold text-indigo-400 tabular-nums">
                        {{
                            game.difficulty.value === 'easy'
                                ? '简单'
                                : game.difficulty.value === 'medium'
                                  ? '中等'
                                  : '困难'
                        }}
                    </span>
                </div>
                <div class="w-px h-6 bg-gray-700/50"></div>
                <div class="flex items-center gap-1.5">
                    <span class="text-gray-400 text-sm">用时</span>
                    <span class="font-mono text-lg font-bold text-gray-200 tabular-nums">{{ game.getTime() }}</span>
                </div>
                <div class="w-px h-6 bg-gray-700/50"></div>
                <div class="flex items-center gap-1.5">
                    <span class="text-gray-400 text-sm">错误</span>
                    <span class="font-mono text-lg font-bold text-red-400 tabular-nums"
                        >{{ game.mistakes.value }} / {{ game.maxMistakes }}</span
                    >
                </div>
                <div class="w-px h-6 bg-gray-700/50"></div>
                <div class="flex items-center gap-1.5">
                    <span class="text-gray-400 text-sm">剩余</span>
                    <span class="font-mono text-lg font-bold text-cyan-400 tabular-nums">{{
                        game.remainingCells.value
                    }}</span>
                </div>
            </div>

            <div class="relative bg-gray-800/60 rounded-xl p-3 border border-gray-700/50">
                <canvas
                    ref="canvasRef"
                    :width="game.getWidth()"
                    :height="game.getHeight()"
                    class="rounded-lg cursor-pointer max-w-[98vw]"
                    style="max-height: 85vh"
                    @click="handleCanvasClick"
                ></canvas>
            </div>

            <div v-if="game.gameStatus.value === 'playing'" class="flex gap-2 flex-wrap justify-center">
                <button
                    v-for="n in 9"
                    :key="n"
                    class="w-10 h-10 rounded-lg text-lg font-bold bg-gray-700/80 hover:bg-gray-600 text-gray-200 transition-all duration-200 active:scale-95 border border-gray-600/50"
                    @click="onSetCellNumber(n)"
                >
                    {{ n }}
                </button>
            </div>

            <div v-if="game.gameStatus.value === 'playing'" class="flex gap-2">
                <button
                    class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 active:scale-95"
                    :class="
                        game.notesMode.value
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    "
                    @click="game.toggleNotesMode()"
                >
                    <Pencil class="w-4 h-4" /> 笔记
                </button>
                <button
                    class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 transition-all duration-200 active:scale-95"
                    @click="game.eraseCell()"
                >
                    <Eraser class="w-4 h-4" /> 擦除
                </button>
                <button
                    class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white transition-all duration-200 active:scale-95 shadow-lg shadow-amber-600/30"
                    @click="game.hintCell()"
                >
                    <Lightbulb class="w-4 h-4" /> 提示
                </button>
                <button
                    class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 transition-all duration-200 active:scale-95"
                    @click="game.startGame(game.difficulty.value as 'easy' | 'medium' | 'hard')"
                >
                    <RotateCcw class="w-4 h-4" /> 新游戏
                </button>
            </div>

            <div v-if="game.gameStatus.value === 'idle'" class="flex flex-col items-center gap-4">
                <p class="text-gray-400 text-sm">选择难度开始游戏</p>
                <div class="flex gap-3">
                    <button
                        class="px-6 py-3 rounded-xl text-base font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-all duration-200 active:scale-95 shadow-lg shadow-indigo-600/30"
                        @click="game.startGame('easy')"
                    >
                        <Play class="w-4 h-4 inline mr-1.5" />简单
                    </button>
                    <button
                        class="px-6 py-3 rounded-xl text-base font-medium bg-purple-600 hover:bg-purple-500 text-white transition-all duration-200 active:scale-95 shadow-lg shadow-purple-600/30"
                        @click="game.startGame('medium')"
                    >
                        <Play class="w-4 h-4 inline mr-1.5" />中等
                    </button>
                    <button
                        class="px-6 py-3 rounded-xl text-base font-medium bg-rose-600 hover:bg-rose-500 text-white transition-all duration-200 active:scale-95 shadow-lg shadow-rose-600/30"
                        @click="game.startGame('hard')"
                    >
                        <Play class="w-4 h-4 inline mr-1.5" />困难
                    </button>
                </div>
            </div>

            <div
                v-if="game.gameStatus.value === 'won'"
                class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            >
                <div class="bg-gray-800 rounded-2xl p-8 shadow-2xl border border-gray-700/50 text-center max-w-sm mx-4">
                    <h2 class="text-2xl font-bold text-yellow-400 mb-2">恭喜通关！</h2>
                    <p class="text-gray-400 mb-6">
                        用时：<span class="font-mono text-lg text-white">{{ game.getTime() }}</span>
                    </p>
                    <div class="flex gap-3 justify-center">
                        <button
                            class="px-5 py-2 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-all duration-200 active:scale-95"
                            @click="game.startGame('easy')"
                        >
                            <Play class="w-4 h-4 inline mr-1.5" />简单
                        </button>
                        <button
                            class="px-5 py-2 rounded-xl text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white transition-all duration-200 active:scale-95"
                            @click="game.startGame('medium')"
                        >
                            <Play class="w-4 h-4 inline mr-1.5" />中等
                        </button>
                        <button
                            class="px-5 py-2 rounded-xl text-sm font-medium bg-rose-600 hover:bg-rose-500 text-white transition-all duration-200 active:scale-95"
                            @click="game.startGame('hard')"
                        >
                            <Play class="w-4 h-4 inline mr-1.5" />困难
                        </button>
                    </div>
                </div>
            </div>

            <div
                v-if="game.gameStatus.value === 'lost'"
                class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            >
                <div class="bg-gray-800 rounded-2xl p-8 shadow-2xl border border-gray-700/50 text-center max-w-sm mx-4">
                    <h2 class="text-2xl font-bold text-red-400 mb-2">挑战失败</h2>
                    <p class="text-gray-400 mb-6">
                        错误次数已用完，用时：<span class="font-mono text-lg text-white">{{ game.getTime() }}</span>
                    </p>
                    <div class="flex gap-3 justify-center">
                        <button
                            class="px-5 py-2 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-all duration-200 active:scale-95"
                            @click="game.startGame('easy')"
                        >
                            <Play class="w-4 h-4 inline mr-1.5" />简单
                        </button>
                        <button
                            class="px-5 py-2 rounded-xl text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white transition-all duration-200 active:scale-95"
                            @click="game.startGame('medium')"
                        >
                            <Play class="w-4 h-4 inline mr-1.5" />中等
                        </button>
                        <button
                            class="px-5 py-2 rounded-xl text-sm font-medium bg-rose-600 hover:bg-rose-500 text-white transition-all duration-200 active:scale-95"
                            @click="game.startGame('hard')"
                        >
                            <Play class="w-4 h-4 inline mr-1.5" />困难
                        </button>
                    </div>
                </div>
            </div>
        </main>
    </div>
</template>
