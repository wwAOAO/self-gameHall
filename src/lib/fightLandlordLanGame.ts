export type FightPlayerId = 0 | 1 | 2;
export type FightPhase = 'lobby' | 'bidding' | 'playing' | 'ended';
export type FightBidValue = 0 | 1 | 2 | 3;

export interface FightCard {
    id: string;
    suit: string;
    rank: string;
    value: number;
}

export type FightHandType =
    | 'single'
    | 'pair'
    | 'triple'
    | 'triple1'
    | 'triple2'
    | 'straight'
    | 'pair_straight'
    | 'airplane'
    | 'airplane1'
    | 'airplane2'
    | 'bomb'
    | 'rocket'
    | 'four2'
    | 'four22';

export interface FightPlayedHand {
    type: FightHandType;
    cards: FightCard[];
    primaryValue: number;
    length: number;
}

export interface FightPlayerState {
    name: string;
    hand: FightCard[];
}

export interface FightRoundHistoryItem {
    player: FightPlayerId;
    cards: FightCard[];
    label: string;
}

export interface FightSnapshot {
    players: [FightPlayerState, FightPlayerState, FightPlayerState];
    landlordCards: FightCard[];
    landlord: FightPlayerId | -1;
    currentPlayer: FightPlayerId;
    bidder: FightPlayerId;
    currentBid: FightBidValue;
    highestBidder: FightPlayerId | -1;
    bidTurns: number;
    lastPlay: { player: FightPlayerId; hand: FightPlayedHand } | null;
    lastPlayPlayer: FightPlayerId | -1;
    passCount: number;
    playSeq: number;
    baseScore: number;
    multiplier: number;
    bombCount: number;
    springType: 'none' | 'spring' | 'antiSpring';
    coins: [number, number, number];
    roundNo: number;
    phase: FightPhase;
    winner: FightPlayerId | null;
    message: string;
    roundHistory: FightRoundHistoryItem[];
    playCounts: [number, number, number];
}

export type FightAction =
    | { type: 'start' }
    | { type: 'restart' }
    | { type: 'bid'; player: FightPlayerId; bid: FightBidValue | 'pass' }
    | { type: 'play'; player: FightPlayerId; cardIds: string[] }
    | { type: 'pass'; player: FightPlayerId };

export const FIGHT_PLAYER_COUNT = 3;
export const FIGHT_PLAYER_NAMES = ['房主', '玩家2', '玩家3'] as const;

const SUITS = ['♠', '♥', '♣', '♦'];
const RANK_NAMES = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const HAND_ORDER: FightHandType[] = [
    'single',
    'pair',
    'triple',
    'triple1',
    'triple2',
    'straight',
    'pair_straight',
    'airplane',
    'airplane1',
    'airplane2',
    'four2',
    'four22',
    'bomb',
    'rocket',
];

function shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function createDeck(): FightCard[] {
    const cards: FightCard[] = [];
    let id = 0;
    for (const suit of SUITS) {
        for (let value = 3; value <= 15; value++) {
            cards.push({ id: `${suit}-${value}-${id++}`, suit, rank: RANK_NAMES[value - 3], value });
        }
    }
    cards.push({ id: `joker-small-${id++}`, suit: 'Joker', rank: '小王', value: 16 });
    cards.push({ id: `joker-big-${id++}`, suit: 'Joker', rank: '大王', value: 17 });
    return shuffle(cards);
}

export function sortFightCards(a: FightCard, b: FightCard) {
    if (a.value !== b.value) return a.value - b.value;
    return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
}

function createPlayers(): [FightPlayerState, FightPlayerState, FightPlayerState] {
    return FIGHT_PLAYER_NAMES.map(name => ({ name, hand: [] })) as [
        FightPlayerState,
        FightPlayerState,
        FightPlayerState,
    ];
}

function cloneState(state: FightSnapshot): FightSnapshot {
    return JSON.parse(JSON.stringify(state));
}

function nextPlayer(player: FightPlayerId): FightPlayerId {
    return ((player + 1) % FIGHT_PLAYER_COUNT) as FightPlayerId;
}

function getValueCounts(cards: FightCard[]): Map<number, number> {
    const counts = new Map<number, number>();
    for (const card of cards) counts.set(card.value, (counts.get(card.value) || 0) + 1);
    return counts;
}

