import { computed, onUnmounted, ref } from 'vue';

type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
type Phase = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'ended';

export interface PokerCard {
    suit: Suit;
    rank: string;
    value: number;
}

export interface PokerPlayer {
    id: number;
    name: string;
    chips: number;
    bet: number;
    hand: PokerCard[];
    folded: boolean;
    acted: boolean;
    isDealer: boolean;
    isSmallBlind: boolean;
    isBigBlind: boolean;
}

export interface HandEval {
    category: number;
    ranks: number[];
    label: string;
}

interface WinnerInfo {
    playerId: number;
    amount: number;
    hand: HandEval;
}

type TexasAIActionName = 'fold' | 'check' | 'call' | 'raise';

interface TexasAIActionResponse {
    ok?: boolean;
    action?: TexasAIActionName;
    amount?: number;
    source?: string;
    strength?: number;
}

const STARTING_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const NEXT_HAND_MIN_CHIPS = BIG_BLIND;
const BEST_ROUNDS_STORAGE_KEY = 'gamehall-texas-holdem-best-rounds';
const RANKS = [
    { rank: '2', value: 2 },
    { rank: '3', value: 3 },
    { rank: '4', value: 4 },
    { rank: '5', value: 5 },
    { rank: '6', value: 6 },
    { rank: '7', value: 7 },
    { rank: '8', value: 8 },
    { rank: '9', value: 9 },
    { rank: '10', value: 10 },
    { rank: 'J', value: 11 },
    { rank: 'Q', value: 12 },
    { rank: 'K', value: 13 },
    { rank: 'A', value: 14 },
];
const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

function createPlayers(): PokerPlayer[] {
    return [createPlayer(0, '你'), createPlayer(1, '电脑1'), createPlayer(2, '电脑2'), createPlayer(3, '电脑3')];
}

function createPlayer(id: number, name: string): PokerPlayer {
    return {
        id,
        name,
        chips: STARTING_CHIPS,
        bet: 0,
        hand: [],
        folded: false,
        acted: false,
        isDealer: false,
        isSmallBlind: false,
        isBigBlind: false,
    };
}

