<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useTankBattle } from '@/composables/useTankBattle';
import { ArrowLeft, Heart, Play, RotateCcw, Shield, Swords, Trophy, Waves } from 'lucide-vue-next';

const router = useRouter();
const game = useTankBattle();
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
    window.addEventListener('keyup', game.handleKeyup);
});

onUnmounted(() => {
    if (renderRaf) cancelAnimationFrame(renderRaf);
    window.removeEventListener('keydown', game.handleKeydown);
    window.removeEventListener('keyup', game.handleKeyup);
});
</script>

<template>
    <div
        class="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-zinc-900 flex flex-col items-center select-none"
    >
        <header class="pt-4 pb-1 w-full max-w-2xl px-4">
            <div class="flex items-center gap-3">
                <button
                    class="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors duration-200 text-sm"
                    @click="router.push('/')"
                >
                    <ArrowLeft class="w-4 h-4" /> 返回
                </button>
                <h1 class="text-xl sm:text-2xl font-bold tracking-tight flex-1 text-center mr-10">
                    <span class="bg-gradient-to-r from-red-400 to-amber-400 bg-clip-text text-transparent"
                        >坦克大战</span
                    >
                    <span class="text-gray-600 text-base ml-2">Tank Battle</span>
                </h1>
            </div>
        </header>

        <main class="flex-1 flex flex-col items-center gap-3 pb-8 px-2">
            <div
                class="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-gray-800/60 rounded-lg px-3 py-2 border border-gray-700/50"
            >
                <div class="flex items-center gap-1.5 min-w-20">
                    <Swords class="w-4 h-4 text-red-400" />
                    <span class="font-mono text-lg font-bold text-red-300 tabular-nums">{{ game.kills.value }}</span>
                </div>
                <div class="flex items-center gap-1.5 min-w-20">
                    <Waves class="w-4 h-4 text-green-400" />
                    <span class="font-mono text-lg font-bold text-green-300 tabular-nums">{{ game.wave.value }}</span>
                </div>
                <div class="flex items-center gap-1.5 min-w-20">
                    <Heart class="w-4 h-4 text-sky-400" />
                    <span class="font-mono text-lg font-bold text-sky-300 tabular-nums">{{ game.lives.value }}</span>
                </div>
                <div class="flex items-center gap-1.5 min-w-20">
                    <Shield class="w-4 h-4 text-amber-400" />
                    <span class="font-mono text-lg font-bold text-amber-300 tabular-nums">{{ game.score.value }}</span>
                </div>
                <div class="flex items-center gap-1.5 min-w-20 col-span-2 sm:col-span-1">
                    <Trophy class="w-4 h-4 text-yellow-400" />
                    <span class="font-mono text-lg font-bold text-yellow-300 tabular-nums">{{
                        game.highScore.value
                    }}</span>
                </div>
            </div>

            <div class="relative bg-gray-800/60 rounded-lg border border-gray-700/50 p-2 shadow-lg shadow-black/20">
                <canvas ref="canvasRef" :width="game.width" :height="game.height" class="rounded"></canvas>

                <div
                    v-if="game.gameStatus.value === 'idle'"
                    class="absolute inset-0 flex items-center justify-center bg-black/45 rounded pointer-events-none"
                >
                    <div class="text-center pointer-events-auto">
                        <p class="text-gray-300 text-sm mb-3">方向键 / WASD 移动，空格射击，Enter 开始</p>
                        <button
                            class="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-all duration-200 active:scale-95 shadow-lg shadow-red-600/30"
                            @click="game.startGame()"
                        >
                            <Play class="w-4 h-4" /> 开始游戏
                        </button>
                    </div>
                </div>

                <div
                    v-if="game.gameStatus.value === 'lost'"
                    class="absolute inset-0 flex items-center justify-center bg-black/55 rounded backdrop-blur-sm"
                >
                    <div class="text-center">
                        <p class="text-red-300 font-bold text-lg mb-1">任务失败</p>
                        <p class="text-gray-300 text-sm mb-1">击毁 {{ game.kills.value }} 辆敌方坦克</p>
                        <p class="text-gray-500 text-xs mb-3">
                            第 {{ game.wave.value }} 波，得分 {{ game.score.value }}
                        </p>
                        <button
                            class="px-4 py-1.5 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-all duration-200 active:scale-95"
                            @click="game.startGame()"
                        >
                            <RotateCcw class="w-4 h-4 inline-block mr-1" /> 重新开始
                        </button>
                    </div>
                </div>
            </div>

            <div class="flex gap-2">
                <button
                    v-if="game.gameStatus.value !== 'idle'"
                    class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 transition-all duration-200 active:scale-95"
                    @click="game.startGame()"
                >
                    <RotateCcw class="w-4 h-4" /> 重新开始
                </button>
            </div>

            <div class="text-gray-500 text-xs text-center leading-relaxed" v-if="game.gameStatus.value === 'idle'">
                <p>摧毁敌人、守住基地。敌人会主动压向基地，后续波次会更快。</p>
            </div>
        </main>
    </div>
</template>
