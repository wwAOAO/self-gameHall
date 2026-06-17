<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Copy, LogIn, Play, Plus, RotateCcw, Users } from 'lucide-vue-next';
import { useChineseChessLan } from '@/composables/useChineseChessLan';
import { getLegalMovesForPiece, getPieceAt, useChineseChess, type Side } from '@/composables/useChineseChess';

const router = useRouter();
const lan = useChineseChessLan();
const board = useChineseChess();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const isFlipped = computed(() => lan.mySide.value === 'black');

let renderRaf: number | null = null;
let syncedBoardKey = '';

const statusText = computed(() => {
    if (lan.state.value.phase === 'playing') {
        return lan.isMyTurn.value ? '\u8f6e\u5230\u4f60\u8d70\u68cb' : `\u7b49\u5f85${lan.opponentLabel.value}\u8d70\u68cb`;
    }
    if (lan.state.value.phase === 'ended') return lan.state.value.message;
    return lan.roomId.value
        ? '\u7b49\u5f85\u53cc\u65b9\u5230\u9f50\u540e\u7531\u623f\u4e3b\u5f00\u59cb'
        : '\u521b\u5efa\u6216\u52a0\u5165\u4e00\u4e2a\u5c40\u57df\u7f51\u623f\u95f4';
});

function phaseToGameStatus(phase: string): 'idle' | 'playing' | 'ended' {
    if (phase === 'playing') return 'playing';
    if (phase === 'ended') return 'ended';
    return 'idle';
}

function syncBoard() {
    const nextKey = [
        lan.state.value.turnNo,
        lan.state.value.phase,
        lan.state.value.currentSide,
        lan.localPlayer.value,
        lan.state.value.lastMove
            ? `${lan.state.value.lastMove.fromRow},${lan.state.value.lastMove.fromCol}-${lan.state.value.lastMove.toRow},${lan.state.value.lastMove.toCol}`
            : 'none',
    ].join('|');
    if (nextKey === syncedBoardKey) return;
    syncedBoardKey = nextKey;

    board.syncExternalState({
        pieces: lan.state.value.pieces,
        currentSide: lan.state.value.currentSide,
        gameStatus: phaseToGameStatus(lan.state.value.phase),
        playerSide: lan.mySide.value,
        message: lan.state.value.message,
        moveHistory: lan.state.value.moveHistory,
        lastMove: lan.state.value.lastMove,
        turnNo: lan.state.value.turnNo,
    });
}

watch(
    () => [lan.state.value.turnNo, lan.state.value.phase, lan.state.value.currentSide, lan.localPlayer.value] as const,
    syncBoard,
    { immediate: true },
);

function eventToCanvas(e: MouseEvent): [number, number] | null {
    const canvas = canvasRef.value;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const y = ((e.clientY - rect.top) * canvas.height) / rect.height;
    return isFlipped.value ? [canvas.width - x, canvas.height - y] : [x, y];
}

function canvasToBoard(mx: number, my: number): [number, number] | null {
    const col = Math.round((mx - 32) / 56);
    const row = Math.round((my - 32) / 56);
    if (row < 0 || row >= 10 || col < 0 || col >= 9) return null;
    const cx = 32 + col * 56;
    const cy = 32 + row * 56;
    if (Math.hypot(mx - cx, my - cy) > 56 * 0.45) return null;
    return [row, col];
}

function handleCanvasClick(e: MouseEvent) {
    if (!lan.isMyTurn.value) return;
    const point = eventToCanvas(e);
    if (!point) return;
    const pos = canvasToBoard(point[0], point[1]);
    if (!pos) {
        board.selectedPiece.value = null;
        board.validMoves.value = [];
        return;
    }

    const [row, col] = pos;
    if (board.selectedPiece.value && board.validMoves.value.some(([r, c]) => r === row && c === col)) {
        lan.movePiece(board.selectedPiece.value.row, board.selectedPiece.value.col, row, col);
        board.selectedPiece.value = null;
        board.validMoves.value = [];
        return;
    }

    const piece = getPieceAt(board.pieces.value, row, col);
    if (piece && piece.side === lan.mySide.value) {
        board.selectedPiece.value = piece;
        board.validMoves.value = getLegalMovesForPiece(piece, board.pieces.value);
        return;
    }

    board.selectedPiece.value = null;
    board.validMoves.value = [];
}

function renderLoop() {
    const canvas = canvasRef.value;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
        if (isFlipped.value) {
            ctx.save();
            ctx.translate(canvas.width, canvas.height);
            ctx.rotate(Math.PI);
            board.draw(ctx, { flipped: true });
            ctx.restore();
        } else {
            board.draw(ctx);
        }
    }
    renderRaf = requestAnimationFrame(renderLoop);
}