function createDeck(): PokerCard[] {
    const deck: PokerCard[] = [];
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

function rankLabel(value: number): string {
    return RANKS.find(r => r.value === value)?.rank || `${value}`;
}

function getCounts(cards: PokerCard[]): Map<number, number> {
    const counts = new Map<number, number>();
    for (const card of cards) {
        counts.set(card.value, (counts.get(card.value) || 0) + 1);
    }
    return counts;
}

function getStraightHigh(values: number[]): number {
    const unique = [...new Set(values)].sort((a, b) => b - a);
    if (unique.length !== 5) return 0;
    if (unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2) {
        return 5;
    }
    return unique[0] - unique[4] === 4 ? unique[0] : 0;
}

function evaluateFive(cards: PokerCard[]): HandEval {
    const values = cards.map(c => c.value).sort((a, b) => b - a);
    const flush = cards.every(card => card.suit === cards[0].suit);
    const straightHigh = getStraightHigh(values);
    const counts = [...getCounts(cards).entries()].sort((a, b) => {
        if (a[1] !== b[1]) return b[1] - a[1];
        return b[0] - a[0];
    });

    if (flush && straightHigh) {
        return { category: 9, ranks: [straightHigh], label: straightHigh === 14 ? '皇家同花顺' : '同花顺' };
    }

    if (counts[0][1] === 4) {
        const kicker = counts.find(([, count]) => count === 1)![0];
        return { category: 8, ranks: [counts[0][0], kicker], label: `四条 ${rankLabel(counts[0][0])}` };
    }

    if (counts[0][1] === 3 && counts[1]?.[1] === 2) {
        return {
            category: 7,
            ranks: [counts[0][0], counts[1][0]],
            label: `葫芦 ${rankLabel(counts[0][0])}满${rankLabel(counts[1][0])}`,
        };
    }

    if (flush) {
        return { category: 6, ranks: values, label: '同花' };
    }

    if (straightHigh) {
        return { category: 5, ranks: [straightHigh], label: `${rankLabel(straightHigh)}高顺子` };
    }

    if (counts[0][1] === 3) {
        const kickers = counts
            .filter(([, count]) => count === 1)
            .map(([value]) => value)
            .sort((a, b) => b - a);
        return { category: 4, ranks: [counts[0][0], ...kickers], label: `三条 ${rankLabel(counts[0][0])}` };
    }

    if (counts[0][1] === 2 && counts[1]?.[1] === 2) {
        const pairs = counts
            .filter(([, count]) => count === 2)
            .map(([value]) => value)
            .sort((a, b) => b - a);
        const kicker = counts.find(([, count]) => count === 1)![0];
        return { category: 3, ranks: [...pairs, kicker], label: `两对 ${rankLabel(pairs[0])}/${rankLabel(pairs[1])}` };
    }

    if (counts[0][1] === 2) {
        const kickers = counts
            .filter(([, count]) => count === 1)
            .map(([value]) => value)
            .sort((a, b) => b - a);
        return { category: 2, ranks: [counts[0][0], ...kickers], label: `一对 ${rankLabel(counts[0][0])}` };
    }

    return { category: 1, ranks: values, label: `${rankLabel(values[0])}高牌` };
}

function compareEval(a: HandEval, b: HandEval): number {
    if (a.category !== b.category) return a.category - b.category;
    const len = Math.max(a.ranks.length, b.ranks.length);
    for (let i = 0; i < len; i++) {
        const av = a.ranks[i] || 0;
        const bv = b.ranks[i] || 0;
        if (av !== bv) return av - bv;
    }
    return 0;
}

export function evaluateBestHand(cards: PokerCard[]): HandEval {
    let best: HandEval | null = null;

    for (let a = 0; a < cards.length - 4; a++) {
        for (let b = a + 1; b < cards.length - 3; b++) {
            for (let c = b + 1; c < cards.length - 2; c++) {
                for (let d = c + 1; d < cards.length - 1; d++) {
                    for (let e = d + 1; e < cards.length; e++) {
                        const current = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
                        if (!best || compareEval(current, best) > 0) best = current;
                    }
                }
            }
        }
    }

    return best || evaluateFive(cards.slice(0, 5));
}

function preflopStrength(hand: PokerCard[]): number {
    if (hand.length < 2) return 0;
    const [a, b] = [...hand].sort((x, y) => y.value - x.value);
    const pair = a.value === b.value;
    const suited = a.suit === b.suit;
    const gap = Math.abs(a.value - b.value);
    let score = (a.value + b.value) / 32;

    if (pair) score += 0.34 + a.value / 30;
    if (suited) score += 0.08;
    if (gap === 1) score += 0.07;
    else if (gap === 2) score += 0.03;
    if (a.value >= 12 && b.value >= 10) score += 0.12;
    if (a.value < 9 && b.value < 9 && !pair && gap > 2) score -= 0.12;

    return Math.max(0.05, Math.min(0.98, score));
}

function makeLog(text: string, logs: string[]) {
    logs.unshift(text);
    if (logs.length > 8) logs.pop();
}

function readBestRounds(): number {
    if (typeof window === 'undefined') return 0;
    const value = Number(window.localStorage.getItem(BEST_ROUNDS_STORAGE_KEY));
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function saveBestRounds(rounds: number) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(BEST_ROUNDS_STORAGE_KEY, String(rounds));
}

export function useTexasHoldem() {
    const players = ref<PokerPlayer[]>(createPlayers());
    const deck = ref<PokerCard[]>([]);
    const communityCards = ref<PokerCard[]>([]);
    const phase = ref<Phase>('idle');
    const pot = ref(0);
    const currentBet = ref(0);
    const minRaise = ref(BIG_BLIND);
    const dealerIndex = ref(0);
    const currentPlayer = ref(0);
    const message = ref('点击开始，坐上德州扑克牌桌');
    const actionLog = ref<string[]>([]);
    const winners = ref<WinnerInfo[]>([]);
    const survivedRounds = ref(0);
    const bestSurvivedRounds = ref(readBestRounds());
    const nextHandMinChips = ref(NEXT_HAND_MIN_CHIPS);

    let aiTimer: ReturnType<typeof setTimeout> | null = null;
    let handSeq = 0;
    let handSettled = false;

    const user = computed(() => players.value[0]);
    const callAmount = computed(() => getCallAmount(0));
    const canCheck = computed(() => callAmount.value === 0);
    const activePlayers = computed(() => players.value.filter(player => !player.folded));
    const remainingMoney = computed(() => user.value?.chips || 0);
    const canAffordNextHand = computed(() => remainingMoney.value >= nextHandMinChips.value);
    const phaseLabel = computed(() => {
        const labels: Record<Phase, string> = {
            idle: '等待开局',
            preflop: '翻牌前',
            flop: '翻牌圈',
            turn: '转牌圈',
            river: '河牌圈',
            showdown: '摊牌',
            ended: '牌局结束',
        };
        return labels[phase.value];
    });

    function resetPlayerForHand(player: PokerPlayer) {
        player.bet = 0;
        player.hand = [];
        player.folded = player.chips <= 0;
        player.acted = false;
        player.isDealer = false;
        player.isSmallBlind = false;
        player.isBigBlind = false;
    }

    function startGame() {
        clearAITimer();
        players.value = createPlayers();
        dealerIndex.value = 0;
        survivedRounds.value = 0;
        pot.value = 0;
        currentBet.value = 0;
        winners.value = [];
        actionLog.value = [];
        startHand(true);
    }

    function startNextHand() {
        if (!canAffordNextHand.value) {
            endSurvivalRun();
            return;
        }
        if (players.value.filter(player => player.chips > 0).length < 2) {
            phase.value = 'ended';
            const chipLeader = [...players.value].sort((a, b) => b.chips - a.chips)[0];
            message.value = `${chipLeader.name} 赢下整桌筹码`;
            return;
        }
        dealerIndex.value = nextSeatWithChips(dealerIndex.value);
        startHand(false);
    }

    function startHand(resetDealer: boolean) {
        clearAITimer();
        handSeq++;
        handSettled = false;
        deck.value = createDeck();
        shuffle(deck.value);
        communityCards.value = [];
        pot.value = 0;
        currentBet.value = 0;
        minRaise.value = BIG_BLIND;
        winners.value = [];
        actionLog.value = [];

        for (const player of players.value) resetPlayerForHand(player);
        if (resetDealer) dealerIndex.value = firstSeatWithChips(0);

        const dealer = players.value[dealerIndex.value];
        const smallBlind = players.value[nextSeatWithChips(dealerIndex.value)];
        const bigBlind = players.value[nextSeatWithChips(smallBlind.id)];

        dealer.isDealer = true;
        smallBlind.isSmallBlind = true;
        bigBlind.isBigBlind = true;

        for (let round = 0; round < 2; round++) {
            for (const player of players.value) {
                if (player.chips > 0) player.hand.push(deck.value.pop()!);
            }
        }

        postBlind(smallBlind, SMALL_BLIND);
        postBlind(bigBlind, BIG_BLIND);
        currentBet.value = Math.max(...players.value.map(player => player.bet));
        phase.value = 'preflop';
        currentPlayer.value = nextActionableSeat(bigBlind.id);
        message.value = `${smallBlind.name} 下小盲，${bigBlind.name} 下大盲`;
        makeLog(`新一手开始，按钮在 ${dealer.name}`, actionLog.value);

        if (currentPlayer.value !== 0) scheduleAI();
    }

    function postBlind(player: PokerPlayer, blind: number) {
        const amount = Math.min(blind, player.chips);
        player.chips -= amount;
        player.bet += amount;
        pot.value += amount;
        if (player.chips === 0) player.acted = true;
    }

    function getCallAmount(playerId: number): number {
        const player = players.value[playerId];
        return Math.max(0, currentBet.value - player.bet);
    }

    function commitChips(player: PokerPlayer, amount: number): number {
        const paid = Math.min(amount, player.chips);
        player.chips -= paid;
        player.bet += paid;
        pot.value += paid;
        return paid;
    }

    function playerFold() {
        if (!isUsersTurn()) return;
        foldPlayer(user.value);
        advanceAfterAction(0);
    }

    function playerCallOrCheck() {
        if (!isUsersTurn()) return;
        callOrCheck(user.value);
        advanceAfterAction(0);
    }

    function playerRaise(extra: number) {
        if (!isUsersTurn()) return;
        raisePlayer(user.value, extra);
        advanceAfterAction(0);
    }

    function isUsersTurn(): boolean {
        return (
            phase.value !== 'idle' &&
            phase.value !== 'showdown' &&
            phase.value !== 'ended' &&
            currentPlayer.value === 0 &&
            !user.value.folded
        );
    }

    function foldPlayer(player: PokerPlayer) {
        player.folded = true;
        player.acted = true;
        makeLog(`${player.name} 弃牌`, actionLog.value);
        message.value = `${player.name} 弃牌`;
    }

    function callOrCheck(player: PokerPlayer) {
        const amount = getCallAmount(player.id);
        if (amount === 0) {
            player.acted = true;
            makeLog(`${player.name} 过牌`, actionLog.value);
            message.value = `${player.name} 过牌`;
            return;
        }

        const paid = commitChips(player, amount);
        player.acted = true;
        makeLog(`${player.name} 跟注 ${paid}`, actionLog.value);
        message.value = `${player.name} 跟注`;
    }

    function raisePlayer(player: PokerPlayer, extra: number) {
        const raiseBy = Math.max(extra, minRaise.value);
        const totalNeeded = getCallAmount(player.id) + raiseBy;
        const paid = commitChips(player, totalNeeded);
        const previousBet = currentBet.value;
        currentBet.value = Math.max(currentBet.value, player.bet);
        minRaise.value = Math.max(BIG_BLIND, currentBet.value - previousBet);

        for (const other of players.value) {
            if (!other.folded && other.id !== player.id && other.chips > 0) other.acted = false;
        }
        player.acted = true;
        makeLog(`${player.name} 加注到 ${player.bet}`, actionLog.value);
        message.value = `${player.name} 加注 ${paid}`;
    }

    function advanceAfterAction(actorId: number) {
        if (awardIfOnlyOneLeft()) return;

        if (isBettingRoundComplete()) {
            advanceStreet();
            return;
        }

        currentPlayer.value = nextActionableSeat(actorId);
        if (currentPlayer.value !== 0) scheduleAI();
        else message.value = '轮到你行动';
    }

    function isBettingRoundComplete(): boolean {
        const waiting = players.value.filter(player => !player.folded && player.chips > 0);
        if (waiting.length <= 1) return true;
        return waiting.every(player => player.acted && player.bet === currentBet.value);
    }

    function awardIfOnlyOneLeft(): boolean {
        const remaining = players.value.filter(player => !player.folded);
        if (remaining.length !== 1) return false;

        const winner = remaining[0];
        winner.chips += pot.value;
        winners.value = [
            {
                playerId: winner.id,
                amount: pot.value,
                hand: { category: 0, ranks: [], label: '其他玩家弃牌' },
            },
        ];
        phase.value = 'showdown';
        message.value = `${winner.name} 赢得底池 ${pot.value}`;
        makeLog(`${winner.name} 拿下底池 ${pot.value}`, actionLog.value);
        pot.value = 0;
        clearAITimer();
        finishHand();
        return true;
    }

    function advanceStreet() {
        for (const player of players.value) {
            player.bet = 0;
            player.acted = false;
        }
        currentBet.value = 0;
        minRaise.value = BIG_BLIND;

        if (players.value.filter(player => !player.folded && player.chips > 0).length === 0) {
            while (communityCards.value.length < 5) dealCommunityCard();
            showdown();
            return;
        }

        if (communityCards.value.length === 0) {
            communityCards.value.push(deck.value.pop()!, deck.value.pop()!, deck.value.pop()!);
            phase.value = 'flop';
            makeLog('翻牌发出', actionLog.value);
        } else if (communityCards.value.length === 3) {
            dealCommunityCard();
            phase.value = 'turn';
            makeLog('转牌发出', actionLog.value);
        } else if (communityCards.value.length === 4) {
            dealCommunityCard();
            phase.value = 'river';
            makeLog('河牌发出', actionLog.value);
        } else {
            showdown();
            return;
        }

        currentPlayer.value = nextActionableSeat(dealerIndex.value);
        if (currentPlayer.value !== 0) {
            message.value = `${players.value[currentPlayer.value].name} 思考中`;
            scheduleAI();
        } else {
            message.value = '轮到你行动';
        }
    }

    function dealCommunityCard() {
        communityCards.value.push(deck.value.pop()!);
    }

    function showdown() {
        const contenders = players.value.filter(player => !player.folded);
        let best: HandEval | null = null;
        let winningPlayers: PokerPlayer[] = [];

        for (const player of contenders) {
            const hand = evaluateBestHand([...player.hand, ...communityCards.value]);
            if (!best || compareEval(hand, best) > 0) {
                best = hand;
                winningPlayers = [player];
            } else if (best && compareEval(hand, best) === 0) {
                winningPlayers.push(player);
            }
        }

        const share = Math.floor(pot.value / winningPlayers.length);
        let remainder = pot.value - share * winningPlayers.length;
        winners.value = winningPlayers.map(player => {
            const amount = share + (remainder-- > 0 ? 1 : 0);
            player.chips += amount;
            return { playerId: player.id, amount, hand: best! };
        });

        phase.value = 'showdown';
        message.value = `${winningPlayers.map(player => player.name).join('、')} 赢得底池`;
        makeLog(`${message.value}：${best?.label || ''}`, actionLog.value);
        pot.value = 0;
        clearAITimer();
        finishHand();
    }

    function finishHand() {
        if (handSettled) return;
        handSettled = true;
        survivedRounds.value++;

        if (survivedRounds.value > bestSurvivedRounds.value) {
            bestSurvivedRounds.value = survivedRounds.value;
            saveBestRounds(bestSurvivedRounds.value);
        }

        if (!canAffordNextHand.value) {
            endSurvivalRun();
        }
    }

    function endSurvivalRun() {
        clearAITimer();
        phase.value = 'ended';
        currentPlayer.value = 0;
        message.value = `资金不足，挑战结束：坚持 ${survivedRounds.value} 轮`;
        makeLog(`挑战结束，坚持 ${survivedRounds.value} 轮，最高 ${bestSurvivedRounds.value} 轮`, actionLog.value);
    }

    function scheduleAI() {
        clearAITimer();
        const scheduledSeq = handSeq;
        aiTimer = setTimeout(
            async () => {
                if (
                    scheduledSeq !== handSeq ||
                    phase.value === 'idle' ||
                    phase.value === 'showdown' ||
                    phase.value === 'ended'
                )
                    return;
                await runAIAction(players.value[currentPlayer.value], scheduledSeq);
            },
            650 + Math.random() * 700,
        );
    }

    async function runAIAction(player: PokerPlayer, scheduledSeq: number) {
        if (!player || player.id === 0 || player.folded) return;
        const remoteAction = await requestTexasAIAction(player);
        if (scheduledSeq !== handSeq || phase.value === 'idle' || phase.value === 'showdown' || phase.value === 'ended')
            return;

        if (remoteAction && applyTexasAIAction(player, remoteAction)) {
            advanceAfterAction(player.id);
            return;
        }

        runFallbackAIAction(player);
    }

    function runFallbackAIAction(player: PokerPlayer) {
        const strength = estimateStrength(player);
        const call = getCallAmount(player.id);
        const pressure = call / Math.max(1, pot.value + call);
        const canRaise = player.chips > call + minRaise.value;

        if (call > 0 && strength + Math.random() * 0.18 < pressure + 0.18) {
            foldPlayer(player);
            advanceAfterAction(player.id);
            return;
        }

        if (canRaise && (strength > 0.82 || (call === 0 && strength > 0.68 && Math.random() < 0.35))) {
            const extra = strength > 0.9 ? BIG_BLIND * 4 : BIG_BLIND * 2;
            raisePlayer(player, Math.min(extra, player.chips - call));
            advanceAfterAction(player.id);
            return;
        }

        callOrCheck(player);
        advanceAfterAction(player.id);
    }

    function getLegalActions(player: PokerPlayer): TexasAIActionName[] {
        const actions: TexasAIActionName[] = [];
        const call = getCallAmount(player.id);
        if (call > 0) {
            actions.push('fold', 'call');
        } else {
            actions.push('check');
        }
        if (player.chips > call + minRaise.value) {
            actions.push('raise');
        }
        return actions;
    }

    async function requestTexasAIAction(player: PokerPlayer): Promise<TexasAIActionResponse | null> {
        const payload = {
            player: player.id,
            phase: phase.value,
            hand: player.hand,
            communityCards: communityCards.value,
            pot: pot.value,
            currentBet: currentBet.value,
            callAmount: getCallAmount(player.id),
            minRaise: minRaise.value,
            chips: player.chips,
            opponentCount: players.value.filter(other => other.id !== player.id && !other.folded).length,
            legalActions: getLegalActions(player),
            players: players.value.map(other => ({
                id: other.id,
                chips: other.chips,
                bet: other.bet,
                folded: other.folded,
                acted: other.acted,
            })),
        };

        try {
            const response = await fetch('/api/texas-ai/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) return null;
            const result = await response.json();
            if (!result?.ok || typeof result.action !== 'string') return null;
            return result;
        } catch {
            return null;
        }
    }

    function applyTexasAIAction(player: PokerPlayer, result: TexasAIActionResponse): boolean {
        const legal = new Set(getLegalActions(player));
        const action = result.action;
        if (!action || !legal.has(action)) return false;

        if (action === 'fold') {
            foldPlayer(player);
            return true;
        }
        if (action === 'check' || action === 'call') {
            callOrCheck(player);
            return true;
        }
        if (action === 'raise') {
            const amount = Number.isFinite(result.amount) ? Number(result.amount) : minRaise.value;
            raisePlayer(player, Math.max(minRaise.value, Math.floor(amount)));
            return true;
        }
        return false;
    }

    function estimateStrength(player: PokerPlayer): number {
        if (communityCards.value.length < 3) return preflopStrength(player.hand);
        const hand = evaluateBestHand([...player.hand, ...communityCards.value]);
        return Math.min(0.98, hand.category / 9 + (hand.ranks[0] || 2) / 140);
    }

    function nextSeatWithChips(fromId: number): number {
        for (let i = 1; i <= players.value.length; i++) {
            const id = (fromId + i) % players.value.length;
            if (players.value[id].chips > 0) return id;
        }
        return fromId;
    }

    function firstSeatWithChips(fromId: number): number {
        for (let i = 0; i < players.value.length; i++) {
            const id = (fromId + i) % players.value.length;
            if (players.value[id].chips > 0) return id;
        }
        return fromId;
    }

    function nextActionableSeat(fromId: number): number {
        for (let i = 1; i <= players.value.length; i++) {
            const id = (fromId + i) % players.value.length;
            const player = players.value[id];
            if (!player.folded && player.chips > 0) return id;
        }
        return fromId;
    }

    function clearAITimer() {
        if (aiTimer !== null) {
            clearTimeout(aiTimer);
            aiTimer = null;
        }
    }

    function getBestHandForPlayer(playerId: number): HandEval | null {
        const player = players.value[playerId];
        if (!player || player.hand.length < 2 || communityCards.value.length < 3) return null;
        return evaluateBestHand([...player.hand, ...communityCards.value]);
    }

    function isWinner(playerId: number): boolean {
        return winners.value.some(winner => winner.playerId === playerId);
    }

    onUnmounted(clearAITimer);

    return {
        players,
        communityCards,
        phase,
        pot,
        currentBet,
        currentPlayer,
        message,
        actionLog,
        winners,
        survivedRounds,
        bestSurvivedRounds,
        remainingMoney,
        nextHandMinChips,
        canAffordNextHand,
        user,
        callAmount,
        canCheck,
        activePlayers,
        phaseLabel,
        startGame,
        startNextHand,
        playerFold,
        playerCallOrCheck,
        playerRaise,
        getCallAmount,
        getBestHandForPlayer,
        isWinner,
        clearAITimer,
    };
}
