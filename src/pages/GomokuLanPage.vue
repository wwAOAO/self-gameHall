<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useGomokuLan } from '@/composables/useGomokuLan';
import type { GomokuCell } from '@/lib/gomokuLanGame';
import { ArrowLeft, Copy, LogIn, Play, Plus, RotateCcw, Users } from 'lucide-vue-next';

const BOARD_SIZE = 15;
const CELL_SIZE = 36;
const PADDING = 24;
const CANVAS_W = PADDING * 2 + (BOARD_SIZE - 1) * CELL_SIZE;
const STONE_ANIMATION_MS = 360;

interface StoneAnimation {
    row: number;
    col: number;
    player: GomokuCell;
    startedAt: number;
}

const router = useRouter();
const game = useGomokuLan();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const hoverPos = ref<[number, number] | null>(null);
const placeAnimation = ref<StoneAnimation | null>(null);
let animatedMoveKey = '';
let renderRaf: number | null = null;

watch(
    () => [game.state.value.turnNo, game.state.value.lastMove] as const,
    move => {
        const [turnNo, lastMove] = move;
        if (!lastMove) {
            animatedMoveKey = '';
            placeAnimation.value = null;
            return;
        }

        const [row, col] = lastMove;
        const moveKey = `${turnNo}:${row}:${col}:${game.state.value.board[row][col]}`;
        if (moveKey === animatedMoveKey) return;
        animatedMoveKey = moveKey;
        placeAnimation.value = {
            row,
            col,
            player: game.state.value.board[row][col],
            startedAt: performance.now(),
        };
    },
);

function boardToCanvas(idx: number): number {
    return PADDING + idx * CELL_SIZE;
}

function canvasToBoard(pos: number): number {
    return Math.round((pos - PADDING) / CELL_SIZE);
}

function easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
}

function drawStone(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: GomokuCell,
    options: { scale?: number; alpha?: number; squash?: number; glow?: number; marker?: boolean } = {},
) {
    const scale = options.scale ?? 1;
    const alpha = options.alpha ?? 1;
    const squash = options.squash ?? 0;
    const radius = CELL_SIZE * 0.42;
    const radiusX = radius * scale * (1 + squash * 0.08);
    const radiusY = radius * scale * (1 - squash * 0.12);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.ellipse(x, y + radius * 0.28, radiusX * 0.82, radiusY * 0.34, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(37, 22, 10, ${0.18 * alpha})`;
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
    if (player === 1) {
        const grad = ctx.createRadialGradient(x - 3, y - 3, 2, x, y, radius);
        grad.addColorStop(0, '#666');
        grad.addColorStop(0.48, '#262626');
        grad.addColorStop(1, '#050505');
        ctx.fillStyle = grad;
    } else {
        const grad = ctx.createRadialGradient(x - 4, y - 5, 2, x, y, radius);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.52, '#ececec');
        grad.addColorStop(1, '#bdbdbd');
        ctx.fillStyle = grad;
    }
    ctx.shadowColor = player === 1 ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.22)';
    ctx.shadowBlur = 6 * scale;
    ctx.shadowOffsetY = 2;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = player === 1 ? '#000' : '#999';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (options.marker) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
    }

    if (options.glow && options.glow > 0) {
        ctx.beginPath();
        ctx.arc(x, y, radius * (1.05 + options.glow * 0.9), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(251, 191, 36, ${0.42 * (1 - options.glow)})`;
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D) {
    const now = performance.now();
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_W);
    ctx.fillStyle = '#dcb35c';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_W);
    ctx.strokeStyle = '#6b4226';
    ctx.lineWidth = 1;

    for (let i = 0; i < BOARD_SIZE; i++) {
        const x = boardToCanvas(i);
        ctx.beginPath();
        ctx.moveTo(x, PADDING);
        ctx.lineTo(x, PADDING + (BOARD_SIZE - 1) * CELL_SIZE);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(PADDING, x);
        ctx.lineTo(PADDING + (BOARD_SIZE - 1) * CELL_SIZE, x);
        ctx.stroke();
    }

    for (const [r, c] of [
        [3, 3],
        [3, 7],
        [3, 11],
        [7, 3],
        [7, 7],
        [7, 11],
        [11, 3],
        [11, 7],
        [11, 11],
    ]) {
        ctx.beginPath();
        ctx.arc(boardToCanvas(c), boardToCanvas(r), 4, 0, Math.PI * 2);
        ctx.fillStyle = '#6b4226';
        ctx.fill();
    }

    if (game.state.value.winLine) {
        ctx.strokeStyle = 'rgba(255,215,0,0.6)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        const [fr, fc] = game.state.value.winLine[0];
        const [tr, tc] = game.state.value.winLine[4];
        ctx.moveTo(boardToCanvas(fc), boardToCanvas(fr));
        ctx.lineTo(boardToCanvas(tc), boardToCanvas(tr));
        ctx.stroke();
    }

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const stone = game.state.value.board[r][c];
            if (stone === 0) continue;
            const x = boardToCanvas(c);
            const y = boardToCanvas(r);
            const isLast = game.state.value.lastMove?.[0] === r && game.state.value.lastMove?.[1] === c;
            const animation = placeAnimation.value;

            if (animation && animation.row === r && animation.col === c && animation.player === stone) {
                const progress = Math.min(1, (now - animation.startedAt) / STONE_ANIMATION_MS);
                const drop = easeOutBack(Math.min(1, progress * 1.08));
                const settle = Math.max(0, 1 - Math.abs(progress - 0.72) / 0.28);
                const glow = progress < 1 ? easeOutCubic(progress) : 0;
                drawStone(ctx, x, y - (1 - drop) * CELL_SIZE * 1.35, stone, {
                    scale: 0.72 + Math.min(1, progress * 1.25) * 0.28,
                    alpha: Math.min(1, 0.35 + progress * 0.65),
                    squash: settle * 0.7,
                    glow,
                    marker: progress >= 0.82,
                });
                if (progress >= 1) placeAnimation.value = null;
            } else {
                drawStone(ctx, x, y, stone, { marker: isLast });
            }
        }
    }

    if (hoverPos.value && game.isMyTurn.value) {
        const [hr, hc] = hoverPos.value;
        ctx.beginPath();
        ctx.arc(boardToCanvas(hc), boardToCanvas(hr), CELL_SIZE * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = game.myStone.value === 1 ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.28)';
        ctx.fill();
        ctx.strokeStyle = game.myStone.value === 1 ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    ctx.fillStyle = '#6b4226';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i < BOARD_SIZE; i++) {
        ctx.fillText(String.fromCharCode(65 + i), boardToCanvas(i), 2);
        ctx.fillText(`${BOARD_SIZE - i}`, 2, boardToCanvas(i) - 5);
    }
}

