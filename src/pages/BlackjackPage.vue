<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useBlackjack, type BlackjackCard } from '@/composables/useBlackjack';
import {
    ArrowLeft,
    Banknote,
    CircleDollarSign,
    Hand,
    Minus,
    Plus,
    RotateCcw,
    Shield,
    Sparkles,
    Trophy,
} from 'lucide-vue-next';

const router = useRouter();
const game = useBlackjack();

const betSteps = [10, 25, 50, 100, 250];
const revealDealer = computed(() => game.phase.value !== 'player-turn');

function suitLabel(suit: BlackjackCard['suit']): string {
    const labels: Record<BlackjackCard['suit'], string> = {
        spades: '♠',
        hearts: '♥',
        diamonds: '♦',
        clubs: '♣',
    };
    return labels[suit];
}

function isRed(card: BlackjackCard): boolean {
    return card.suit === 'hearts' || card.suit === 'diamonds';
}

function cardKey(card: BlackjackCard, index: number): string {
    return `${card.suit}-${card.rank}-${index}`;
}

function streakText(): string {
    if (game.streak.value > 0) return `${game.streak.value} 连胜`;
    if (game.streak.value < 0) return `${Math.abs(game.streak.value)} 连败`;
    return '等待突破';
}
</script>

<template>
    <div class="blackjack-page min-h-screen select-none overflow-hidden text-slate-100">
        <header class="page-header">
            <button class="nav-button" @click="router.push('/')">
                <ArrowLeft class="h-4 w-4" />
                返回
            </button>

            <div class="title-block">
                <h1>黑杰克 / 21点</h1>
                <span>Blackjack</span>
            </div>

            <button class="nav-button ghost" @click="game.startSession()">
                <RotateCcw class="h-4 w-4" />
                重开
            </button>
        </header>

        <main class="table-wrap">
            <section class="blackjack-table">
                <div class="table-felt">
                    <div class="dealer-zone hand-zone">
                        <div class="zone-head">
                            <span class="zone-label">
                                <Shield class="h-4 w-4" />
                                庄家
                            </span>
                            <strong>{{
                                game.dealerHand.value.length ? game.scoreLabel(game.visibleDealerScore.value) : '--'
                            }}</strong>
                        </div>

                        <div class="card-row dealer-row">
                            <div
                                v-for="(card, index) in game.dealerHand.value"
                                :key="cardKey(card, index)"
                                class="playing-card"
                                :class="{ red: isRed(card), back: index === 1 && !revealDealer }"
                                :style="{ '--deal-delay': `${index * 80}ms` }"
                            >
                                <template v-if="index !== 1 || revealDealer">
                                    <span class="rank">{{ card.rank }}</span>
                                    <span class="suit">{{ suitLabel(card.suit) }}</span>
                                </template>
                            </div>
                            <div v-if="game.dealerHand.value.length === 0" class="empty-hand">等待发牌</div>
                        </div>
                    </div>

                    <div class="table-center">
                        <div class="bet-medallion">
                            <CircleDollarSign class="h-5 w-5 text-amber-200" />
                            <span>本局下注</span>
                            <strong>{{ game.currentBet.value }}</strong>
                        </div>
                        <div class="phase-pill">{{ game.phaseLabel.value }}</div>
                        <div
                            class="message-board"
                            :class="{
                                win: game.roundResult.value === 'win' || game.roundResult.value === 'blackjack',
                                lose: game.roundResult.value === 'lose',
                            }"
                        >
                            <Sparkles class="h-4 w-4 text-amber-200" />
                            <span>{{ game.message.value }}</span>
                        </div>
                    </div>

                    <div class="player-zone hand-zone">
                        <div class="zone-head">
                            <span class="zone-label">
                                <Hand class="h-4 w-4" />
                                你的手牌
                            </span>
                            <strong>{{
                                game.playerHand.value.length ? game.scoreLabel(game.playerScore.value) : '--'
                            }}</strong>
                        </div>

                        <div class="card-row player-row">
                            <div
                                v-for="(card, index) in game.playerHand.value"
                                :key="cardKey(card, index)"
                                class="playing-card"
                                :class="{ red: isRed(card) }"
                                :style="{ '--deal-delay': `${index * 75}ms` }"
                            >
                                <span class="rank">{{ card.rank }}</span>
                                <span class="suit">{{ suitLabel(card.suit) }}</span>
                            </div>
                            <div v-if="game.playerHand.value.length === 0" class="empty-hand">先下注，再开牌</div>
                        </div>
                    </div>

                    <div v-if="game.resultLabel.value" class="result-ribbon" :class="game.roundResult.value">
                        {{ game.resultLabel.value }}
                    </div>
                </div>
            </section>
        </main>

        <aside class="info-strip">
            <div class="info-item">
                <Banknote class="h-4 w-4 text-emerald-200" />
                <span>筹码</span>
                <strong>{{ game.bankroll.value }}</strong>
            </div>
            <div class="info-item">
                <Trophy class="h-4 w-4 text-amber-200" />
                <span>最佳</span>
                <strong>{{ game.bestBankroll.value }}</strong>
            </div>
            <div class="info-item">
                <Sparkles class="h-4 w-4 text-sky-200" />
                <span>Blackjack</span>
                <strong>{{ game.blackjacks.value }}</strong>
            </div>
            <div class="info-item">
                <span>胜 / 负 / 平</span>
                <strong>{{ game.wins.value }} / {{ game.losses.value }} / {{ game.pushes.value }}</strong>
            </div>
            <div class="info-item">
                <span>走势</span>
                <strong>{{ streakText() }}</strong>
            </div>
        </aside>

        <footer class="control-dock">
            <div class="bet-panel" :class="{ locked: !game.canDeal.value }">
                <button class="icon-button" :disabled="!game.canDeal.value" @click="game.addBet(-10)">
                    <Minus class="h-4 w-4" />
                </button>
                <div class="bet-display">
                    <span>下注</span>
                    <strong>{{ game.nextBet.value }}</strong>
                </div>
                <button class="icon-button" :disabled="!game.canDeal.value" @click="game.addBet(10)">
                    <Plus class="h-4 w-4" />
                </button>
                <button
                    v-for="step in betSteps"
                    :key="step"
                    class="chip-button"
                    :class="{ selected: game.selectedBet.value === step }"
                    :disabled="!game.canDeal.value"
                    @click="game.setBet(step)"
                >
                    {{ step }}
                </button>
            </div>

            <div class="action-panel">
                <button v-if="game.phase.value === 'broke'" class="primary-action wide" @click="game.startSession()">
                    <RotateCcw class="h-4 w-4" />
                    重新开局
                </button>
                <button
                    v-else-if="game.canDeal.value"
                    class="primary-action wide"
                    :disabled="game.bankroll.value < 10"
                    @click="game.deal()"
                >
                    发牌
                </button>
                <template v-else>
                    <button class="secondary-action" :disabled="!game.canHit.value" @click="game.hit()">要牌</button>
                    <button class="secondary-action" :disabled="!game.canStand.value" @click="game.stand()">
                        停牌
                    </button>
                    <button class="primary-action" :disabled="!game.canDouble.value" @click="game.doubleDown()">
                        双倍
                    </button>
                </template>
            </div>
        </footer>
    </div>
