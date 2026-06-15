<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useJumpJump } from '@/composables/useJumpJump';
import { ArrowLeft, Gauge, Play, RotateCcw, Target, Trophy } from 'lucide-vue-next';

const router = useRouter();
const game = useJumpJump();
const canvasRef = ref<HTMLCanvasElement | null>(null);

onMounted(() => {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) game.setCanvas(ctx);
    window.addEventListener('keydown', game.handleKeydown);
    window.addEventListener('keyup', game.handleKeyup);
});

onUnmounted(() => {
    game.dispose();
    window.removeEventListener('keydown', game.handleKeydown);
    window.removeEventListener('keyup', game.handleKeyup);
});
</script>

<template>
    <div class="jump-page min-h-screen select-none">
        <header class="jump-header">
            <div class="header-inner">
                <button class="ghost-button" @click="router.push('/')">
                    <ArrowLeft class="w-4 h-4" />
                    <span>返回</span>
                </button>
                <h1 class="game-title">
                    <span>跳一跳</span>
                    <small>Jump Jump</small>
                </h1>
                <button class="ghost-button reset-top" @click="game.startGame()">
                    <RotateCcw class="w-4 h-4" />
                    <span>重开</span>
                </button>
            </div>
        </header>

        <main class="jump-layout">
            <section class="stage-column">
                <div class="score-strip" aria-label="比分">
                    <div class="score-item current">
                        <Gauge class="w-4 h-4" />
                        <span>得分</span>
                        <strong>{{ game.score.value }}</strong>
                    </div>
                    <div class="score-item best">
                        <Trophy class="w-4 h-4" />
                        <span>最高</span>
                        <strong>{{ game.bestScore.value }}</strong>
                    </div>
                </div>

                <div class="stage-shell">
                    <canvas
                        ref="canvasRef"
                        :width="game.width"
                        :height="game.height"
                        class="jump-canvas"
                        @contextmenu.prevent
                        @pointerdown="game.handlePointerDown($event)"
                        @pointerup="game.handlePointerUp($event)"
                        @pointercancel="game.handlePointerUp($event)"
                    ></canvas>

                    <div v-if="game.gameStatus.value === 'idle'" class="stage-overlay">
                        <div class="overlay-panel">
                            <Target class="w-9 h-9 mx-auto text-fuchsia-200" />
                            <div>
                                <p class="overlay-title">准备起跳</p>
                                <p class="overlay-subtitle">按住蓄力，松开落点</p>
                            </div>
                            <button class="primary-button" @click.stop="game.startGame()">
                                <Play class="w-4 h-4" />
                                <span>开始游戏</span>
                            </button>
                        </div>
                    </div>

                    <div v-if="game.gameStatus.value === 'dead'" class="stage-overlay end">
                        <div class="overlay-panel">
                            <p class="overlay-title danger">游戏结束</p>
                            <div class="result-grid">
                                <div>
                                    <span>本局</span>
                                    <strong>{{ game.score.value }}</strong>
                                </div>
                                <div>
                                    <span>纪录</span>
                                    <strong>{{ game.bestScore.value }}</strong>
                                </div>
                            </div>
                            <button class="primary-button" @click.stop="game.startGame()">
                                <RotateCcw class="w-4 h-4" />
                                <span>重新开始</span>
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <aside class="side-panel">
                <div class="panel-block hero-score">
                    <span>当前得分</span>
                    <strong>{{ game.score.value }}</strong>
                </div>

                <div class="panel-block status-block">
                    <span>状态</span>
                    <strong v-if="game.gameStatus.value === 'idle'">待开始</strong>
                    <strong v-else-if="game.gameStatus.value === 'playing'">蓄势</strong>
                    <strong v-else-if="game.gameStatus.value === 'jumping'">腾空</strong>
                    <strong v-else>结束</strong>
                </div>

                <div class="control-grid">
                    <button class="primary-button wide" @click="game.startGame()">
                        <Play v-if="game.gameStatus.value === 'idle'" class="w-4 h-4" />
                        <RotateCcw v-else class="w-4 h-4" />
                        <span>{{ game.gameStatus.value === 'idle' ? '开始游戏' : '重新开始' }}</span>
                    </button>
                </div>

                <div class="hint-block">
                    <div class="hint-row">
                        <kbd>鼠标</kbd>
                        <span>按住蓄力</span>
                    </div>
                    <div class="hint-row">
                        <kbd>空格</kbd>
                        <span>松开跳跃</span>
                    </div>
                    <div class="hint-row">
                        <kbd>Perfect</kbd>
                        <span>中心 +2</span>
                    </div>
                </div>
            </aside>
        </main>
    </div>
