<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import {
    ArrowLeft,
    Bomb,
    Bot,
    Copy,
    Crown,
    DoorOpen,
    Flame,
    Link2,
    Plane,
    Play,
    Rocket,
    RotateCcw,
    Sparkles,
    UserRound,
    Wheat,
    Wifi,
    X,
} from 'lucide-vue-next';
import { useFightLandlordLan } from '@/composables/useFightLandlordLan';
import type { FightCard, FightPlayerId } from '@/lib/fightLandlordLanGame';

const router = useRouter();
const game = useFightLandlordLan();

const playEffectKey = computed(() => {
    const last = game.state.value.lastPlay;
    return last ? `${game.state.value.playSeq}-${last.hand.type}` : 'none';
});

const lastPlayCards = computed(() => game.state.value.lastPlay?.hand.cards || []);

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

function isRedSuit(suit: string): boolean {
    return suit === '♥' || suit === '♦' || suit === 'Joker';
}

function isLandlord(player: FightPlayerId): boolean {
    return game.state.value.landlord === player;
}

function isCurrentPlayer(player: FightPlayerId): boolean {
    return game.state.value.phase === 'playing' && game.state.value.currentPlayer === player;
}

function getRoleLabel(player: FightPlayerId): string {
    if (game.state.value.landlord === -1) return '待定';
    return isLandlord(player) ? '地主' : '农民';
}

function getAvatarClass(player: FightPlayerId) {
    return {
        landlord: isLandlord(player),
        farmer: game.state.value.landlord !== -1 && !isLandlord(player),
    };
}

function getLastPlayLabel() {
    if (!game.state.value.lastPlay) return '';
    const labels: Record<string, string> = {
        single: '单张',
        pair: '对子',
        triple: '三张',
        triple1: '三带一',
        triple2: '三带二',
        straight: '顺子',
        pair_straight: '连对',
        airplane: '飞机',
        airplane1: '飞机带单',
        airplane2: '飞机带对',
        bomb: '炸弹',
        rocket: '火箭',
        four2: '四带二',
        four22: '四带两对',
    };
    return labels[game.state.value.lastPlay.hand.type] || '';
}

function getLastPlayName() {
    const last = game.state.value.lastPlay;
    return last ? game.state.value.players[last.player].name : '';
}

function getHandDealDelay(index: number): string {
    return `${Math.min(index, 22) * 24}ms`;
}

function getBackDealDelay(index: number, player: FightPlayerId): string {
    return `${(index + (player === 2 ? 7 : 0)) * 34}ms`;
}

function getPlayedCardDelay(index: number): string {
    return `${index * 42}ms`;
}

function getPlayEffectClass(): string {
    const type = game.state.value.lastPlay?.hand.type;
    if (type === 'bomb' || type === 'four2' || type === 'four22') return 'effect-bomb';
    if (type === 'rocket') return 'effect-rocket';
    if (type === 'airplane' || type === 'airplane1' || type === 'airplane2') return 'effect-airplane';
    if (type === 'straight' || type === 'pair_straight') return 'effect-chain';
    if (type === 'triple' || type === 'triple1' || type === 'triple2') return 'effect-triple';
    if (type === 'pair') return 'effect-pair';
    return 'effect-single';
}

function getEffectIcon() {
    const type = game.state.value.lastPlay?.hand.type;
    if (type === 'rocket') return Rocket;
    if (type === 'bomb' || type === 'four2' || type === 'four22') return Bomb;
    if (type === 'airplane' || type === 'airplane1' || type === 'airplane2') return Plane;
    return Flame;
}

function cardKey(card: FightCard, prefix: string, index: number) {
    return `${prefix}-${card.id}-${index}`;
}

function isSelected(card: FightCard) {
    return game.selectedCardIds.value.includes(card.id);
}
</script>

