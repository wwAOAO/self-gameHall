<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Copy, DoorOpen, Link2, Play, RefreshCcw, Wifi } from 'lucide-vue-next';
import { useUnoLan } from '@/composables/useUnoLan';
import type { PlayerId, UnoCard } from '@/lib/unoGame';

const router = useRouter();
const game = useUnoLan();

const statusText = computed(() => {
    const map = {
        idle: '未连接',
        waiting: '等待加入',
        connected: '已连接',
        closed: '已断开',
        error: '连接失败',
    };
    return map[game.connectionStatus.value];
});

function cardClass(card: UnoCard | null) {
    if (!card) return '';
    return [`color-${card.color}`, `kind-${card.kind}`];
}

function cardMain(card: UnoCard) {
    return card.kind === 'number' ? String(card.value) : game.kindLabels[card.kind];
}

function seatClass(id: PlayerId) {
    const offset = (id - game.localPlayer.value + game.playerLimit + game.playerLimit) % game.playerLimit;
    return `seat-${offset}`;
}
</script>

<template>
    <div class="uno-page min-h-screen select-none overflow-hidden text-white">
        <header class="uno-header">
            <button class="icon-button text-button" @click="router.push('/')">
                <ArrowLeft class="h-4 w-4" />
                返回
            </button>
            <div class="title-block">
                <h1>UNO 四人局域网</h1>
                <span
                    >{{ statusText }} ·
                    {{ game.role.value === 'guest' ? `玩家${game.localPlayer.value + 1}` : '房主' }}</span
                >
            </div>
            <button class="icon-button text-button" :disabled="!game.isHost.value" @click="game.restartGame()">
                <RefreshCcw class="h-4 w-4" />
                重开
            </button>
        </header>

        <main class="uno-layout">
            <aside class="connection-panel">
                <div class="panel-head">
                    <Wifi class="h-4 w-4" />
                    <span>联机房间</span>
                </div>

                <div class="connection-actions">
                    <button class="primary-btn" @click="game.createRoom()">
                        <Link2 class="h-4 w-4" />
                        创建房间
                    </button>
                </div>

                <div v-if="game.roomId.value" class="room-code">
                    <span>房间号</span>
                    <strong>{{ game.roomId.value }}</strong>
                    <button class="copy-btn compact" @click="game.copyRoomId()">
                        <Copy class="h-4 w-4" />
                        {{ game.copied.value ? '已复制' : '复制' }}
                    </button>
                </div>

                <label class="code-label">
                    <span>加入房间号</span>
                    <input
                        v-model="game.joinRoomId.value"
                        maxlength="4"
                        spellcheck="false"
                        placeholder="输入 4 位房间号"
                        @input="game.joinRoomId.value = game.joinRoomId.value.toUpperCase()"
                    />
                </label>

                <button class="secondary-btn full" :disabled="!game.joinRoomId.value.trim()" @click="game.joinRoom()">
                    <DoorOpen class="h-4 w-4" />
                    加入房间
                </button>

                <div class="status-grid">
                    <span>玩家</span>
                    <strong>{{ game.playerCount.value }}/{{ game.playerLimit }}</strong>
                    <span>身份</span>
                    <strong>{{
                        game.role.value === 'guest'
                            ? `玩家${game.localPlayer.value + 1}`
                            : game.role.value === 'host'
                              ? '房主'
                              : '未选择'
                    }}</strong>
                </div>

                <div class="hint-box">
                    房主创建房间后，把 4 位房间号发给另外三名玩家。4 人到齐后，房主才能开始牌局。
                </div>
                <div v-if="game.error.value" class="error-box">
                    {{ game.error.value }}
                </div>
            </aside>

            <section class="table-area">
                <div
                    v-for="seat in game.opponents.value"
                    :key="seat.id"
                    class="opponent-seat"
                    :class="[
                        seatClass(seat.id),
                        { active: game.state.value.currentPlayer === seat.id && game.state.value.phase === 'playing' },
                    ]"
                >
                    <div class="player-chip">
                        <span>{{ seat.player.name }}</span>
                        <strong>{{ seat.player.hand.length }} 张</strong>
                    </div>
                    <div class="back-row">
                        <div v-for="i in Math.min(seat.player.hand.length, 12)" :key="i" class="card-back" />
                    </div>
                </div>

                <div class="table-center">
                    <div class="draw-stack">
                        <div class="card-back pile" />
                        <span>{{ game.state.value.deck.length }}</span>
                    </div>

                    <div class="discard-wrap">
                        <div
                            v-if="game.topCard.value"
                            class="uno-card table-card"
                            :class="cardClass(game.topCard.value)"
                        >
                            <span>{{ cardMain(game.topCard.value) }}</span>
                            <small>{{
                                game.topCard.value.color === 'wild'
                                    ? game.colorLabels[game.activeColor.value || 'red']
                                    : game.colorLabels[game.topCard.value.color]
                            }}</small>
                        </div>
                    </div>

                    <div class="color-picker">
                        <button
                            v-for="color in game.colors"
                            :key="color"
                            class="color-dot"
                            :class="[`dot-${color}`, { selected: game.selectedColor.value === color }]"
                            :title="game.colorLabels[color]"
                            @click="game.selectedColor.value = color"
                        />
                        <span>万能牌指定色</span>
                    </div>
                </div>

                <div class="message-strip" :class="{ win: game.state.value.phase === 'ended' }">
                    {{ game.state.value.message }}
                </div>

                <div class="action-row">
                    <button
                        v-if="game.state.value.phase === 'lobby'"
                        class="primary-btn large"
                        :disabled="!game.canStart.value"
                        @click="game.startGame()"
                    >
                        <Play class="h-5 w-5" />
                        开始牌局
                    </button>
                    <template v-else-if="game.state.value.phase === 'playing'">
                        <button class="secondary-btn" :disabled="!game.canDraw.value" @click="game.drawOne()">
                            摸一张
                        </button>
                        <button class="secondary-btn" :disabled="!game.canKeep.value" @click="game.keepAfterDraw()">
                            保留并结束
                        </button>
                    </template>
                    <button v-else class="primary-btn large" :disabled="!game.isHost.value" @click="game.restartGame()">
                        再来一局
                    </button>
                </div>

                <div class="hand-zone" :class="{ active: game.isMyTurn.value }">
                    <div class="player-chip self">
                        <span>{{ game.me.value.name }}</span>
                        <strong>{{ game.me.value.hand.length }} 张</strong>
                    </div>
                    <div class="hand-row">
                        <button
                            v-for="card in game.me.value.hand"
                            :key="card.id"
                            class="uno-card hand-card"
                            :class="[cardClass(card), { playable: game.isPlayable(card) }]"
                            :disabled="!game.isPlayable(card)"
                            @click="game.playCard(card)"
                        >
                            <span>{{ cardMain(card) }}</span>
                            <small>{{ card.color === 'wild' ? '万能' : game.colorLabels[card.color] }}</small>
                        </button>
                    </div>
                </div>
            </section>
        </main>
    </div>
