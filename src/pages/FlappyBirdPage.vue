<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useFlappyBird } from '@/composables/useFlappyBird';
import { Activity, ArrowLeft, Crown, Gauge, MousePointer2, Play, RotateCcw, Trophy } from 'lucide-vue-next';

const router = useRouter();
const game = useFlappyBird();
const canvasRef = ref<HTMLCanvasElement | null>(null);

function drawOnce() {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    game.draw(ctx);
}

onMounted(() => {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) game.setCanvas(ctx);
    drawOnce();
    window.addEventListener('keydown', game.handleKeydown);
    window.addEventListener('keyup', game.handleKeyup);
});

onUnmounted(() => {
    game.stopGameLoop();
    window.removeEventListener('keydown', game.handleKeydown);
    window.removeEventListener('keyup', game.handleKeyup);
});

const statusLabel = computed(() => {
    if (game.gameStatus.value === 'playing') return '飞行中';
    if (game.gameStatus.value === 'dead') return '本局结束';
    return '准备起飞';
});

const rhythmLabel = computed(() => {
    if (game.score.value >= 18) return '极速';
    if (game.score.value >= 10) return '加速';
    if (game.score.value >= 4) return '稳定';
    return '轻快';
});

const titleText = computed(() => {
    if (game.gameStatus.value === 'dead') return game.score.value > 0 ? '差一点就穿过去了' : '再来一局';
    if (game.gameStatus.value === 'playing') return '保持节奏';
    return '像素鸟';
});
</script>

<template>
    <div class="flappy-page select-none">
        <header class="topbar">
            <div class="topbar-inner">
                <button class="nav-button" @click="router.push('/')">
                    <ArrowLeft class="w-4 h-4" />
                    <span>返回</span>
                </button>

                <div class="title-lockup">
                    <span class="title-kicker">Arcade</span>
                    <h1>像素鸟</h1>
                </div>

                <div class="status-chip" :class="game.gameStatus.value">
                    <span class="status-dot"></span>
                    <span>{{ statusLabel }}</span>
                </div>
            </div>
        </header>

        <main class="flappy-layout">
            <section class="stage-column">
                <div class="stage-shell">
                    <div class="stage-glass">
                        <div class="score-rail">
                            <div class="score-tile primary">
                                <Trophy class="w-4 h-4" />
                                <span>得分</span>
                                <strong>{{ game.score.value }}</strong>
                            </div>
                            <div class="score-tile">
                                <Crown class="w-4 h-4" />
                                <span>最高</span>
                                <strong>{{ game.bestScore.value }}</strong>
                            </div>
                        </div>

                        <div class="canvas-frame">
                            <canvas
                                ref="canvasRef"
                                :width="game.width"
                                :height="game.height"
                                class="flappy-canvas"
                                @pointerdown.prevent="game.jump()"
                            ></canvas>

                            <div v-if="game.gameStatus.value === 'idle'" class="state-overlay">
                                <div class="state-panel">
                                    <div class="state-icon">
                                        <Play class="w-7 h-7" />
                                    </div>
                                    <p class="state-title">{{ titleText }}</p>
                                    <p class="state-copy">穿过管道，刷新最高纪录</p>
                                    <button class="primary-button" @click.stop="game.jump()">
                                        <Play class="w-4 h-4" />
                                        <span>开始飞行</span>
                                    </button>
                                </div>
                            </div>

                            <div v-if="game.gameStatus.value === 'dead'" class="state-overlay dead">
                                <div class="state-panel">
                                    <div class="state-icon danger">
                                        <RotateCcw class="w-7 h-7" />
                                    </div>
                                    <p class="state-title">{{ titleText }}</p>
                                    <div class="result-line">
                                        <span>本局 {{ game.score.value }}</span>
                                        <span>最佳 {{ game.bestScore.value }}</span>
                                    </div>
                                    <button class="primary-button" @click.stop="game.jump()">
                                        <RotateCcw class="w-4 h-4" />
                                        <span>重新开始</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <aside class="side-panel">
                <div class="hero-stat">
                    <span class="panel-label">当前成绩</span>
                    <strong>{{ game.score.value }}</strong>
                    <span>{{ statusLabel }}</span>
                </div>

                <div class="metric-grid">
                    <div class="metric-cell">
                        <Gauge class="w-4 h-4" />
                        <span>节奏</span>
                        <strong>{{ rhythmLabel }}</strong>
                    </div>
                    <div class="metric-cell">
                        <Activity class="w-4 h-4" />
                        <span>纪录</span>
                        <strong>{{ game.bestScore.value }}</strong>
                    </div>
                </div>

                <button class="wide-action" @click="game.jump()">
                    <MousePointer2 class="w-4 h-4" />
                    <span>{{ game.gameStatus.value === 'playing' ? '振翅' : '开始' }}</span>
                </button>

                <button v-if="game.gameStatus.value !== 'idle'" class="ghost-action" @click="game.startGame()">
                    <RotateCcw class="w-4 h-4" />
                    <span>重开本局</span>
                </button>
            </aside>
        </main>
    </div>
