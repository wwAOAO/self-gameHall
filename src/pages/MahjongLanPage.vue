<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Copy, DoorOpen, Link2, Play, RefreshCcw, Trophy, Wifi } from 'lucide-vue-next';
import { useMahjongLan } from '@/composables/useMahjongLan';
import type { MahjongPlayerId, MahjongTile } from '@/lib/mahjongLanGame';

const router = useRouter();
const game = useMahjongLan();

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

function tileClass(tile: MahjongTile) {
    return `tile-${tile.suit}`;
}

function seatClass(id: MahjongPlayerId) {
    const offset = (id - game.localPlayer.value + game.playerLimit + game.playerLimit) % game.playerLimit;
    return `seat-${offset}`;
}
</script>

<template>
    <div class="mahjong-lan-page min-h-screen select-none overflow-hidden text-white">
        <header class="mahjong-header">
            <button class="icon-button text-button" @click="router.push('/')">
                <ArrowLeft class="h-4 w-4" />
                返回
            </button>
            <div class="title-block">
                <h1>麻将局域网</h1>
                <span>
                    {{ statusText }} /
                    {{ game.role.value === 'guest' ? `玩家${game.localPlayer.value + 1}` : '房主' }}
                </span>
            </div>
            <button class="icon-button text-button" :disabled="!game.isHost.value" @click="game.restartGame()">
                <RefreshCcw class="h-4 w-4" />
                重开
            </button>
        </header>

        <main class="mahjong-layout">
            <aside class="connection-panel">
                <div class="panel-head">
                    <Wifi class="h-4 w-4" />
                    <span>联机房间</span>
                </div>

                <button class="primary-btn full" @click="game.createRoom()">
                    <Link2 class="h-4 w-4" />
                    创建房间
                </button>

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
                    <span>牌墙</span>
                    <strong>{{ game.state.value.deck.length }} 张</strong>
                    <span>身份</span>
                    <strong>
                        {{
                            game.role.value === 'guest'
                                ? `玩家${game.localPlayer.value + 1}`
                                : game.role.value === 'host'
                                  ? '房主'
                                  : '未选择'
                        }}
                    </strong>
                </div>

                <div class="hint-box">
                    房主创建房间后，把房间号发给同一局域网里的三名玩家。四人到齐后，房主开始牌局。
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
                        <div v-for="i in Math.min(seat.player.hand.length, 14)" :key="i" class="tile-back" />
                    </div>
                    <div class="discard-row compact-discard">
                        <span v-for="tile in seat.player.discarded.slice(-8)" :key="tile.id" class="mini-tile">
                            {{ game.tileLabel(tile) }}
                        </span>
                    </div>
                </div>

                <div class="table-center">
                    <div class="wall-stack">
                        <div class="wall-tile" />
                        <span>{{ game.state.value.deck.length }}</span>
                    </div>
                    <div class="last-discard">
                        <span>最新弃牌</span>
                        <button
                            v-if="game.state.value.lastDiscard"
                            class="mahjong-tile table-tile"
                            :class="tileClass(game.state.value.lastDiscard)"
                        >
                            {{ game.tileLabel(game.state.value.lastDiscard) }}
                        </button>
                        <em v-else>无</em>
                    </div>
                    <div class="round-info">
                        <strong>第 {{ game.state.value.turnNo }} 手</strong>
                        <span>{{ game.state.value.phase === 'claim' ? '等待响应' : '轮到出牌' }}</span>
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
                        开始麻将局
                    </button>
                    <template v-else-if="game.canClaimWin.value">
                        <button class="primary-btn large" @click="game.claimWin()">
                            <Trophy class="h-5 w-5" />
                            胡
                        </button>
                        <button class="secondary-btn" @click="game.passClaim()">过</button>
                    </template>
                    <button v-else-if="game.state.value.phase === 'ended' || game.state.value.phase === 'draw'" class="primary-btn large" :disabled="!game.isHost.value" @click="game.restartGame()">
                        再来一局
                    </button>
                    <span v-else class="turn-note">
                        {{ game.isMyTurn.value ? '请选择一张手牌打出' : '等待其他玩家操作' }}
                    </span>
                </div>

                <div class="hand-zone" :class="{ active: game.isMyTurn.value }">
                    <div class="player-chip self">
                        <span>{{ game.me.value.name }}</span>
                        <strong>{{ game.me.value.hand.length }} 张</strong>
                    </div>
                    <div class="discard-row self-discard">
                        <span v-for="tile in game.me.value.discarded.slice(-16)" :key="tile.id" class="mini-tile">
                            {{ game.tileLabel(tile) }}
                        </span>
                    </div>
                    <div class="hand-row">
                        <button
                            v-for="tile in game.me.value.hand"
                            :key="tile.id"
                            class="mahjong-tile hand-tile"
                            :class="tileClass(tile)"
                            :disabled="!game.isMyTurn.value"
                            @click="game.discard(tile)"
                        >
                            {{ game.tileLabel(tile) }}
                        </button>
                    </div>
                </div>
            </section>
        </main>
    </div>
</template>

