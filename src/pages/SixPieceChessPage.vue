<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Brain, Play, RotateCcw } from 'lucide-vue-next';
import { useSixPieceChess } from '@/composables/useSixPieceChess';

const router = useRouter();
const game = useSixPieceChess();
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

function getCanvasPoint(event: MouseEvent) {
    const canvas = canvasRef.value;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
}

function handleCanvasClick(event: MouseEvent) {
    const point = getCanvasPoint(event);
    if (!point) return;
    game.handleClick(point.x, point.y);
}

function handleCanvasMove(event: MouseEvent) {
    const point = getCanvasPoint(event);
    if (!point) return;
    game.handleHover(point.x, point.y);
}

function handleCanvasLeave() {
    game.handleHover(-999, -999);
}
</script>

<template>
    <div class="min-h-screen select-none overflow-hidden bg-[#14120e] text-white" style="height: 100dvh">
        <div
            class="flex h-full flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.07)_0,rgba(255,255,255,0)_34%),linear-gradient(135deg,rgba(248,113,113,0.13)_0,rgba(248,113,113,0)_38%,rgba(59,130,246,0.12)_100%)]"
        >
            <header class="mx-auto w-full max-w-6xl shrink-0 px-3 pb-2 pt-3">
                <div class="flex items-center gap-3">
                    <button class="nav-button" @click="router.push('/')"><ArrowLeft class="h-4 w-4" /> 返回</button>
                    <h1 class="mr-10 flex-1 text-center text-lg font-bold tracking-normal sm:text-xl">
                        <span class="text-amber-100">六子炮</span>
                        <span class="ml-2 text-base text-slate-500">Six Piece Chess</span>
                    </h1>
                </div>
            </header>

            <main
                class="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 overflow-hidden px-3 pb-3 lg:flex-row lg:items-center"
            >
                <section class="flex min-h-0 flex-1 items-center justify-center">
                    <div
                        class="relative rounded-lg border border-white/10 bg-black/20 p-2.5 shadow-[0_24px_70px_rgba(0,0,0,0.35)]"
                    >
                        <canvas
                            ref="canvasRef"
                            :width="game.getWidth()"
                            :height="game.getHeight()"
                            class="w-[min(92vw,calc(100dvh-154px),560px)] rounded-md cursor-pointer"
                            @click="handleCanvasClick"
                            @mousemove="handleCanvasMove"
                            @mouseleave="handleCanvasLeave"
                        />

                        <div
                            v-if="game.gameStatus.value === 'idle'"
                            class="absolute inset-2 grid place-items-center rounded-md bg-black/50 backdrop-blur-sm"
                        >
                            <div class="flex w-[min(88%,390px)] flex-col items-center gap-4 text-center">
                                <div>
                                    <p class="text-xl font-black text-amber-100">十二点民间棋，隔己吃敌</p>
                                    <p class="mt-1 text-sm leading-6 text-slate-300">
                                        红方先走，选中棋子后移到相邻空点，或隔着己方棋子跳吃敌子。
                                    </p>
                                </div>

                                <button class="option-button" @click="game.switchDifficulty()">
                                    <Brain class="h-4 w-4" />
                                    {{ game.difficulty.value === 'hard' ? '标准 AI' : '轻松 AI' }}
                                </button>

                                <button class="primary-button" @click="game.startGame()">
                                    <Play class="h-4 w-4" /> 开始
                                </button>
                            </div>
                        </div>

                        <div
                            v-if="game.gameStatus.value === 'ended'"
                            class="absolute inset-2 grid place-items-center rounded-md bg-black/55 backdrop-blur-sm"
                        >
                            <div
                                class="w-[min(88%,360px)] rounded-lg border border-white/10 bg-slate-950/84 p-5 text-center shadow-xl"
                            >
                                <p
                                    class="text-xl font-black"
                                    :class="game.message.value.includes('你赢') ? 'text-emerald-300' : 'text-red-300'"
                                >
                                    {{ game.message.value }}
                                </p>
                                <div class="mt-4 grid grid-cols-2 gap-2 text-sm">
                                    <div class="score-box">
                                        <span>红方</span>
                                        <strong>{{ game.playerCount.value }}</strong>
                                    </div>
                                    <div class="score-box">
                                        <span>蓝方</span>
                                        <strong>{{ game.aiCount.value }}</strong>
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
                        <span class="turn-disc" :class="game.currentPlayer.value === 1 ? 'red' : 'blue'" />
                        <span>{{ game.message.value }}</span>
                    </div>

                    <div class="stat-grid">
                        <div class="stat-card">
                            <span>红方</span>
                            <strong>{{ game.playerCount.value }}</strong>
                        </div>
                        <div class="stat-card">
                            <span>蓝方</span>
                            <strong>{{ game.aiCount.value }}</strong>
                        </div>
                        <div class="stat-card">
                            <span>可走</span>
                            <strong>{{ game.legalMoves.value.length || game.playerMoves.value.length }}</strong>
                        </div>
                        <div class="stat-card">
                            <span>AI</span>
                            <strong>{{ game.difficulty.value === 'hard' ? '标准' : '轻松' }}</strong>
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
                            @click="game.switchDifficulty()"
                        >
                            <Brain class="h-4 w-4" /> 切换难度
                        </button>
                    </div>

                    <div class="rule-notes">
                        <p>棋盘共有 12 个点，红蓝双方各 6 枚，红方先走。</p>
                        <p>普通走法是沿线移动到相邻空点。</p>
                        <p>吃子走法是隔着一枚己方棋子，跳到后方敌子位置并吃掉它。</p>
                        <p>任一方只剩 1 枚棋，或轮到走棋却无合法走法，即判负。</p>
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
    background: rgb(180 83 9);
    color: white;
    padding: 0.65rem 1.1rem;
    box-shadow: 0 14px 34px rgba(180, 83, 9, 0.3);
}

.primary-button:hover {
    background: rgb(217 119 6);
}

.secondary-button,
.option-button {
    min-height: 2.5rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.08);
    color: rgb(226 232 240);
    padding: 0.55rem 0.8rem;
}

.secondary-button:hover,
.option-button:hover {
    background: rgba(255, 255, 255, 0.14);
}

.side-panel {
    display: flex;
    width: 100%;
    flex-direction: column;
    gap: 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.5rem;
    background: rgba(15, 23, 42, 0.52);
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

.turn-disc {
    display: inline-block;
    height: 1.15rem;
    width: 1.15rem;
    flex: 0 0 auto;
    border-radius: 999px;
}

.turn-disc.red {
    border: 1px solid #7f1d1d;
    background: radial-gradient(circle at 35% 30%, #fff7ed, #ef4444 52%, #7f1d1d);
}

.turn-disc.blue {
    border: 1px solid #172554;
    background: radial-gradient(circle at 35% 30%, #dbeafe, #2563eb 52%, #172554);
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
    color: rgb(253 230 138);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 1.05rem;
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
        width: 19rem;
    }

    .stat-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .controls {
        flex-direction: column;
    }
}
</style>