<template>
    <div class="fight-page min-h-screen flex flex-col select-none overflow-hidden">
        <header class="table-header shrink-0">
            <button class="nav-button" @click="router.push('/')">
                <ArrowLeft class="w-4 h-4" />
                返回
            </button>

            <div class="title-wrap">
                <h1>斗地主局域网</h1>
                <span>{{ statusText }} · {{ game.me.value.name }} · {{ game.state.value.coins[game.localPlayer.value] }} 分</span>
            </div>

            <button class="nav-button ghost" :disabled="!game.isHost.value || game.state.value.phase === 'lobby'" @click="game.restartGame()">
                <RotateCcw class="w-4 h-4" />
                重开
            </button>
        </header>

        <main class="table-shell">
            <aside class="lan-panel">
                <div class="panel-head">
                    <Wifi class="w-4 h-4" />
                    <span>联机房间</span>
                    <strong>{{ game.playerCount.value }}/3</strong>
                </div>

                <div class="room-actions">
                    <button class="panel-action primary" @click="game.createRoom()">
                        <Link2 class="w-4 h-4" />
                        创建
                    </button>
                    <button class="panel-action" :disabled="!game.joinRoomId.value.trim()" @click="game.joinRoom()">
                        <DoorOpen class="w-4 h-4" />
                        加入
                    </button>
                </div>

                <div v-if="game.roomId.value" class="room-code">
                    <span>{{ game.roomId.value }}</span>
                    <button class="copy-button" @click="game.copyRoomId()">
                        <Copy class="w-3.5 h-3.5" />
                        {{ game.copied.value ? '已复制' : '复制' }}
                    </button>
                </div>

                <label class="join-code">
                    <input
                        v-model="game.joinRoomId.value"
                        maxlength="4"
                        spellcheck="false"
                        placeholder="房间号"
                        @input="game.joinRoomId.value = game.joinRoomId.value.toUpperCase()"
                    />
                </label>

                <div v-if="game.error.value" class="panel-error">
                    <X class="w-3.5 h-3.5" />
                    <span>{{ game.error.value }}</span>
                </div>
            </aside>

            <section class="table-felt">
                <div v-if="game.state.value.lastPlay" :key="playEffectKey" class="play-effect-layer" :class="getPlayEffectClass()" aria-hidden="true">
                    <div class="effect-ring" />
                    <component :is="getEffectIcon()" class="effect-icon" />
                    <div class="effect-title">{{ getLastPlayLabel() }}</div>
                    <span
                        v-for="i in 12"
                        :key="'effect-particle-' + i"
                        class="effect-particle"
                        :style="{ '--particle-angle': `${i * 30}deg`, '--particle-distance': `${52 + (i % 4) * 13}px` }"
                    />
                </div>

                <div class="landlord-strip">
                    <div class="strip-label">
                        <Crown class="w-4 h-4" />
                        底牌
                    </div>
                    <div class="mini-card-row">
                        <div v-for="(card, i) in game.state.value.landlordCards" :key="cardKey(card, 'landlord', i)" class="mini-card">
                            <span :class="{ red: isRedSuit(card.suit) }">{{ card.rank }}</span>
                            <span v-if="card.suit !== 'Joker'" :class="{ red: isRedSuit(card.suit) }">{{ card.suit }}</span>
                        </div>
                        <div v-if="game.state.value.landlordCards.length === 0" class="landlord-hidden">已归地主</div>
                    </div>
                    <div class="score-strip">
                        <span>底分 {{ game.state.value.baseScore }}</span>
                        <span>倍率 x{{ game.state.value.multiplier }}</span>
                        <span>炸弹 {{ game.state.value.bombCount }}</span>
                    </div>
                </div>

                <div class="opponents-row">
                    <div
                        v-for="seat in game.opponents.value"
                        :key="seat.id"
                        class="seat-panel"
                        :class="{ active: isCurrentPlayer(seat.id), landlord: isLandlord(seat.id) }"
                    >
                        <div class="seat-info" :class="{ right: seat.id === 2 }">
                            <div class="avatar" :class="getAvatarClass(seat.id)">
                                <Crown v-if="isLandlord(seat.id)" class="w-4 h-4" />
                                <Wheat v-else class="w-4 h-4" />
                                <span class="avatar-chip">
                                    <Bot class="w-3 h-3" />
                                </span>
                            </div>
                            <div>
                                <div class="seat-name">
                                    {{ seat.player.name }}
                                    <span v-if="game.state.value.landlord !== -1" class="role-badge" :class="{ farmer: !isLandlord(seat.id) }">
                                        {{ getRoleLabel(seat.id) }}
                                    </span>
                                </div>
                                <div class="seat-count">{{ seat.player.hand.length }} 张 · {{ game.state.value.coins[seat.id] }} 分</div>
                            </div>
                        </div>

                        <div class="card-back-stack" :class="{ right: seat.id === 2 }">
                            <div
                                v-for="i in Math.min(seat.player.hand.length, 9)"
                                :key="'back-' + seat.id + '-' + i"
                                class="card-back"
                                :style="{ '--deal-delay': getBackDealDelay(i, seat.id) }"
                            />
                            <span v-if="seat.player.hand.length > 9" class="more-count">+{{ seat.player.hand.length - 9 }}</span>
                        </div>
                    </div>
                </div>

                <div class="center-area">
                    <div v-if="game.state.value.phase === 'lobby'" class="center-state">
                        <Sparkles class="w-7 h-7 text-amber-200" />
                        <p>创建房间，把房间号发给同一局域网里的两名玩家。</p>
                        <button class="primary-action" :disabled="!game.canStart.value" @click="game.startGame()">
                            <Play class="w-4 h-4" />
                            开始游戏
                        </button>
                    </div>

                    <div v-else-if="game.state.value.phase === 'bidding'" class="center-state">
                        <div class="status-pill">{{ game.state.value.message }}</div>
                        <div v-if="game.canBid.value" class="bid-actions">
                            <button v-for="score in game.bidOptions()" :key="'bid-' + score" class="primary-action" @click="game.bid(score)">
                                {{ score }} 分
                            </button>
                            <button class="secondary-action" @click="game.bid('pass')">Pass</button>
                        </div>
                        <div v-else class="thinking-text">
                            <span class="thinking-dot" />
                            等待叫分
                        </div>
                    </div>

                    <div v-else class="play-zone">
                        <div v-if="game.state.value.lastPlay" class="last-play">
                            <div class="last-play-head">
                                <span>{{ getLastPlayName() }}</span>
                                <strong>{{ getLastPlayLabel() }}</strong>
                            </div>
                            <div class="played-cards">
                                <div
                                    v-for="(card, i) in lastPlayCards"
                                    :key="cardKey(card, 'played', i)"
                                    class="table-card played"
                                    :style="{ '--play-delay': getPlayedCardDelay(i) }"
                                >
                                    <span :class="{ red: isRedSuit(card.suit) }">{{ card.rank }}</span>
                                    <span v-if="card.suit !== 'Joker'" :class="{ red: isRedSuit(card.suit) }">{{ card.suit }}</span>
                                    <span v-else class="joker">JOKER</span>
                                </div>
                            </div>
                        </div>
                        <div v-else class="empty-play">
                            <Sparkles class="w-5 h-5" />
                            等待出牌
                        </div>

                        <div class="message-line" :class="{ win: game.state.value.phase === 'ended' }">
                            {{ game.state.value.message }}
                            <span v-if="!game.isMyTurn.value && game.state.value.phase === 'playing'" class="thinking-dot" />
                        </div>

                        <button v-if="game.state.value.phase === 'ended'" class="primary-action compact" :disabled="!game.isHost.value" @click="game.restartGame()">
                            <RotateCcw class="w-4 h-4" />
                            再来一局
                        </button>
                    </div>
                </div>

                <div class="player-area" :class="{ active: isCurrentPlayer(game.localPlayer.value), landlord: isLandlord(game.localPlayer.value) }">
                    <div class="player-meta">
                        <div class="avatar player-avatar" :class="getAvatarClass(game.localPlayer.value)">
                            <Crown v-if="isLandlord(game.localPlayer.value)" class="w-4 h-4" />
                            <UserRound v-else class="w-4 h-4" />
                        </div>
                        <div>
                            <div class="seat-name">
                                {{ game.me.value.name }}
                                <span v-if="game.state.value.landlord !== -1" class="role-badge" :class="{ farmer: !isLandlord(game.localPlayer.value) }">
                                    {{ getRoleLabel(game.localPlayer.value) }}
                                </span>
                            </div>
                            <div class="seat-count">{{ game.me.value.hand.length }} 张手牌 · {{ game.state.value.coins[game.localPlayer.value] }} 分</div>
                        </div>
                    </div>

                    <div v-if="game.state.value.phase !== 'lobby'" class="hand-row scrollbar-none">
                        <button
                            v-for="(card, i) in game.me.value.hand"
                            :key="cardKey(card, 'hand', i)"
                            class="table-card hand-card"
                            :class="{
                                selected: isSelected(card),
                                hint: game.isHintCard(card),
                                disabled: game.state.value.phase !== 'playing' || !game.isMyTurn.value,
                            }"
                            :style="{
                                zIndex: i,
                                marginLeft: i > 0 ? 'var(--hand-card-overlap)' : '0',
                                '--deal-delay': getHandDealDelay(i),
                            }"
                            :disabled="game.state.value.phase !== 'playing' || !game.isMyTurn.value"
                            @click="game.toggleCard(card)"
                        >
                            <span :class="{ red: isRedSuit(card.suit) }">{{ card.rank }}</span>
                            <span v-if="card.suit !== 'Joker'" :class="{ red: isRedSuit(card.suit) }">{{ card.suit }}</span>
                            <span v-else class="joker">JOKER</span>
                        </button>
                    </div>
                </div>
            </section>
        </main>

        <footer class="action-bar">
            <button v-if="game.state.value.phase === 'playing' && game.isMyTurn.value" class="play-action" :disabled="game.selectedCards.value.length === 0" @click="game.playSelected()">
                出牌
            </button>
            <button v-if="game.state.value.phase === 'playing' && game.isMyTurn.value && game.canPass.value" class="pass-action" @click="game.passTurn()">
                不出
            </button>
            <button v-if="game.state.value.phase === 'playing' && game.isMyTurn.value" class="hint-action" :disabled="!game.selectedCardIds.value.length" @click="game.clearSelection()">
                清空
            </button>
        </footer>
    </div>