function renderLoop() {
    const canvas = canvasRef.value;
    const ctx = canvas?.getContext('2d');
    if (ctx) draw(ctx);
    renderRaf = requestAnimationFrame(renderLoop);
}

function updateHover(mx: number, my: number) {
    if (!game.isMyTurn.value) {
        hoverPos.value = null;
        return;
    }
    const row = canvasToBoard(my);
    const col = canvasToBoard(mx);
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE || game.state.value.board[row][col] !== 0) {
        hoverPos.value = null;
        return;
    }
    hoverPos.value = [row, col];
}

function eventToCanvas(e: MouseEvent): [number, number] | null {
    const canvas = canvasRef.value;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return [((e.clientX - rect.left) * canvas.width) / rect.width, ((e.clientY - rect.top) * canvas.height) / rect.height];
}

function handleCanvasClick(e: MouseEvent) {
    const point = eventToCanvas(e);
    if (!point || !game.isMyTurn.value) return;
    const row = canvasToBoard(point[1]);
    const col = canvasToBoard(point[0]);
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return;
    if (game.state.value.board[row][col] !== 0) return;
    game.placeStone(row, col);
}

function handleCanvasMove(e: MouseEvent) {
    const point = eventToCanvas(e);
    if (point) updateHover(point[0], point[1]);
}

onMounted(renderLoop);

onUnmounted(() => {
    if (renderRaf) cancelAnimationFrame(renderRaf);
});
</script>