function groupCardsByValue(cards: FightCard[]): Map<number, FightCard[]> {
    const groups = new Map<number, FightCard[]>();
    for (const card of [...cards].sort(sortFightCards)) {
        if (!groups.has(card.value)) groups.set(card.value, []);
        groups.get(card.value)!.push(card);
    }
    return groups;
}

function withoutCards(hand: FightCard[], played: FightCard[]): FightCard[] {
    const playedIds = new Set(played.map(card => card.id));
    return hand.filter(card => !playedIds.has(card.id));
}

function findConsecutiveGroups(values: number[], minLength: number): number[][] {
    if (values.length < minLength) return [];
    const groups: number[][] = [];
    let current = [values[0]];
    for (let i = 1; i < values.length; i++) {
        if (values[i] === values[i - 1] + 1) current.push(values[i]);
        else {
            if (current.length >= minLength) groups.push(current);
            current = [values[i]];
        }
    }
    if (current.length >= minLength) groups.push(current);
    return groups;
}

function chooseLowestSingles(cards: FightCard[], count: number): FightCard[] | null {
    const singles = [...cards].sort(sortFightCards);
    return singles.length >= count ? singles.slice(0, count) : null;
}

function chooseLowestPairs(cards: FightCard[], count: number): FightCard[] | null {
    const pairs: FightCard[] = [];
    for (const [value, group] of groupCardsByValue(cards)) {
        if (value >= 16 || group.length < 2) continue;
        pairs.push(group[0], group[1]);
        if (pairs.length === count * 2) return pairs;
    }
    return null;
}

export function classifyFightHand(cards: FightCard[]): FightPlayedHand | null {
    const n = cards.length;
    if (n === 0) return null;

    const sorted = [...cards].sort(sortFightCards);
    const values = sorted.map(card => card.value);
    const entries = [...getValueCounts(cards).entries()].sort((a, b) => a[0] - b[0]);
    const counts = entries.map(([, count]) => count);
    const uniqueValues = entries.map(([value]) => value);

    if (n === 2 && values[0] === 16 && values[1] === 17) {
        return { type: 'rocket', cards: sorted, primaryValue: 17, length: 2 };
    }
    if (n === 1) return { type: 'single', cards: sorted, primaryValue: values[0], length: 1 };
    if (n === 2 && values[0] === values[1] && values[0] < 16) {
        return { type: 'pair', cards: sorted, primaryValue: values[0], length: 2 };
    }
    if (n === 3 && uniqueValues.length === 1 && counts[0] === 3) {
        return { type: 'triple', cards: sorted, primaryValue: values[0], length: 3 };
    }
    if (n === 4 && uniqueValues.length === 1 && counts[0] === 4) {
        return { type: 'bomb', cards: sorted, primaryValue: values[0], length: 4 };
    }
    if (n === 4) {
        const triple = entries.find(([, count]) => count === 3);
        if (triple) return { type: 'triple1', cards: sorted, primaryValue: triple[0], length: 3 };
    }
    if (n === 5) {
        const triple = entries.find(([, count]) => count === 3);
        const pair = entries.find(([, count]) => count === 2);
        if (triple && pair) return { type: 'triple2', cards: sorted, primaryValue: triple[0], length: 3 };
    }
    if (n >= 5 && counts.every(count => count === 1)) {
        const min = uniqueValues[0];
        const max = uniqueValues[uniqueValues.length - 1];
        if (max <= 14 && min >= 3 && max - min === n - 1) {
            return { type: 'straight', cards: sorted, primaryValue: max, length: n };
        }
    }
    if (n >= 6 && n % 2 === 0 && counts.every(count => count === 2)) {
        const min = uniqueValues[0];
        const max = uniqueValues[uniqueValues.length - 1];
        if (uniqueValues.length >= 3 && max <= 14 && min >= 3 && max - min === uniqueValues.length - 1) {
            return { type: 'pair_straight', cards: sorted, primaryValue: max, length: n };
        }
    }
    if (n === 6) {
        const four = entries.find(([, count]) => count === 4);
        if (four) return { type: 'four2', cards: sorted, primaryValue: four[0], length: 4 };
    }
    if (n === 8) {
        const four = entries.find(([, count]) => count === 4);
        const pairs = entries.filter(([value, count]) => value !== four?.[0] && count === 2);
        if (four && pairs.length === 2) return { type: 'four22', cards: sorted, primaryValue: four[0], length: 4 };
    }

    return classifyAirplane(cards, entries, n);
}