</template>

<style scoped>
.fight-page {
    height: 100dvh;
    color: #fff8e6;
    background:
        radial-gradient(circle at 18% 16%, rgba(255, 205, 96, 0.18), transparent 24%),
        radial-gradient(circle at 82% 8%, rgba(244, 114, 74, 0.16), transparent 26%),
        linear-gradient(145deg, #2c1714 0%, #4b2019 42%, #171b17 100%);
}

.table-header {
    width: min(960px, 100%);
    margin: 0 auto;
    padding: 14px 16px 8px;
    display: grid;
    grid-template-columns: 88px 1fr 88px;
    align-items: center;
    gap: 10px;
}

.nav-button {
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-radius: 8px;
    color: #f8dba0;
    background: rgba(42, 24, 17, 0.58);
    border: 1px solid rgba(255, 218, 145, 0.16);
    font-size: 13px;
    transition:
        transform 160ms ease,
        background 160ms ease,
        opacity 160ms ease;
}

.nav-button:hover:not(:disabled) {
    background: rgba(86, 43, 25, 0.72);
    transform: translateY(-1px);
}

.nav-button:disabled {
    opacity: 0.42;
    cursor: not-allowed;
}

.title-wrap {
    text-align: center;
    line-height: 1.05;
}

.title-wrap h1 {
    font-size: clamp(22px, 4vw, 34px);
    font-weight: 900;
    letter-spacing: 0;
    color: #ffe4a3;
    text-shadow:
        0 2px 0 rgba(80, 29, 15, 0.8),
        0 12px 24px rgba(0, 0, 0, 0.28);
}

.title-wrap span {
    font-size: 12px;
    color: rgba(255, 239, 204, 0.54);
}

.table-shell {
    flex: 1;
    min-height: 0;
    width: min(1180px, 100%);
    margin: 0 auto;
    padding: 0 12px 10px;
    display: grid;
    grid-template-columns: 196px minmax(0, 960px);
    gap: 12px;
    align-items: stretch;
    justify-content: center;
}

.table-felt {
    position: relative;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border-radius: 22px;
    border: 10px solid #6a3922;
    box-shadow:
        inset 0 0 0 2px rgba(255, 220, 146, 0.2),
        inset 0 16px 48px rgba(255, 255, 255, 0.04),
        0 24px 60px rgba(0, 0, 0, 0.42);
    background:
        linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
        linear-gradient(0deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
        radial-gradient(circle at 50% 35%, rgba(49, 164, 108, 0.42), transparent 44%),
        linear-gradient(145deg, #0d5d42, #083b2d 58%, #07271f);
    background-size:
        30px 30px,
        30px 30px,
        auto,
        auto;
}

.lan-panel {
    position: relative;
    z-index: 5;
    width: 188px;
    align-self: start;
    padding: 9px;
    border-radius: 10px;
    color: #fff1cb;
    background: rgba(42, 24, 17, 0.66);
    border: 1px solid rgba(255, 218, 145, 0.16);
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.24);
}

.panel-head,
.room-actions,
.room-code,
.panel-error,
.mini-card-row,
.played-cards,
.card-back-stack {
    display: flex;
    align-items: center;
}

.panel-head {
    justify-content: space-between;
    gap: 6px;
    font-size: 12px;
    font-weight: 900;
}

.panel-head span {
    flex: 1;
}

.panel-head strong {
    color: #ffd36b;
}

.room-actions {
    gap: 7px;
    margin-top: 9px;
}

.panel-action,
.copy-button {
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border-radius: 7px;
    color: #ffe9ba;
    background: rgba(255, 238, 190, 0.08);
    border: 1px solid rgba(255, 220, 155, 0.16);
    font-size: 12px;
    font-weight: 900;
}

.panel-action {
    flex: 1;
}

.panel-action.primary {
    color: #431904;
    background: linear-gradient(145deg, #ffd36b, #f08b24);
}

.panel-action:disabled {
    opacity: 0.42;
    cursor: not-allowed;
}

.room-code {
    justify-content: space-between;
    gap: 8px;
    margin-top: 8px;
    padding: 7px;
    border-radius: 8px;
    background: rgba(255, 211, 107, 0.11);
    border: 1px solid rgba(255, 211, 107, 0.2);
}

.room-code span {
    color: #ffd36b;
    font-size: 22px;
    line-height: 1;
    font-weight: 950;
}

.copy-button {
    height: 28px;
    padding: 0 8px;
}

.join-code {
    display: block;
    margin-top: 8px;
}

.join-code input {
    width: 100%;
    height: 34px;
    border-radius: 8px;
    border: 1px solid rgba(255, 220, 155, 0.16);
    background: rgba(0, 0, 0, 0.22);
    padding: 0 10px;
    color: #ffe9ba;
    outline: none;
    font-weight: 900;
    text-transform: uppercase;
}

.panel-error {
    gap: 6px;
    margin-top: 8px;
    color: #fecaca;
    font-size: 11px;
    line-height: 1.35;
}

.play-effect-layer {
    pointer-events: none;
    position: absolute;
    z-index: 1;
    inset: 35% auto auto 50%;
    width: 168px;
    height: 96px;
    display: grid;
    place-items: center;
    transform: translate(-50%, -50%);
    opacity: 0;
    animation: effect-pop 1100ms ease-out both;
}

.effect-ring {
    position: absolute;
    width: 82px;
    height: 82px;
    border-radius: 50%;
    border: 2px solid rgba(255, 226, 142, 0.42);
    box-shadow:
        0 0 26px rgba(255, 198, 83, 0.22),
        inset 0 0 20px rgba(255, 255, 255, 0.08);
    animation: effect-ring 1100ms ease-out both;
}

.effect-icon {
    width: 30px;
    height: 30px;
    transform: translateY(-3px);
    z-index: 1;
    color: #fff1b8;
    filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.38));
}

.effect-title {
    position: absolute;
    top: -20px;
    min-width: 76px;
    padding: 3px 9px;
    border-radius: 999px;
    color: #432006;
    background: linear-gradient(145deg, #fff1a8, #f59e0b);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    font-size: 13px;
    font-weight: 950;
}

.effect-particle {
    position: absolute;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgba(255, 211, 107, 0.62);
    transform: rotate(var(--particle-angle)) translateX(0);
    animation: effect-particle 900ms ease-out both;
}

.effect-bomb .effect-ring,
.effect-bomb .effect-particle,
.effect-rocket .effect-ring,
.effect-rocket .effect-particle {
    background: radial-gradient(circle, rgba(255, 241, 184, 0.95), rgba(239, 68, 68, 0.2) 52%, transparent 70%);
}

.effect-bomb .effect-icon {
    color: #fee2e2;
    animation: effect-shake 420ms ease-out both;
}

.effect-rocket {
    animation-duration: 1350ms;
}

.effect-rocket .effect-icon {
    color: #dff7ff;
    animation: rocket-lift 1050ms cubic-bezier(0.2, 0.8, 0.28, 1) both;
}

.effect-airplane .effect-ring {
    border-color: rgba(125, 211, 252, 0.86);
    box-shadow: 0 0 36px rgba(56, 189, 248, 0.26);
}

.effect-airplane .effect-icon {
    color: #bae6fd;
    animation: plane-sweep 1050ms ease-out both;
}

.effect-chain .effect-ring {
    border-color: rgba(134, 239, 172, 0.86);
    box-shadow: 0 0 34px rgba(74, 222, 128, 0.24);
}

.effect-chain .effect-icon {
    color: #bbf7d0;
}

.landlord-strip {
    margin: 10px auto 2px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 7px 12px;
    border-radius: 8px;
    background: rgba(5, 35, 27, 0.52);
    border: 1px solid rgba(255, 226, 160, 0.18);
}

.score-strip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: rgba(255, 239, 204, 0.68);
    font-size: 11px;
    font-weight: 800;
    white-space: nowrap;
}

.score-strip span {
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(255, 238, 190, 0.08);
    border: 1px solid rgba(255, 226, 160, 0.12);
}

.strip-label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #f8d991;
    font-size: 13px;
    font-weight: 800;
}