function sideLabel(side: Side) {
    return side === 'red' ? '\u7ea2\u65b9' : '\u9ed1\u65b9';
}

function roomCopyLabel() {
    return lan.copied.value ? '\u5df2\u590d\u5236' : '\u623f\u95f4\u53f7';
}

function joinedLabel() {
    return lan.roomId.value ? lan.myLabel.value : '\u672a\u52a0\u5165';
}

function blackSeatStatus() {
    return lan.playerCount.value >= 2 ? '\u5df2\u52a0\u5165' : '\u7b49\u5f85\u52a0\u5165';
}

function lobbyOverlayText() {
    return lan.roomId.value
        ? '\u7b49\u5f85\u53cc\u65b9\u5230\u9f50\u540e\u7531\u623f\u4e3b\u5f00\u59cb'
        : '\u5148\u521b\u5efa\u6216\u52a0\u5165\u4e00\u4e2a\u623f\u95f4';
}

function getLastMoves() {
    return lan.state.value.moveHistory.slice(-8);
}

onMounted(renderLoop);

onUnmounted(() => {
    if (renderRaf) cancelAnimationFrame(renderRaf);
    board.clearAITimer();
});
</script>

<template>
    <div class="chess-screen min-h-screen flex flex-col select-none overflow-hidden" style="height: 100dvh">
        <header class="page-header">
            <button class="nav-button" @click="router.push('/')"><ArrowLeft class="w-4 h-4" /> &#x8fd4;&#x56de;</button>
            <h1>
                <span class="text-[#f6d28a]">&#x4e2d;&#x56fd;&#x8c61;&#x68cb;&#x5c40;&#x57df;&#x7f51;</span>
                <span class="text-[#9b8a70] text-sm sm:text-base ml-2 font-semibold">LAN Battle</span>
            </h1>
            <button v-if="lan.roomId.value" class="nav-button justify-self-end" @click="lan.copyRoomId()">
                <Copy class="w-4 h-4" /> {{ roomCopyLabel() }}
            </button>
        </header>

        <main class="game-shell">
            <aside class="lan-panel">
                <section class="panel-section">
                    <div class="section-title"><Users class="w-4 h-4" /> &#x5c40;&#x57df;&#x7f51;&#x623f;&#x95f4;</div>
                    <div class="room-code" :class="{ empty: !lan.roomId.value }">{{ lan.roomId.value || '----' }}</div>
                    <div class="status-grid">
                        <div><span>&#x8eab;&#x4efd;</span><strong>{{ joinedLabel() }}</strong></div>
                        <div><span>&#x4eba;&#x6570;</span><strong>{{ lan.playerCount.value }}/{{ lan.playerLimit }}</strong></div>
                    </div>
                    <p class="state-message">{{ lan.state.value.message }}</p>
                    <p v-if="lan.error.value" class="error-message">{{ lan.error.value }}</p>
                </section>

                <section v-if="!lan.roomId.value" class="panel-section controls">
                    <button class="primary-button" @click="lan.createRoom()"><Plus class="w-4 h-4" /> &#x521b;&#x5efa;&#x623f;&#x95f4;</button>
                    <div class="join-row">
                        <input v-model="lan.joinRoomId.value" maxlength="4" placeholder="房间号" @keyup.enter="lan.joinRoom()" />
                        <button class="icon-button" @click="lan.joinRoom()"><LogIn class="w-4 h-4" /></button>
                    </div>
                </section>

                <section v-else class="panel-section controls">
                    <button class="primary-button" :disabled="!lan.canStart.value" @click="lan.startGame()">
                        <Play class="w-4 h-4" /> &#x5f00;&#x59cb;&#x68cb;&#x5c40;
                    </button>
                    <button class="secondary-button" :disabled="!lan.isHost.value" @click="lan.restartGame()">
                        <RotateCcw class="w-4 h-4" /> &#x91cd;&#x65b0;&#x5f00;&#x59cb;
                    </button>
                </section>

                <section class="panel-section seats">
                    <div class="seat" :class="{ active: lan.state.value.currentSide === 'red', mine: lan.mySide.value === 'red' }">
                        <span class="piece-dot red">&#x5e05;</span>
                        <div><strong>&#x7ea2;&#x65b9;</strong><small>&#x623f;&#x4e3b;</small></div>
                    </div>
                    <div class="seat" :class="{ active: lan.state.value.currentSide === 'black', mine: lan.mySide.value === 'black' }">
                        <span class="piece-dot black">&#x5c06;</span>
                        <div><strong>&#x9ed1;&#x65b9;</strong><small>{{ blackSeatStatus() }}</small></div>
                    </div>
                </section>
            </aside>

            <section class="board-section">
                <div class="status-bar">
                    <div class="turn-chip" :class="lan.state.value.currentSide === 'red' ? 'is-red' : 'is-black'">
                        <span class="turn-dot"></span>
                        <span>{{ sideLabel(lan.state.value.currentSide) }}</span>
                    </div>
                    <span class="status-text">{{ statusText }}</span>
                </div>

                <div class="board-layout">
                    <div class="board-shell">
                        <canvas
                            ref="canvasRef"
                            :width="board.getWidth()"
                            :height="board.getHeight()"
                            class="chess-canvas"
                            @click="handleCanvasClick"
                        ></canvas>

                        <div v-if="lan.state.value.phase === 'lobby'" class="board-overlay">
                            <div class="start-panel">
                                <p>{{ lobbyOverlayText() }}</p>
                            </div>
                        </div>

                        <div v-if="lan.state.value.phase === 'ended'" class="board-overlay ended">
                            <div class="start-panel">
                                <p class="text-xl font-black mb-3">{{ lan.state.value.message }}</p>
                                <button v-if="lan.isHost.value" class="primary-button" @click="lan.restartGame()">
                                    <RotateCcw class="w-4 h-4" /> &#x518d;&#x6765;&#x4e00;&#x5c40;
                                </button>
                            </div>
                        </div>
                    </div>

                    <div v-if="lan.state.value.phase !== 'lobby'" class="move-panel hidden sm:block">
                        <p>&#x68cb;&#x8c31;</p>
                        <div
                            v-for="(entry, i) in getLastMoves()"
                            :key="i"
                            class="move-entry"
                            :class="entry.startsWith('红') ? 'is-red' : 'is-black'"
                        >
                            {{ entry }}
                        </div>
                    </div>
                </div>
            </section>
        </main>
    </div>