<template>
    <div class="gomoku-lan-page min-h-screen select-none overflow-hidden text-white">
        <header class="page-header">
            <button class="nav-button" @click="router.push('/')">
                <ArrowLeft class="h-4 w-4" /> 返回
            </button>
            <div class="title-block">
                <h1>五子棋局域网</h1>
                <p>{{ game.roomId.value ? `房间 ${game.roomId.value}` : '双人联机对弈' }}</p>
            </div>
            <button v-if="game.roomId.value" class="nav-button" @click="game.copyRoomId()">
                <Copy class="h-4 w-4" /> {{ game.copied.value ? '已复制' : '房间号' }}
            </button>
        </header>

        <main class="game-shell">
            <aside class="lan-panel">
                <section class="panel-section">
                    <div class="section-title">
                        <Users class="h-4 w-4" />
                        <span>局域网房间</span>
                    </div>
                    <div class="room-code" :class="{ empty: !game.roomId.value }">
                        {{ game.roomId.value || '----' }}
                    </div>
                    <div class="status-grid">
                        <div>
                            <span>身份</span>
                            <strong>{{ game.roomId.value ? game.myLabel.value : '未加入' }}</strong>
                        </div>
                        <div>
                            <span>人数</span>
                            <strong>{{ game.playerCount.value }}/{{ game.playerLimit }}</strong>
                        </div>
                    </div>
                    <p class="state-message">{{ game.state.value.message }}</p>
                    <p v-if="game.error.value" class="error-message">{{ game.error.value }}</p>
                </section>

                <section v-if="!game.roomId.value" class="panel-section controls">
                    <button class="primary-button" @click="game.createRoom()">
                        <Plus class="h-4 w-4" /> 创建房间
                    </button>
                    <div class="join-row">
                        <input v-model="game.joinRoomId.value" maxlength="4" placeholder="房间号" @keyup.enter="game.joinRoom()" />
                        <button class="icon-button" @click="game.joinRoom()">
                            <LogIn class="h-4 w-4" />
                        </button>
                    </div>
                </section>

                <section v-else class="panel-section controls">
                    <button class="primary-button" :disabled="!game.canStart.value" @click="game.startGame()">
                        <Play class="h-4 w-4" /> 开始棋局
                    </button>
                    <button class="secondary-button" :disabled="!game.isHost.value" @click="game.restartGame()">
                        <RotateCcw class="h-4 w-4" /> 重新开始
                    </button>
                </section>

                <section class="panel-section seats">
                    <div class="seat" :class="{ active: game.state.value.currentPlayer === 1, mine: game.localPlayer.value === 0 }">
                        <span class="stone black" />
                        <div>
                            <strong>黑棋</strong>
                            <small>房主</small>
                        </div>
                    </div>
                    <div class="seat" :class="{ active: game.state.value.currentPlayer === 2, mine: game.localPlayer.value === 1 }">
                        <span class="stone white" />
                        <div>
                            <strong>白棋</strong>
                            <small>{{ game.playerCount.value >= 2 ? '已加入' : '等待加入' }}</small>
                        </div>
                    </div>
                </section>
            </aside>

            <section class="board-section">
                <div class="turn-strip">
                    <span class="turn-dot" :class="game.state.value.currentPlayer === 1 ? 'black' : 'white'" />
                    <span>
                        {{
                            game.state.value.phase === 'playing'
                                ? game.isMyTurn.value
                                    ? '轮到你落子'
                                    : `等待${game.opponentLabel.value}落子`
                                : game.state.value.phase === 'ended'
                                  ? game.state.value.message
                                  : '创建或加入房间后开始'
                        }}
                    </span>
                </div>

                <div class="board-frame">
                    <canvas
                        ref="canvasRef"
                        :width="CANVAS_W"
                        :height="CANVAS_W"
                        class="board-canvas"
                        @click="handleCanvasClick"
                        @mousemove="handleCanvasMove"
                        @mouseleave="hoverPos = null"
                    />
                    <div v-if="game.state.value.phase === 'lobby'" class="board-overlay">
                        <div>
                            <p>{{ game.roomId.value ? '等待玩家到齐后由房主开始' : '先创建或加入一个房间' }}</p>
                        </div>
                    </div>
                    <div v-if="game.state.value.phase === 'ended'" class="board-overlay ended">
                        <div>
                            <p>{{ game.state.value.message }}</p>
                            <button v-if="game.isHost.value" class="primary-button compact" @click="game.restartGame()">
                                <RotateCcw class="h-4 w-4" /> 再来一局
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    </div>
</template>

<style scoped>
.gomoku-lan-page {
    background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent 34%),
        linear-gradient(135deg, #111827 0%, #1f2937 48%, #0f172a 100%);
}

.page-header {
    display: grid;
    grid-template-columns: 160px 1fr 160px;
    align-items: center;
    gap: 12px;
    width: min(1180px, calc(100% - 28px));
    margin: 0 auto;
    padding: 14px 0 10px;
}

.title-block {
    text-align: center;
}

