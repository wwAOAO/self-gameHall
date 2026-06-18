<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useLudo, type BoardCell, type LudoPlayer, type PieceView } from '@/composables/useLudo';
import type { CSSProperties } from 'vue';
import { ArrowLeft, Bot, CircleDot, Plane, Play, RotateCcw, Trophy } from 'lucide-vue-next';

const router = useRouter();
const game = useLudo();

function cellClasses(cell: BoardCell) {
    const owner = game.laneOwner(cell) ?? game.homeOwner(cell);
    return {
        track: game.isTrackCell(cell),
        start: game.isStartCell(cell),
        lane: game.laneOwner(cell) !== null,
        home: game.homeOwner(cell) !== null,
        center: cell.x === 7 && cell.y === 7,
        red: owner === 0,
        blue: owner === 1,
        green: owner === 2,
        yellow: owner === 3,
    };
}

function pieceClass(piece: PieceView) {
    return {
        red: piece.player === 0,
        blue: piece.player === 1,
        green: piece.player === 2,
        yellow: piece.player === 3,
        legal: game.isLegalPiece(piece.player, piece.piece.id),
        last: game.lastMove.value?.player === piece.player && game.lastMove.value.piece === piece.piece.id + 1,
        hidden: isAnimatingPiece(piece),
    };
}

function isAnimatingPiece(piece: PieceView) {
    const animation = game.flightAnimation.value;
    return animation?.player === piece.player && animation.pieceId === piece.piece.id;
}

function getPieceStyle(index: number, total: number): CSSProperties {
    if (total <= 1) return {};

    const offsets =
        total === 2
            ? [
                  [-7, -5],
                  [7, 5],
              ]
            : total === 3
              ? [
                    [-8, -6],
                    [8, -6],
                    [0, 8],
                ]
              : [
                    [-8, -8],
                    [8, -8],
                    [-8, 8],
                    [8, 8],
                ];
    const [x, y] = offsets[index % offsets.length];
    const scale = total > 3 ? 0.78 : 0.86;

    return {
        '--piece-x': `${x}px`,
        '--piece-y': `${y}px`,
        '--piece-scale': String(scale),
    } as CSSProperties;
}

function getFlightPieceStyle(): CSSProperties {
    const animation = game.flightAnimation.value;
    if (!animation) return {};

    return {
        '--flight-from-x': `${((animation.from.x - 0.5) / 15) * 100}%`,
        '--flight-from-y': `${((animation.from.y - 0.5) / 15) * 100}%`,
        '--flight-to-x': `${((animation.to.x - 0.5) / 15) * 100}%`,
        '--flight-to-y': `${((animation.to.y - 0.5) / 15) * 100}%`,
    } as CSSProperties;
}

function getFlightPieceClass() {
    const animation = game.flightAnimation.value;
    if (!animation) return {};

    return {
        [game.players.value[animation.player].color]: true,
        takeoff: animation.kind === 'takeoff',
    };
}

function getPieceTitle(piece: PieceView) {
    const player = game.players.value[piece.player];
    return `${player.name} ${piece.piece.id + 1}号飞机`;
}

function statsText(player: LudoPlayer) {
    const stats = game.playerStats(player.id);
    return `基地 ${stats.home} / 航行 ${stats.flying} / 到达 ${stats.finished}`;
}
</script>