</template>

<style scoped>
.jump-page {
    min-height: 100dvh;
    background:
        radial-gradient(circle at 22% 12%, rgba(236, 72, 153, 0.22), transparent 26%),
        radial-gradient(circle at 80% 18%, rgba(45, 212, 191, 0.16), transparent 28%),
        linear-gradient(135deg, #101522 0%, #171923 48%, #0c1424 100%);
    color: #f8fafc;
}

.jump-header {
    width: 100%;
    padding: 0.9rem 1rem 0.45rem;
}

.header-inner {
    width: min(100%, 58rem);
    margin: 0 auto;
    display: grid;
    grid-template-columns: 6.5rem 1fr 6.5rem;
    align-items: center;
    gap: 0.75rem;
}

.game-title {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 0.55rem;
    font-size: clamp(1.25rem, 3vw, 2rem);
    font-weight: 900;
    letter-spacing: 0;
}

.game-title span {
    color: #fdf2f8;
    text-shadow: 0 10px 30px rgba(236, 72, 153, 0.34);
}

.game-title small {
    color: rgba(203, 213, 225, 0.5);
    font-size: 0.58em;
    font-weight: 800;
}

.ghost-button,
.primary-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.42rem;
    border-radius: 8px;
    font-weight: 800;
    transition:
        transform 0.16s ease,
        border-color 0.16s ease,
        background 0.16s ease,
        color 0.16s ease;
}

.ghost-button {
    min-height: 2.25rem;
    color: #cbd5e1;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.45);
    font-size: 0.875rem;
}

.ghost-button:hover {
    color: #ffffff;
    border-color: rgba(244, 114, 182, 0.45);
    background: rgba(30, 41, 59, 0.65);
}

.jump-layout {
    width: min(100%, 58rem);
    margin: 0 auto;
    padding: 0.5rem 1rem 1.25rem;
    display: grid;
    grid-template-columns: minmax(0, 33rem) 16rem;
    justify-content: center;
    align-items: start;
    gap: 1rem;
}

.stage-column {
    min-width: 0;
}

.score-strip {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.55rem;
    margin-bottom: 0.6rem;
}

.score-item {
    min-height: 3.2rem;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.58);
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.8rem;
    box-shadow: 0 16px 42px rgba(0, 0, 0, 0.2);
}

.score-item span {
    color: #aab6c8;
    font-size: 0.82rem;
    font-weight: 800;
}

.score-item strong {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 1.45rem;
    line-height: 1;
    font-variant-numeric: tabular-nums;
}

.score-item.current svg,
.score-item.current strong {
    color: #f472b6;
}

.score-item.best svg,
.score-item.best strong {
    color: #fbbf24;
}

.stage-shell {
    position: relative;
    width: min(100%, 500px);
    margin: 0 auto;
    border-radius: 8px;
    border: 1px solid rgba(226, 232, 240, 0.18);
    background: rgba(15, 23, 42, 0.7);
    padding: 0.45rem;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.36);
}

.jump-canvas {
    display: block;
    width: 100%;
    aspect-ratio: 5 / 6;
    height: auto;
    border-radius: 6px;
    cursor: pointer;
    touch-action: none;
}

.stage-overlay {
    position: absolute;
    inset: 0.45rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: rgba(2, 6, 23, 0.58);
    backdrop-filter: blur(8px);
}

.stage-overlay.end {
    background: rgba(2, 6, 23, 0.68);
}

