<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Flag, Play, RotateCcw } from 'lucide-vue-next';
import { useJapaneseShogi } from '@/composables/useJapaneseShogi';

const router = useRouter();
const game = useJapaneseShogi();
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

const recentMoves = computed(() => game.moveHistory.value.slice(-12).reverse());

function handEntries(side: 'black' | 'white') {
    const summary = game.handSummary(side);
    return Object.entries(summary) as [keyof typeof game.pieceLabel, number][];
}
</script>

<template>
    <div class="min-h-screen select-none overflow-hidden bg-[#18110a] text-stone-100" style="height: 100dvh">
        <div
            class="flex h-full flex-col bg-[radial-gradient(circle_at_50%_-20%,rgba(245,211,146,0.16),transparent_32%),linear-gradient(180deg,rgba(72,39,15,0.92),rgba(18,13,9,1))]"
        >
            <header class="mx-auto w-full max-w-6xl shrink-0 px-3 pb-2 pt-3">
                <div class="flex items-center gap-3">
                    <button class="nav-button" @click="router.push('/')"><ArrowLeft class="h-4 w-4" /> 返回</button>
                    <h1 class="mr-10 flex-1 text-center text-lg font-bold tracking-normal sm:text-xl">
                        <span class="text-amber-100">日本将棋</span>
                        <span class="ml-2 text-base text-amber-700">Shogi</span>
                    </h1>
                </div>
            </header>

            <main
                class="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 overflow-hidden px-3 pb-3 lg:flex-row lg:items-center"
            >
                <section class="flex min-h-0 flex-1 items-center justify-center">
                    <div class="board-shell relative p-3 shadow-[0_28px_80px_rgba(0,0,0,0.42)]">
                        <canvas
                            ref="canvasRef"
                            :width="game.getWidth()"
                            :height="game.getHeight()"
                            class="aspect-square w-[min(94vw,calc(100dvh-108px),600px)] cursor-pointer rounded-[3px]"
                            @click="handleCanvasClick"
                            @mousemove="handleCanvasMove"
                            @mouseleave="handleCanvasLeave"
                        />

                        <div
                            v-if="game.gameStatus.value === 'idle'"
                            class="absolute inset-2 grid place-items-center rounded-md bg-black/45 backdrop-blur-sm"
                        >
                            <div class="flex w-[min(86%,340px)] flex-col items-center gap-4 text-center">
                                <div>
                                    <p class="text-xl font-black text-amber-100">本将棋 9 x 9</p>
                                    <p class="mt-1 text-sm leading-6 text-amber-50/75">
                                        双人同屏对弈，支持持驹打入与升变。
                                    </p>
                                </div>
                                <button class="primary-button" @click="game.startGame()">
                                    <Play class="h-4 w-4" /> 开始对局
                                </button>
                            </div>
                        </div>

                        <div
                            v-if="game.gameStatus.value === 'ended'"
                            class="absolute inset-2 grid place-items-center rounded-md bg-black/55 backdrop-blur-sm"
                        >
                            <div
                                class="w-[min(86%,360px)] rounded-lg border border-white/10 bg-stone-950/82 p-5 text-center shadow-xl"
                            >
                                <p class="text-xl font-black text-amber-100">{{ game.message.value }}</p>
                                <p class="mt-2 text-sm text-stone-400">共 {{ game.moveCount.value }} 手</p>
                                <button class="primary-button mt-4" @click="game.startGame()">
                                    <RotateCcw class="h-4 w-4" /> 再来一局
                                </button>
                            </div>
                        </div>

                        <div
                            v-if="game.promoteChoice.value"
                            class="absolute inset-2 grid place-items-center rounded-md bg-black/48 backdrop-blur-sm"
                        >
                            <div class="rounded-lg border border-white/10 bg-stone-950/88 p-4 text-center shadow-xl">
                                <p class="text-base font-black text-amber-100">是否升变？</p>
                                <div class="mt-4 flex gap-2">
                                    <button class="primary-button" @click="game.choosePromotion(true)">升变</button>
                                    <button class="secondary-button" @click="game.choosePromotion(false)">
                                        不升变
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <aside class="side-panel">
                    <div class="status-line" :class="game.currentSide.value">
                        <span class="turn-badge">{{ game.currentSide.value === 'black' ? '先' : '后' }}</span>
                        <div class="min-w-0">
                            <p class="truncate">{{ game.message.value }}</p>
                            <span class="turn-subtitle">{{ game.sideLabel.value }}</span>
                        </div>
                    </div>

                    <div class="stat-grid">
                        <div class="stat-card">
                            <span>手数</span>
                            <strong>{{ game.moveCount.value }}</strong>
                        </div>
                        <div class="stat-card">
                            <span>当前</span>
                            <strong>{{ game.sideLabel.value }}</strong>
                        </div>
                    </div>

                    <div class="hand-panel">
                        <div class="panel-title">AI</div>
                        <div class="ai-line">
                            <span>{{ game.aiEnabled.value ? 'YaneuraOu' : 'Off' }}</span>
                            <strong class="ml-1">{{
                                game.aiThinking.value ? 'Thinking' : game.aiEnabled.value ? 'Ready' : 'Human'
                            }}</strong>
                        </div>
                    </div>

                    <div class="hand-panel">
                        <div class="panel-title">先手持驹</div>
                        <div class="hand-list">
                            <button
                                v-for="[kind, count] in handEntries('black')"
                                :key="`b-${kind}`"
                                class="hand-piece"
                                :class="{
                                    active: game.currentSide.value === 'black' && game.selectedHand.value === kind,
                                }"
                                :disabled="game.currentSide.value !== 'black' || game.gameStatus.value !== 'playing'"
                                :title="game.getPieceName(kind)"
                                @click="game.selectHand(kind)"
                            >
                                {{ game.pieceLabel[kind] }}<span>{{ count }}</span>
                            </button>
                            <span v-if="handEntries('black').length === 0" class="empty-text">无</span>
                        </div>
                    </div>

                    <div class="hand-panel">
                        <div class="panel-title">后手持驹</div>
                        <div class="hand-list">
                            <button
                                v-for="[kind, count] in handEntries('white')"
                                :key="`w-${kind}`"
                                class="hand-piece"
                                :class="{
                                    active: game.currentSide.value === 'white' && game.selectedHand.value === kind,
                                }"
                                :disabled="game.currentSide.value !== 'white' || game.gameStatus.value !== 'playing'"
                                :title="game.getPieceName(kind)"
                                @click="game.selectHand(kind)"
                            >
                                {{ game.pieceLabel[kind] }}<span>{{ count }}</span>
                            </button>
                            <span v-if="handEntries('white').length === 0" class="empty-text">无</span>
                        </div>
                    </div>

                    <div class="controls">
                        <button
                            v-if="game.gameStatus.value === 'idle'"
                            class="primary-button"
                            @click="game.startGame()"
                        >
                            <Play class="h-4 w-4" /> 开始
                        </button>
                        <button
                            v-if="game.gameStatus.value !== 'idle'"
                            class="secondary-button"
                            @click="game.startGame()"
                        >
                            <RotateCcw class="h-4 w-4" /> 重开
                        </button>
                        <button v-if="game.gameStatus.value === 'playing'" class="danger-button" @click="game.resign()">
                            <Flag class="h-4 w-4" /> 认输
                        </button>
                    </div>

                    <div class="move-panel">
                        <div class="panel-title">最近棋谱</div>
                        <div v-if="recentMoves.length" class="move-list">
                            <span v-for="(move, index) in recentMoves" :key="`${move.text}-${index}`">
                                {{ move.text }}
                            </span>
                        </div>
                        <div v-else class="empty-text">开局后显示记录</div>
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
.danger-button,
.hand-piece {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    border-radius: 0.42rem;
    font-size: 0.875rem;
    font-weight: 800;
    letter-spacing: 0;
    transition:
        transform 160ms ease,
        background-color 160ms ease,
        border-color 160ms ease,
        color 160ms ease,
        box-shadow 160ms ease;
}