function classifyAirplane(cards: FightCard[], entries: [number, number][], n: number): FightPlayedHand | null {
    const triples = entries
        .filter(([value, count]) => count >= 3 && value <= 14)
        .map(([value]) => value)
        .sort((a, b) => a - b);
    if (triples.length < 2) return null;

    const groups = findConsecutiveGroups(triples, 2).flatMap(group => {
        const slices: number[][] = [];
        for (let length = group.length; length >= 2; length--) {
            for (let start = 0; start <= group.length - length; start++) slices.push(group.slice(start, start + length));
        }
        return slices;
    });

    for (const group of groups) {
        const tripleCount = group.length;
        if (n !== tripleCount * 3 && n !== tripleCount * 4 && n !== tripleCount * 5) continue;

        const groupSet = new Set(group);
        const tripleCards: FightCard[] = [];
        for (const value of group) tripleCards.push(...cards.filter(card => card.value === value).slice(0, 3));
        if (tripleCards.length !== tripleCount * 3) continue;

        const remaining = withoutCards(cards, tripleCards).sort(sortFightCards);
        if (remaining.some(card => groupSet.has(card.value))) continue;

        if (remaining.length === 0) {
            return { type: 'airplane', cards: tripleCards.sort(sortFightCards), primaryValue: group[group.length - 1], length: tripleCount * 3 };
        }
        if (remaining.length === tripleCount) {
            return { type: 'airplane1', cards: [...remaining, ...tripleCards].sort(sortFightCards), primaryValue: group[group.length - 1], length: tripleCount * 4 };
        }
        if (remaining.length === tripleCount * 2) {
            const restCounts = getValueCounts(remaining);
            if ([...restCounts.values()].every(count => count === 2) && restCounts.size === tripleCount) {
                return { type: 'airplane2', cards: [...remaining, ...tripleCards].sort(sortFightCards), primaryValue: group[group.length - 1], length: tripleCount * 5 };
            }
        }
    }
    return null;
}

export function canFightHandBeat(hand: FightPlayedHand, lastPlay: FightPlayedHand): boolean {
    if (lastPlay.type === 'rocket') return false;
    if (hand.type === 'rocket') return true;
    if (hand.type === 'bomb' && lastPlay.type !== 'bomb') return true;
    if (hand.type === 'bomb' && lastPlay.type === 'bomb') return hand.primaryValue > lastPlay.primaryValue;
    return hand.type === lastPlay.type && hand.length === lastPlay.length && hand.primaryValue > lastPlay.primaryValue;
}

function getPlayKey(play: FightPlayedHand): string {
    const values = play.cards.map(card => card.value).sort((a, b) => a - b).join(',');
    return `${play.type}:${play.primaryValue}:${play.length}:${values}`;
}

function pushPlay(plays: FightPlayedHand[], seen: Set<string>, cards: FightCard[]) {
    const play = classifyFightHand(cards);
    if (!play) return;
    const key = getPlayKey(play);
    if (seen.has(key)) return;
    seen.add(key);
    plays.push(play);
}

function comparePlays(a: FightPlayedHand, b: FightPlayedHand): number {
    const typeDelta = HAND_ORDER.indexOf(a.type) - HAND_ORDER.indexOf(b.type);
    if (typeDelta !== 0) return typeDelta;
    if (a.primaryValue !== b.primaryValue) return a.primaryValue - b.primaryValue;
    return a.cards.length - b.cards.length;
}