<template>
    <div class="ludo-page min-h-screen flex flex-col select-none overflow-hidden">
        <header class="topbar">
            <button class="icon-text-button" @click="router.push('/')">
                <ArrowLeft class="w-4 h-4" />
                返回
            </button>

            <div class="title-block">
                <h1>飞行棋</h1>
                <span>1 名玩家和 3 个 AI</span>
            </div>

            <button
                class="icon-button"
                title="重新开始"
                :class="{ hidden: game.phase.value === 'idle' }"
                @click="game.startGame()"
            >
                <RotateCcw class="w-4 h-4" />
            </button>
        </header>

        <main class="game-shell">
            <section class="board-panel">
                <div class="board-grid">
                    <div
                        v-for="cell in game.boardCells.value"
                        :key="cell.key"
                        class="board-cell"
                        :class="cellClasses(cell)"
                    >
                        <CircleDot v-if="cell.x === 7 && cell.y === 7" class="center-mark" />
                        <div class="piece-stack" :class="{ many: game.getPiecesAt(cell).length > 1 }">
                            <button
                                v-for="(piece, pieceIndex) in game.getPiecesAt(cell)"
                                :key="`${piece.player}-${piece.piece.id}`"
                                class="plane-piece"
                                :class="pieceClass(piece)"
                                :style="getPieceStyle(pieceIndex, game.getPiecesAt(cell).length)"
                                :title="getPieceTitle(piece)"
                                :disabled="piece.player !== 0 || !game.isLegalPiece(piece.player, piece.piece.id)"
                                @click.stop="game.movePiece(piece.piece.id)"
                            >
                                <Plane class="plane-icon" />
                                <span>{{ piece.piece.id + 1 }}</span>
                            </button>
                        </div>
                    </div>
                    <div
                        v-if="game.flightAnimation.value"
                        class="flight-piece"
                        :class="getFlightPieceClass()"
                        :style="getFlightPieceStyle()"
                    >
                        <Plane class="plane-icon" />
                        <span>{{ game.flightAnimation.value.pieceId + 1 }}</span>
                    </div>
                </div>
            </section>

            <aside class="side-panel">
                <section class="control-panel">
                    <div class="turn-row">
                        <div class="turn-avatar" :class="game.activePlayer.value.color">
                            <Bot v-if="game.activePlayer.value.isAI" class="w-5 h-5" />
                            <Plane v-else class="w-5 h-5" />
                        </div>
                        <div>
                            <div class="turn-label">当前回合</div>
                            <strong>{{ game.activePlayer.value.name }}</strong>
                        </div>
                    </div>

                    <div class="dice-box" :class="{ rolling: game.diceRolling.value }">
                        <span v-if="game.diceRolling.value">{{ game.dicePreview.value ?? '?' }}</span>
                        <span v-else-if="game.dice.value">{{ game.dice.value }}</span>
                        <span v-else>?</span>
                    </div>

                    <p class="message">{{ game.message.value }}</p>

                    <button v-if="game.phase.value === 'idle'" class="primary-button" @click="game.startGame()">
                        <Play class="w-4 h-4" />
                        开始游戏
                    </button>
                    <button v-else-if="game.canHumanRoll.value" class="primary-button" @click="game.rollDice()">
                        <CircleDot class="w-4 h-4" />
                        投骰子
                    </button>
                    <button v-else-if="game.canHumanMove.value" class="hint-button" disabled>选择高亮飞机</button>
                    <button v-else-if="game.phase.value === 'ended'" class="primary-button" @click="game.startGame()">
                        <RotateCcw class="w-4 h-4" />
                        再来一局
                    </button>
                    <button v-else class="hint-button" disabled>AI 行动中</button>
                </section>

                <section class="players-panel">
                    <div
                        v-for="player in game.players.value"
                        :key="player.id"
                        class="player-card"
                        :class="[
                            player.color,
                            { active: game.currentPlayer.value === player.id, winner: game.winner.value === player.id },
                        ]"
                    >
                        <div class="player-head">
                            <span class="player-dot"></span>
                            <div>
                                <strong>{{ player.name }}</strong>
                                <p>{{ statsText(player) }}</p>
                            </div>
                            <Trophy v-if="game.winner.value === player.id" class="w-4 h-4 trophy" />
                        </div>
                    </div>
                </section>

                <section class="log-panel">
                    <div v-if="game.eventLog.value.length === 0" class="empty-log">行动记录会显示在这里</div>
                    <div v-for="item in game.eventLog.value" :key="item" class="log-item">{{ item }}</div>
                </section>
            </aside>
        </main>
    </div>
</template>

<style scoped>
.ludo-page {
    height: 100dvh;
    color: #dceff5;
    background:
        radial-gradient(circle at 20% 14%, rgba(34, 211, 238, 0.18), transparent 30%),
        radial-gradient(circle at 84% 18%, rgba(245, 158, 11, 0.12), transparent 28%),
        linear-gradient(145deg, #16313f 0%, #203f48 46%, #253f36 100%);
}

.topbar {
    width: min(1320px, 100%);
    margin: 0 auto;
    padding: 14px 16px 8px;
    display: grid;
    grid-template-columns: 96px 1fr 44px;
    align-items: center;
    gap: 12px;
}

.icon-text-button,
.icon-button,
.primary-button,
.hint-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 8px;
    font-weight: 800;
    transition:
        transform 160ms ease,
        filter 160ms ease,
        background 160ms ease;
}