</template>

<style scoped>
:global(html),
:global(body),
:global(#app) {
    min-height: 100%;
    background: #15120f;
}

.chess-screen {
    background:
        linear-gradient(135deg, rgba(49, 23, 16, 0.42), transparent 36%),
        linear-gradient(225deg, rgba(16, 54, 48, 0.32), transparent 40%), #15120f;
    color: #f4dfbd;
}

.page-header {
    display: grid;
    grid-template-columns: 180px 1fr 180px;
    align-items: center;
    gap: 12px;
    width: min(1180px, calc(100% - 28px));
    margin: 0 auto;
    padding: 12px 0 8px;
}

.page-header h1 {
    text-align: center;
    font-size: 22px;
    font-weight: 900;
}

.nav-button,
.icon-button,
.secondary-button,
.primary-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    border-radius: 0.5rem;
    transition:
        transform 160ms ease,
        border-color 160ms ease,
        background 160ms ease,
        color 160ms ease;
}

.nav-button,
.icon-button,
.secondary-button {
    border: 1px solid rgba(214, 168, 100, 0.28);
    color: #e8d1a9;
    background: rgba(45, 34, 25, 0.86);
}

.nav-button {
    min-height: 38px;
    padding: 0 12px;
    font-size: 14px;
    font-weight: 800;
}

.primary-button {
    min-height: 38px;
    padding: 0 12px;
    border: 1px solid rgba(246, 205, 132, 0.34);
    color: #220c08;
    font-size: 14px;
    font-weight: 900;
    background: linear-gradient(180deg, #ffd98a, #d99032);
}

button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
}

.game-shell {
    display: grid;
    grid-template-columns: 290px minmax(0, 1fr);
    gap: 16px;
    width: min(1180px, calc(100% - 28px));
    height: calc(100dvh - 70px);
    margin: 0 auto;
    min-height: 0;
}

.lan-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.panel-section,
.status-bar,
.move-panel {
    border: 1px solid rgba(213, 161, 86, 0.25);
    border-radius: 0.5rem;
    background: rgba(29, 23, 19, 0.82);
    box-shadow: 0 16px 34px rgba(0, 0, 0, 0.28);
}

.panel-section {
    padding: 14px;
}

.section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    color: #f1d9ad;
    font-size: 14px;
    font-weight: 900;
}

.room-code {
    display: grid;
    place-items: center;
    min-height: 68px;
    border-radius: 0.5rem;
    background: rgba(0, 0, 0, 0.24);
    color: #f6d28a;
    font-size: 34px;
    font-weight: 950;
    letter-spacing: 5px;
}

.room-code.empty {
    color: #6b5b45;
}

