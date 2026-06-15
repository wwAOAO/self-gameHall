<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Gem, Play, RotateCcw, Target, Timer, Trophy } from 'lucide-vue-next';
import { useGoldMiner } from '@/composables/useGoldMiner';

const router = useRouter();
const game = useGoldMiner();
const canvasRef = ref<HTMLCanvasElement | null>(null);

let renderRaf: number | null = null;

function renderLoop() {
    const canvas = canvasRef.value;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    game.draw(ctx);
}

function startRender() {
    renderLoop();
    renderRaf = requestAnimationFrame(startRender);
}

function handleCanvasClick() {
    game.dropHook();
}

onMounted(() => {
    startRender();
});

onUnmounted(() => {
    if (renderRaf) cancelAnimationFrame(renderRaf);
});
</script>

<template>
    <div class="miner-page">
        <header class="miner-header">
            <button class="back-button" @click="router.push('/')">
                <ArrowLeft class="w-4 h-4" />
                <span>返回</span>
            </button>

            <div class="title-block">
                <span class="title-kicker">Mine Shift</span>
                <h1>黄金矿工</h1>
            </div>

            <div class="level-chip">第 {{ game.level.value }} 关</div>
        </header>

        <main class="miner-main">
            <section class="score-strip" aria-label="游戏数据">
                <div class="stat-cell">
                    <Trophy class="stat-icon gold" />
                    <span>最高分</span>
                    <strong>{{ game.highScore.value }}</strong>
                </div>
                <div class="stat-cell">
                    <Gem class="stat-icon cyan" />
                    <span>当前分</span>
                    <strong>{{ game.score.value }}</strong>
                </div>
                <div class="stat-cell">
                    <Target class="stat-icon amber" />
                    <span>目标</span>
                    <strong>{{ game.targetScore.value }}</strong>
                </div>
                <div class="stat-cell">
                    <Timer class="stat-icon blue" />
                    <span>时间</span>
                    <strong>{{ game.timeLeft.value }}s</strong>
                </div>
            </section>

            <section class="mine-frame">
                <div class="frame-top">
                    <span class="lamp"></span>
                    <span class="frame-label">点击矿洞放下钩子</span>
                    <span class="lamp right"></span>
                </div>

                <div class="canvas-shell">
                    <canvas
                        ref="canvasRef"
                        :width="game.width"
                        :height="game.height"
                        class="mine-canvas"
                        @click="handleCanvasClick"
                    ></canvas>

                    <div v-if="game.gameStatus.value === 'idle'" class="state-overlay">
                        <div class="state-panel">
                            <p class="state-eyebrow">Ready</p>
                            <h2>准备开工</h2>
                            <p>瞄准高价值矿石，避开沉重的石块。</p>
                            <button class="primary-action" @click="game.startGame()">
                                <Play class="w-4 h-4" />
                                开始游戏
                            </button>
                        </div>
                    </div>

                    <div v-if="game.gameStatus.value === 'won'" class="state-overlay">
                        <div class="state-panel success">
                            <p class="state-eyebrow">Clear</p>
                            <h2>通关成功</h2>
                            <p>得分 {{ game.score.value }}，下一层矿洞已经点亮。</p>
                            <button class="primary-action" @click="game.startGame()">下一关</button>
                        </div>
                    </div>

                    <div v-if="game.gameStatus.value === 'lost'" class="state-overlay">
                        <div class="state-panel danger">
                            <p class="state-eyebrow">Time Up</p>
                            <h2>时间到</h2>
                            <p>得分 {{ game.score.value }}，重新规划这一趟采矿路线。</p>
                            <button class="secondary-action" @click="game.restartGame()">
                                <RotateCcw class="w-4 h-4" />
                                重新开始
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <footer class="action-row">
                <button v-if="game.gameStatus.value !== 'idle'" class="reset-button" @click="game.restartGame()">
                    <RotateCcw class="w-4 h-4" />
                    重新开始
                </button>
            </footer>
        </main>
    </div>
</template>

