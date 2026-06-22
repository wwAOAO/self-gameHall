<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Crown, Play, RotateCcw } from 'lucide-vue-next';
import { useCheckers } from '@/composables/useCheckers';

const router = useRouter();
const game = useCheckers();
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

function toCanvasPoint(event: MouseEvent) {
    const canvas = canvasRef.value;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
}

function handleCanvasClick(event: MouseEvent) {
    const point = toCanvasPoint(event);
    if (!point) return;
    game.handleClick(point.x, point.y);
}

function handleCanvasMove(event: MouseEvent) {
    const point = toCanvasPoint(event);
    if (!point) return;
    game.handleHover(point.x, point.y);
}

function handleCanvasLeave() {
    game.handleHover(-999, -999);
}
</script>

<template>
    <div class="min-h-screen select-none overflow-hidden bg-[#15120f] text-white" style="height: 100dvh">
        <div
            class="flex h-full flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.07)_0,rgba(255,255,255,0)_34%),linear-gradient(135deg,rgba(220,38,38,0.16)_0,rgba(220,38,38,0)_36%,rgba(245,158,11,0.12)_100%)]"
        >
            <header class="mx-auto w-full max-w-6xl shrink-0 px-3 pb-2 pt-3">
                <div class="flex items-center gap-3">
                    <button class="nav-button" @click="router.push('/')"><ArrowLeft class="h-4 w-4" /> 返回</button>
                    <h1 class="mr-10 flex-1 text-center text-lg font-bold tracking-normal sm:text-xl">
                        <span class="text-red-100">西洋跳棋</span>
                        <span class="ml-2 text-base text-slate-500">Checkers</span>
                    </h1>
                </div>
            </header>

            <main
                class="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 overflow-hidden px-3 pb-3 lg:flex-row lg:items-center"
            >
                <section class="flex min-h-0 flex-1 items-center justify-center">
                    <div
                        class="relative rounded-lg border border-white/10 bg-black/24 p-2.5 shadow-[0_24px_70px_rgba(0,0,0,0.36)]"
                    >
                        <canvas
                            ref="canvasRef"
                            :width="game.getWidth()"
                            :height="game.getHeight()"
                            class="aspect-square w-[min(88vw,calc(100dvh-148px),560px)] rounded-md cursor-pointer"
                            @click="handleCanvasClick"
                            @mousemove="handleCanvasMove"
                            @mouseleave="handleCanvasLeave"
                        />

                        <div
                            v-if="game.gameStatus.value === 'idle'"
                            class="absolute inset-2 grid place-items-center rounded-md bg-black/48 backdrop-blur-sm"
                        >
                            <div class="flex w-[min(88%,380px)] flex-col items-center gap-4 text-center">
                                <div>
                                    <p class="text-xl font-black text-red-100">跳吃推进，升王反攻</p>
                                    <p class="mt-1 text-sm leading-6 text-slate-300">
                                        {{ game.playerColor.value === 1 ? '你执红先行' : '你执黑后行' }}
                                    </p>
                                </div>

                                <div class="grid grid-cols-2 gap-2">
                                    <button
                                        class="option-button"
                                        :class="{ active: game.playerColor.value === 1 }"
                                        @click="game.playerColor.value = 1"
                                    >
                                        <span class="piece-dot red" /> 执红
                                    </button>
                                    <button
                                        class="option-button"
                                        :class="{ active: game.playerColor.value === 2 }"
                                        @click="game.playerColor.value = 2"
                                    >
                                        <span class="piece-dot black" /> 执黑
                                    </button>
                                </div>

                                <div class="grid grid-cols-2 gap-2">
                                    <button
                                        class="option-button"
                                        :class="{ active: game.difficulty.value === 'easy' }"
                                        @click="game.difficulty.value = 'easy'"
                                    >
                                        轻松
                                    </button>
                                    <button
                                        class="option-button"
                                        :class="{ active: game.difficulty.value === 'hard' }"
                                        @click="game.difficulty.value = 'hard'"
                                    >
                                        标准
                                    </button>
                                </div>

                                <button class="primary-button" @click="game.startGame()">
                                    <Play class="h-4 w-4" /> 开始
                                </button>
                            </div>
                        </div>

                        <div
                            v-if="game.gameStatus.value === 'ended'"
                            class="absolute inset-2 grid place-items-center rounded-md bg-black/58 backdrop-blur-sm"
                        >
                            <div
                                class="w-[min(88%,380px)] rounded-lg border border-white/10 bg-slate-950/84 p-5 text-center shadow-xl"
                            >
                                <p class="text-xl font-black text-red-100">{{ game.message.value }}</p>
                                <div class="mt-4 grid grid-cols-2 gap-2 text-sm">
                                    <div class="score-box">
                                        <span>红方</span>
                                        <strong>{{ game.score.value.red }}</strong>
                                    </div>
                                    <div class="score-box">
                                        <span>黑方</span>
                                        <strong>{{ game.score.value.black }}</strong>
                                    </div>
                                </div>
                                <button class="primary-button mt-4" @click="game.startGame()">
                                    <RotateCcw class="h-4 w-4" /> 再来一局
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <aside class="side-panel">
                    <div class="status-line">
                        <div class="turn-piece" :class="game.currentPlayer.value === 1 ? 'red' : 'black'" />
                        <span>{{ game.message.value }}</span>
                    </div>

                    <div class="stat-grid">
                        <div class="stat-card">
                            <span>红方</span>
                            <strong>{{ game.score.value.red }}</strong>
                        </div>
                        <div class="stat-card">
                            <span>黑方</span>
                            <strong>{{ game.score.value.black }}</strong>
                        </div>
                        <div class="stat-card">
                            <span>红王</span>
                            <strong>{{ game.score.value.redKings }}</strong>
                        </div>
                        <div class="stat-card">
                            <span>黑王</span>
                            <strong>{{ game.score.value.blackKings }}</strong>
                        </div>
                    </div>

                    <div class="controls">
                        <button
                            v-if="game.gameStatus.value !== 'idle'"
                            class="secondary-button"
                            @click="game.startGame()"
                        >
                            <RotateCcw class="h-4 w-4" /> 重开
                        </button>
                        <button
                            v-if="game.gameStatus.value === 'idle'"
                            class="secondary-button"
                            @click="game.switchColor()"
                        >
                            <Crown class="h-4 w-4" /> 换先后
                        </button>
                    </div>

                    <div class="rule-notes">
                        <p>棋子只能在深色格斜向移动，普通子向前走一步。</p>
                        <p>有吃子时必须吃；可连续跳吃时会一次完成整条跳吃路线。</p>
                        <p>普通子到达底线升王，王可以前后斜向移动和跳吃。</p>
                    </div>
                </aside>
            </main>
        </div>
    </div>
