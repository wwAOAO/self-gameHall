<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useTexasHoldem, type PokerCard, type PokerPlayer } from '@/composables/useTexasHoldem';
import { ArrowLeft, Bot, Coins, Crown, Play, RotateCcw, Sparkles, Trophy, UserRound } from 'lucide-vue-next';

const router = useRouter();
const game = useTexasHoldem();
const raiseAmount = ref(40);

const revealOpponents = computed(() => game.phase.value === 'showdown' || game.phase.value === 'ended');
const userBestHand = computed(() => game.getBestHandForPlayer(0));
const normalizedRaiseAmount = computed(() => {
    if (!game.canRaise.value) return 0;
    return Math.min(game.maxUserRaise.value, Math.max(game.minUserRaise.value, Math.floor(raiseAmount.value || 0)));
});

watch(
    [game.minUserRaise, game.maxUserRaise, game.canRaise],
    () => {
        if (!game.canRaise.value) {
            raiseAmount.value = game.minUserRaise.value;
            return;
        }
        raiseAmount.value = normalizedRaiseAmount.value || game.minUserRaise.value;
    },
    { immediate: true },
);

function suitLabel(suit: string): string {
    const labels: Record<string, string> = {
        spades: '♠',
        hearts: '♥',
        diamonds: '♦',
        clubs: '♣',
    };
    return labels[suit] || suit;
}

function isRed(card: PokerCard): boolean {
    return card.suit === 'hearts' || card.suit === 'diamonds';
}

function cardKey(card: PokerCard, index: number): string {
    return `${card.suit}-${card.rank}-${index}`;
}

function getSeatClass(player: PokerPlayer): string {
    if (player.id === 0) return 'seat-bottom';
    if (player.id === 1) return 'seat-left';
    if (player.id === 2) return 'seat-top';
    return 'seat-right';
}

function shouldReveal(player: PokerPlayer): boolean {
    return player.id === 0 || (revealOpponents.value && !player.folded);
}

function actionText(): string {
    return game.canCheck.value ? '过牌' : `跟注 ${game.callAmount.value}`;
}

function winnerText(player: PokerPlayer): string {
    const winner = game.winners.value.find(item => item.playerId === player.id);
    return winner ? `赢得 ${winner.amount}` : '';
}

function playerHandLabel(player: PokerPlayer): string {
    if (player.folded) return '已弃牌';
    if (player.chips === 0 && player.hand.length > 0 && game.phase.value !== 'idle') return 'All in';
    if (game.phase.value === 'showdown') {
        const best = game.getBestHandForPlayer(player.id);
        return best?.label || '等待摊牌';
    }
    if (player.id === 0) return userBestHand.value?.label || '等待公共牌';
    return '手牌保密';
}

function raiseText(): string {
    return game.canRaise.value ? `加注到 ${normalizedRaiseAmount.value}` : `加注到 ${game.minUserRaise.value}`;
}

function commitRaise() {
    if (!game.canRaise.value) return;
    game.playerRaiseTo(normalizedRaiseAmount.value);
}
</script>