.mini-card {
    width: 28px;
    height: 36px;
    margin-left: -4px;
    display: grid;
    place-items: center;
    border-radius: 5px;
    color: #19130f;
    background: linear-gradient(145deg, #fffdf7, #eadbc1);
    border: 1px solid rgba(78, 42, 22, 0.28);
    font-size: 10px;
    font-weight: 900;
    line-height: 1;
}

.mini-card:first-child {
    margin-left: 0;
}

.landlord-hidden {
    color: rgba(255, 240, 202, 0.54);
    font-size: 12px;
}

.opponents-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    padding: 4px 18px 0;
}

.seat-panel,
.player-area {
    border-radius: 12px;
    border: 1px solid rgba(255, 234, 178, 0.14);
    background: rgba(2, 27, 22, 0.38);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.seat-panel {
    min-height: 92px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.seat-panel.active,
.player-area.active {
    border-color: rgba(255, 216, 115, 0.72);
    box-shadow:
        0 0 0 2px rgba(255, 183, 64, 0.14),
        0 0 28px rgba(255, 184, 77, 0.16);
}

.seat-panel.landlord,
.player-area.landlord {
    background: rgba(79, 38, 12, 0.36);
}

.seat-info {
    display: flex;
    align-items: center;
    gap: 8px;
}

.seat-info.right,
.card-back-stack.right {
    justify-content: flex-end;
}

.avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    position: relative;
    display: grid;
    place-items: center;
    color: #ffe6a6;
    background: linear-gradient(145deg, #6a4f2a, #223629);
    border: 1px solid rgba(255, 223, 154, 0.24);
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);
}

.avatar.landlord {
    color: #3b1706;
    background: linear-gradient(145deg, #ffe08a, #e58d27);
    border-color: rgba(255, 247, 196, 0.74);
}

.avatar.farmer {
    color: #103b28;
    background: linear-gradient(145deg, #b5f0c8, #55b87f);
    border-color: rgba(202, 255, 221, 0.46);
}

.avatar-chip {
    position: absolute;
    right: -4px;
    bottom: -3px;
    width: 16px;
    height: 16px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #fff0c8;
    background: rgba(32, 20, 14, 0.92);
    border: 1px solid rgba(255, 230, 173, 0.35);
}

.seat-name {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #fff3cf;
    font-size: 13px;
    font-weight: 900;
}

.seat-count {
    margin-top: 2px;
    color: rgba(255, 239, 204, 0.52);
    font-size: 12px;
}

.role-badge {
    padding: 2px 5px;
    border-radius: 5px;
    color: #4c2208;
    background: linear-gradient(145deg, #ffd876, #f0a12d);
    font-size: 10px;
    font-weight: 900;
}

.role-badge.farmer {
    color: #07331e;
    background: linear-gradient(145deg, #b8f7cd, #4ec67e);
}

.card-back-stack {
    min-height: 38px;
    padding-left: 8px;
}

.card-back {
    width: 26px;
    height: 36px;
    margin-left: -12px;
    border-radius: 6px;
    border: 1px solid rgba(255, 230, 167, 0.28);
    background:
        linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.18) 0 10%,
            transparent 10% 20%,
            rgba(255, 255, 255, 0.16) 20% 30%,
            transparent 30%
        ),
        linear-gradient(145deg, #a4372c, #581c1a);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.18);
    animation: deal-card 520ms cubic-bezier(0.18, 0.85, 0.3, 1.12) both;
    animation-delay: var(--deal-delay, 0ms);
}

.card-back:first-child {
    margin-left: 0;
}

.more-count {
    margin-left: 6px;
    color: rgba(255, 236, 190, 0.52);
    font-size: 11px;
}

.center-area {
    flex: 1;
    min-height: 0;
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14px 14px 18px;
}

.center-state,
.play-zone {
    width: min(520px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    text-align: center;
}

.center-state p {
    color: rgba(255, 242, 213, 0.8);
    font-size: 15px;
}

.status-pill {
    max-width: 100%;
    padding: 8px 14px;
    border-radius: 8px;
    color: #ffe1a0;
    background: rgba(55, 27, 16, 0.58);
    border: 1px solid rgba(255, 214, 130, 0.2);
    font-size: 15px;
    font-weight: 900;
}

.bid-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
}

.primary-action,
.secondary-action,
.play-action,
.pass-action,
.hint-action {
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 8px;
    padding: 0 18px;
    font-weight: 900;
    transition:
        transform 150ms ease,
        filter 150ms ease,
        opacity 150ms ease;
}

.primary-action,
.play-action {
    color: #431904;
    background: linear-gradient(145deg, #ffd36b, #f08b24);
    box-shadow: 0 8px 22px rgba(255, 158, 43, 0.26);
}

.secondary-action,
.pass-action {
    color: #ffe9ba;
    background: rgba(52, 31, 22, 0.72);
    border: 1px solid rgba(255, 220, 155, 0.22);
}

.hint-action {
    color: #102d21;
    background: linear-gradient(145deg, #a6f0c9, #4ac889);
}

.primary-action:hover:not(:disabled),
.secondary-action:hover:not(:disabled),
.play-action:hover:not(:disabled),
.pass-action:hover:not(:disabled),
.hint-action:hover:not(:disabled) {
    filter: brightness(1.06);
    transform: translateY(-1px);
}

.primary-action.compact {
    height: 36px;
    padding: 0 14px;
}

.primary-action:disabled,
.play-action:disabled,
.hint-action:disabled {
    opacity: 0.42;
    cursor: not-allowed;
    transform: none;
}

.thinking-text {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: rgba(255, 238, 200, 0.56);
    font-size: 13px;
}

.thinking-dot {
    width: 8px;
    height: 8px;
    display: inline-block;
    border-radius: 50%;
    background: #ffd36b;
    box-shadow: 0 0 0 0 rgba(255, 211, 107, 0.7);
    animation: pulse-dot 1s infinite;
}

.last-play {
    width: 100%;
    min-height: 154px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 14px;
    padding-top: 18px;
}

.last-play-head {
    display: flex;
    justify-content: center;
    gap: 8px;
    color: rgba(255, 238, 204, 0.66);
    font-size: 12px;
    position: relative;
    z-index: 3;
}

.last-play-head strong {
    color: #ffd36b;
}

.played-cards {
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px;
    perspective: 900px;
    position: relative;
    z-index: 3;
}

.empty-play {
    height: 110px;
    display: flex;
    align-items: center;
    gap: 8px;
    color: rgba(255, 238, 204, 0.46);
    font-size: 13px;
}

.message-line {
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    color: #fff1cb;
    font-size: 14px;
    font-weight: 800;
    margin-top: 4px;
}

.message-line.win {
    color: #ffd36b;
}

.player-area {
    margin: 0 16px 14px;
    padding: 10px 10px 12px;
    --hand-card-overlap: clamp(-22px, -3.2vw, -14px);
}

.player-meta {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 9px;
    margin-bottom: 6px;
}

.player-avatar {
    width: 34px;
    height: 34px;
}

.hand-row {
    min-height: 96px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    overflow-x: auto;
    overflow-y: visible;
    padding: 24px 8px 4px;
}

.table-card {
    position: relative;
    width: 48px;
    height: 68px;
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    padding: 5px 0 0 6px;
    border-radius: 7px;
    color: #17120c;
    background:
        radial-gradient(circle at 76% 78%, rgba(189, 146, 78, 0.16), transparent 28%),
        linear-gradient(145deg, #fffdf8, #eadcc4);
    border: 1px solid rgba(83, 48, 24, 0.32);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.18);
    font-size: 16px;
    font-weight: 950;
    line-height: 1;
}

.table-card.played {
    width: 42px;
    height: 58px;
    font-size: 13px;
    animation: played-card-in 420ms cubic-bezier(0.2, 0.85, 0.28, 1.16) both;
    animation-delay: var(--play-delay, 0ms);
}

.hand-card {
    cursor: pointer;
    transition:
        transform 160ms ease,
        box-shadow 160ms ease;
    animation: deal-hand-card 520ms cubic-bezier(0.18, 0.85, 0.3, 1.12) backwards;
    animation-delay: var(--deal-delay, 0ms);
}

.hand-card:not(.disabled):hover {
    transform: translateY(-10px);
}

.hand-card.hint {
    box-shadow:
        inset 0 0 0 2px rgba(255, 211, 107, 0.35),
        0 8px 16px rgba(0, 0, 0, 0.18);
}

.hand-card.selected {
    transform: translateY(-18px) !important;
    border-color: rgba(255, 210, 82, 0.95);
    box-shadow:
        0 0 0 3px rgba(255, 211, 107, 0.82),
        0 0 18px rgba(255, 184, 64, 0.45),
        0 18px 26px rgba(0, 0, 0, 0.32);
}

.hand-card.disabled {
    cursor: default;
}

.red {
    color: #cf2f2b;
}

.joker {
    margin-top: 4px;
    writing-mode: vertical-rl;
    letter-spacing: 0;
    color: #9b2f25;
    font-size: 10px;
}

.action-bar {
    min-height: 56px;
    padding: 6px 12px 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
}

.scrollbar-none::-webkit-scrollbar {
    display: none;
}

.scrollbar-none {
    -ms-overflow-style: none;
    scrollbar-width: none;
}

@keyframes pulse-dot {
    0% {
        box-shadow: 0 0 0 0 rgba(255, 211, 107, 0.7);
    }

    70% {
        box-shadow: 0 0 0 8px rgba(255, 211, 107, 0);
    }

    100% {
        box-shadow: 0 0 0 0 rgba(255, 211, 107, 0);
    }
}

@keyframes deal-card {
    0% {
        opacity: 0;
        transform: translateY(-24px) rotate(-10deg) scale(0.72);
    }

    70% {
        opacity: 1;
        transform: translateY(3px) rotate(2deg) scale(1.04);
    }

    100% {
        opacity: 1;
        transform: translateY(0) rotate(0deg) scale(1);
    }
}

@keyframes deal-hand-card {
    0% {
        opacity: 0;
        transform: translateY(-76px) rotate(-8deg) scale(0.74);
    }

    72% {
        opacity: 1;
        transform: translateY(3px) rotate(1deg) scale(1.03);
    }

    100% {
        opacity: 1;
        transform: translateY(0) rotate(0deg) scale(1);
    }
}

@keyframes played-card-in {
    0% {
        opacity: 0;
        transform: translateY(20px) rotateX(55deg) scale(0.86);
    }

    100% {
        opacity: 1;
        transform: translateY(0) rotateX(0deg) scale(1);
    }
}

@keyframes effect-pop {
    0% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.72);
    }

    14%,
    72% {
        opacity: 1;
    }

    100% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(1.08);
    }
}

@keyframes effect-ring {
    0% {
        opacity: 0;
        transform: scale(0.3);
    }

    24% {
        opacity: 1;
    }

    100% {
        opacity: 0;
        transform: scale(1.85);
    }
}

@keyframes effect-particle {
    0% {
        opacity: 0;
        transform: rotate(var(--particle-angle)) translateX(0) scale(0.6);
    }

    18% {
        opacity: 1;
    }

    100% {
        opacity: 0;
        transform: rotate(var(--particle-angle)) translateX(var(--particle-distance)) scale(0.1);
    }
}

@keyframes effect-shake {
    0%,
    100% {
        transform: translateX(0) rotate(0deg) scale(1);
    }

    22% {
        transform: translateX(-5px) rotate(-8deg) scale(1.12);
    }

    44% {
        transform: translateX(5px) rotate(8deg) scale(1.16);
    }

    66% {
        transform: translateX(-3px) rotate(-4deg) scale(1.08);
    }
}

@keyframes rocket-lift {
    0% {
        transform: translateY(28px) rotate(-10deg) scale(0.72);
    }

    40% {
        transform: translateY(-12px) rotate(0deg) scale(1.14);
    }

    100% {
        transform: translateY(-70px) rotate(7deg) scale(0.82);
    }
}

@keyframes plane-sweep {
    0% {
        transform: translateX(-86px) translateY(18px) rotate(-18deg) scale(0.72);
    }

    52% {
        transform: translateX(0) translateY(-6px) rotate(0deg) scale(1.1);
    }

    100% {
        transform: translateX(94px) translateY(-24px) rotate(12deg) scale(0.86);
    }
}

@media (max-width: 760px) {
    .table-header {
        grid-template-columns: 68px 1fr 68px;
        padding: 10px 10px 6px;
    }

    .nav-button {
        height: 32px;
        font-size: 12px;
    }

    .table-shell {
        padding: 0 8px 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .table-felt {
        border-width: 6px;
        border-radius: 18px;
    }

    .lan-panel {
        width: calc(100% - 16px);
        margin: 8px 8px 0;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
    }

    .room-actions,
    .room-code,
    .join-code,
    .panel-error {
        margin-top: 0;
    }

    .room-actions,
    .room-code,
    .join-code,
    .panel-error {
        grid-column: 1 / -1;
    }

    .landlord-strip {
        margin-top: 8px;
        padding: 6px 9px;
        flex-wrap: wrap;
        justify-content: center;
    }

    .score-strip {
        width: 100%;
        justify-content: center;
    }

    .opponents-row {
        gap: 8px;
        padding: 4px 8px 0;
    }

    .seat-panel {
        min-height: 84px;
        padding: 8px;
    }

    .avatar {
        width: 28px;
        height: 28px;
    }

    .play-effect-layer {
        top: 38%;
        width: 136px;
        height: 86px;
    }

    .effect-ring {
        width: 68px;
        height: 68px;
    }

    .effect-icon {
        width: 26px;
        height: 26px;
    }

    .effect-title {
        top: -22px;
        min-width: 62px;
        font-size: 12px;
    }

    .center-area {
        padding: 6px 8px;
    }

    .last-play {
        min-height: 132px;
        gap: 12px;
        padding-top: 18px;
    }

    .empty-play {
        height: 94px;
    }

    .player-area {
        margin: 0 8px 10px;
        padding: 8px 8px 10px;
    }

    .hand-row {
        justify-content: flex-start;
        min-height: 88px;
        padding-top: 24px;
    }

    .table-card {
        width: 44px;
        height: 64px;
        font-size: 15px;
    }

    .table-card.played {
        width: 38px;
        height: 54px;
    }

    .action-bar {
        min-height: 50px;
        padding-bottom: 8px;
    }
}
</style>