.title-block h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    color: #f8fafc;
}

.title-block p {
    margin: 4px 0 0;
    font-size: 12px;
    color: #94a3b8;
}

.nav-button,
.icon-button,
.primary-button,
.secondary-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    min-height: 38px;
    padding: 0 12px;
    font-size: 14px;
    font-weight: 700;
    transition: 160ms ease;
}

.nav-button,
.secondary-button,
.icon-button {
    background: rgba(255, 255, 255, 0.07);
    color: #cbd5e1;
}

.nav-button:hover,
.secondary-button:hover,
.icon-button:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
}

.primary-button {
    background: #b45309;
    color: #fff;
    border-color: rgba(251, 191, 36, 0.34);
}

.primary-button:hover {
    background: #d97706;
}

button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
}

.game-shell {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
    gap: 18px;
    width: min(1180px, calc(100% - 28px));
    height: calc(100dvh - 76px);
    margin: 0 auto;
    min-height: 0;
}

.lan-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
}

.panel-section {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.72);
    padding: 14px;
}

.section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    color: #e2e8f0;
    font-size: 14px;
    font-weight: 800;
}

.room-code {
    display: grid;
    place-items: center;
    min-height: 70px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.22);
    color: #fbbf24;
    font-size: 34px;
    font-weight: 900;
    letter-spacing: 5px;
}

.room-code.empty {
    color: #475569;
}

.status-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-top: 10px;
}

.status-grid div {
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
    padding: 10px;
}

.status-grid span,
.seat small {
    display: block;
    color: #94a3b8;
    font-size: 12px;
}

.status-grid strong,
.seat strong {
    display: block;
    color: #f8fafc;
    font-size: 14px;
    margin-top: 3px;
}

.state-message,
.error-message {
    margin: 12px 0 0;
    font-size: 13px;
    line-height: 1.6;
    color: #cbd5e1;
}

.error-message {
    color: #fca5a5;
}

.controls {
    display: grid;
    gap: 10px;
}

.join-row {
    display: grid;
    grid-template-columns: 1fr 42px;
    gap: 8px;
}

.join-row input {
    min-width: 0;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    padding: 0 12px;
    color: #fff;
    font-weight: 800;
    letter-spacing: 2px;
    text-transform: uppercase;
    outline: none;
}

.seats {
    display: grid;
    gap: 10px;
}

.seat {
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    padding: 10px;
}

.seat.active {
    border-color: rgba(251, 191, 36, 0.58);
    background: rgba(251, 191, 36, 0.1);
}

.seat.mine {
    box-shadow: inset 3px 0 0 #f59e0b;
}

.stone,
.turn-dot {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    flex: none;
}

.stone.black,
.turn-dot.black {
    background: radial-gradient(circle at 35% 28%, #666, #050505 72%);
    border: 1px solid #000;
}

.stone.white,
.turn-dot.white {
    background: radial-gradient(circle at 35% 28%, #fff, #d4d4d4 72%);
    border: 1px solid #9ca3af;
}

.board-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 0;
    gap: 10px;
}

.turn-strip {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(15, 23, 42, 0.7);
    padding: 0 16px;
    color: #e2e8f0;
    font-size: 14px;
    font-weight: 800;
}

.turn-dot {
    width: 13px;
    height: 13px;
}

.board-frame {
    position: relative;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(15, 23, 42, 0.75);
    padding: 6px;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.32);
}

.board-canvas {
    display: block;
    width: min(72vh, 72vw, 552px);
    aspect-ratio: 1;
    border-radius: 4px;
    cursor: pointer;
}

.board-overlay {
    position: absolute;
    inset: 6px;
    display: grid;
    place-items: center;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.42);
    text-align: center;
    color: #e2e8f0;
    font-weight: 800;
    pointer-events: none;
}

.board-overlay.ended {
    background: rgba(0, 0, 0, 0.52);
    backdrop-filter: blur(3px);
    pointer-events: auto;
}

.compact {
    margin-top: 12px;
}

@media (max-width: 900px) {
    .page-header {
        grid-template-columns: 1fr;
    }

    .nav-button {
        justify-self: start;
    }

    .game-shell {
        grid-template-columns: 1fr;
        height: auto;
        overflow: auto;
        padding-bottom: 18px;
    }

    .lan-panel {
        order: 2;
    }

    .board-canvas {
        width: min(calc(100vw - 44px), 552px);
    }
}
</style>
