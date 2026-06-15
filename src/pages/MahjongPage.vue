<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useMahjong } from '@/composables/useMahjong';
import { ArrowLeft, Play, RotateCcw, Sparkles, Timer, Layers3, CircleDot } from 'lucide-vue-next';

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
                    class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/10 text-stone-300 shadow-sm transition hover:border-emerald-300/40 hover:bg-white/15 hover:text-white active:scale-95"
                    aria-label="&#x8fd4;&#x56de;"
                    @click="router.push('/')"
                >
                    <ArrowLeft class="h-4 w-4" />
                </button>
                <div>
                    <h1 class="text-2xl font-semibold tracking-wide text-white sm:text-3xl">&#x9ebb;&#x5c06;</h1>
                    <p class="text-xs uppercase tracking-[0.28em] text-emerald-200/70">Mahjong Table</p>
                </div>
            </div>

            <div class="hidden items-center gap-2 sm:flex">
                <div
                    class="inline-flex items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100"
                >
                    <CircleDot class="h-4 w-4 text-emerald-300" />
                    {{ statusText }}
                </div>
                <button
                    v-if="game.gameStatus.value !== 'idle'"
                    class="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium text-stone-100 transition hover:border-rose-300/30 hover:bg-rose-400/15 active:scale-95"
                    @click="game.startGame()"
                >
                    <RotateCcw class="h-4 w-4" /> &#x91cd;&#x5f00;
                </button>
            </div>
        </header>

        <main class="mx-auto grid w-full max-w-7xl flex-1 gap-4 px-3 pb-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_220px]">
            <section class="min-w-0">
                <div class="mb-3 flex flex-wrap items-center gap-2">
                    <div
                        class="inline-flex min-h-12 flex-1 items-center rounded-lg border border-amber-200/25 bg-black/35 px-4 py-2 text-sm text-amber-50 shadow-lg shadow-black/20"
                    >
                        <Sparkles class="mr-3 h-5 w-5 shrink-0 text-amber-300" />
                        <span class="truncate text-base font-medium">{{
                            game.message.value || '\u51c6\u5907\u5f00\u5c40'
                        }}</span>
                    </div>
                    <button
                        v-if="game.gameStatus.value !== 'idle'"
                        class="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 text-sm font-medium text-stone-100 transition hover:border-rose-300/30 hover:bg-rose-400/15 active:scale-95 sm:hidden"
                        @click="game.startGame()"
                    >
                        <RotateCcw class="h-4 w-4" /> &#x91cd;&#x5f00;
                    </button>
                </div>

                <div
                    class="relative overflow-hidden rounded-xl border border-emerald-200/20 bg-black/30 p-1.5 shadow-2xl shadow-black/45 ring-1 ring-white/5"
                >
                    <div
                        class="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(250,204,21,0.14),transparent_34%),radial-gradient(circle_at_50%_100%,rgba(16,185,129,0.18),transparent_42%)]"
                    ></div>
                    <canvas
                        ref="canvasRef"
                        :width="game.width"
                        :height="game.height"
                        class="relative block aspect-[4/3] w-full rounded-lg cursor-pointer bg-emerald-950 shadow-inner shadow-black/50"
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

            <aside class="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <div class="rounded-lg border border-white/10 bg-white/10 p-4 shadow-lg shadow-black/20">
                    <div
                        class="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-stone-400"
                    >
                        <span>&#x724c;&#x5899;</span>
                        <Layers3 class="h-4 w-4 text-emerald-300" />
                    </div>
                    <p class="text-3xl font-semibold text-white">{{ remainingTiles }}</p>
                    <p class="mt-1 text-xs text-stone-400">&#x5269;&#x4f59;&#x5f20;&#x6570;</p>
                </div>

                <div class="rounded-lg border border-white/10 bg-white/10 p-4 shadow-lg shadow-black/20">
                    <div
                        class="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-stone-400"
                    >
                        <span>&#x624b;&#x724c;</span>
                        <CircleDot class="h-4 w-4 text-amber-300" />
                    </div>
                    <p class="text-3xl font-semibold text-white">{{ playerTileCount }}</p>
                    <p class="mt-1 text-xs text-stone-400">&#x5f53;&#x524d;&#x6301;&#x724c;</p>
                </div>

                <div class="rounded-lg border border-white/10 bg-white/10 p-4 shadow-lg shadow-black/20">
                    <div
                        class="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-stone-400"
                    >
                        <span>&#x724c;&#x6cb3;</span>
                        <Timer class="h-4 w-4 text-sky-300" />
                    </div>
                    <p class="text-3xl font-semibold text-white">{{ discardCount }}</p>
                    <p class="mt-1 text-xs text-stone-400">&#x5df2;&#x6253;&#x51fa;</p>
                </div>

                <div
                    class="rounded-lg border border-emerald-200/15 bg-emerald-300/10 p-4 shadow-lg shadow-black/20 sm:col-span-3 lg:col-span-1"
                >
                    <p class="text-xs uppercase tracking-[0.2em] text-emerald-200/70">
                        &#x5f53;&#x524d;&#x72b6;&#x6001;
                    </p>
                    <p class="mt-2 text-base font-medium text-white">{{ statusText }}</p>
                    <p class="mt-2 text-sm leading-6 text-stone-300">
                        {{ game.message.value || '\u7b49\u5f85\u5f00\u59cb' }}
                    </p>
                    <button
                        class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/15 active:scale-95"
                        @click="game.startGame()"
                    >
                        <RotateCcw class="h-4 w-4" />
                        {{ game.gameStatus.value === 'idle' ? '\u5f00\u59cb' : '\u91cd\u5f00' }}
                    </button>
                </div>
            </aside>
        </main>
    </div>
</template>

<style scoped>
.mahjong-shell {
    background:
        radial-gradient(circle at 18% 12%, rgba(16, 185, 129, 0.22), transparent 28%),
        radial-gradient(circle at 82% 0%, rgba(245, 158, 11, 0.16), transparent 30%),
        linear-gradient(135deg, #101411 0%, #18231f 45%, #0a1014 100%);
}
</style>
