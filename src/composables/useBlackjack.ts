import { computed, onUnmounted, ref } from 'vue';

type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
type Phase = 'idle' | 'player-turn' | 'dealer-turn' | 'round-over' | 'broke';
type RoundResult = 'win' | 'lose' | 'push' | 'blackjack' | null;

export interface BlackjackCard {
    suit: Suit;
    rank: string;
    value: number;
}

export interface HandScore {
    total: number;
    soft: boolean;
}

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS = [
    { rank: 'A', value: 11 },
    { rank: '2', value: 2 },
    { rank: '3', value: 3 },
    { rank: '4', value: 4 },
    { rank: '5', value: 5 },
    { rank: '6', value: 6 },
    { rank: '7', value: 7 },
    { rank: '8', value: 8 },
    { rank: '9', value: 9 },
    { rank: '10', value: 10 },
    { rank: 'J', value: 10 },
    { rank: 'Q', value: 10 },
    { rank: 'K', value: 10 },
];

const STARTING_BANKROLL = 1000;
const DEFAULT_BET = 50;
const MIN_BET = 10;
const MAX_BET = 250;
const BEST_BANKROLL_KEY = 'gamehall-blackjack-best-bankroll';

function createDeck(): BlackjackCard[] {
    const deck: BlackjackCard[] = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({ suit, rank: rank.rank, value: rank.value });
        }
    }
    return deck;
}

function shuffle<T>(arr: T[]) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function scoreHand(hand: BlackjackCard[]): HandScore {
    let total = hand.reduce((sum, card) => sum + card.value, 0);
    let aces = hand.filter(card => card.rank === 'A').length;

    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }

    return { total, soft: aces > 0 };
}

function isBlackjack(hand: BlackjackCard[]): boolean {
    return hand.length === 2 && scoreHand(hand).total === 21;
}

function readBestBankroll(): number {
    if (typeof window === 'undefined') return STARTING_BANKROLL;
    const saved = Number(window.localStorage.getItem(BEST_BANKROLL_KEY));
    return Number.isFinite(saved) ? Math.max(STARTING_BANKROLL, saved) : STARTING_BANKROLL;
}

function saveBestBankroll(value: number) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(BEST_BANKROLL_KEY, String(value));
}