.icon-text-button,
.icon-button {
    height: 38px;
    color: #d8eef5;
    background: rgba(22, 49, 63, 0.66);
    border: 1px solid rgba(171, 219, 230, 0.2);
}

.icon-text-button {
    padding: 0 12px;
    font-size: 13px;
}

.icon-button {
    width: 38px;
}

.icon-button.hidden {
    visibility: hidden;
}

.icon-text-button:hover,
.icon-button:hover,
.primary-button:hover {
    filter: brightness(1.04);
    transform: translateY(-1px);
}

.title-block {
    text-align: center;
    line-height: 1.05;
}

.title-block h1 {
    font-size: clamp(24px, 4vw, 38px);
    font-weight: 950;
    color: #9fe7f2;
}

.title-block span {
    font-size: 12px;
    color: rgba(216, 239, 245, 0.62);
}

.game-shell {
    flex: 1;
    min-height: 0;
    width: min(1320px, 100%);
    margin: 0 auto;
    padding: 8px 16px 18px;
    display: grid;
    grid-template-columns: 250px minmax(680px, 820px) 250px;
    gap: 16px;
}

.board-panel {
    min-height: 0;
    grid-column: 2;
    display: grid;
    place-items: center;
}

.board-grid {
    position: relative;
    width: min(100%, 86vh, 820px);
    aspect-ratio: 1;
    display: grid;
    grid-template-columns: repeat(15, 1fr);
    grid-template-rows: repeat(15, 1fr);
    gap: 3px;
    padding: 12px;
    border-radius: 8px;
    background:
        linear-gradient(145deg, rgba(35, 72, 82, 0.92), rgba(42, 84, 84, 0.9)),
        repeating-linear-gradient(45deg, transparent 0 18px, rgba(209, 250, 229, 0.05) 18px 36px);
    border: 1px solid rgba(188, 229, 233, 0.22);
    box-shadow:
        0 22px 54px rgba(3, 18, 24, 0.36),
        inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.board-cell {
    position: relative;
    min-width: 0;
    min-height: 0;
    display: grid;
    place-items: center;
    border-radius: 7px;
    background: rgba(64, 99, 104, 0.48);
}

.board-cell.track {
    background: #bed3d4;
    border: 1px solid rgba(15, 45, 56, 0.22);
    box-shadow: inset 0 -2px 0 rgba(13, 71, 88, 0.1);
}

.board-cell.start {
    box-shadow: inset 0 0 0 2px rgba(15, 23, 42, 0.22);
}

.board-cell.lane {
    border: 1px dashed rgba(15, 23, 42, 0.16);
}

.board-cell.home {
    border: 1px solid rgba(15, 23, 42, 0.12);
}

.board-cell.red {
    background: #d89792;
}

.board-cell.blue {
    background: #93b5d8;
}

.board-cell.green {
    background: #91bf9a;
}

.board-cell.yellow {
    background: #d8bf7f;
}

.board-cell.center {
    background: conic-gradient(from 45deg, #d89792, #93b5d8, #91bf9a, #d8bf7f, #d89792);
    border: 1px solid rgba(15, 45, 56, 0.2);
}

.center-mark {
    width: 45%;
    height: 45%;
    color: rgba(18, 44, 52, 0.5);
}

.piece-stack {
    position: absolute;
    inset: 4px;
    pointer-events: none;
}

.piece-stack.many {
    z-index: 4;
}

.plane-piece {
    --piece-x: 0px;
    --piece-y: 0px;
    --piece-scale: 1;
    position: absolute;
    left: 50%;
    top: 50%;
    width: min(82%, 38px);
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: white;
    border: 2px solid rgba(255, 255, 255, 0.8);
    box-shadow: 0 5px 12px rgba(15, 23, 42, 0.2);
    pointer-events: auto;
    transform: translate(calc(-50% + var(--piece-x)), calc(-50% + var(--piece-y))) scale(var(--piece-scale));
    transition:
        transform 150ms ease,
        box-shadow 150ms ease;
}

.piece-stack.many .plane-piece {
    width: min(76%, 34px);
}

.plane-piece.red,
.turn-avatar.red,
.player-card.red .player-dot {
    background: #ef4444;
}

.plane-piece.blue,
.turn-avatar.blue,
.player-card.blue .player-dot {
    background: #3b82f6;
}

.plane-piece.green,
.turn-avatar.green,
.player-card.green .player-dot {
    background: #22c55e;
}

.plane-piece.yellow,
.turn-avatar.yellow,
.player-card.yellow .player-dot {
    background: #f59e0b;
}

.plane-piece.legal {
    cursor: pointer;
    animation: legalPulse 1s ease-in-out infinite;
}

.plane-piece.legal:hover {
    transform: translate(calc(-50% + var(--piece-x)), calc(-50% + var(--piece-y) - 3px))
        scale(calc(var(--piece-scale) * 1.06));
}

.plane-piece.hidden {
    opacity: 0;
}

.plane-piece.last {
    box-shadow:
        0 0 0 3px rgba(17, 24, 39, 0.22),
        0 8px 18px rgba(15, 23, 42, 0.24);
}

.flight-piece {
    --flight-from-x: 50%;
    --flight-from-y: 50%;
    --flight-to-x: 50%;
    --flight-to-y: 50%;
    position: absolute;
    left: var(--flight-from-x);
    top: var(--flight-from-y);
    z-index: 20;
    width: min(5.2%, 42px);
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: white;
    border: 2px solid rgba(255, 255, 255, 0.88);
    box-shadow:
        0 12px 24px rgba(0, 0, 0, 0.32),
        0 0 0 6px rgba(255, 255, 255, 0.12);
    pointer-events: none;
    animation: planeFly 680ms cubic-bezier(0.2, 0.82, 0.25, 1) both;
}

.flight-piece.takeoff {
    animation-duration: 760ms;
}

.flight-piece.red {
    background: #ef4444;
}

.flight-piece.blue {
    background: #3b82f6;
}

.flight-piece.green {
    background: #22c55e;
}

.flight-piece.yellow {
    background: #f59e0b;
}

.flight-piece span {
    position: absolute;
    right: -2px;
    bottom: -3px;
    width: 16px;
    height: 16px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #0f172a;
    background: #fff;
    font-size: 10px;
    font-weight: 950;
    line-height: 1;
}

.plane-piece:disabled {
    cursor: default;
}

.plane-icon {
    width: 58%;
    height: 58%;
}

.plane-piece span {
    position: absolute;
    right: -2px;
    bottom: -3px;
    width: 16px;
    height: 16px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #0f172a;
    background: #fff;
    font-size: 10px;
    font-weight: 950;
    line-height: 1;
}

.side-panel {
    min-height: 0;
    grid-column: 3;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.control-panel,
.players-panel,
.log-panel {
    border-radius: 8px;
    background: rgba(22, 49, 63, 0.7);
    border: 1px solid rgba(171, 219, 230, 0.18);
    box-shadow: 0 12px 30px rgba(3, 18, 24, 0.22);
}

.control-panel {
    padding: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
}

.turn-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
}

.turn-avatar {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: white;
    border: 2px solid rgba(255, 255, 255, 0.9);
}

.turn-label {
    color: rgba(216, 239, 245, 0.58);
    font-size: 12px;
    font-weight: 800;
}

.turn-row strong {
    color: #e5f7fb;
}

.dice-box {
    width: 86px;
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: #eafcff;
    background: linear-gradient(145deg, #2b5966, #1d4452);
    border: 1px solid rgba(171, 219, 230, 0.22);
    box-shadow:
        inset 0 -5px 0 rgba(8, 27, 36, 0.22),
        0 10px 20px rgba(3, 18, 24, 0.22);
    font-size: 42px;
    font-weight: 950;
}

.dice-box.rolling {
    animation: diceRoll 650ms cubic-bezier(0.22, 0.95, 0.32, 1);
}

.message {
    min-height: 36px;
    display: flex;
    align-items: center;
    text-align: center;
    color: #d8eef5;
    font-size: 14px;
    font-weight: 800;
}

.primary-button,
.hint-button {
    width: 100%;
    min-height: 42px;
    padding: 0 14px;
    font-size: 14px;
}

.primary-button {
    color: #ffffff;
    background: linear-gradient(145deg, #0ea5e9, #2563eb);
    box-shadow: 0 10px 22px rgba(37, 99, 235, 0.24);
}

.hint-button {
    color: rgba(216, 239, 245, 0.66);
    background: rgba(43, 89, 102, 0.62);
    border: 1px solid rgba(171, 219, 230, 0.14);
}

.players-panel {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.player-card {
    border-radius: 8px;
    padding: 9px;
    border: 1px solid rgba(171, 219, 230, 0.12);
    background: rgba(35, 72, 82, 0.62);
}

.player-card.active {
    box-shadow: inset 0 0 0 2px rgba(14, 165, 233, 0.2);
}

.player-card.winner {
    background: rgba(216, 191, 127, 0.28);
}

.player-head {
    display: flex;
    align-items: center;
    gap: 8px;
}

.player-dot {
    width: 13px;
    height: 13px;
    flex: 0 0 auto;
    border-radius: 50%;
}

.player-head strong {
    color: #e5f7fb;
    font-size: 13px;
}

.player-head p {
    margin-top: 2px;
    color: rgba(216, 239, 245, 0.58);
    font-size: 11px;
    font-weight: 700;
}

.trophy {
    margin-left: auto;
    color: #d97706;
}

.log-panel {
    min-height: 88px;
    padding: 10px;
    overflow: hidden;
}

.empty-log,
.log-item {
    color: rgba(216, 239, 245, 0.58);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.55;
}

.log-item {
    color: #d8eef5;
}

@keyframes legalPulse {
    0%,
    100% {
        box-shadow:
            0 0 0 0 rgba(14, 165, 233, 0.42),
            0 5px 12px rgba(15, 23, 42, 0.2);
    }
    50% {
        box-shadow:
            0 0 0 5px rgba(14, 165, 233, 0),
            0 5px 12px rgba(15, 23, 42, 0.2);
    }
}

@keyframes diceNudge {
    0% {
        transform: rotate(-5deg) scale(0.98);
    }
    100% {
        transform: rotate(0deg) scale(1);
    }
}

@keyframes diceRoll {
    0% {
        transform: rotate(0deg) translateY(0) scale(1);
        filter: brightness(1);
    }
    18% {
        transform: rotate(-18deg) translateY(-9px) scale(1.06);
    }
    36% {
        transform: rotate(22deg) translateY(5px) scale(0.98);
    }
    55% {
        transform: rotate(-15deg) translateY(-6px) scale(1.04);
        filter: brightness(1.18);
    }
    76% {
        transform: rotate(12deg) translateY(3px) scale(1);
    }
    100% {
        transform: rotate(0deg) translateY(0) scale(1);
        filter: brightness(1);
    }
}

@keyframes planeFly {
    0% {
        left: var(--flight-from-x);
        top: var(--flight-from-y);
        transform: translate(-50%, -50%) scale(0.78) rotate(-10deg);
        opacity: 0.72;
    }
    28% {
        transform: translate(-50%, calc(-50% - 18px)) scale(1.12) rotate(9deg);
        opacity: 1;
    }
    68% {
        transform: translate(-50%, calc(-50% - 10px)) scale(1.04) rotate(-4deg);
    }
    100% {
        left: var(--flight-to-x);
        top: var(--flight-to-y);
        transform: translate(-50%, -50%) scale(1) rotate(0deg);
        opacity: 1;
    }
}

@media (max-width: 900px) {
    .game-shell {
        grid-template-columns: 1fr;
        overflow-y: auto;
    }

    .board-panel,
    .side-panel {
        grid-column: auto;
    }

    .board-grid {
        width: min(100%, 92vw, 700px);
    }

    .side-panel {
        width: min(100%, 620px);
        margin: 0 auto;
    }

    .players-panel {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 560px) {
    .topbar {
        grid-template-columns: 76px 1fr 38px;
        padding: 10px 10px 6px;
    }

    .icon-text-button {
        height: 34px;
        padding: 0 9px;
    }

    .icon-button {
        width: 34px;
        height: 34px;
    }

    .game-shell {
        padding: 6px 8px 12px;
        gap: 10px;
    }

    .board-grid {
        gap: 2px;
        padding: 8px;
        width: min(100%, 94vw);
    }

    .board-cell {
        border-radius: 5px;
    }

    .piece-stack {
        inset: 2px;
    }

    .plane-piece {
        width: min(82%, 30px);
        border-width: 1px;
    }

    .plane-piece span {
        width: 13px;
        height: 13px;
        font-size: 9px;
    }

    .players-panel {
        grid-template-columns: 1fr;
    }
}
</style>