export function findFightPlays(cards: FightCard[]): FightPlayedHand[] {
    const sorted = [...cards].sort(sortFightCards);
    const plays: FightPlayedHand[] = [];
    const seen = new Set<string>();
    const groups = [...groupCardsByValue(sorted).entries()].sort((a, b) => a[0] - b[0]);

    for (const card of sorted) pushPlay(plays, seen, [card]);
    const smallJoker = sorted.find(card => card.value === 16);
    const bigJoker = sorted.find(card => card.value === 17);
    if (smallJoker && bigJoker) pushPlay(plays, seen, [smallJoker, bigJoker]);

    for (const [value, group] of groups) {
        if (group.length >= 2 && value < 16) pushPlay(plays, seen, group.slice(0, 2));
        if (group.length >= 3) pushPlay(plays, seen, group.slice(0, 3));
        if (group.length === 4) pushPlay(plays, seen, group);
    }
    for (const [value, group] of groups) {
        if (group.length >= 3) {
            const triple = group.slice(0, 3);
            for (const kicker of sorted.filter(card => card.value !== value)) pushPlay(plays, seen, [...triple, kicker]);
            for (const [pairValue, pairGroup] of groups) {
                if (pairValue !== value && pairValue < 16 && pairGroup.length >= 2) {
                    pushPlay(plays, seen, [...triple, ...pairGroup.slice(0, 2)]);
                }
            }
        }
        if (group.length === 4) {
            const kickers = sorted.filter(card => card.value !== value);
            for (let i = 0; i < kickers.length - 1; i++) {
                for (let j = i + 1; j < kickers.length; j++) pushPlay(plays, seen, [...group, kickers[i], kickers[j]]);
            }
            const pairGroups = groups.filter(([pairValue, pairGroup]) => pairValue !== value && pairValue < 16 && pairGroup.length >= 2);
            for (let i = 0; i < pairGroups.length - 1; i++) {
                for (let j = i + 1; j < pairGroups.length; j++) {
                    pushPlay(plays, seen, [...group, ...pairGroups[i][1].slice(0, 2), ...pairGroups[j][1].slice(0, 2)]);
                }
            }
        }
    }

    for (const play of [...findStraights(sorted), ...findPairStraights(sorted), ...findAirplanes(sorted)]) {
        const key = getPlayKey(play);
        if (!seen.has(key)) {
            seen.add(key);
            plays.push(play);
        }
    }
    return plays.sort(comparePlays);
}

function findStraights(sorted: FightCard[]): FightPlayedHand[] {
    const valid = sorted.filter(card => card.value >= 3 && card.value <= 14);
    const unique = [...new Set(valid.map(card => card.value))].sort((a, b) => a - b);
    const results: FightPlayedHand[] = [];
    for (let length = 5; length <= unique.length; length++) {
        for (let start = 0; start <= unique.length - length; start++) {
            const seq = unique.slice(start, start + length);
            if (seq[seq.length - 1] - seq[0] === length - 1) {
                const play = classifyFightHand(seq.map(value => valid.find(card => card.value === value)!));
                if (play) results.push(play);
            }
        }
    }
    return results;
}

function findPairStraights(sorted: FightCard[]): FightPlayedHand[] {
    const counts = getValueCounts(sorted);
    const pairs = [...counts.entries()].filter(([value, count]) => count >= 2 && value >= 3 && value <= 14).map(([value]) => value).sort((a, b) => a - b);
    const results: FightPlayedHand[] = [];
    for (let length = 3; length <= pairs.length; length++) {
        for (let start = 0; start <= pairs.length - length; start++) {
            const seq = pairs.slice(start, start + length);
            if (seq[seq.length - 1] - seq[0] === length - 1) {
                const cards = seq.flatMap(value => sorted.filter(card => card.value === value).slice(0, 2));
                const play = classifyFightHand(cards);
                if (play) results.push(play);
            }
        }
    }
    return results;
}

function findAirplanes(sorted: FightCard[]): FightPlayedHand[] {
    const results: FightPlayedHand[] = [];
    const seen = new Set<string>();
    const triples = [...getValueCounts(sorted).entries()].filter(([value, count]) => count >= 3 && value <= 14).map(([value]) => value).sort((a, b) => a - b);
    for (const group of findConsecutiveGroups(triples, 2)) {
        for (let length = 2; length <= group.length; length++) {
            for (let start = 0; start <= group.length - length; start++) {
                const seq = group.slice(start, start + length);
                const seqSet = new Set(seq);
                const triplesCards = seq.flatMap(value => sorted.filter(card => card.value === value).slice(0, 3));
                const remaining = withoutCards(sorted, triplesCards).filter(card => !seqSet.has(card.value));
                pushPlay(results, seen, triplesCards);
                const singles = chooseLowestSingles(remaining, seq.length);
                if (singles) pushPlay(results, seen, [...triplesCards, ...singles]);
                const pairs = chooseLowestPairs(remaining, seq.length);
                if (pairs) pushPlay(results, seen, [...triplesCards, ...pairs]);
            }
        }
    }
    return results.sort(comparePlays);
}

export function findFightHints(cards: FightCard[], lastPlay: FightPlayedHand | null): FightPlayedHand[] {
    const plays = findFightPlays(cards);
    return lastPlay ? plays.filter(play => canFightHandBeat(play, lastPlay)).sort(comparePlays) : plays;
}