<template>
    <div class="texas-page min-h-screen select-none overflow-hidden text-slate-100">
        <header class="texas-header">
            <button class="nav-button" @click="router.push('/')">
                <ArrowLeft class="h-4 w-4" />
                返回
            </button>

            <div class="title-block">
                <h1>德州扑克</h1>
                <span>Texas Hold'em</span>
            </div>

            <button class="nav-button ghost" :class="{ hidden: game.phase.value === 'idle' }" @click="game.startGame()">
                <RotateCcw class="h-4 w-4" />
                重开
            </button>
        </header>

        <main class="table-wrap">
            <section class="table">
                <div class="table-rail" />
                <div class="table-center">
                    <div class="pot-pill">
                        <Coins class="h-4 w-4 text-amber-200" />
                        <span>底池</span>
                        <strong>{{ game.pot.value }}</strong>
                    </div>

                    <div class="phase-pill">{{ game.phaseLabel.value }}</div>

                    <div class="community-row">
                        <div
                            v-for="(card, index) in game.communityCards.value"
                            :key="cardKey(card, index)"
                            class="poker-card community-card"
                            :class="{ red: isRed(card) }"
                            :style="{ '--deal-delay': `${index * 70}ms` }"
                        >
                            <span class="rank">{{ card.rank }}</span>
                            <span class="suit">{{ suitLabel(card.suit) }}</span>
                        </div>
                        <div
                            v-for="slot in 5 - game.communityCards.value.length"
                            :key="'empty-' + slot"
                            class="poker-card empty-card"
                        />
                    </div>

                    <div class="message-board">
                        <Sparkles class="h-4 w-4 text-emerald-200" />
                        <span>{{ game.message.value }}</span>
                    </div>

                    <div v-if="game.sidePots.value.length > 1" class="side-pot-row">
                        <span v-for="(sidePot, index) in game.sidePots.value" :key="index" class="side-pot-chip">
                            {{ index === 0 ? '主池' : `边池${index}` }} {{ sidePot.amount }} ·
                            {{ sidePot.eligibleNames.join(' / ') }}
                        </span>
                    </div>

                    <div v-if="game.burnedCards.value.length > 0" class="burn-note">
                        Burn {{ game.burnedCards.value.length }}
                    </div>
                </div>

                <article
                    v-for="player in game.players.value"
                    :key="player.id"
                    class="player-seat"
                    :class="[
                        getSeatClass(player),
                        {
                            active:
                                game.currentPlayer.value === player.id &&
                                game.phase.value !== 'idle' &&
                                game.phase.value !== 'showdown',
                            folded: player.folded,
                            winner: game.isWinner(player.id),
                            compact: player.hand.length === 0,
                        },
                    ]"
                >
                    <div class="seat-head">
                        <div class="avatar" :class="{ user: player.id === 0 }">
                            <UserRound v-if="player.id === 0" class="h-4 w-4" />
                            <Bot v-else class="h-4 w-4" />
                        </div>
                        <div class="seat-copy">
                            <div class="seat-name">
                                {{ player.name }}
                                <span v-if="player.isDealer" class="dealer-chip">D</span>
                                <span v-if="player.isSmallBlind" class="blind-chip">SB</span>
                                <span v-if="player.isBigBlind" class="blind-chip">BB</span>
                            </div>
                            <div class="seat-status">{{ playerHandLabel(player) }}</div>
                        </div>
                    </div>

                    <div v-if="player.hand.length > 0" class="hole-cards">
                        <div
                            v-for="(card, index) in player.hand"
                            :key="player.id + '-' + cardKey(card, index)"
                            class="poker-card hole-card"
                            :class="{ red: shouldReveal(player) && isRed(card), back: !shouldReveal(player) }"
                            :style="{ '--deal-delay': `${index * 72}ms` }"
                        >
                            <template v-if="shouldReveal(player)">
                                <span class="rank">{{ card.rank }}</span>
                                <span class="suit">{{ suitLabel(card.suit) }}</span>
                            </template>
                        </div>
                    </div>

                    <div class="chip-line">
                        <span><Coins class="h-3.5 w-3.5" /> {{ player.chips }}</span>
                        <span v-if="player.bet > 0" class="bet-chip">下注 {{ player.bet }}</span>
                        <span v-if="player.chips === 0 && player.hand.length > 0 && !player.folded" class="all-in-chip">
                            All in
                        </span>
                        <span v-if="game.isWinner(player.id)" class="win-chip">
                            <Trophy class="h-3.5 w-3.5" />
                            {{ winnerText(player) }}
                        </span>
                    </div>
                </article>
            </section>
        </main>

        <aside class="info-strip">
            <div class="info-item">
                <Coins class="h-4 w-4 text-amber-200" />
                <span>剩余钱</span>
                <strong>{{ game.remainingMoney.value }}</strong>
            </div>
            <div class="info-item">
                <Play class="h-4 w-4 text-sky-200" />
                <span>坚持轮数</span>
                <strong>{{ game.survivedRounds.value }}</strong>
            </div>
            <div class="info-item">
                <Trophy class="h-4 w-4 text-emerald-200" />
                <span>最高纪录</span>
                <strong>{{ game.bestSurvivedRounds.value }}</strong>
            </div>
            <div class="info-item">
                <Crown class="h-4 w-4 text-amber-200" />
                <span>当前最高注</span>
                <strong>{{ game.currentBet.value }}</strong>
            </div>
            <div class="info-item">
                <Trophy class="h-4 w-4 text-emerald-200" />
                <span>你的牌型</span>
                <strong>{{ userBestHand?.label || '未成牌' }}</strong>
            </div>
            <div class="log-line">
                <span v-for="(item, index) in game.actionLog.value.slice(0, 3)" :key="index">{{ item }}</span>
            </div>
        </aside>

        <footer class="action-dock">
            <template v-if="game.phase.value === 'idle'">
                <button class="primary-action wide" @click="game.startGame()">
                    <Play class="h-4 w-4" />
                    开始
                </button>
            </template>
            <template v-else-if="game.phase.value === 'showdown'">
                <button class="primary-action wide" @click="game.startNextHand()">
                    <Play class="h-4 w-4" />
                    下一手
                </button>
                <span v-if="!game.canAffordNextHand.value" class="limit-note">
                    下一局至少需要 {{ game.nextHandMinChips.value }}
                </span>
            </template>
            <template v-else-if="game.phase.value === 'ended'">
                <button class="primary-action wide" @click="game.startGame()">
                    <RotateCcw class="h-4 w-4" />
                    重新挑战
                </button>
            </template>
            <template v-else-if="game.currentPlayer.value === 0 && !game.user.value.folded">
                <button class="danger-action" @click="game.playerFold()">弃牌</button>
                <button class="secondary-action" @click="game.playerCallOrCheck()">{{ actionText() }}</button>
                <div class="raise-control" :class="{ disabled: !game.canRaise.value }">
                    <input
                        v-model.number="raiseAmount"
                        class="raise-input"
                        type="number"
                        inputmode="numeric"
                        :min="game.minUserRaise.value"
                        :max="game.maxUserRaise.value"
                        :step="game.minUserRaise.value"
                        :disabled="!game.canRaise.value"
                    />
                    <input
                        v-model.number="raiseAmount"
                        class="raise-slider"
                        type="range"
                        :min="game.minUserRaise.value"
                        :max="game.maxUserRaise.value"
                        :step="game.minUserRaise.value"
                        :disabled="!game.canRaise.value"
                    />
                    <span>{{ game.canRaise.value ? `到 ${game.minUserRaise.value}-${game.maxUserRaise.value}` : '筹码不足' }}</span>
                </div>
                <button class="primary-action" :disabled="!game.canRaise.value" @click="commitRaise()">
                    {{ raiseText() }}
                </button>
                <button class="all-in-action" :disabled="!game.canAllIn.value" @click="game.playerAllIn()">All in</button>
            </template>
            <template v-else>
                <div class="waiting-pill">
                    <span class="thinking-dot" />
                    等待电脑行动
                </div>
            </template>
        </footer>
    </div>