.overlay-panel {
    width: min(76%, 18rem);
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(15, 23, 42, 0.76);
    padding: 1.1rem;
    text-align: center;
    display: grid;
    gap: 0.8rem;
    box-shadow: 0 18px 54px rgba(0, 0, 0, 0.32);
}

.overlay-title {
    color: #ffffff;
    font-size: 1.1rem;
    font-weight: 900;
}

.overlay-title.danger {
    color: #fb7185;
}

.overlay-subtitle {
    color: #cbd5e1;
    margin-top: 0.1rem;
    font-size: 0.85rem;
    font-weight: 650;
}

.primary-button {
    min-height: 2.45rem;
    border: 1px solid rgba(244, 114, 182, 0.45);
    background: linear-gradient(135deg, #db2777, #7c3aed);
    color: white;
    padding: 0 1rem;
    box-shadow: 0 16px 36px rgba(219, 39, 119, 0.28);
}

.primary-button:hover {
    border-color: rgba(255, 255, 255, 0.42);
    filter: brightness(1.06);
}

.primary-button:active,
.ghost-button:active {
    transform: scale(0.97);
}

.result-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
}

.result-grid div {
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.72);
    border: 1px solid rgba(148, 163, 184, 0.16);
    padding: 0.65rem 0.4rem;
}

.result-grid span,
.panel-block span {
    display: block;
    color: #94a3b8;
    font-size: 0.72rem;
    font-weight: 850;
}

.result-grid strong {
    display: block;
    margin-top: 0.15rem;
    font-size: 1.45rem;
    line-height: 1;
    font-variant-numeric: tabular-nums;
}

.side-panel {
    display: grid;
    gap: 0.75rem;
}

.panel-block,
.hint-block {
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.58);
    padding: 0.85rem;
}

.hero-score strong {
    display: block;
    color: #f472b6;
    font-size: 3rem;
    line-height: 1;
    font-weight: 950;
    font-variant-numeric: tabular-nums;
}

.status-block strong {
    display: block;
    color: #f8fafc;
    margin-top: 0.2rem;
    font-size: 1.05rem;
}

.control-grid,
.primary-button.wide {
    width: 100%;
}

.hint-block {
    display: grid;
    gap: 0.55rem;
}

.hint-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    color: #cbd5e1;
    font-size: 0.82rem;
    font-weight: 750;
}

kbd {
    min-width: 3rem;
    border-radius: 6px;
    border: 1px solid rgba(148, 163, 184, 0.28);
    background: rgba(2, 6, 23, 0.5);
    color: #f8fafc;
    padding: 0.18rem 0.4rem;
    text-align: center;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.75rem;
}

@media (max-width: 820px) {
    .jump-layout {
        grid-template-columns: minmax(0, 1fr);
        width: min(100%, 34rem);
    }

    .side-panel {
        grid-template-columns: 1fr 1fr;
    }

    .hint-block {
        grid-column: 1 / -1;
    }

    .reset-top {
        visibility: hidden;
    }
}

@media (max-width: 560px) {
    .jump-header {
        padding: 0.65rem 0.65rem 0.25rem;
    }

    .header-inner {
        grid-template-columns: 5rem 1fr 5rem;
        gap: 0.35rem;
    }

    .ghost-button span,
    .game-title small {
        display: none;
    }

    .jump-layout {
        padding: 0.45rem 0.6rem 0.9rem;
        gap: 0.65rem;
    }

    .score-strip,
    .side-panel {
        gap: 0.45rem;
    }

    .score-item {
        min-height: 2.8rem;
        grid-template-columns: auto 1fr;
        padding: 0 0.65rem;
    }

    .score-item strong {
        grid-column: 2;
        font-size: 1.25rem;
    }

    .stage-shell {
        width: min(100%, max(16rem, calc((100dvh - 15.5rem) * 0.833)));
        padding: 0.35rem;
    }

    .stage-overlay {
        inset: 0.35rem;
    }

    .overlay-panel {
        width: min(82%, 16rem);
        padding: 0.9rem;
    }

    .side-panel {
        grid-template-columns: 1fr 1fr;
    }

    .hero-score strong {
        font-size: 2rem;
    }

    .hint-block {
        display: none;
    }
}
</style>