</template>

<style scoped>
.uno-page {
    height: 100dvh;
    background:
        radial-gradient(circle at 18% 14%, rgba(239, 68, 68, 0.18), transparent 24%),
        radial-gradient(circle at 86% 8%, rgba(250, 204, 21, 0.14), transparent 24%),
        linear-gradient(145deg, #10151f 0%, #14251f 46%, #111827 100%);
}

.uno-header {
    width: min(1180px, 100%);
    margin: 0 auto;
    padding: 14px 16px 8px;
    display: grid;
    grid-template-columns: 96px 1fr 96px;
    align-items: center;
    gap: 10px;
}

.title-block {
    text-align: center;
}

.title-block h1 {
    font-size: clamp(22px, 3.6vw, 34px);
    font-weight: 950;
    letter-spacing: 0;
    color: #fff7d6;
}

.title-block span {
    color: rgba(255, 255, 255, 0.56);
    font-size: 12px;
}

.uno-layout {
    width: min(1180px, 100%);
    height: calc(100dvh - 72px);
    margin: 0 auto;
    padding: 8px 16px 16px;
    display: grid;
    grid-template-columns: 310px 1fr;
    gap: 14px;
}

.connection-panel,
.table-area {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(7, 13, 22, 0.58);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.32);
}

.connection-panel {
    border-radius: 8px;
    padding: 14px;
    overflow-y: auto;
}

.panel-head,
.player-chip,
.action-row,
.connection-actions {
    display: flex;
    align-items: center;
}

.panel-head {
    gap: 8px;
    color: #fef3c7;
    font-weight: 900;
}

.connection-actions {
    gap: 8px;
    margin-top: 14px;
}

.icon-button,
.primary-btn,
.secondary-btn,
.copy-btn {
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 8px;
    font-weight: 850;
    transition:
        transform 150ms ease,
        filter 150ms ease,
        opacity 150ms ease;
}

.text-button {
    color: #fef3c7;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
}