</template>

<style scoped>
.flappy-page {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    color: #f8fafc;
    background:
        linear-gradient(135deg, #14213d 0%, #17324d 42%, #23414a 100%),
        radial-gradient(circle at 50% 0%, rgba(125, 211, 252, 0.24), transparent 40%);
    overflow-x: hidden;
}

.topbar {
    flex-shrink: 0;
    width: 100%;
    padding: 0.9rem 1rem 0.45rem;
}

.topbar-inner {
    width: min(100%, 1080px);
    margin: 0 auto;
    display: grid;
    grid-template-columns: 7rem 1fr 7rem;
    align-items: center;
    gap: 0.75rem;
}

.nav-button,
.status-chip,
.primary-button,
.wide-action,
.ghost-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    transition:
        transform 0.16s ease,
        background 0.16s ease,
        border-color 0.16s ease,
        color 0.16s ease;
}

.nav-button {
    justify-self: start;
    min-height: 2.25rem;
    color: #bad4e8;
    font-size: 0.875rem;
    font-weight: 750;
}

.nav-button:hover {
    color: #ffffff;
}

.title-lockup {
    text-align: center;
    min-width: 0;
}

.title-kicker {
    display: block;
    color: #f9c74f;
    font-size: 0.7rem;
    font-weight: 900;
    text-transform: uppercase;
}

.title-lockup h1 {
    margin: 0;
    color: #ffffff;
    font-size: clamp(1.45rem, 4vw, 2.35rem);
    line-height: 1;
    font-weight: 950;
    text-shadow: 0 3px 0 rgba(15, 23, 42, 0.34);
}

.status-chip {
    justify-self: end;
    min-height: 2.25rem;
    padding: 0 0.75rem;
    border-radius: 999px;
    border: 1px solid rgba(186, 230, 253, 0.28);
    background: rgba(8, 47, 73, 0.46);
    color: #dff7ff;
    font-size: 0.78rem;
    font-weight: 850;
}

.status-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    background: #f9c74f;
    box-shadow: 0 0 0 4px rgba(249, 199, 79, 0.18);
}

.status-chip.playing .status-dot {
    background: #34d399;
    box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.18);
}

.status-chip.dead .status-dot {
    background: #fb7185;
    box-shadow: 0 0 0 4px rgba(251, 113, 133, 0.18);
}

.flappy-layout {
    width: min(100%, 1080px);
    flex: 1;
    min-height: 0;
    margin: 0 auto;
    padding: 0.55rem 1rem 1rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 240px;
    gap: 1rem;
    align-items: center;
}

.stage-column {
    min-width: 0;
    display: flex;
    justify-content: center;
}

.stage-shell {
    width: min(100%, 540px);
    border-radius: 1.5rem;
    padding: 0.6rem;
    background: linear-gradient(180deg, rgba(248, 250, 252, 0.18), rgba(15, 23, 42, 0.32));
    border: 1px solid rgba(226, 232, 240, 0.24);
    box-shadow: 0 24px 70px rgba(2, 8, 23, 0.36);
}

.stage-glass {
    border-radius: 1.1rem;
    padding: 0.6rem;
    background: rgba(15, 23, 42, 0.34);
    border: 1px solid rgba(186, 230, 253, 0.18);
}

.score-rail {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.55rem;
    margin-bottom: 0.6rem;
}

.score-tile {
    min-height: 3.2rem;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.45rem;
    padding: 0 0.75rem;
    border-radius: 0.85rem;
    background: rgba(8, 47, 73, 0.56);
    border: 1px solid rgba(125, 211, 252, 0.22);
    color: #bae6fd;
}

.score-tile.primary {
    background: rgba(3, 105, 161, 0.58);
}

.score-tile span {
    color: #dff7ff;
    font-size: 0.78rem;
    font-weight: 800;
}

.score-tile strong {
    color: #ffffff;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 1.35rem;
    line-height: 1;
    font-weight: 950;
}

.canvas-frame {
    position: relative;
    overflow: hidden;
    border-radius: 0.95rem;
    background: #7dd3fc;
    box-shadow: inset 0 0 0 1px rgba(2, 6, 23, 0.2);
}

.flappy-canvas {
    display: block;
    width: 100%;
    max-height: calc(100dvh - 7.8rem);
    aspect-ratio: 2 / 3;
    cursor: pointer;
    touch-action: manipulation;
}

.state-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.25rem;
    background: linear-gradient(180deg, rgba(8, 47, 73, 0.24), rgba(2, 6, 23, 0.52));
    backdrop-filter: blur(2px);
}

.state-overlay.dead {
    background: linear-gradient(180deg, rgba(88, 28, 38, 0.28), rgba(2, 6, 23, 0.6));
}