<style scoped>
.miner-page {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    color: #fff4d1;
    background:
        radial-gradient(circle at 18% 12%, rgba(249, 184, 79, 0.24), transparent 24%),
        radial-gradient(circle at 80% 10%, rgba(78, 199, 255, 0.12), transparent 22%),
        linear-gradient(145deg, #17110d 0%, #2a1810 43%, #0d1016 100%);
    overflow-x: hidden;
}

.miner-header {
    width: min(760px, 100%);
    padding: 18px 16px 10px;
    display: grid;
    grid-template-columns: 86px 1fr 86px;
    align-items: center;
    gap: 10px;
}

.back-button,
.reset-button,
.primary-action,
.secondary-action {
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 8px;
    font-weight: 800;
    transition:
        transform 150ms ease,
        filter 150ms ease,
        background 150ms ease;
}

.back-button {
    color: #e8c989;
    background: rgba(34, 20, 14, 0.62);
    border: 1px solid rgba(255, 218, 139, 0.14);
    font-size: 13px;
}

.back-button:hover,
.reset-button:hover,
.primary-action:hover,
.secondary-action:hover {
    transform: translateY(-1px);
    filter: brightness(1.07);
}

.title-block {
    text-align: center;
    line-height: 1.02;
}

.title-kicker {
    display: block;
    margin-bottom: 4px;
    color: rgba(255, 213, 128, 0.62);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
}

.title-block h1 {
    font-size: clamp(26px, 5vw, 42px);
    font-weight: 950;
    letter-spacing: 0;
    color: #ffd879;
    text-shadow:
        0 2px 0 #5b2a08,
        0 12px 28px rgba(0, 0, 0, 0.4);
}

.level-chip {
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: #362008;
    background: linear-gradient(145deg, #ffdf86, #d58c2a);
    font-size: 13px;
    font-weight: 950;
    box-shadow: 0 8px 24px rgba(230, 151, 45, 0.22);
}

.miner-main {
    width: min(760px, 100%);
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 0 14px 18px;
}

.score-strip {
    width: min(632px, 100%);
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
}

.stat-cell {
    min-width: 0;
    min-height: 64px;
    padding: 9px 10px;
    display: grid;
    grid-template-columns: 22px 1fr;
    grid-template-rows: auto auto;
    column-gap: 7px;
    align-items: center;
    border-radius: 8px;
    background: rgba(29, 22, 19, 0.64);
    border: 1px solid rgba(255, 221, 153, 0.13);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.stat-icon {
    grid-row: span 2;
    width: 20px;
    height: 20px;
}

.stat-icon.gold {
    color: #ffd35e;
}
.stat-icon.cyan {
    color: #6ee7ff;
}
.stat-icon.amber {
    color: #f4b04f;
}
.stat-icon.blue {
    color: #8cc7ff;
}

.stat-cell span {
    color: rgba(255, 236, 196, 0.58);
    font-size: 11px;
    font-weight: 800;
}

.stat-cell strong {
    min-width: 0;
    color: #fff2c2;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: clamp(15px, 3vw, 19px);
    font-weight: 950;
    line-height: 1.1;
    overflow-wrap: anywhere;
}

.mine-frame {
    width: min(632px, 100%);
    padding: 10px;
    border-radius: 8px;
    background:
        linear-gradient(90deg, rgba(255, 226, 160, 0.14), transparent 12% 88%, rgba(255, 226, 160, 0.12)),
        linear-gradient(145deg, #6b3d21, #2c1710 72%);
    border: 1px solid rgba(255, 215, 137, 0.24);
    box-shadow:
        inset 0 0 0 2px rgba(55, 26, 12, 0.55),
        0 24px 70px rgba(0, 0, 0, 0.48);
}

.frame-top {
    height: 36px;
    display: grid;
    grid-template-columns: 38px 1fr 38px;
    align-items: center;
    gap: 8px;
    padding: 0 6px 8px;
}

.frame-label {
    justify-self: center;
    color: rgba(255, 235, 190, 0.78);
    font-size: 13px;
    font-weight: 900;
}

.lamp {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: radial-gradient(circle, #fff2a6 0 24%, #f2a83f 44%, rgba(242, 168, 63, 0.12) 72%);
    box-shadow: 0 0 28px rgba(255, 188, 72, 0.56);
}

.lamp.right {
    justify-self: end;
}

.canvas-shell {
    position: relative;
    overflow: hidden;
    border-radius: 8px;
    background: #120c0a;
    border: 1px solid rgba(255, 224, 168, 0.18);
}

.mine-canvas {
    width: 100%;
    max-height: calc(100dvh - 208px);
    display: block;
    aspect-ratio: 600 / 650;
    cursor: crosshair;
}

.state-overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 18px;
    background: radial-gradient(circle at 50% 42%, rgba(255, 190, 88, 0.14), transparent 32%), rgba(5, 4, 4, 0.58);
    backdrop-filter: blur(4px);
}

.state-panel {
    width: min(310px, 100%);
    padding: 20px 18px;
    text-align: center;
    border-radius: 8px;
    color: #fff0c7;
    background: rgba(33, 21, 15, 0.86);
    border: 1px solid rgba(255, 214, 136, 0.22);
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.38);
}

.state-panel.success {
    border-color: rgba(255, 215, 94, 0.44);
}

.state-panel.danger {
    border-color: rgba(248, 113, 113, 0.42);
}

.state-eyebrow {
    margin-bottom: 5px;
    color: #ffc762;
    font-size: 11px;
    font-weight: 950;
    letter-spacing: 0.16em;
    text-transform: uppercase;
}

.state-panel h2 {
    margin-bottom: 7px;
    color: #ffe2a0;
    font-size: 24px;
    font-weight: 950;
    letter-spacing: 0;
}

.state-panel p:not(.state-eyebrow) {
    margin-bottom: 14px;
    color: rgba(255, 235, 197, 0.68);
    font-size: 13px;
    line-height: 1.5;
}

.primary-action {
    padding: 0 18px;
    color: #341f07;
    background: linear-gradient(145deg, #ffe08b, #e18b28);
    box-shadow: 0 10px 30px rgba(230, 148, 45, 0.28);
}

.secondary-action,
.reset-button {
    padding: 0 16px;
    color: #ffe8b1;
    background: rgba(62, 35, 19, 0.82);
    border: 1px solid rgba(255, 215, 138, 0.18);
}

.action-row {
    min-height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
}

@media (max-width: 640px) {
    .miner-header {
        grid-template-columns: 72px 1fr 64px;
        padding-top: 12px;
    }

    .back-button span {
        display: none;
    }

    .score-strip {
        grid-template-columns: repeat(2, 1fr);
    }

    .mine-frame {
        padding: 7px;
    }

    .frame-top {
        height: 30px;
        padding-bottom: 6px;
    }

    .mine-canvas {
        max-height: calc(100dvh - 266px);
    }
}
</style>