export function fightHandLabel(hand: FightPlayedHand): string {
    const labels: Record<FightHandType, string> = {
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
    return labels[hand.type];
}

export function fightCardLabel(card: FightCard): string {
    return card.suit === 'Joker' ? card.rank : `${card.suit}${card.rank}`;
}

export function createInitialFightState(): FightSnapshot {
    return {
        players: createPlayers(),
        landlordCards: [],
        landlord: -1,
        currentPlayer: 0,
        bidder: 0,
        currentBid: 0,
        highestBidder: -1,
        bidTurns: 0,
        lastPlay: null,
        lastPlayPlayer: -1,
        passCount: 0,
        playSeq: 0,
        baseScore: 1,
        multiplier: 1,
        bombCount: 0,
        springType: 'none',
        coins: [100, 100, 100],
        roundNo: 0,
        phase: 'lobby',
        winner: null,
        message: '创建房间后，把房间号发给另外两名玩家。',
        roundHistory: [],
        playCounts: [0, 0, 0],
    };
}

function createDealtFightState(previous: FightSnapshot): FightSnapshot {
    const deck = createDeck();
    const players = createPlayers();
    players[0].hand = deck.slice(0, 17).sort(sortFightCards);
    players[1].hand = deck.slice(17, 34).sort(sortFightCards);
    players[2].hand = deck.slice(34, 51).sort(sortFightCards);
    const bidder = Math.floor(Math.random() * FIGHT_PLAYER_COUNT) as FightPlayerId;

    return {
        ...createInitialFightState(),
        players,
        landlordCards: deck.slice(51, 54).sort(sortFightCards),
        bidder,
        currentPlayer: bidder,
        coins: [...previous.coins] as [number, number, number],
        roundNo: previous.roundNo + 1,
        phase: 'bidding',
        message: `第 ${previous.roundNo + 1} 局发牌完成，轮到${FIGHT_PLAYER_NAMES[bidder]}叫分。`,
    };
}

function isBombHand(hand: FightPlayedHand): boolean {
    return hand.type === 'bomb' || hand.type === 'rocket';
}

function isSameTeam(state: FightSnapshot, a: FightPlayerId, b: FightPlayerId): boolean {
    if (state.landlord === -1) return a === b;
    if (a === state.landlord || b === state.landlord) return a === b;
    return true;
}

function settleRound(state: FightSnapshot, winner: FightPlayerId) {
    if (state.landlord === -1) return;
    const landlordWon = winner === state.landlord;
    const farmers = ([0, 1, 2] as FightPlayerId[]).filter(player => player !== state.landlord);
    const farmersPlayed = farmers.reduce((total, player) => total + state.playCounts[player], 0);
    const landlordOnlyOpened = state.playCounts[state.landlord] === 1;

    state.springType = 'none';
    if (landlordWon && farmersPlayed === 0) {
        state.springType = 'spring';
        state.multiplier *= 2;
    } else if (!landlordWon && landlordOnlyOpened) {
        state.springType = 'antiSpring';
        state.multiplier *= 2;
    }

    const score = state.multiplier;
    if (landlordWon) {
        state.coins[state.landlord] += score * 2;
        for (const farmer of farmers) state.coins[farmer] -= score;
    } else {
        state.coins[state.landlord] -= score * 2;
        for (const farmer of farmers) state.coins[farmer] += score;
    }
}

function settlementText(state: FightSnapshot): string {
    const spring = state.springType === 'spring' ? '，春天 x2' : state.springType === 'antiSpring' ? '，反春天 x2' : '';
    return `底分 ${state.baseScore}，倍率 x${state.multiplier}${spring}`;
}

function startPlayPhase(state: FightSnapshot, landlord: FightPlayerId) {
    state.phase = 'playing';
    state.landlord = landlord;
    state.players[landlord].hand = [...state.players[landlord].hand, ...state.landlordCards].sort(sortFightCards);
    state.landlordCards = [];
    state.currentPlayer = landlord;
    state.lastPlay = null;
    state.lastPlayPlayer = -1;
    state.passCount = 0;
    state.message = `${FIGHT_PLAYER_NAMES[landlord]}成为地主，请先出牌。`;
}

function applyBid(state: FightSnapshot, action: Extract<FightAction, { type: 'bid' }>) {
    if (state.phase !== 'bidding' || action.player !== state.bidder) return;
    state.bidTurns++;
    if (action.bid !== 'pass' && action.bid > state.currentBid) {
        state.currentBid = action.bid;
        state.highestBidder = action.player;
        state.message = `${FIGHT_PLAYER_NAMES[action.player]}叫 ${action.bid} 分。`;
    } else {
        state.message = `${FIGHT_PLAYER_NAMES[action.player]}不叫。`;
    }

    if (state.currentBid === 3 || state.bidTurns >= FIGHT_PLAYER_COUNT) {
        if (state.highestBidder === -1) {
            const redealt = createDealtFightState(state);
            Object.assign(state, redealt, { message: '无人叫分，已重新发牌。' });
            return;
        }
        state.baseScore = Math.max(1, state.currentBid);
        state.multiplier = state.baseScore;
        startPlayPhase(state, state.highestBidder);
        return;
    }

    state.bidder = nextPlayer(action.player);
    state.currentPlayer = state.bidder;
    state.message += ` 轮到${FIGHT_PLAYER_NAMES[state.bidder]}叫分。`;
}

function applyPlay(state: FightSnapshot, action: Extract<FightAction, { type: 'play' }>) {
    if (state.phase !== 'playing' || action.player !== state.currentPlayer || action.cardIds.length === 0) return;
    const handCards = state.players[action.player].hand;
    const idSet = new Set(action.cardIds);
    const cards = handCards.filter(card => idSet.has(card.id));
    if (cards.length !== action.cardIds.length) return;

    const playedHand = classifyFightHand(cards);
    if (!playedHand) {
        state.message = '这组牌型不合法。';
        return;
    }
    const isLeading = !state.lastPlay || state.lastPlayPlayer === action.player || state.lastPlayPlayer === -1;
    if (!isLeading && state.lastPlay && !canFightHandBeat(playedHand, state.lastPlay.hand)) {
        state.message = '这组牌打不过上一手。';
        return;
    }

    state.players[action.player].hand = withoutCards(handCards, cards).sort(sortFightCards);
    state.lastPlay = { player: action.player, hand: playedHand };
    state.lastPlayPlayer = action.player;
    state.passCount = 0;
    state.playSeq++;
    state.playCounts[action.player]++;
    state.roundHistory.push({ player: action.player, cards: [...cards].sort(sortFightCards), label: fightHandLabel(playedHand) });
    if (isBombHand(playedHand)) {
        state.bombCount++;
        state.multiplier *= 2;
    }

    if (state.players[action.player].hand.length === 0) {
        state.phase = 'ended';
        state.winner = action.player;
        settleRound(state, action.player);
        const landlordWon = action.player === state.landlord;
        state.message = `${FIGHT_PLAYER_NAMES[action.player]}出完手牌，${landlordWon ? '地主' : '农民'}获胜。${settlementText(state)}`;
        return;
    }

    state.currentPlayer = nextPlayer(action.player);
    state.message = `${FIGHT_PLAYER_NAMES[action.player]}打出${fightHandLabel(playedHand)}，轮到${FIGHT_PLAYER_NAMES[state.currentPlayer]}。`;
}

function applyPass(state: FightSnapshot, action: Extract<FightAction, { type: 'pass' }>) {
    if (state.phase !== 'playing' || action.player !== state.currentPlayer) return;
    if (!state.lastPlay || state.lastPlayPlayer === action.player || state.lastPlayPlayer === -1) {
        state.message = '当前必须出牌。';
        return;
    }
    if (state.lastPlay.player !== action.player && isSameTeam(state, action.player, state.lastPlay.player)) {
        state.message = `${FIGHT_PLAYER_NAMES[action.player]}不出。`;
    }

    state.passCount++;
    state.roundHistory.push({ player: action.player, cards: [], label: '不出' });
    if (state.passCount >= 2) {
        const next = state.lastPlayPlayer as FightPlayerId;
        state.passCount = 0;
        state.currentPlayer = next;
        state.lastPlay = null;
        state.lastPlayPlayer = -1;
        state.roundHistory.push({ player: next, cards: [], label: 'new_round' });
        state.message = `${FIGHT_PLAYER_NAMES[next]}获得新一轮出牌权。`;
        return;
    }

    state.currentPlayer = nextPlayer(action.player);
    state.message = `${FIGHT_PLAYER_NAMES[action.player]}不出，轮到${FIGHT_PLAYER_NAMES[state.currentPlayer]}。`;
}

export function applyFightAction(source: FightSnapshot, action: FightAction): FightSnapshot {
    if (action.type === 'start' || action.type === 'restart') return createDealtFightState(source);

    const state = cloneState(source);
    if (action.type === 'bid') applyBid(state, action);
    else if (action.type === 'play') applyPlay(state, action);
    else if (action.type === 'pass') applyPass(state, action);
    return state;
}