</template>

<style scoped>
.blackjack-page {
    min-height: 100dvh;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    background:
        linear-gradient(90deg, rgba(255, 255, 255, 0.034) 1px, transparent 1px),
        linear-gradient(0deg, rgba(255, 255, 255, 0.026) 1px, transparent 1px),
        linear-gradient(145deg, #18262d 0%, #0e4138 46%, #181b20 100%);
    background-size:
        32px 32px,
        32px 32px,
        auto;
}

.page-header {
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
.chip-button,
.icon-button {
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 850;
    transition:
        transform 160ms ease,
        filter 160ms ease,
        border-color 160ms ease,
        background 160ms ease;
}

.nav-button {
    padding: 8px 12px;
    color: #e2f7ec;
    border: 1px solid rgba(209, 250, 229, 0.18);
    background: rgba(8, 31, 33, 0.58);
}

.title-block {
    text-align: center;
    line-height: 1.05;
}

.title-block h1 {
    margin: 0;
    color: #fff8e5;
    font-size: clamp(24px, 4vw, 38px);
    font-weight: 950;
    letter-spacing: 0;
    text-shadow: 0 14px 28px rgba(0, 0, 0, 0.28);
}

.title-block span {
    display: block;
    margin-top: 4px;
    color: rgba(220, 252, 231, 0.62);
    font-size: 12px;
}

.table-wrap {
    min-height: 0;
    width: min(1100px, 100%);
    margin: 0 auto;
    padding: 5px 14px 8px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.blackjack-table {
    width: min(100%, 980px);
}

.table-felt {
    position: relative;
    min-height: clamp(520px, calc(100dvh - 172px), 630px);
    display: grid;
    grid-template-rows: minmax(132px, auto) 1fr minmax(156px, auto);
    gap: 8px;
    padding: 28px 34px;
    overflow: hidden;
    border-radius: 42px;
    border: 12px solid #6b3f26;
    background:
        radial-gradient(ellipse at 50% 48%, rgba(250, 250, 210, 0.09), transparent 34%),
        linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
        linear-gradient(0deg, rgba(255, 255, 255, 0.032) 1px, transparent 1px),
        linear-gradient(145deg, #0a6a50 0%, #084739 58%, #062f29 100%);
    background-size:
        auto,
        28px 28px,
        28px 28px,
        auto;
    box-shadow:
        inset 0 0 0 2px rgba(255, 224, 178, 0.2),
        inset 0 24px 60px rgba(255, 255, 255, 0.04),
        0 24px 70px rgba(0, 0, 0, 0.38);
}

.table-felt::before {
    content: '';
    position: absolute;
    inset: 24px;
    border-radius: 32px;
    border: 2px solid rgba(255, 235, 193, 0.2);
    pointer-events: none;
}

.hand-zone,
.table-center {
    position: relative;
    z-index: 1;
}

.hand-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 9px;
}

.zone-head {
    min-width: 180px;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 7px 11px;
    border-radius: 8px;
    border: 1px solid rgba(209, 250, 229, 0.17);
    background: rgba(4, 32, 28, 0.56);
    color: rgba(236, 253, 245, 0.82);
}

.zone-label {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
}

.zone-head strong {
    color: #fde68a;
    font-size: 15px;
}

.card-row {
    min-height: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    flex-wrap: wrap;
}

.playing-card {
    position: relative;
    width: 68px;
    height: 96px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 8px 0 0 8px;
    border-radius: 8px;
    color: #111827;
    background: linear-gradient(145deg, #ffffff, #e7edf4);
    border: 1px solid rgba(15, 23, 42, 0.24);
    box-shadow: 0 14px 26px rgba(0, 0, 0, 0.22);
    font-weight: 950;
    line-height: 1;
    animation: deal-in 360ms cubic-bezier(0.18, 0.9, 0.24, 1.12) both;
    animation-delay: var(--deal-delay, 0ms);
}

.playing-card .rank {
    font-size: 19px;
}

.playing-card .suit {
    margin-top: 7px;
    font-family: Georgia, serif;
    font-size: 28px;
}

.playing-card.red {
    color: #dc2626;
}

.playing-card.back {
    background:
        linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.18) 0 10%,
            transparent 10% 20%,
            rgba(255, 255, 255, 0.13) 20% 30%,
            transparent 30%
        ),
        linear-gradient(145deg, #b63b32, #611c1a);
    border-color: rgba(255, 230, 190, 0.34);
}

.empty-hand {
    min-width: 150px;
    min-height: 72px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    border: 1px dashed rgba(209, 250, 229, 0.2);
    color: rgba(220, 252, 231, 0.55);
    font-size: 13px;
    font-weight: 800;
}

.table-center {
    align-self: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}

.bet-medallion,
.phase-pill,
.message-board {
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

.bet-medallion {
    min-width: 150px;
    padding: 9px 13px;
    font-size: 13px;
}

.bet-medallion strong {
    color: #fde68a;
    font-size: 20px;
}

.phase-pill {
    padding: 5px 10px;
    color: #a7f3d0;
    font-size: 12px;
    font-weight: 900;
}

.message-board {
    width: min(430px, 92vw);
    min-height: 36px;
    padding: 8px 12px;
    text-align: center;
    font-size: 13px;
    font-weight: 850;
}

.message-board.win {
    border-color: rgba(134, 239, 172, 0.45);
    color: #dcfce7;
}

.message-board.lose {
    border-color: rgba(252, 165, 165, 0.34);
    color: #fee2e2;
}

.result-ribbon {
    position: absolute;
    z-index: 2;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-4deg);
    padding: 9px 18px;
    border-radius: 8px;
    border: 1px solid rgba(254, 240, 138, 0.5);
    background: rgba(67, 20, 7, 0.86);
    color: #fef3c7;
    font-size: clamp(20px, 4vw, 34px);
    font-weight: 950;
    box-shadow: 0 20px 44px rgba(0, 0, 0, 0.28);
}

.result-ribbon.win,
.result-ribbon.blackjack {
    border-color: rgba(134, 239, 172, 0.6);
    background: rgba(5, 46, 22, 0.9);
    color: #bbf7d0;
}

.result-ribbon.lose {
    border-color: rgba(252, 165, 165, 0.42);
    background: rgba(69, 10, 10, 0.9);
    color: #fecaca;
}

.info-strip {
    width: min(1100px, 100%);
    margin: 0 auto;
    padding: 2px 14px 0;
    display: grid;
    grid-template-columns: repeat(5, minmax(116px, 1fr));
    gap: 8px;
    align-items: center;
}

.info-item {
    min-height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 8px;
    border: 1px solid rgba(209, 250, 229, 0.13);
    background: rgba(5, 24, 28, 0.52);
    color: rgba(226, 232, 240, 0.7);
    padding: 7px 10px;
    font-size: 12px;
}

.info-item strong {
    color: #f8fafc;
    font-size: 13px;
    white-space: nowrap;
}

.control-dock {
    min-height: 68px;
    padding: 7px 14px 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
}

.bet-panel,
.action-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    flex-wrap: wrap;
}

.bet-panel.locked {
    opacity: 0.62;
}

.bet-display {
    min-width: 82px;
    min-height: 38px;
    display: grid;
    place-items: center;
    gap: 0;
    border-radius: 8px;
    border: 1px solid rgba(253, 230, 138, 0.24);
    background: rgba(120, 53, 15, 0.48);
}

.bet-display span {
    color: rgba(254, 243, 199, 0.72);
    font-size: 10px;
    line-height: 1;
}

.bet-display strong {
    color: #fde68a;
    font-size: 15px;
    line-height: 1;
}

.icon-button,
.chip-button {
    color: #fef3c7;
    border: 1px solid rgba(253, 230, 138, 0.28);
    background: rgba(133, 77, 14, 0.62);
}

.icon-button {
    width: 38px;
    padding: 0;
}

.chip-button {
    min-width: 46px;
    padding: 7px 10px;
}

.chip-button.selected {
    color: #451a03;
    background: #fbbf24;
    border-color: rgba(254, 243, 199, 0.72);
}

.primary-action {
    color: #062e1c;
    background: linear-gradient(145deg, #bbf7d0, #34d399);
    border: 1px solid rgba(187, 247, 208, 0.72);
    box-shadow: 0 12px 24px rgba(16, 185, 129, 0.2);
    padding: 8px 16px;
}

.secondary-action {
    color: #eafff5;
    background: rgba(7, 89, 72, 0.68);
    border: 1px solid rgba(167, 243, 208, 0.28);
    padding: 8px 16px;
}

.primary-action.wide {
    min-width: 148px;
}

.primary-action:hover,
.secondary-action:hover,
.nav-button:hover,
.chip-button:hover,
.icon-button:hover {
    filter: brightness(1.06);
    transform: translateY(-1px);
}

button:disabled {
    cursor: not-allowed;
    opacity: 0.42;
    transform: none;
}

@keyframes deal-in {
    0% {
        opacity: 0;
        transform: translateY(-22px) rotate(-4deg) scale(0.8);
    }
    100% {
        opacity: 1;
        transform: translateY(0) rotate(0deg) scale(1);
    }
}

@media (max-width: 760px) {
    .blackjack-page {
        grid-template-rows: auto auto auto auto;
    }

    .page-header {
        grid-template-columns: 70px 1fr 70px;
        padding: 10px 10px 4px;
    }

    .nav-button {
        min-height: 32px;
        padding: 6px 8px;
        font-size: 12px;
    }

    .title-block h1 {
        font-size: 22px;
    }

    .table-wrap {
        padding: 5px 8px;
    }

    .table-felt {
        min-height: 520px;
        padding: 18px 12px;
        border-width: 8px;
        border-radius: 24px;
    }

    .playing-card {
        width: 54px;
        height: 76px;
    }

    .playing-card .rank {
        font-size: 16px;
    }

    .playing-card .suit {
        font-size: 22px;
    }

    .info-strip {
        grid-template-columns: 1fr 1fr;
        padding: 2px 8px 0;
    }

    .control-dock {
        position: sticky;
        bottom: 0;
        min-height: 74px;
        background: rgba(12, 24, 28, 0.92);
        backdrop-filter: blur(12px);
    }

    .chip-button {
        min-width: 42px;
    }
}

@media (max-width: 460px) {
    .page-header {
        grid-template-columns: 58px 1fr 58px;
    }

    .nav-button {
        gap: 4px;
        padding: 6px;
    }

    .title-block h1 {
        font-size: 19px;
    }

    .title-block span {
        font-size: 11px;
    }

    .card-row {
        gap: 6px;
    }

    .message-board {
        font-size: 12px;
    }

    .info-strip {
        grid-template-columns: 1fr;
    }
}
</style>