.nav-button {
    color: rgb(231 229 228);
}

.nav-button:hover {
    color: white;
    transform: translateX(-2px);
}

.primary-button {
    min-height: 2.5rem;
    min-width: 7.5rem;
    border: 1px solid rgba(255, 231, 173, 0.22);
    background: linear-gradient(180deg, rgb(180 83 9), rgb(126 59 12));
    color: white;
    padding: 0.58rem 0.9rem;
    box-shadow: 0 14px 34px rgba(91, 43, 11, 0.35);
}

.primary-button:hover {
    background: linear-gradient(180deg, rgb(217 119 6), rgb(146 64 14));
    transform: translateY(-1px);
}

.secondary-button,
.danger-button {
    min-height: 2.5rem;
    border: 1px solid rgba(250, 204, 21, 0.17);
    background: rgba(73, 40, 14, 0.5);
    color: rgb(244 238 225);
    padding: 0.55rem 0.8rem;
}

.secondary-button:hover,
.danger-button:hover {
    background: rgba(105, 62, 24, 0.72);
    transform: translateY(-1px);
}

.danger-button {
    color: rgb(254 202 202);
}

.danger-button:hover {
    border-color: rgba(248, 113, 113, 0.38);
    background: rgba(127, 29, 29, 0.55);
}