export function useBlackjack() {
    const deck = ref<BlackjackCard[]>([]);
    const playerHand = ref<BlackjackCard[]>([]);
    const dealerHand = ref<BlackjackCard[]>([]);
    const phase = ref<Phase>('idle');
    const bankroll = ref(STARTING_BANKROLL);
    const currentBet = ref(DEFAULT_BET);
    const selectedBet = ref(DEFAULT_BET);
    const message = ref('选择筹码，点击发牌开始 21 点。');
    const roundResult = ref<RoundResult>(null);
    const wins = ref(0);
    const losses = ref(0);
    const pushes = ref(0);
    const blackjacks = ref(0);
    const streak = ref(0);
    const bestBankroll = ref(readBestBankroll());

    let dealerTimer: ReturnType<typeof setTimeout> | null = null;

    const playerScore = computed(() => scoreHand(playerHand.value));
    const dealerScore = computed(() => scoreHand(dealerHand.value));
    const visibleDealerScore = computed(() => {
        if (phase.value === 'player-turn' && dealerHand.value.length > 0) {
            return scoreHand([dealerHand.value[0]]);
        }
        return dealerScore.value;
    });
    const canDeal = computed(() => phase.value === 'idle' || phase.value === 'round-over');
    const canHit = computed(() => phase.value === 'player-turn');
    const canStand = computed(() => phase.value === 'player-turn');
    const canDouble = computed(
        () => phase.value === 'player-turn' && playerHand.value.length === 2 && bankroll.value >= currentBet.value,
    );
    const nextBet = computed(() => Math.min(selectedBet.value, bankroll.value));
    const phaseLabel = computed(() => {
        const labels: Record<Phase, string> = {
            idle: '等待开局',
            'player-turn': '玩家行动',
            'dealer-turn': '庄家行动',
            'round-over': '本局结算',
            broke: '筹码用尽',
        };
        return labels[phase.value];
    });
    const resultLabel = computed(() => {
        if (roundResult.value === 'blackjack') return 'Blackjack!';
        if (roundResult.value === 'win') return '你赢了';
        if (roundResult.value === 'lose') return '庄家赢';
        if (roundResult.value === 'push') return '平局';
        return '';
    });

    function ensureDeck() {
        if (deck.value.length < 18) {
            deck.value = createDeck();
            shuffle(deck.value);
        }
    }

    function drawCard(): BlackjackCard {
        ensureDeck();
        return deck.value.pop()!;
    }

    function updateBestBankroll() {
        if (bankroll.value > bestBankroll.value) {
            bestBankroll.value = bankroll.value;
            saveBestBankroll(bankroll.value);
        }
    }

    function setBet(amount: number) {
        selectedBet.value = Math.max(MIN_BET, Math.min(MAX_BET, Math.floor(amount)));
    }

    function addBet(delta: number) {
        setBet(selectedBet.value + delta);
    }

    function startSession() {
        clearDealerTimer();
        bankroll.value = STARTING_BANKROLL;
        selectedBet.value = DEFAULT_BET;
        currentBet.value = DEFAULT_BET;
        playerHand.value = [];
        dealerHand.value = [];
        wins.value = 0;
        losses.value = 0;
        pushes.value = 0;
        blackjacks.value = 0;
        streak.value = 0;
        roundResult.value = null;
        phase.value = 'idle';
        message.value = '新牌桌已准备好，选择筹码后发牌。';
        deck.value = createDeck();
        shuffle(deck.value);
    }

    function deal() {
        clearDealerTimer();
        if (bankroll.value < MIN_BET) {
            phase.value = 'broke';
            message.value = '筹码不足，重新开局再战。';
            return;
        }

        const wager = Math.min(selectedBet.value, bankroll.value);
        currentBet.value = wager;
        bankroll.value -= wager;
        playerHand.value = [drawCard(), drawCard()];
        dealerHand.value = [drawCard(), drawCard()];
        roundResult.value = null;
        phase.value = 'player-turn';

        const playerNatural = isBlackjack(playerHand.value);
        const dealerNatural = isBlackjack(dealerHand.value);

        if (playerNatural || dealerNatural) {
            settleNatural(playerNatural, dealerNatural);
            return;
        }

        message.value = '你的回合：要牌、停牌，或在前两张牌时双倍。';
    }

    function settleNatural(playerNatural: boolean, dealerNatural: boolean) {
        if (playerNatural && dealerNatural) {
            settle('push', currentBet.value, '双方都是 Blackjack，退回下注。');
            return;
        }

        if (playerNatural) {
            blackjacks.value++;
            const payout = currentBet.value + Math.floor(currentBet.value * 1.5);
            settle('blackjack', payout, `Blackjack！赢得 ${Math.floor(currentBet.value * 1.5)} 筹码。`);
            return;
        }

        settle('lose', 0, '庄家 Blackjack，本局失利。');
    }

    function hit() {
        if (!canHit.value) return;
        playerHand.value.push(drawCard());

        if (playerScore.value.total > 21) {
            settle('lose', 0, '爆牌了，本局庄家获胜。');
            return;
        }

        if (playerScore.value.total === 21) {
            stand();
            return;
        }

        message.value = `当前 ${scoreLabel(playerScore.value)}，还可以继续要牌。`;
    }

    function stand() {
        if (!canStand.value) return;
        phase.value = 'dealer-turn';
        message.value = '你停牌，庄家开始补牌。';
        runDealerTurn();
    }

    function doubleDown() {
        if (!canDouble.value) return;
        bankroll.value -= currentBet.value;
        currentBet.value *= 2;
        playerHand.value.push(drawCard());

        if (playerScore.value.total > 21) {
            settle('lose', 0, '双倍后爆牌，本局庄家获胜。');
            return;
        }

        phase.value = 'dealer-turn';
        message.value = `双倍下注到 ${currentBet.value}，庄家行动。`;
        runDealerTurn();
    }

    function runDealerTurn() {
        clearDealerTimer();
        dealerTimer = setTimeout(() => {
            const score = dealerScore.value;
            if (score.total < 17) {
                dealerHand.value.push(drawCard());
                message.value = `庄家要牌，当前 ${scoreLabel(dealerScore.value)}。`;
                runDealerTurn();
                return;
            }
            compareHands();
        }, 620);
    }

    function compareHands() {
        const dealer = dealerScore.value.total;
        const player = playerScore.value.total;

        if (dealer > 21) {
            settle('win', currentBet.value * 2, '庄家爆牌，你赢回本局。');
            return;
        }

        if (player > dealer) {
            settle('win', currentBet.value * 2, `你以 ${player} 点击败庄家 ${dealer} 点。`);
            return;
        }

        if (player < dealer) {
            settle('lose', 0, `庄家 ${dealer} 点大于你的 ${player} 点。`);
            return;
        }

        settle('push', currentBet.value, `${player} 点平局，退回下注。`);
    }

    function settle(result: Exclude<RoundResult, null>, payout: number, text: string) {
        clearDealerTimer();
        roundResult.value = result;
        bankroll.value += payout;
        updateBestBankroll();

        if (result === 'win' || result === 'blackjack') {
            wins.value++;
            streak.value = Math.max(1, streak.value + 1);
        } else if (result === 'lose') {
            losses.value++;
            streak.value = Math.min(-1, streak.value - 1);
        } else {
            pushes.value++;
            streak.value = 0;
        }

        if (bankroll.value < MIN_BET) {
            phase.value = 'broke';
            message.value = `${text} 筹码不足，挑战结束。`;
            return;
        }

        phase.value = 'round-over';
        message.value = text;
    }

    function scoreLabel(score: HandScore): string {
        return `${score.total}${score.soft ? ' 软点' : ' 点'}`;
    }

    function clearDealerTimer() {
        if (dealerTimer !== null) {
            clearTimeout(dealerTimer);
            dealerTimer = null;
        }
    }

    onUnmounted(clearDealerTimer);

    return {
        deck,
        playerHand,
        dealerHand,
        phase,
        bankroll,
        currentBet,
        selectedBet,
        message,
        roundResult,
        wins,
        losses,
        pushes,
        blackjacks,
        streak,
        bestBankroll,
        playerScore,
        dealerScore,
        visibleDealerScore,
        canDeal,
        canHit,
        canStand,
        canDouble,
        nextBet,
        phaseLabel,
        resultLabel,
        setBet,
        addBet,
        startSession,
        deal,
        hit,
        stand,
        doubleDown,
        scoreLabel,
    };
}