.status-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-top: 10px;
}

.status-grid div,
.seat {
    border-radius: 0.5rem;
    background: rgba(255, 226, 161, 0.07);
    padding: 10px;
}

.status-grid span,
.seat small {
    display: block;
    color: #b99c72;
    font-size: 12px;
}

.status-grid strong,
.seat strong {
    display: block;
    color: #f7dca3;
    font-size: 14px;
    margin-top: 3px;
}

.state-message,
.error-message {
    margin: 12px 0 0;
    font-size: 13px;
    line-height: 1.6;
    color: #d8cab4;
}

.error-message {
    color: #fca5a5;
}

.controls,
.seats {
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
    border: 1px solid rgba(214, 168, 100, 0.28);
    border-radius: 0.5rem;
    background: rgba(0, 0, 0, 0.18);
    padding: 0 12px;
    color: #f7dca3;
    font-weight: 900;
    letter-spacing: 2px;
    text-transform: uppercase;
    outline: none;
}

.seat {
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid rgba(246, 205, 132, 0.12);
}

.seat.active {
    border-color: rgba(255, 217, 138, 0.65);
    background: rgba(255, 217, 138, 0.12);
}

.seat.mine {
    box-shadow: inset 3px 0 0 #d99032;
}

.piece-dot {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: #f4d494;
    font-family: KaiTi, STKaiti, serif;
    font-weight: 900;
}

.piece-dot.red {
    color: #c62828;
}

.piece-dot.black {
    color: #1a1a2e;
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

.status-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    min-height: 2.35rem;
    padding: 0.35rem 0.7rem;
}

.turn-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.38rem;
    min-width: 4.25rem;
    font-size: 0.8rem;
    font-weight: 900;
}

.turn-dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 999px;
}

.turn-chip.is-red {
    color: #ffb0a0;
}

.turn-chip.is-red .turn-dot {
    background: #dd3e32;
}

.turn-chip.is-black {
    color: #d5c9b5;
}

.turn-chip.is-black .turn-dot {
    background: #24201d;
    border: 1px solid #7b6d5d;
}

.status-text {
    color: #f1d9ad;
    font-size: 0.875rem;
    font-weight: 800;
}

.board-layout {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    gap: 12px;
}

.board-shell {
    position: relative;
    padding: 0.55rem;
    border-radius: 0.625rem;
    border: 1px solid rgba(246, 205, 132, 0.28);
    background: linear-gradient(180deg, #392216, #1c1714);
    box-shadow:
        0 26px 60px rgba(0, 0, 0, 0.48),
        inset 0 1px 0 rgba(255, 244, 206, 0.2);
}

.chess-canvas {
    display: block;
    width: min(64vh, 64vw, 512px);
    height: auto;
    border-radius: 0.45rem;
    cursor: pointer;
    box-shadow:
        inset 0 0 0 1px rgba(75, 35, 13, 0.6),
        0 12px 26px rgba(0, 0, 0, 0.28);
}

.board-overlay {
    position: absolute;
    inset: 0.55rem;
    display: grid;
    place-items: center;
    border-radius: 0.45rem;
    background: rgba(18, 13, 9, 0.56);
    color: #f7dca3;
    font-weight: 900;
    text-align: center;
    pointer-events: none;
}

.board-overlay.ended {
    background: rgba(18, 13, 9, 0.68);
    backdrop-filter: blur(3px);
    pointer-events: auto;
}

.start-panel {
    width: min(72%, 260px);
    padding: 1rem;
    border-radius: 0.625rem;
    border: 1px solid rgba(246, 205, 132, 0.28);
    background: rgba(31, 20, 14, 0.86);
    text-align: center;
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.36);
}

.move-panel {
    width: 146px;
    max-height: 500px;
    overflow-y: auto;
    padding: 0.65rem;
}

.move-panel p {
    color: #b99c72;
    font-size: 12px;
    font-weight: 900;
    text-align: center;
    margin-bottom: 8px;
}

.move-entry {
    padding: 0.25rem 0.38rem;
    border-radius: 0.35rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.7rem;
    line-height: 1.35;
    margin-bottom: 0.25rem;
}

.move-entry.is-red {
    color: #ffb3a6;
    background: rgba(150, 37, 27, 0.24);
}

.move-entry.is-black {
    color: #d8cab4;
    background: rgba(255, 230, 182, 0.08);
}

@media (max-width: 900px) {
    .page-header {
        grid-template-columns: 1fr;
    }

    .page-header h1 {
        order: -1;
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

    .chess-canvas {
        width: min(calc(100vw - 44px), 512px);
    }
}
</style>