.primary-btn {
    padding: 0 14px;
    color: #211305;
    background: linear-gradient(145deg, #fde047, #fb923c);
}

.secondary-btn,
.copy-btn {
    padding: 0 12px;
    color: #ecfeff;
    background: rgba(255, 255, 255, 0.09);
    border: 1px solid rgba(255, 255, 255, 0.13);
}

.large {
    height: 44px;
    padding: 0 20px;
}

.full {
    width: 100%;
    margin-top: 10px;
}

.compact {
    height: 32px;
}

button:disabled {
    opacity: 0.42;
    cursor: not-allowed;
}

button:not(:disabled):hover {
    filter: brightness(1.06);
    transform: translateY(-1px);
}

.room-code {
    margin-top: 14px;
    padding: 12px;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    align-items: center;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.68);
    background: rgba(250, 204, 21, 0.1);
    border: 1px solid rgba(250, 204, 21, 0.24);
}

.room-code strong {
    grid-column: 1;
    color: #fde047;
    font-size: 34px;
    line-height: 1;
    letter-spacing: 0;
}

.room-code .copy-btn {
    grid-column: 2;
    grid-row: 1 / 3;
}

.code-label {
    display: block;
    margin-top: 12px;
}

.code-label span {
    display: block;
    margin-bottom: 6px;
    color: rgba(255, 255, 255, 0.62);
    font-size: 12px;
    font-weight: 800;
}

.code-label input {
    width: 100%;
    height: 42px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(0, 0, 0, 0.32);
    padding: 0 12px;
    color: #e5f4ff;
    font-size: 18px;
    font-weight: 900;
    letter-spacing: 0;
    outline: none;
    text-transform: uppercase;
}

.status-grid {
    margin-top: 12px;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    color: rgba(255, 255, 255, 0.58);
    font-size: 12px;
}

.status-grid strong {
    color: #fef3c7;
}

.hint-box {
    margin-top: 12px;
    padding: 10px;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.62);
    background: rgba(34, 197, 94, 0.08);
    border: 1px solid rgba(74, 222, 128, 0.16);
    font-size: 12px;
    line-height: 1.55;
}

.error-box {
    margin-top: 10px;
    padding: 10px;
    border-radius: 8px;
    color: #fecaca;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(248, 113, 113, 0.28);
    font-size: 12px;
    line-height: 1.5;
}

.table-area {
    position: relative;
    min-width: 0;
    min-height: 0;
    border-radius: 16px;
    padding: 14px;
    display: grid;
    grid-template-rows: 100px 1fr auto auto 170px;
    gap: 10px;
    background:
        linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
        linear-gradient(0deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
        radial-gradient(circle at 50% 38%, rgba(22, 163, 74, 0.38), transparent 44%),
        linear-gradient(145deg, #064e3b, #052e2b 62%, #07151d);
    background-size:
        32px 32px,
        32px 32px,
        auto,
        auto;
}

.opponent-seat,
.hand-zone {
    min-width: 0;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.11);
    background: rgba(0, 0, 0, 0.18);
    padding: 10px;
}

.opponent-seat.active,
.hand-zone.active {
    border-color: rgba(250, 204, 21, 0.78);
    box-shadow:
        0 0 0 2px rgba(250, 204, 21, 0.12),
        0 0 28px rgba(250, 204, 21, 0.12);
}

.seat-1 {
    position: absolute;
    top: 116px;
    left: 14px;
    width: 164px;
}

.seat-2 {
    grid-row: 1;
    justify-self: center;
    width: min(360px, 52%);
}

.seat-3 {
    position: absolute;
    top: 116px;
    right: 14px;
    width: 164px;
}

.player-chip {
    justify-content: space-between;
    gap: 10px;
    color: rgba(255, 255, 255, 0.72);
    font-size: 13px;
    font-weight: 900;
}

.player-chip strong {
    color: #fde68a;
}

.back-row,
.hand-row {
    display: flex;
    align-items: flex-end;
    min-width: 0;
    overflow-x: auto;
}

.back-row {
    height: 54px;
    justify-content: center;
    padding-top: 10px;
}

.card-back {
    width: 34px;
    height: 50px;
    flex: 0 0 auto;
    margin-left: -14px;
    border-radius: 7px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    background:
        linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.18) 0 10%,
            transparent 10% 20%,
            rgba(255, 255, 255, 0.16) 20% 30%,
            transparent 30%
        ),
        linear-gradient(145deg, #dc2626, #1d4ed8);
    box-shadow: 0 10px 18px rgba(0, 0, 0, 0.24);
}

.card-back:first-child {
    margin-left: 0;
}

.table-center {
    min-height: 0;
    grid-row: 2;
    display: grid;
    grid-template-columns: 130px 1fr 160px;
    align-items: center;
    gap: 12px;
    padding: 0 164px;
}

.draw-stack,
.discard-wrap,
.color-picker {
    display: flex;
    align-items: center;
    justify-content: center;
}