</template>

<style scoped>
.nav-button,
.primary-button,
.secondary-button,
.option-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 700;
    transition:
        transform 160ms ease,
        background-color 160ms ease,
        border-color 160ms ease,
        color 160ms ease;
}

.nav-button {
    color: rgb(148 163 184);
}

.nav-button:hover {
    color: white;
}

.primary-button {
    min-width: 8.5rem;
    background: rgb(185 28 28);
    color: white;
    padding: 0.65rem 1.1rem;
    box-shadow: 0 14px 34px rgba(185, 28, 28, 0.3);
}

.primary-button:hover {
    background: rgb(220 38 38);
}

.secondary-button {
    min-height: 2.5rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.08);
    color: rgb(226 232 240);
    padding: 0.55rem 0.8rem;
}

.secondary-button:hover {
    background: rgba(255, 255, 255, 0.14);
}

.option-button {
    min-width: 7rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(15, 23, 42, 0.75);
    color: rgb(203 213 225);
    padding: 0.6rem 0.8rem;
}

.option-button.active {
    border-color: rgba(248, 113, 113, 0.85);
    background: rgba(127, 29, 29, 0.72);
    color: white;
}

.piece-dot,
.turn-piece {
    display: inline-block;
    border-radius: 999px;
    flex: 0 0 auto;
}

.piece-dot {
    height: 1rem;
    width: 1rem;
}

.turn-piece {
    height: 1.15rem;
    width: 1.15rem;
}

.red {
    background: radial-gradient(circle at 35% 30%, #fecaca, #dc2626 58%, #7f1d1d);
    border: 1px solid #fecaca;
}

.black {
    background: radial-gradient(circle at 35% 30%, #64748b, #111827 62%, #020617);
    border: 1px solid #475569;
}

.side-panel {
    display: flex;
    width: 100%;
    flex-direction: column;
    gap: 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.5rem;
    background: rgba(15, 23, 42, 0.54);
    padding: 0.85rem;
}

.status-line {
    display: flex;
    min-height: 2.75rem;
    align-items: center;
    gap: 0.6rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 0.75rem;
    color: rgb(226 232 240);
    font-size: 0.9rem;
    font-weight: 700;
}

.stat-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.5rem;
}

.stat-card,
.score-box {
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.055);
    padding: 0.65rem;
}

.stat-card span,
.score-box span {
    display: block;
    color: rgb(148 163 184);
    font-size: 0.72rem;
}

.stat-card strong,
.score-box strong {
    color: rgb(254 202 202);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 1.15rem;
}

.controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.rule-notes {
    color: rgb(148 163 184);
    font-size: 0.75rem;
    line-height: 1.55;
}

@media (min-width: 1024px) {
    .side-panel {
        width: 18rem;
    }

    .stat-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .controls {
        flex-direction: column;
    }
}
</style>