</template>

<style scoped>
.texas-page {
    min-height: 100dvh;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    overflow-y: auto;
    background:
        linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
        linear-gradient(0deg, rgba(255, 255, 255, 0.028) 1px, transparent 1px),
        linear-gradient(145deg, #15262c 0%, #103d35 44%, #171a21 100%);
    background-size:
        34px 34px,
        34px 34px,
        auto;
}

.texas-header {
    width: min(1100px, 100%);
    margin: 0 auto;
    padding: 14px 16px 6px;
    display: grid;
    grid-template-columns: 92px 1fr 92px;
    align-items: center;
    gap: 10px;
}

.nav-button,
.primary-action,
.secondary-action,
.danger-action,
.all-in-action {
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 850;
    transition:
        transform 160ms ease,
        filter 160ms ease,
        border-color 160ms ease,
        background 160ms ease;
}

.nav-button {
    color: #d7eadf;
    border: 1px solid rgba(209, 250, 229, 0.18);
    background: rgba(10, 31, 35, 0.58);
}

.nav-button.ghost.hidden {
    visibility: hidden;
}

.title-block {
    text-align: center;
    line-height: 1.05;
}

.title-block h1 {
    margin: 0;
    color: #f6f7e9;
    font-size: clamp(24px, 4vw, 38px);
    font-weight: 950;
    letter-spacing: 0;
    text-shadow: 0 14px 28px rgba(0, 0, 0, 0.28);
}

.title-block span {
    display: block;
    margin-top: 4px;
    color: rgba(220, 252, 231, 0.58);
    font-size: 12px;
}

.table-wrap {
    min-height: 0;
    width: min(1100px, 100%);
    margin: 0 auto;
    padding: 4px 14px 8px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.table {
    position: relative;
    width: min(100%, 980px);
    min-width: min(100%, 760px);
    height: clamp(580px, calc(100dvh - 150px), 660px);
    min-height: 580px;
    overflow: hidden;
    display: grid;
    grid-template-columns: minmax(190px, 1fr) minmax(360px, 1.25fr) minmax(190px, 1fr);
    grid-template-rows: minmax(104px, auto) 1fr minmax(116px, auto);
    grid-template-areas:
        '. top .'
        'left center right'
        '. bottom .';
    gap: 10px 22px;
    align-items: center;
    justify-items: center;
    padding: 32px 54px 26px;
    border-radius: 50%;
    border: 14px solid #6b3f26;
    background:
        radial-gradient(ellipse at 50% 50%, rgba(244, 255, 233, 0.08), transparent 35%),
        linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
        linear-gradient(0deg, rgba(255, 255, 255, 0.032) 1px, transparent 1px),
        linear-gradient(145deg, #0d684f 0%, #094a3c 58%, #073329 100%);
    background-size:
        28px 28px,
        28px 28px,
        auto;
    box-shadow:
        inset 0 0 0 2px rgba(255, 224, 178, 0.2),
        inset 0 22px 60px rgba(255, 255, 255, 0.04),
        0 24px 70px rgba(0, 0, 0, 0.38);
}

.table-rail {
    pointer-events: none;
    position: absolute;
    z-index: 0;
    inset: 28px;
    border-radius: 50%;
    border: 2px solid rgba(255, 235, 193, 0.2);
    box-shadow:
        inset 0 0 0 10px rgba(4, 44, 38, 0.22),
        inset 0 0 50px rgba(0, 0, 0, 0.18);
}

.table-center {
    position: relative;
    z-index: 2;
    grid-area: center;
    width: min(430px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    align-self: center;
}

.pot-pill,
.phase-pill,
.message-board,
.waiting-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 8px;
    border: 1px solid rgba(209, 250, 229, 0.18);
    background: rgba(4, 32, 28, 0.58);
    color: rgba(236, 253, 245, 0.82);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.pot-pill {
    min-width: 132px;
    padding: 8px 12px;
    font-size: 13px;
}

.pot-pill strong {
    color: #fde68a;
    font-size: 18px;
}

.phase-pill {
    padding: 5px 10px;
    color: #a7f3d0;
    font-size: 12px;
    font-weight: 900;
}

.community-row,
.hole-cards {
    display: flex;
    align-items: center;
    justify-content: center;
}

.community-row {
    gap: 8px;
    min-height: 86px;
    max-width: 100%;
    flex-wrap: nowrap;
}

.poker-card {
    position: relative;
    width: 58px;
    height: 82px;
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    padding: 7px 0 0 7px;
    border-radius: 8px;
    color: #111827;
    background: linear-gradient(145deg, #ffffff, #e6edf4);
    border: 1px solid rgba(15, 23, 42, 0.22);
    box-shadow: 0 12px 22px rgba(0, 0, 0, 0.2);
    font-weight: 950;
    line-height: 1;
    animation: deal-in 420ms cubic-bezier(0.18, 0.9, 0.24, 1.12) both;
    animation-delay: var(--deal-delay, 0ms);
}

.poker-card .rank {
    font-size: 17px;
}

.poker-card .suit {
    margin-top: 6px;
    font-family: Georgia, serif;
    font-size: 24px;
}

.poker-card.red {
    color: #dc2626;
}

.poker-card.back {
    background:
        linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.2) 0 10%,
            transparent 10% 20%,
            rgba(255, 255, 255, 0.15) 20% 30%,
            transparent 30%
        ),
        linear-gradient(145deg, #be3f34, #6b1f1a);
    border-color: rgba(255, 230, 190, 0.32);
}

.poker-card.empty-card {
    background: rgba(5, 46, 38, 0.52);
    border: 1px dashed rgba(209, 250, 229, 0.18);
    box-shadow: none;
    animation: none;
}

.message-board {
    width: min(390px, 100%);
    min-height: 34px;
    padding: 7px 11px;
    text-align: center;
    font-size: 12px;
    font-weight: 800;
}

.side-pot-row {
    width: min(390px, 100%);
    min-height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 5px;
}

.side-pot-chip {
    min-height: 22px;
    max-width: min(360px, 100%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    border: 1px solid rgba(253, 230, 138, 0.22);
    background: rgba(67, 20, 7, 0.5);
    color: #fde68a;
    padding: 3px 7px;
    font-size: 11px;
    font-weight: 850;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.burn-note {
    min-height: 20px;
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.22);
    background: rgba(15, 23, 42, 0.36);
    color: rgba(226, 232, 240, 0.58);
    padding: 2px 7px;
    font-size: 10px;
    font-weight: 850;
}

.player-seat {
    position: relative;
    z-index: 2;
    width: min(236px, 100%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: 12px;
    border: 1px solid rgba(220, 252, 231, 0.16);
    background: rgba(4, 24, 27, 0.6);
    box-shadow:
        0 16px 34px rgba(0, 0, 0, 0.24),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(10px);
}

.player-seat.compact {
    min-height: 94px;
    justify-content: space-between;
}

.player-seat.active {
    border-color: rgba(253, 230, 138, 0.78);
    box-shadow:
        0 0 0 2px rgba(251, 191, 36, 0.14),
        0 18px 40px rgba(0, 0, 0, 0.28);
}

.player-seat.folded {
    opacity: 0.58;
}

.player-seat.winner {
    border-color: rgba(167, 243, 208, 0.86);
}

.seat-bottom {
    grid-area: bottom;
    align-self: end;
}

.seat-top {
    grid-area: top;
    align-self: start;
}

.seat-left {
    grid-area: left;
    justify-self: start;
}

.seat-right {
    grid-area: right;
    justify-self: end;
}

.seat-head {
    display: flex;
    align-items: center;
    gap: 9px;
}

.avatar {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #d1fae5;
    background: linear-gradient(145deg, #365547, #112b2f);
    border: 1px solid rgba(209, 250, 229, 0.2);
}

.avatar.user {
    color: #10351f;
    background: linear-gradient(145deg, #bbf7d0, #34d399);
}

.seat-copy {
    min-width: 0;
    flex: 1;
}

.seat-name {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    color: #f8fafc;
    font-size: 14px;
    font-weight: 950;
}

.seat-status {
    margin-top: 2px;
    overflow: hidden;
    color: rgba(226, 232, 240, 0.58);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dealer-chip,
.blind-chip,
.bet-chip,
.all-in-chip,
.win-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 950;
}

.dealer-chip {
    width: 20px;
    height: 20px;
    color: #431407;
    background: #fde68a;
}

.blind-chip {
    height: 18px;
    padding: 0 5px;
    color: #052e16;
    background: #86efac;
}

.hole-cards {
    min-height: 62px;
}

.hole-card {
    width: 44px;
    height: 60px;
    margin-left: -10px;
    padding: 5px 0 0 5px;
}

.hole-card:first-child {
    margin-left: 0;
}

.hole-card .rank {
    font-size: 14px;
}

.hole-card .suit {
    font-size: 18px;
}

.chip-line {
    min-height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 7px;
    color: rgba(226, 232, 240, 0.72);
    font-size: 12px;
    overflow: hidden;
}

.chip-line span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.bet-chip {
    padding: 3px 6px;
    color: #451a03;
    background: #fbbf24;
}

.win-chip {
    padding: 3px 6px;
    color: #052e16;
    background: #86efac;
}

.all-in-chip {
    padding: 3px 6px;
    color: #431407;
    background: #fcd34d;
}

.info-strip {
    width: min(1100px, 100%);
    margin: 0 auto;
    padding: 2px 14px 0;
    display: grid;
    grid-template-columns: repeat(5, minmax(118px, auto)) minmax(180px, 1fr);
    gap: 8px;
    align-items: center;
}

.info-item,
.log-line {
    min-height: 34px;
    display: flex;
    align-items: center;
    gap: 7px;
    border-radius: 8px;
    border: 1px solid rgba(209, 250, 229, 0.13);
    background: rgba(5, 24, 28, 0.52);
    color: rgba(226, 232, 240, 0.68);
    padding: 7px 10px;
    font-size: 12px;
}

.info-item strong {
    color: #f8fafc;
    font-size: 13px;
}

.log-line {
    overflow: hidden;
}

.log-line span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.action-dock {
    min-height: 58px;
    padding: 6px 14px 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
}

.raise-control {
    width: min(230px, calc(100vw - 28px));
    min-height: 44px;
    display: grid;
    grid-template-columns: 72px minmax(86px, 1fr);
    grid-template-rows: 22px 18px;
    gap: 3px 8px;
    align-items: center;
    border-radius: 8px;
    border: 1px solid rgba(209, 250, 229, 0.13);
    background: rgba(5, 24, 28, 0.52);
    padding: 6px 8px;
}

.raise-control.disabled {
    opacity: 0.5;
}

.raise-input {
    width: 72px;
    height: 34px;
    grid-row: 1 / span 2;
    border-radius: 7px;
    border: 1px solid rgba(253, 230, 138, 0.25);
    background: rgba(15, 23, 42, 0.58);
    color: #fef3c7;
    padding: 0 7px;
    font-size: 13px;
    font-weight: 850;
}

.raise-slider {
    width: 100%;
    min-width: 0;
    accent-color: #34d399;
}

.raise-control span {
    color: rgba(226, 232, 240, 0.62);
    font-size: 10px;
    font-weight: 800;
    text-align: center;
}

.limit-note {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    border-radius: 8px;
    border: 1px solid rgba(253, 230, 138, 0.24);
    background: rgba(120, 53, 15, 0.42);
    color: #fde68a;
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 800;
}

.primary-action {
    color: #062e1c;
    background: linear-gradient(145deg, #bbf7d0, #34d399);
    border: 1px solid rgba(187, 247, 208, 0.72);
    box-shadow: 0 12px 24px rgba(16, 185, 129, 0.2);
}

.secondary-action {
    color: #fef3c7;
    background: rgba(133, 77, 14, 0.64);
    border: 1px solid rgba(253, 230, 138, 0.28);
}

.danger-action {
    color: #fee2e2;
    background: rgba(127, 29, 29, 0.72);
    border: 1px solid rgba(252, 165, 165, 0.24);
}

.all-in-action {
    color: #431407;
    background: linear-gradient(145deg, #fde68a, #f59e0b);
    border: 1px solid rgba(253, 230, 138, 0.58);
    box-shadow: 0 12px 24px rgba(245, 158, 11, 0.18);
}

.primary-action.wide {
    min-width: 148px;
}

.primary-action:hover,
.secondary-action:hover,
.danger-action:hover,
.all-in-action:hover,
.nav-button:hover {
    filter: brightness(1.06);
    transform: translateY(-1px);
}

.primary-action:disabled,
.secondary-action:disabled,
.all-in-action:disabled {
    opacity: 0.42;
    cursor: not-allowed;
    transform: none;
}

.waiting-pill {
    min-height: 38px;
    padding: 8px 13px;
    font-size: 13px;
    font-weight: 800;
}

.thinking-dot {
    width: 8px;
    height: 8px;
    display: inline-block;
    border-radius: 50%;
    background: #a7f3d0;
    box-shadow: 0 0 0 0 rgba(167, 243, 208, 0.7);
    animation: pulse-dot 1s infinite;
}

@keyframes pulse-dot {
    0% {
        box-shadow: 0 0 0 0 rgba(167, 243, 208, 0.7);
    }
    70% {
        box-shadow: 0 0 0 8px rgba(167, 243, 208, 0);
    }
    100% {
        box-shadow: 0 0 0 0 rgba(167, 243, 208, 0);
    }
}

@keyframes deal-in {
    0% {
        opacity: 0;
        transform: translateY(-20px) rotate(-5deg) scale(0.78);
    }
    100% {
        opacity: 1;
        transform: translateY(0) rotate(0deg) scale(1);
    }
}

@media (max-width: 860px) {
    .texas-page {
        grid-template-rows: auto auto auto auto;
    }

    .texas-header {
        grid-template-columns: 72px 1fr 72px;
        padding: 10px 10px 4px;
    }

    .nav-button {
        min-height: 32px;
        padding: 6px 8px;
        font-size: 12px;
    }

    .table-wrap {
        padding: 5px 8px;
    }

    .table {
        width: min(100%, 760px);
        height: auto;
        min-height: 650px;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: auto auto auto auto;
        grid-template-areas:
            'top top'
            'left right'
            'center center'
            'bottom bottom';
        gap: 8px;
        padding: 18px 18px 14px;
        border-width: 8px;
        border-radius: 26px;
    }

    .table-center {
        width: min(340px, 92%);
    }

    .community-row {
        gap: 5px;
    }

    .poker-card {
        width: 48px;
        height: 68px;
    }

    .poker-card .rank {
        font-size: 15px;
    }

    .poker-card .suit {
        font-size: 20px;
    }

    .player-seat {
        width: min(225px, 100%);
        padding: 8px;
    }

    .seat-top {
        align-self: start;
    }

    .seat-bottom {
        align-self: end;
    }

    .seat-left {
        justify-self: end;
    }

    .seat-right {
        justify-self: start;
    }

    .hole-card {
        width: 42px;
        height: 60px;
    }

    .info-strip {
        grid-template-columns: 1fr;
        padding: 2px 8px 0;
    }

    .log-line {
        display: none;
    }

    .action-dock {
        position: sticky;
        bottom: 0;
        min-height: 58px;
        background: rgba(12, 24, 28, 0.92);
        backdrop-filter: blur(12px);
    }

    .primary-action,
    .secondary-action,
    .danger-action {
        min-height: 36px;
        padding: 7px 10px;
    }
}

@media (max-width: 520px) {
    .table {
        min-height: 620px;
        padding: 14px 10px 12px;
        gap: 7px;
    }

    .title-block h1 {
        font-size: 22px;
    }

    .title-block span {
        font-size: 11px;
    }

    .player-seat {
        width: min(178px, 100%);
    }

    .seat-name {
        font-size: 13px;
    }

    .seat-status {
        max-width: 128px;
    }

    .community-row {
        min-height: 72px;
    }

    .message-board {
        min-height: 34px;
        font-size: 12px;
    }
}
</style>