.state-panel {
    width: min(82%, 250px);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.65rem;
    border-radius: 1rem;
    padding: 1.15rem;
    background: rgba(15, 23, 42, 0.78);
    border: 1px solid rgba(226, 232, 240, 0.2);
    box-shadow: 0 18px 50px rgba(2, 6, 23, 0.32);
}

.state-icon {
    width: 3.25rem;
    height: 3.25rem;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: #082f49;
    background: #f9c74f;
    box-shadow: 0 12px 28px rgba(249, 199, 79, 0.28);
}

.state-icon.danger {
    color: #fff1f2;
    background: #e11d48;
    box-shadow: 0 12px 28px rgba(225, 29, 72, 0.28);
}

.state-title {
    margin: 0;
    color: #ffffff;
    font-size: 1.25rem;
    line-height: 1.2;
    font-weight: 950;
    text-align: center;
}

.state-copy,
.result-line {
    margin: 0;
    color: #cbd5e1;
    font-size: 0.83rem;
    font-weight: 700;
    text-align: center;
}

.result-line {
    display: flex;
    gap: 0.75rem;
    color: #f8fafc;
}

.primary-button {
    min-height: 2.5rem;
    padding: 0 1rem;
    border-radius: 0.75rem;
    background: #0284c7;
    color: #ffffff;
    font-size: 0.9rem;
    font-weight: 900;
    box-shadow: 0 14px 30px rgba(2, 132, 199, 0.32);
}

.primary-button:hover,
.wide-action:hover {
    background: #0ea5e9;
}

.primary-button:active,
.wide-action:active,
.ghost-action:active {
    transform: scale(0.97);
}

.side-panel {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    border-radius: 1.25rem;
    padding: 0.85rem;
    background: rgba(15, 23, 42, 0.42);
    border: 1px solid rgba(226, 232, 240, 0.18);
    box-shadow: 0 18px 48px rgba(2, 8, 23, 0.24);
}

.hero-stat {
    border-radius: 1rem;
    padding: 1rem;
    background: linear-gradient(180deg, rgba(14, 165, 233, 0.2), rgba(15, 23, 42, 0.2));
    border: 1px solid rgba(125, 211, 252, 0.18);
}

.panel-label,
.hero-stat span,
.metric-cell span {
    color: #bae6fd;
    font-size: 0.78rem;
    font-weight: 800;
}

.hero-stat strong {
    display: block;
    margin: 0.2rem 0;
    color: #ffffff;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 3.1rem;
    line-height: 1;
    font-weight: 950;
}

.metric-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.55rem;
}

.metric-cell {
    min-height: 5rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    border-radius: 0.9rem;
    padding: 0.75rem;
    background: rgba(8, 47, 73, 0.5);
    border: 1px solid rgba(125, 211, 252, 0.16);
    color: #7dd3fc;
}

.metric-cell strong {
    color: #ffffff;
    font-size: 1rem;
    font-weight: 950;
}

.wide-action,
.ghost-action {
    width: 100%;
    min-height: 2.55rem;
    border-radius: 0.8rem;
    font-weight: 900;
}

.wide-action {
    background: #0284c7;
    color: #ffffff;
    box-shadow: 0 16px 34px rgba(2, 132, 199, 0.28);
}

.ghost-action {
    border: 1px solid rgba(226, 232, 240, 0.18);
    background: rgba(15, 23, 42, 0.34);
    color: #dbeafe;
}

.ghost-action:hover {
    border-color: rgba(125, 211, 252, 0.42);
    color: #ffffff;
}

@media (max-width: 820px) {
    .topbar-inner {
        grid-template-columns: 4.5rem 1fr 4.5rem;
    }

    .nav-button span,
    .status-chip span {
        display: none;
    }

    .flappy-layout {
        grid-template-columns: 1fr;
        align-items: start;
        padding-top: 0.35rem;
    }

    .stage-shell {
        width: min(100%, 520px);
    }

    .side-panel {
        width: min(100%, 520px);
        margin: 0 auto;
        display: grid;
        grid-template-columns: 1fr 1fr;
    }

    .hero-stat {
        display: none;
    }

    .metric-grid {
        grid-column: 1 / -1;
    }
}

@media (max-width: 520px) {
    .topbar {
        padding-inline: 0.7rem;
    }

    .flappy-layout {
        padding-inline: 0.7rem;
        gap: 0.65rem;
    }

    .stage-shell,
    .stage-glass {
        border-radius: 1rem;
        padding: 0.45rem;
    }

    .score-rail {
        gap: 0.4rem;
    }

    .score-tile {
        min-height: 2.8rem;
        padding: 0 0.55rem;
    }

    .score-tile strong {
        font-size: 1.12rem;
    }

    .flappy-canvas {
        max-height: calc(100dvh - 11.4rem);
    }

    .side-panel {
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
        padding: 0.55rem;
    }

    .metric-grid {
        display: none;
    }

    .state-panel {
        padding: 0.95rem;
    }
}
</style>
