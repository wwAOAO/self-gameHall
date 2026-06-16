<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useMahjong } from '@/composables/useMahjong';
import { ArrowLeft, Play, RotateCcw, Timer, Layers3, CircleDot } from 'lucide-vue-next';

const router = useRouter();
const game = useMahjong();
const canvasRef = ref<HTMLCanvasElement | null>(null);

const statusText = computed(() => {
    if (game.gameStatus.value === 'idle') return '\u5f85\u5f00\u5c40';
    if (game.gameStatus.value === 'won') return '\u672c\u5c40\u7ed3\u675f';
    if (game.gameStatus.value === 'draw') return '\u6d41\u5c40';
    return game.isPlayerTurn.value ? '\u4f60\u7684\u56de\u5408' : '\u5bf9\u624b\u884c\u52a8';
});

const remainingTiles = computed(() => game.deck.value.length);
const playerTileCount = computed(() => game.players.value[1]?.hand.length ?? 0);
const discardCount = computed(() => game.players.value.reduce((sum, player) => sum + player.discarded.length, 0));

onMounted(() => {
    const canvas = canvasRef.value;
    if (canvas) {
        const ctx = canvas.getContext('2d')!;
        game.setCanvas(ctx);
    }
    window.addEventListener('keydown', game.handleKeydown);
    window.addEventListener('keyup', game.handleKeyup);
});

onUnmounted(() => {
    window.removeEventListener('keydown', game.handleKeydown);
    window.removeEventListener('keyup', game.handleKeyup);
});
</script>

<template>
    <div class="mahjong-shell min-h-screen text-stone-100 select-none">
        <header class="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 pb-3 pt-5 sm:px-6">
            <div class="flex items-center gap-3">
                <button
                    class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#d6a24a]/20 bg-white/[0.06] text-stone-300 shadow-sm transition hover:border-[#d6a24a]/50 hover:bg-white/10 hover:text-white active:scale-95"
                    aria-label="&#x8fd4;&#x56de;"
                    @click="router.push('/')"
                >
                    <ArrowLeft class="h-4 w-4" />
                </button>
                <div>
                    <h1 class="text-2xl font-semibold tracking-wide text-stone-50 sm:text-3xl">&#x9ebb;&#x5c06;</h1>
                    <p class="text-xs uppercase tracking-[0.28em] text-cyan-100/70">Mahjong Room</p>
                </div>
            </div>

            <div class="hidden items-center gap-2 sm:flex">
                <div
                    class="inline-flex items-center gap-2 rounded-lg border border-cyan-200/20 bg-cyan-300/10 px-3 py-2 text-sm text-stone-100"
                >
                    <CircleDot class="h-4 w-4 text-cyan-200" />
                    {{ statusText }}
                </div>
                <button
                    v-if="game.gameStatus.value !== 'idle'"
                    class="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-medium text-stone-100 transition hover:border-cyan-200/40 hover:bg-cyan-300/10 active:scale-95"
                    @click="game.startGame()"
                >
                    <RotateCcw class="h-4 w-4" /> &#x91cd;&#x5f00;
                </button>
            </div>
        </header>

        <main class="mx-auto w-full max-w-7xl px-3 pb-8 sm:px-6">
            <section class="min-w-0">
                <div class="mb-3 grid gap-2 rounded-xl border border-white/10 bg-[#111713]/90 p-2 shadow-2xl shadow-black/30 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div class="flex min-w-0 items-center gap-2 px-2">
                        <span class="h-2 w-2 rounded-full bg-cyan-200 shadow-[0_0_14px_rgba(103,232,249,.7)]"></span>
                        <span class="truncate text-sm font-medium text-stone-100">{{ game.message.value || '\u51c6\u5907\u5f00\u5c40' }}</span>
                    </div>
                    <div class="grid grid-cols-3 gap-2 text-xs text-stone-300 sm:flex">
                        <div class="inline-flex items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-2">
                            <Layers3 class="h-4 w-4 text-cyan-200" />
                            <span>{{ remainingTiles }}</span>
                        </div>
                        <div class="inline-flex items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-2">
                            <CircleDot class="h-4 w-4 text-lime-300" />
                            <span>{{ playerTileCount }}</span>
                        </div>
                        <div class="inline-flex items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-2">
                            <Timer class="h-4 w-4 text-sky-200" />
                            <span>{{ discardCount }}</span>
                        </div>
                    </div>
                </div>

                <div
                    class="mahjong-stage relative overflow-hidden rounded-2xl border border-white/10 p-2 shadow-2xl shadow-black/50"
                >
                    <canvas
                        ref="canvasRef"
                        :width="game.width"
                        :height="game.height"
                        class="relative block aspect-[4/3] w-full rounded-xl cursor-pointer bg-[#07120e] shadow-inner shadow-black/60"
                        @click="game.handleCanvasClick($event)"
                    ></canvas>

                    <div
                        v-if="game.gameStatus.value === 'idle'"
                        class="absolute inset-2 flex items-center justify-center rounded-lg bg-black/55 backdrop-blur-sm"
                    >
                        <button
                            class="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-3 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-950/40 transition hover:bg-emerald-300 active:scale-95"
                            @click="game.startGame()"
                        >
                            <Play class="h-4 w-4" /> &#x5f00;&#x59cb;&#x5bf9;&#x5c40;
                        </button>
                    </div>

                    <div
                        v-if="game.gameStatus.value === 'won' || game.gameStatus.value === 'draw'"
                        class="absolute inset-2 flex items-center justify-center rounded-lg bg-black/60 backdrop-blur-sm"
                    >
                        <div
                            class="rounded-xl border border-amber-200/25 bg-stone-950/85 px-6 py-5 text-center shadow-2xl shadow-black/40"
                        >
                            <p class="mb-4 text-lg font-semibold text-amber-200">{{ game.message.value }}</p>
                            <button
                                class="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 active:scale-95"
                                @click="game.startGame()"
                            >
                                <RotateCcw class="h-4 w-4" /> &#x518d;&#x6765;&#x4e00;&#x5c40;
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    </div>
</template>

<style scoped>
.mahjong-shell {
    background:
        radial-gradient(circle at 50% -10%, rgba(34, 211, 238, 0.14), transparent 34%),
        linear-gradient(135deg, #040b0d 0%, #092024 45%, #030606 100%);
}

.mahjong-stage {
    background:
        radial-gradient(circle at 50% 0%, rgba(34, 211, 238, 0.14), transparent 34%),
        linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.32)),
        #071113;
}
</style>