.board-shell {
    position: relative;
    animation: board-in 420ms ease both;
    border: 1px solid rgba(255, 232, 180, 0.22);
    border-radius: 0.45rem;
    background:
        linear-gradient(90deg, rgba(255, 245, 214, 0.11), transparent 18%, rgba(82, 38, 12, 0.2) 74%),
        linear-gradient(135deg, #6d3c16, #3c200d 48%, #221208);
}

.board-shell::before {
    position: absolute;
    inset: 0.32rem;
    border: 1px solid rgba(48, 26, 10, 0.85);
    border-radius: 0.24rem;
    box-shadow:
        inset 0 0 0 2px rgba(255, 226, 164, 0.12),
        inset 0 18px 28px rgba(255, 255, 255, 0.06),
        inset 0 -18px 28px rgba(33, 16, 6, 0.24);
    content: '';
    pointer-events: none;
}

.side-panel {
    display: flex;
    width: 100%;
    flex-direction: column;
    gap: 0.75rem;
    border: 1px solid rgba(255, 226, 164, 0.16);
    border-radius: 0.45rem;
    background:
        linear-gradient(110deg, rgba(255, 236, 191, 0.08), transparent 32%),
        linear-gradient(180deg, rgba(78, 45, 18, 0.9), rgba(35, 22, 13, 0.95));
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.08),
        0 18px 42px rgba(0, 0, 0, 0.24);
    padding: 0.85rem;
}

.status-line {
    display: flex;
    min-height: 3.2rem;
    align-items: center;
    gap: 0.65rem;
    border-bottom: 1px solid rgba(255, 225, 170, 0.12);
    padding-bottom: 0.75rem;
    color: rgb(250 244 232);
    font-size: 0.9rem;
    font-weight: 900;
}

.turn-badge {
    display: grid;
    height: 2.35rem;
    width: 2.1rem;
    place-items: center;
    clip-path: polygon(50% 0, 92% 22%, 82% 100%, 18% 100%, 8% 22%);
    background: linear-gradient(180deg, #f7d88f, #bd7a2d);
    color: rgb(40 20 8);
    font-family: 'Yu Mincho', 'Noto Serif CJK SC', 'Microsoft YaHei', serif;
    box-shadow: 0 7px 14px rgba(0, 0, 0, 0.22);
}

.status-line.white .turn-badge {
    background: linear-gradient(180deg, #f3c978, #985a24);
    color: rgb(67 20 7);
}

.turn-subtitle,
.panel-title,
.stat-card span {
    display: block;
    color: rgb(201 185 160);
    font-size: 0.72rem;
    font-weight: 800;
}

.panel-title {
    color: rgb(239 211 158);
    font-family: 'Yu Mincho', 'Noto Serif CJK SC', 'Microsoft YaHei', serif;
}

.stat-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
}

.stat-card,
.hand-panel,
.move-panel {
    border: 1px solid rgba(255, 226, 164, 0.13);
    border-radius: 0.45rem;
    background: linear-gradient(90deg, rgba(255, 240, 198, 0.07), transparent 42%), rgba(29, 19, 11, 0.48);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
    padding: 0.65rem;
}

.stat-card strong {
    color: rgb(253 230 138);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 1.1rem;
}

.ai-line {
    padding-top: 0.35rem;
    color: rgb(231 221 203);
    font-size: 0.86rem;
}

.ai-line strong {
    color: rgb(254 243 199);
}

.hand-list {
    display: flex;
    min-height: 2.35rem;
    flex-wrap: wrap;
    gap: 0.45rem;
    padding-top: 0.55rem;
}

.hand-piece {
    min-height: 2.15rem;
    min-width: 2.45rem;
    border: 1px solid rgba(84, 44, 16, 0.82);
    clip-path: polygon(50% 0, 93% 23%, 82% 100%, 18% 100%, 7% 23%);
    border-radius: 0;
    background: linear-gradient(180deg, #f5d994, #c4863b 72%, #9b5b22);
    color: rgb(35 18 8);
    font-family: 'Yu Mincho', 'Noto Serif CJK SC', 'Microsoft YaHei', serif;
    font-size: 1rem;
    padding: 0.42rem 0.52rem 0.34rem;
    text-shadow: 0 1px 0 rgba(255, 244, 210, 0.32);
}

.hand-piece span {
    color: rgb(92 38 14);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.72rem;
    text-shadow: none;
}

.hand-piece.active {
    border-color: rgba(255, 236, 178, 0.92);
    background: linear-gradient(180deg, #ffe8a9, #df9b43 72%, #a76424);
    box-shadow:
        0 0 0 3px rgba(251, 191, 36, 0.16),
        0 9px 16px rgba(0, 0, 0, 0.25);
    transform: translateY(-1px);
}

.hand-piece:disabled {
    cursor: not-allowed;
    filter: saturate(0.75);
    opacity: 0.48;
}

.controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.move-list {
    display: flex;
    max-height: 9rem;
    flex-direction: column;
    gap: 0.35rem;
    overflow: hidden;
    padding-top: 0.5rem;
}

.move-list span {
    border: 1px solid rgba(255, 226, 164, 0.08);
    border-radius: 0.3rem;
    background: rgba(0, 0, 0, 0.2);
    color: rgb(231 229 228);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.78rem;
    padding: 0.25rem 0.4rem;
}

.empty-text {
    color: rgb(151 132 107);
    font-size: 0.78rem;
}

@keyframes board-in {
    from {
        opacity: 0;
        transform: translateY(10px) scale(0.985);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

@media (min-width: 1024px) {
    .side-panel {
        width: 19rem;
    }

    .controls {
        flex-direction: column;
    }
}
</style>