<style scoped>
.mahjong-lan-page {
    height: 100dvh;
    background:
        radial-gradient(circle at 20% 12%, rgba(16, 185, 129, 0.22), transparent 28%),
        radial-gradient(circle at 85% 4%, rgba(245, 158, 11, 0.16), transparent 26%),
        linear-gradient(145deg, #121713 0%, #172b22 48%, #111827 100%);
}

.mahjong-header {
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

.title-block span,
.turn-note {
    color: rgba(255, 255, 255, 0.62);
    font-size: 12px;
}

.mahjong-layout {
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
.action-row {
    display: flex;
    align-items: center;
}

.panel-head {
    gap: 8px;
    color: #fef3c7;
    font-weight: 900;
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
    color: #142015;
    background: linear-gradient(145deg, #facc15, #34d399);
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
    margin-top: 14px;
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

.hint-box,
.error-box {
    margin-top: 12px;
    padding: 10px;
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.55;
}

.hint-box {
    color: rgba(255, 255, 255, 0.62);
    background: rgba(34, 197, 94, 0.08);
    border: 1px solid rgba(74, 222, 128, 0.16);
}

.error-box {
    color: #fecaca;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(248, 113, 113, 0.28);
}

.table-area {
    position: relative;
    min-width: 0;
    min-height: 0;
    border-radius: 16px;
    padding: 14px;
    display: grid;
    grid-template-rows: 106px 1fr auto auto 206px;
    gap: 10px;
    background:
        linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
        linear-gradient(0deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
        radial-gradient(circle at 50% 40%, rgba(16, 185, 129, 0.42), transparent 44%),
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
    top: 122px;
    left: 14px;
    width: 168px;
}

.seat-2 {
    grid-row: 1;
    justify-self: center;
    width: min(390px, 56%);
}

.seat-3 {
    position: absolute;
    top: 122px;
    right: 14px;
    width: 168px;
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
.hand-row,
.discard-row {
    display: flex;
    min-width: 0;
    overflow-x: auto;
}

.back-row {
    height: 48px;
    align-items: flex-end;
    justify-content: center;
    padding-top: 8px;
}

.tile-back {
    width: 28px;
    height: 40px;
    flex: 0 0 auto;
    margin-left: -11px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    background:
        linear-gradient(135deg, rgba(255, 255, 255, 0.16) 0 14%, transparent 14% 28%),
        linear-gradient(145deg, #0f766e, #064e3b);
    box-shadow: 0 10px 18px rgba(0, 0, 0, 0.24);
}

.tile-back:first-child {
    margin-left: 0;
}

.compact-discard {
    height: 28px;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
}

.table-center {
    min-height: 0;
    grid-row: 2;
    display: grid;
    grid-template-columns: 130px 1fr 140px;
    align-items: center;
    gap: 12px;
    padding: 0 170px;
}

.wall-stack,
.last-discard,
.round-info {
    display: flex;
    align-items: center;
    justify-content: center;
}

.wall-stack,
.last-discard,
.round-info {
    flex-direction: column;
    gap: 8px;
    color: rgba(255, 255, 255, 0.68);
    font-weight: 900;
}

.wall-tile {
    width: 76px;
    height: 112px;
    border-radius: 10px;
    background:
        linear-gradient(90deg, rgba(255, 255, 255, 0.14), transparent),
        linear-gradient(145deg, #047857, #064e3b);
    border: 1px solid rgba(255, 255, 255, 0.18);
    box-shadow: 0 16px 28px rgba(0, 0, 0, 0.28);
}

.last-discard em {
    color: rgba(255, 255, 255, 0.38);
    font-style: normal;
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

.self-discard {
    height: 32px;
    align-items: center;
    gap: 5px;
    margin-top: 6px;
}

.hand-row {
    height: 132px;
    align-items: flex-end;
    padding: 14px 10px 4px;
}

.mahjong-tile {
    width: 48px;
    height: 72px;
    flex: 0 0 auto;
    border-radius: 8px;
    border: 1px solid rgba(92, 64, 35, 0.25);
    color: #1f2937;
    background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 251, 235, 0.8)),
        #fef3c7;
    box-shadow:
        inset 0 -8px 14px rgba(146, 64, 14, 0.1),
        0 12px 22px rgba(0, 0, 0, 0.24);
    font-size: 15px;
    font-weight: 950;
    writing-mode: vertical-rl;
    letter-spacing: 0;
}

.table-tile {
    width: 62px;
    height: 92px;
    font-size: 17px;
}

.hand-tile {
    margin-left: -12px;
    cursor: pointer;
    transition:
        transform 150ms ease,
        box-shadow 150ms ease,
        opacity 150ms ease;
}

.hand-tile:first-child {
    margin-left: 0;
}

.hand-tile:not(:disabled):hover {
    transform: translateY(-14px);
    box-shadow:
        0 0 0 3px rgba(250, 204, 21, 0.66),
        0 22px 32px rgba(0, 0, 0, 0.34);
}

.tile-wan {
    color: #b91c1c;
}

.tile-tong {
    color: #1d4ed8;
}

.tile-suo {
    color: #047857;
}

.tile-feng {
    color: #111827;
}

.tile-jian {
    color: #be123c;
}

.mini-tile {
    min-width: 28px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.82);
    color: #1f2937;
    font-size: 11px;
    font-weight: 900;
    padding: 0 4px;
}

@media (max-width: 860px) {
    .mahjong-header {
        grid-template-columns: 72px 1fr 72px;
        padding: 10px 10px 6px;
    }

    .text-button {
        font-size: 12px;
    }

    .mahjong-layout {
        height: auto;
        min-height: calc(100dvh - 62px);
        grid-template-columns: 1fr;
        padding: 8px;
    }

    .connection-panel {
        max-height: 330px;
    }

    .table-area {
        min-height: 760px;
        grid-template-rows: 104px 104px 1fr auto auto 186px;
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

    .round-info {
        grid-column: 1 / -1;
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

    .mahjong-tile {
        width: 42px;
        height: 64px;
        font-size: 13px;
    }
}
</style>