.draw-stack {
    flex-direction: column;
    gap: 8px;
    color: rgba(255, 255, 255, 0.6);
    font-weight: 900;
}

.pile {
    width: 74px;
    height: 108px;
    margin: 0;
}

.discard-wrap {
    min-height: 150px;
}

.uno-card {
    width: 76px;
    height: 112px;
    flex: 0 0 auto;
    border-radius: 10px;
    border: 3px solid rgba(255, 255, 255, 0.92);
    color: white;
    box-shadow: 0 16px 28px rgba(0, 0, 0, 0.28);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-weight: 950;
    position: relative;
    overflow: hidden;
}

.uno-card::before {
    content: '';
    position: absolute;
    width: 86%;
    height: 58%;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.9);
    transform: rotate(-24deg);
}

.uno-card span,
.uno-card small {
    position: relative;
    z-index: 1;
    text-shadow: 0 2px 7px rgba(0, 0, 0, 0.4);
}

.uno-card span {
    color: #111827;
    font-size: 28px;
}

.uno-card small {
    color: rgba(17, 24, 39, 0.72);
    font-size: 11px;
    font-weight: 900;
}

.table-card {
    width: 96px;
    height: 142px;
}

.table-card span {
    font-size: 34px;
}

.color-red {
    background: linear-gradient(145deg, #ef4444, #991b1b);
}

.color-yellow {
    background: linear-gradient(145deg, #facc15, #ca8a04);
}

.color-green {
    background: linear-gradient(145deg, #22c55e, #047857);
}

.color-blue {
    background: linear-gradient(145deg, #38bdf8, #1d4ed8);
}

.color-wild {
    background: linear-gradient(135deg, #ef4444 0 25%, #facc15 25% 50%, #22c55e 50% 75%, #2563eb 75% 100%);
}

.color-picker {
    flex-wrap: wrap;
    gap: 8px;
}

.color-picker span {
    width: 100%;
    color: rgba(255, 255, 255, 0.56);
    text-align: center;
    font-size: 12px;
    font-weight: 800;
}

.color-dot {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.52);
}

.color-dot.selected {
    border-color: #fff7d6;
    box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.34);
}

.dot-red {
    background: #ef4444;
}

.dot-yellow {
    background: #facc15;
}

.dot-green {
    background: #22c55e;
}

.dot-blue {
    background: #2563eb;
}

.message-strip {
    grid-row: 3;
    min-height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: #fff7d6;
    background: rgba(0, 0, 0, 0.22);
    font-weight: 900;
    text-align: center;
    padding: 6px 10px;
}

.message-strip.win {
    color: #fde047;
}

.action-row {
    grid-row: 4;
    min-height: 46px;
    justify-content: center;
    gap: 10px;
}

.hand-zone {
    grid-row: 5;
    padding-bottom: 12px;
}

.hand-row {
    height: 126px;
    padding: 14px 10px 4px;
}

.hand-card {
    margin-left: -20px;
    cursor: pointer;
    transition:
        transform 150ms ease,
        box-shadow 150ms ease,
        opacity 150ms ease;
}

.hand-card:first-child {
    margin-left: 0;
}

.hand-card:not(.playable) {
    opacity: 0.58;
}

.hand-card.playable:hover {
    transform: translateY(-16px);
    box-shadow:
        0 0 0 3px rgba(250, 204, 21, 0.7),
        0 22px 32px rgba(0, 0, 0, 0.36);
}

@media (max-width: 860px) {
    .uno-header {
        grid-template-columns: 72px 1fr 72px;
        padding: 10px 10px 6px;
    }

    .text-button {
        font-size: 12px;
    }

    .uno-layout {
        height: auto;
        min-height: calc(100dvh - 62px);
        grid-template-columns: 1fr;
        padding: 8px;
    }

    .connection-panel {
        max-height: 330px;
    }

    .table-area {
        min-height: 720px;
        grid-template-rows: 92px 92px 1fr auto auto 158px;
        padding: 10px;
    }

    .seat-1,
    .seat-2,
    .seat-3 {
        position: static;
        width: 100%;
    }

    .seat-1 {
        grid-row: 1;
    }

    .seat-2 {
        grid-row: 2;
    }

    .seat-3 {
        grid-row: 3;
    }

    .table-center {
        grid-row: 4;
        grid-template-columns: 88px 1fr;
        padding: 0;
    }

    .message-strip {
        grid-row: 5;
    }

    .action-row {
        grid-row: 6;
    }

    .hand-zone {
        grid-row: 7;
    }

    .color-picker {
        grid-column: 1 / -1;
    }

    .uno-card {
        width: 64px;
        height: 96px;
    }

    .table-card {
        width: 82px;
        height: 122px;
    }
}
</style>
