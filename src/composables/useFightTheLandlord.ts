import { ref } from 'vue';

const SUITS = ['♠', '♥', '♣', '♦'];
const SUIT_COLORS: Record<string, string> = {
    '♠': '#1a1a2e',
    '♥': '#ef4444',
    '♣': '#1a1a2e',
    '♦': '#ef4444',
};
const RANK_NAMES = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

interface Card {
    suit: string;
    rank: string;
    value: number;
}

type HandType =
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

interface PlayedHand {
    type: HandType;
    cards: Card[];
    primaryValue: number;
    length: number;
}

type PlayerIdx = 0 | 1 | 2;
type GamePhase = 'idle' | 'bidding' | 'playing' | 'ended';
type BidValue = 0 | 1 | 2 | 3;
type DouZeroPosition = 'landlord' | 'landlord_up' | 'landlord_down';

interface DouZeroHistoryItem {
    player: PlayerIdx;
    position: DouZeroPosition;
    values: number[];
}

interface DouZeroPlayRequest {
    player: PlayerIdx;
    position: DouZeroPosition;
    playerPositions: Record<PlayerIdx, DouZeroPosition>;
    hands: number[][];
    landlordCards: number[];
    history: DouZeroHistoryItem[];
    legalActions: number[][];
    bombCount: number;
}

const PLAYER_NAMES = ['你', '电脑1', '电脑2'];
const HAND_ORDER: HandType[] = [
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

function createDeck(): Card[] {
    const cards: Card[] = [];
    for (const suit of SUITS) {
        for (let v = 3; v <= 15; v++) {
            cards.push({ suit, rank: RANK_NAMES[v - 3], value: v });
        }
    }
    cards.push({ suit: '🃏', rank: '小王', value: 16 });
    cards.push({ suit: '🃏', rank: '大王', value: 17 });
    return cards;
}

function shuffle<T>(arr: T[]) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function sortCards(a: Card, b: Card) {
    if (a.value !== b.value) return a.value - b.value;
    return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
}

function getValueCounts(cards: Card[]): Map<number, number> {
    const counts = new Map<number, number>();
    for (const c of cards) {
        counts.set(c.value, (counts.get(c.value) || 0) + 1);
    }
    return counts;
}

function groupCardsByValue(cards: Card[]): Map<number, Card[]> {
    const groups = new Map<number, Card[]>();
    for (const c of [...cards].sort(sortCards)) {
        if (!groups.has(c.value)) groups.set(c.value, []);
        groups.get(c.value)!.push(c);
    }
    return groups;
}

function withoutCards(hand: Card[], played: Card[]): Card[] {
    const remaining = [...hand];
    for (const card of played) {
        const idx = remaining.indexOf(card);
        if (idx >= 0) remaining.splice(idx, 1);
    }
    return remaining;
}

function getPlayKey(play: PlayedHand): string {
    const values = play.cards
        .map(c => c.value)
        .sort((a, b) => a - b)
        .join(',');
    return `${play.type}:${play.primaryValue}:${play.length}:${values}`;
}

function comparePlays(a: PlayedHand, b: PlayedHand): number {
    const ai = HAND_ORDER.indexOf(a.type);
    const bi = HAND_ORDER.indexOf(b.type);
    if (ai !== bi) return ai - bi;
    if (a.primaryValue !== b.primaryValue) return a.primaryValue - b.primaryValue;
    return a.cards.length - b.cards.length;
}

function sortPlays(plays: PlayedHand[]): PlayedHand[] {
    return [...plays].sort(comparePlays);
}

function pushPlay(plays: PlayedHand[], seen: Set<string>, cards: Card[]) {
    const hand = classifyHand(cards);
    if (!hand) return;

    const key = getPlayKey(hand);
    if (seen.has(key)) return;
    seen.add(key);
    plays.push(hand);
}

function findConsecutiveGroups(values: number[], minLength: number): number[][] {
    if (values.length < minLength) return [];

    const groups: number[][] = [];
    let cur = [values[0]];
    for (let i = 1; i < values.length; i++) {
        if (values[i] === values[i - 1] + 1) {
            cur.push(values[i]);
        } else {
            if (cur.length >= minLength) groups.push(cur);
            cur = [values[i]];
        }
    }
    if (cur.length >= minLength) groups.push(cur);
    return groups;
}

function chooseLowestSingles(cards: Card[], count: number): Card[] | null {
    const singles = [...cards].sort(sortCards);
    if (singles.length < count) return null;
    return singles.slice(0, count);
}

function chooseLowestPairs(cards: Card[], count: number): Card[] | null {
    const pairs: Card[] = [];
    for (const [value, group] of groupCardsByValue(cards)) {
        if (value >= 16 || group.length < 2) continue;
        pairs.push(group[0], group[1]);
        if (pairs.length === count * 2) return pairs;
    }
    return null;
}

function classifyHand(cards: Card[]): PlayedHand | null {
    const n = cards.length;
    if (n === 0) return null;

    const sorted = [...cards].sort(sortCards);
    const values = sorted.map(c => c.value);
    const counts = getValueCounts(cards);
    const entries = [...counts.entries()].sort((a, b) => a[0] - b[0]);
    const countArr = entries.map(([_, c]) => c);
    const uniqueVals = entries.map(([v]) => v);

    if (n === 2 && values[0] === 16 && values[1] === 17) {
        return { type: 'rocket', cards: sorted, primaryValue: 17, length: 2 };
    }
    if (n === 1) {
        return { type: 'single', cards: sorted, primaryValue: values[0], length: 1 };
    }
    if (n === 2 && values[0] === values[1] && values[0] < 16) {
        return { type: 'pair', cards: sorted, primaryValue: values[0], length: 2 };
    }
    if (n === 3 && uniqueVals.length === 1 && countArr[0] === 3) {
        return { type: 'triple', cards: sorted, primaryValue: values[0], length: 3 };
    }
    if (n === 4 && uniqueVals.length === 1 && countArr[0] === 4) {
        return { type: 'bomb', cards: sorted, primaryValue: values[0], length: 4 };
    }
    if (n === 4) {
        const triple = entries.find(([_, c]) => c === 3);
        if (triple) {
            const kicker = cards.filter(c => c.value !== triple[0]);
            const arranged = [...cards.filter(c => c.value === triple[0]), ...kicker];
            return { type: 'triple1', cards: arranged, primaryValue: triple[0], length: 3 };
        }
    }
    if (n === 5) {
        const triple = entries.find(([_, c]) => c === 3);
        const pair = entries.find(([_, c]) => c === 2);
        if (triple && pair) {
            return { type: 'triple2', cards: sorted, primaryValue: triple[0], length: 3 };
        }
    }
    if (n >= 5 && countArr.every(c => c === 1)) {
        const minV = uniqueVals[0];
        const maxV = uniqueVals[uniqueVals.length - 1];
        if (maxV <= 14 && minV >= 3 && maxV - minV === n - 1) {
            return { type: 'straight', cards: sorted, primaryValue: maxV, length: n };
        }
    }
    if (n >= 6 && n % 2 === 0 && countArr.every(c => c === 2)) {
        if (uniqueVals.length >= 3) {
            const minV = uniqueVals[0];
            const maxV = uniqueVals[uniqueVals.length - 1];
            if (maxV <= 14 && minV >= 3 && maxV - minV === uniqueVals.length - 1) {
                return { type: 'pair_straight', cards: sorted, primaryValue: maxV, length: n };
            }
        }
    }
    if (n === 6) {
        const four = entries.find(([_, c]) => c === 4);
        if (four) {
            const kickers = cards.filter(c => c.value !== four[0]);
            if (kickers.length === 2) {
                return {
                    type: 'four2',
                    cards: [...kickers, ...cards.filter(c => c.value === four[0])],
                    primaryValue: four[0],
                    length: 4,
                };
            }
        }
    }
    if (n === 8) {
        const four = entries.find(([_, c]) => c === 4);
        if (four) {
            const pairs = entries.filter(([v, c]) => v !== four[0] && c === 2);
            if (pairs.length === 2) {
                return { type: 'four22', cards: sorted, primaryValue: four[0], length: 4 };
            }
        }
    }
    const airplaneResult = classifyAirplane(cards, entries, n);
    if (airplaneResult) return airplaneResult;

    return null;
}

function classifyAirplane(cards: Card[], entries: [number, number][], n: number): PlayedHand | null {
    const triples = entries
        .filter(([v, c]) => c >= 3 && v <= 14)
        .map(([v]) => v)
        .sort((a, b) => a - b);
    if (triples.length < 2) return null;

    const groups = findConsecutiveGroups(triples, 2).flatMap(group => {
        const slices: number[][] = [];
        for (let len = group.length; len >= 2; len--) {
            for (let start = 0; start <= group.length - len; start++) {
                slices.push(group.slice(start, start + len));
            }
        }
        return slices;
    });

    for (const group of groups) {
        const tripleCount = group.length;
        if (n !== tripleCount * 3 && n !== tripleCount * 4 && n !== tripleCount * 5) continue;

        const groupSet = new Set(group);
        const tripleCards: Card[] = [];
        for (const value of group) {
            const valueCards = cards.filter(c => c.value === value).sort(sortCards);
            if (valueCards.length < 3) continue;
            tripleCards.push(...valueCards.slice(0, 3));
        }
        if (tripleCards.length !== tripleCount * 3) continue;

        const remaining = withoutCards(cards, tripleCards).sort(sortCards);
        if (remaining.some(c => groupSet.has(c.value))) continue;

        if (remaining.length === 0) {
            return {
                type: 'airplane',
                cards: tripleCards.sort(sortCards),
                primaryValue: group[group.length - 1],
                length: tripleCount * 3,
            };
        }

        if (remaining.length === tripleCount) {
            return {
                type: 'airplane1',
                cards: [...remaining, ...tripleCards].sort(sortCards),
                primaryValue: group[group.length - 1],
                length: tripleCount * 4,
            };
        }

        if (remaining.length === tripleCount * 2) {
            const remCounts = getValueCounts(remaining);
            const allPairs = [...remCounts.values()].every(c => c === 2);
            if (allPairs && remCounts.size === tripleCount) {
                return {
                    type: 'airplane2',
                    cards: [...remaining, ...tripleCards].sort(sortCards),
                    primaryValue: group[group.length - 1],
                    length: tripleCount * 5,
                };
            }
        }
    }

    return null;
}

function canBeat(hand: PlayedHand, lastPlay: PlayedHand): boolean {
    if (lastPlay.type === 'rocket') return false;
    if (hand.type === 'rocket') return true;
    if (hand.type === 'bomb' && lastPlay.type !== 'bomb') return true;
    if (hand.type === 'bomb' && lastPlay.type === 'bomb') {
        return hand.primaryValue > lastPlay.primaryValue;
    }
    if (hand.type === lastPlay.type && hand.length === lastPlay.length) {
        return hand.primaryValue > lastPlay.primaryValue;
    }
    return false;
}

function findAllPlays(cards: Card[]): PlayedHand[] {
    if (cards.length === 0) return [];
    const plays: PlayedHand[] = [];
    const seen = new Set<string>();
    const sorted = [...cards].sort(sortCards);

    for (const card of sorted) {
        pushPlay(plays, seen, [card]);
    }

    const smallJoker = sorted.find(c => c.value === 16);
    const bigJoker = sorted.find(c => c.value === 17);
    if (smallJoker && bigJoker) {
        pushPlay(plays, seen, [smallJoker, bigJoker]);
    }

    const valueGroups = groupCardsByValue(sorted);
    const groups = [...valueGroups.entries()].sort((a, b) => a[0] - b[0]);

    for (const [value, group] of groups) {
        if (group.length >= 2 && value < 16) {
            pushPlay(plays, seen, group.slice(0, 2));
        }
        if (group.length >= 3) {
            pushPlay(plays, seen, group.slice(0, 3));
        }
        if (group.length === 4) {
            pushPlay(plays, seen, group);
        }
    }

    for (const [value, group] of groups) {
        if (group.length >= 3) {
            const tripleCards = group.slice(0, 3);
            const others = sorted.filter(c => c.value !== value);

            for (const kicker of others) {
                pushPlay(plays, seen, [...tripleCards, kicker]);
            }

            for (const [pairValue, pairGroup] of groups) {
                if (pairValue !== value && pairValue < 16 && pairGroup.length >= 2) {
                    pushPlay(plays, seen, [...tripleCards, ...pairGroup.slice(0, 2)]);
                }
            }
        }
    }

    for (const [value, group] of groups) {
        if (group.length !== 4) continue;

        const kickers = sorted.filter(c => c.value !== value);
        for (let i = 0; i < kickers.length - 1; i++) {
            for (let j = i + 1; j < kickers.length; j++) {
                pushPlay(plays, seen, [...group, kickers[i], kickers[j]]);
            }
        }

        const pairGroups = groups.filter(
            ([pairValue, pairGroup]) => pairValue !== value && pairValue < 16 && pairGroup.length >= 2,
        );
        for (let i = 0; i < pairGroups.length - 1; i++) {
            for (let j = i + 1; j < pairGroups.length; j++) {
                pushPlay(plays, seen, [...group, ...pairGroups[i][1].slice(0, 2), ...pairGroups[j][1].slice(0, 2)]);
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

    return sortPlays(plays);
}

function findStraights(sorted: Card[]): PlayedHand[] {
    const results: PlayedHand[] = [];
    const valid = sorted.filter(c => c.value >= 3 && c.value <= 14);
    const unique = [...new Set(valid.map(c => c.value))].sort((a, b) => a - b);

    for (let len = 5; len <= unique.length; len++) {
        for (let start = 0; start <= unique.length - len; start++) {
            const seq = unique.slice(start, start + len);
            if (seq[seq.length - 1] - seq[0] === len - 1) {
                const cards = seq.map(v => valid.find(c => c.value === v)!).filter(Boolean);
                if (cards.length === len) {
                    const h = classifyHand(cards);
                    if (h) results.push(h);
                }
            }
        }
    }
    return results;
}

function findPairStraights(sorted: Card[]): PlayedHand[] {
    const results: PlayedHand[] = [];
    const counts = getValueCounts(sorted);
    const pairs = [...counts.entries()]
        .filter(([v, c]) => c >= 2 && v >= 3 && v <= 14)
        .map(([v]) => v)
        .sort((a, b) => a - b);

    for (let len = 3; len <= pairs.length; len++) {
        for (let start = 0; start <= pairs.length - len; start++) {
            const seq = pairs.slice(start, start + len);
            if (seq[seq.length - 1] - seq[0] === len - 1) {
                const cards: Card[] = [];
                for (const v of seq) {
                    const vCards = sorted.filter(c => c.value === v);
                    cards.push(vCards[0], vCards[1]);
                }
                const h = classifyHand(cards);
                if (h) results.push(h);
            }
        }
    }
    return results;
}

function findAirplanes(sorted: Card[]): PlayedHand[] {
    const results: PlayedHand[] = [];
    const seen = new Set<string>();
    const counts = getValueCounts(sorted);
    const triples = [...counts.entries()]
        .filter(([v, c]) => c >= 3 && v <= 14)
        .map(([v]) => v)
        .sort((a, b) => a - b);
    if (triples.length < 2) return results;

    const groups = findConsecutiveGroups(triples, 2);

    for (const group of groups) {
        for (let len = 2; len <= group.length; len++) {
            for (let start = 0; start <= group.length - len; start++) {
                const seq = group.slice(start, start + len);
                const seqSet = new Set(seq);
                const usedTriples: Card[] = [];

                for (const value of seq) {
                    const vc = sorted.filter(c => c.value === value);
                    usedTriples.push(...vc.slice(0, 3));
                }

                if (usedTriples.length !== seq.length * 3) continue;

                const remaining = withoutCards(sorted, usedTriples).filter(c => !seqSet.has(c.value));
                pushPlay(results, seen, usedTriples);

                const singleWings = chooseLowestSingles(remaining, seq.length);
                if (singleWings) {
                    pushPlay(results, seen, [...usedTriples, ...singleWings]);
                }

                const pairWings = chooseLowestPairs(remaining, seq.length);
                if (pairWings) {
                    pushPlay(results, seen, [...usedTriples, ...pairWings]);
                }
            }
        }
    }

    return sortPlays(results);
}

function findSmallerPlays(plays: PlayedHand[], lastPlay: PlayedHand): PlayedHand[] {
    const beats: PlayedHand[] = [];
    for (const p of plays) {
        if (canBeat(p, lastPlay)) {
            beats.push(p);
        }
    }
    return sortPlays(beats);
}

function findLowestPlay(plays: PlayedHand[]): PlayedHand | null {
    if (plays.length === 0) return null;
    return sortPlays(plays)[0];
}

function isPowerPlay(play: PlayedHand): boolean {
    return play.type === 'bomb' || play.type === 'rocket';
}

function cardsToValues(cards: Card[]): number[] {
    return cards.map(card => card.value);
}

function getBombCountFromHistory(history: { cards: Card[] }[]): number {
    return history.filter(item => {
        const hand = classifyHand(item.cards);
        return hand?.type === 'bomb' || hand?.type === 'rocket';
    }).length;
}

function isBombHand(hand: PlayedHand): boolean {
    return hand.type === 'bomb' || hand.type === 'rocket';
}

function evaluateHandStructure(hand: Card[]): number {
    if (hand.length === 0) return 99999;
    const counts = getValueCounts(hand);
    let singles = 0,
        pairs = 0,
        triples = 0,
        bombs = 0;
    for (const [v, c] of counts) {
        if (c === 4) bombs++;
        else if (c === 3) triples++;
        else if (c === 2) pairs++;
        else if (c === 1) singles++;
    }
    let score = 100 - hand.length * 2;
    score -= singles * 15;
    score -= pairs * 5;
    score -= triples * 3;
    score += bombs * 8;
    const vals = [...counts.keys()].filter(v => v >= 3 && v <= 14).sort((a, b) => a - b);
    let consec = 0;
    for (let i = 0; i < vals.length; i++) {
        if (i === 0 || vals[i] === vals[i - 1] + 1) {
            consec++;
            if (consec >= 5) score += 15;
        } else {
            consec = 1;
        }
    }
    return score;
}

function chooseBestPlayByRemaining(hand: Card[], plays: PlayedHand[], allowPower = false): PlayedHand | null {
    const candidates = allowPower ? plays : plays.filter(p => !isPowerPlay(p));
    const pool = candidates.length > 0 ? candidates : plays;
    if (pool.length === 0) return null;

    let bestPlay = pool[0];
    let bestScore = -Infinity;

    for (const play of pool) {
        const remaining = withoutCards(hand, play.cards);
        let score = evaluateHandStructure(remaining) + play.cards.length * 3;

        if (remaining.length === 0) score += 100000;
        if (remaining.length > 0 && remaining.length <= 10) {
            const nextPlays = findAllPlays(remaining);
            if (nextPlays.some(next => next.cards.length === remaining.length)) {
                score += 250;
            }
        }

        if (isPowerPlay(play) && !allowPower) score -= 500;
        if (play.type === 'straight' || play.type === 'pair_straight' || play.type.startsWith('airplane')) {
            score += 20;
        }

        const tieBreak = comparePlays(bestPlay, play);
        if (score > bestScore || (score === bestScore && tieBreak > 0)) {
            bestScore = score;
            bestPlay = play;
        }
    }

    return bestPlay;
}

function findFinishingBeat(hand: Card[], lastPlay: PlayedHand): PlayedHand | null {
    const beating = findSmallerPlays(findAllPlays(hand), lastPlay);
    return beating.find(p => p.cards.length === hand.length) || null;
}

function getDouZeroPositions(landlordPlayer: PlayerIdx | -1): Record<PlayerIdx, DouZeroPosition> | null {
    if (landlordPlayer === -1) return null;

    const positions = {} as Record<PlayerIdx, DouZeroPosition>;
    positions[landlordPlayer] = 'landlord';
    positions[((landlordPlayer + 1) % 3) as PlayerIdx] = 'landlord_down';
    positions[((landlordPlayer + 2) % 3) as PlayerIdx] = 'landlord_up';
    return positions;
}

function findCardsByValues(hand: Card[], values: number[]): Card[] | null {
    const remaining = [...hand];
    const selected: Card[] = [];

    for (const value of values) {
        const index = remaining.findIndex(card => card.value === value);
        if (index < 0) return null;
        selected.push(remaining[index]);
        remaining.splice(index, 1);
    }

    return selected;
}

function aiShouldBid(hand: Card[]): boolean {
    const counts = getValueCounts(hand);
    let score = 0;
    score += (counts.get(17) || 0) * 6;
    score += (counts.get(16) || 0) * 4;
    score += (counts.get(15) || 0) * 2.5;
    score += (counts.get(14) || 0) * 1;
    score += (counts.get(13) || 0) * 0.5;
    for (const [v, c] of counts) {
        if (c === 4) score += 6;
    }
    let singles = 0,
        pairs = 0,
        triples = 0;
    for (const [v, c] of counts) {
        if (c === 3) triples++;
        else if (c === 2) pairs++;
        else if (c === 1 && v <= 15) singles++;
    }
    if (singles > 4) score -= singles - 4;
    score += triples * 1.5;
    score += Math.floor(pairs / 2) * 1;
    const vals = [...counts.keys()].filter(v => v >= 3 && v <= 14).sort((a, b) => a - b);
    let consec = 0;
    for (let i = 0; i < vals.length; i++) {
        if (i === 0 || vals[i] === vals[i - 1] + 1) consec++;
        else consec = 1;
        if (consec >= 5) {
            score += 2;
            break;
        }
    }
    return score >= 4.5;
}

function evaluateBidScore(hand: Card[]): number {
    const counts = getValueCounts(hand);
    let score = 0;
    score += (counts.get(17) || 0) * 3;
    score += (counts.get(16) || 0) * 2.4;
    score += (counts.get(15) || 0) * 1.1;
    for (const c of counts.values()) {
        if (c === 4) score += 3.2;
        else if (c === 3) score += 0.9;
        else if (c === 2) score += 0.35;
    }
    const vals = [...counts.keys()].filter(v => v >= 3 && v <= 14).sort((a, b) => a - b);
    let streak = 1;
    for (let i = 1; i < vals.length; i++) {
        streak = vals[i] === vals[i - 1] + 1 ? streak + 1 : 1;
        if (streak >= 5) score += 0.8;
    }
    return score;
}

function aiChooseBid(hand: Card[], minBid: BidValue): BidValue | 'pass' {
    const score = evaluateBidScore(hand);
    const target: BidValue = score >= 8 ? 3 : score >= 6 ? 2 : score >= 4.2 ? 1 : 0;
    return target > minBid ? target : 'pass';
}

function aiDecidePlay(hand: Card[], lastPlay: PlayedHand | null, isLeading: boolean): Card[] | null {
    if (hand.length === 0) return null;
    const plays = findAllPlays(hand);
    if (plays.length === 0) return null;

    if (isLeading) {
        // 1) Can finish in one play?
        for (const p of plays) {
            if (p.cards.length === hand.length) return p.cards;
        }

        // 2) Can finish in two plays?
        if (hand.length <= 10) {
            for (const p of plays) {
                if (p.type === 'bomb' || p.type === 'rocket') continue;
                const remaining = hand.filter(c => !p.cards.includes(c));
                const remPlays = findAllPlays(remaining);
                if (remPlays.some(rp => rp.cards.length === remaining.length)) {
                    return p.cards;
                }
            }
        }

        // 3) Pick the play that leaves the cleanest remaining hand.
        const bestPlay = chooseBestPlayByRemaining(hand, plays);
        if (bestPlay) return bestPlay.cards;

        // 4) Only bombs left - play smallest
        return plays[0].cards;
    }

    // --- Following (trying to beat last play) ---
    if (!lastPlay) return null;
    const beating = findSmallerPlays(plays, lastPlay);
    if (beating.length === 0) return null;

    // Can finish?
    const canFinish = beating.find(p => p.cards.length === hand.length);
    if (canFinish) return canFinish.cards;

    const bestNormalBeat = chooseBestPlayByRemaining(hand, beating);
    if (bestNormalBeat && !isPowerPlay(bestNormalBeat)) return bestNormalBeat.cards;

    // Only bombs - save them unless hand is small (can win with bomb)
    if (hand.length <= 5) {
        return beating[0].cards;
    }
    return null;
}

export function useFightTheLandlord() {
    const phase = ref<GamePhase>('idle');
    const deck = ref<Card[]>([]);
    const hands = ref<[Card[], Card[], Card[]]>([[], [], []]);
    const landlordCards = ref<Card[]>([]);
    const landlord = ref<PlayerIdx | -1>(-1);
    const currentPlayer = ref<PlayerIdx>(0);
    const lastPlay = ref<{ player: PlayerIdx; hand: PlayedHand } | null>(null);
    const lastPlayPlayer = ref<PlayerIdx | -1>(-1);
    const playSeq = ref(0);
    const passCount = ref(0);
    const selectedCards = ref<Card[]>([]);
    const hintCards = ref<Card[]>([]);
    const message = ref('');
    const bidder = ref<PlayerIdx>(0);
    const bidPhase = ref<'waiting' | 'decided'>('waiting');
    const playerBid = ref<BidValue | 'pass' | 'none'>('none');
    const bidPassCount = ref(0);
    const currentBid = ref<BidValue>(0);
    const highestBidder = ref<PlayerIdx | -1>(-1);
    const bidTurns = ref(0);
    const baseScore = ref(1);
    const multiplier = ref(1);
    const bombCount = ref(0);
    const springType = ref<'none' | 'spring' | 'antiSpring'>('none');
    const coins = ref<[number, number, number]>([100, 100, 100]);
    const roundNo = ref(0);
    const sessionEnded = ref(false);
    const roundHistory = ref<{ player: PlayerIdx; cards: Card[]; label: string }[]>([]);
    const playCounts = ref<[number, number, number]>([0, 0, 0]);
    const playerCall = ref(false);

    let aiTimer: ReturnType<typeof setTimeout> | null = null;
    let gameSeq = 0;

    function getHand(player: PlayerIdx): Card[] {
        return hands.value[player];
    }

    function updateMessage(msg: string) {
        message.value = msg;
    }

    function startGame() {
        clearAITimer();
        if (sessionEnded.value) {
            coins.value = [100, 100, 100];
            roundNo.value = 0;
            sessionEnded.value = false;
        }

        if (coins.value[0] < 1) {
            phase.value = 'ended';
            sessionEnded.value = true;
            updateMessage(`资金不足，游戏结束。坚持了 ${roundNo.value} 轮`);
            return;
        }

        gameSeq++;
        roundNo.value++;

        const d = createDeck();
        shuffle(d);
        deck.value = d;

        hands.value = [
            d.slice(0, 17).sort(sortCards),
            d.slice(17, 34).sort(sortCards),
            d.slice(34, 51).sort(sortCards),
        ];
        landlordCards.value = d.slice(51, 54);
        landlord.value = -1;
        currentPlayer.value = 0;
        lastPlay.value = null;
        lastPlayPlayer.value = -1;
        playSeq.value = 0;
        passCount.value = 0;
        selectedCards.value = [];
        hintCards.value = [];
        roundHistory.value = [];
        playCounts.value = [0, 0, 0];
        currentBid.value = 0;
        highestBidder.value = -1;
        bidTurns.value = 0;
        baseScore.value = 1;
        multiplier.value = 1;
        bombCount.value = 0;
        springType.value = 'none';
        playerCall.value = false;
        bidPassCount.value = 0;
        playerBid.value = 'none';

        const startingBidder = Math.floor(Math.random() * 3) as PlayerIdx;
        bidder.value = startingBidder;
        bidPhase.value = 'waiting';
        phase.value = 'bidding';

        if (startingBidder === 0) {
            updateMessage('轮到你叫分');
        } else {
            updateMessage(`${PLAYER_NAMES[startingBidder]} 思考中...`);
            scheduleAIBid(startingBidder);
        }
    }

    function scheduleAIBid(player: PlayerIdx) {
        clearAITimer();
        const scheduledGameSeq = gameSeq;
        aiTimer = setTimeout(
            () => {
                if (scheduledGameSeq !== gameSeq || phase.value !== 'bidding' || bidder.value !== player) return;
                const hand = getHand(player);
                handleBid(player, aiChooseBid(hand, currentBid.value));
            },
            800 + Math.random() * 600,
        );
    }

    function playerBidAction(bid: BidValue | 'pass' | boolean) {
        if (phase.value !== 'bidding' || bidder.value !== 0) return;
        const normalized = bid === true ? 1 : bid === false ? 'pass' : bid;
        playerCall.value = normalized !== 'pass' && normalized > 0;
        playerBid.value = normalized;
        handleBid(0, normalized);
    }

    function handleBid(player: PlayerIdx, bid: BidValue | 'pass') {
        if (phase.value !== 'bidding' || bidder.value !== player) return;

        bidTurns.value++;
        if (bid !== 'pass' && bid > currentBid.value) {
            currentBid.value = bid;
            highestBidder.value = player;
            updateMessage(`${PLAYER_NAMES[player]} 叫 ${bid} 分`);
        } else {
            bidPassCount.value++;
            updateMessage(`${PLAYER_NAMES[player]} pass`);
        }

        if (currentBid.value === 3 || bidTurns.value >= 3) {
            if (highestBidder.value === -1) {
                updateMessage('无人叫分，重新发牌...');
                const scheduledGameSeq = gameSeq;
                setTimeout(() => {
                    if (scheduledGameSeq === gameSeq && phase.value === 'bidding') startGame();
                }, 1000);
                return;
            }

            landlord.value = highestBidder.value;
            baseScore.value = Math.max(1, currentBid.value);
            multiplier.value = baseScore.value;
            bidPhase.value = 'decided';
            updateMessage(`${PLAYER_NAMES[highestBidder.value]} ${currentBid.value} 分当地主`);

            const scheduledGameSeq = gameSeq;
            setTimeout(() => {
                if (scheduledGameSeq !== gameSeq || phase.value !== 'bidding') return;
                startPlayPhase(highestBidder.value as PlayerIdx);
            }, 700);
            return;
        }

        const next = ((player + 1) % 3) as PlayerIdx;
        bidder.value = next;

        if (next === 0) {
            updateMessage(`轮到你叫分（当前 ${currentBid.value} 分）`);
        } else {
            updateMessage(`${PLAYER_NAMES[next]} 思考中...`);
            scheduleAIBid(next);
        }
    }

    function startPlayPhase(landlordPlayer: PlayerIdx) {
        phase.value = 'playing';
        landlord.value = landlordPlayer;

        const landCards = [...landlordCards.value];
        hands.value[landlordPlayer] = [...hands.value[landlordPlayer], ...landCards].sort(sortCards);
        landlordCards.value = [];

        currentPlayer.value = landlordPlayer;
        lastPlay.value = null;
        lastPlayPlayer.value = -1;
        playSeq.value = 0;
        passCount.value = 0;

        if (landlordPlayer === 0) {
            updateMessage('你是地主，请出牌');
        } else {
            updateMessage(`地主 ${PLAYER_NAMES[landlordPlayer]} 出牌`);
            scheduleAIPlay(landlordPlayer);
        }
    }

    function toggleSelect(card: Card) {
        if (phase.value !== 'playing' || currentPlayer.value !== 0) return;
        const idx = selectedCards.value.indexOf(card);
        if (idx >= 0) {
            selectedCards.value.splice(idx, 1);
        } else {
            selectedCards.value.push(card);
        }
        hintCards.value = [];
    }

    function isSelected(card: Card): boolean {
        return selectedCards.value.includes(card);
    }

    function playerPlay() {
        if (phase.value !== 'playing' || currentPlayer.value !== 0) return;
        if (selectedCards.value.length === 0) return;

        const hand = classifyHand(selectedCards.value);
        if (!hand) {
            updateMessage('无效的牌型');
            return;
        }

        if (lastPlay.value && lastPlayPlayer.value !== 0) {
            if (!canBeat(hand, lastPlay.value.hand)) {
                updateMessage('打不过，请选择更大的牌');
                return;
            }
        }

        executePlay(0, selectedCards.value, hand);
    }

    function playerPass() {
        if (phase.value !== 'playing' || currentPlayer.value !== 0) return;
        if (!lastPlay.value || lastPlayPlayer.value === 0) {
            updateMessage('必须出牌');
            return;
        }

        executePass(0);
    }

    function playerHint() {
        if (phase.value !== 'playing' || currentPlayer.value !== 0) return;
        const isLeading = !lastPlay.value || lastPlayPlayer.value === 0 || lastPlayPlayer.value === -1;

        requestDouZeroPlay(0, isLeading).then(suggested => {
            if (phase.value !== 'playing' || currentPlayer.value !== 0) return;
            if (suggested === undefined) {
                updateMessage('DouZero AI 不可用，无法提示');
                return;
            }
            if (suggested === null) {
                updateMessage('没有能打过的牌');
                return;
            }
            if (suggested.length === 0) {
                updateMessage('DouZero 建议不出');
                return;
            }
            hintCards.value = suggested;
            selectedCards.value = [...suggested];
        });
    }

    function executePlay(player: PlayerIdx, cards: Card[], hand: PlayedHand) {
        for (const c of cards) {
            const idx = hands.value[player].indexOf(c);
            if (idx >= 0) hands.value[player].splice(idx, 1);
        }

        lastPlay.value = { player, hand };
        lastPlayPlayer.value = player;
        playSeq.value++;
        passCount.value = 0;
        playCounts.value[player]++;
        if (isBombHand(hand)) {
            bombCount.value++;
            multiplier.value *= 2;
        }

        roundHistory.value.push({ player, cards: [...cards], label: getHandLabel(hand) });

        if (hands.value[player].length === 0) {
            phase.value = 'ended';
            clearAITimer();
            const userWon = player === 0 || (landlord.value !== 0 && player !== landlord.value);
            settleRound(player);
            if (userWon && player === 0) {
                updateMessage(`你赢了！${getSettlementSummary()}`);
            } else if (userWon) {
                updateMessage(`队友 ${PLAYER_NAMES[player]} 走完，农民胜利！${getSettlementSummary()}`);
            } else if (landlord.value === player) {
                updateMessage(`地主 ${PLAYER_NAMES[player]} 赢了。${getSettlementSummary()}`);
            } else {
                updateMessage(`${PLAYER_NAMES[player]} 走完，农民胜利。${getSettlementSummary()}`);
            }
            selectedCards.value = [];
            hintCards.value = [];
            return;
        }

        const next = getNextPlayer(player);
        currentPlayer.value = next;

        if (next === 0) {
            updateMessage('轮到你出牌');
        } else {
            updateMessage(`${PLAYER_NAMES[next]} 思考中...`);
            scheduleAIPlay(next);
        }

        selectedCards.value = [];
        hintCards.value = [];
    }

    function executePass(player: PlayerIdx) {
        passCount.value++;

        roundHistory.value.push({ player, cards: [], label: '不出' });

        if (passCount.value >= 2) {
            passCount.value = 0;
            const next = lastPlayPlayer.value as PlayerIdx;
            currentPlayer.value = next;
            lastPlay.value = null;
            roundHistory.value.push({ player: next, cards: [], label: 'new_round' });

            if (next === 0) {
                lastPlayPlayer.value = -1;
                updateMessage('轮到你出牌（新一轮）');
            } else {
                lastPlayPlayer.value = next;
                updateMessage(`${PLAYER_NAMES[next]} 出牌（新一轮）`);
                scheduleAIPlay(next);
            }
        } else {
            const next = getNextPlayer(currentPlayer.value);
            currentPlayer.value = next;

            if (next === 0) {
                updateMessage('轮到你出牌');
            } else {
                updateMessage(`${PLAYER_NAMES[next]} 思考中...`);
                scheduleAIPlay(next);
            }
        }

        selectedCards.value = [];
        hintCards.value = [];
    }

    function getNextPlayer(player: PlayerIdx): PlayerIdx {
        return ((player + 1) % 3) as PlayerIdx;
    }

    function isSameTeam(a: PlayerIdx, b: PlayerIdx): boolean {
        if (landlord.value === -1) return a === b;
        if (a === landlord.value || b === landlord.value) return a === b;
        return true;
    }

    function settleRound(winner: PlayerIdx) {
        if (landlord.value === -1) return;

        const landlordWon = winner === landlord.value;
        const farmerPlayers = ([0, 1, 2] as PlayerIdx[]).filter(player => player !== landlord.value);
        const farmersPlayed = farmerPlayers.reduce((total, player) => total + playCounts.value[player], 0);
        const landlordOnlyOpened = playCounts.value[landlord.value] === 1;

        springType.value = 'none';
        if (landlordWon && farmersPlayed === 0) {
            springType.value = 'spring';
            multiplier.value *= 2;
        } else if (!landlordWon && landlordOnlyOpened) {
            springType.value = 'antiSpring';
            multiplier.value *= 2;
        }

        const score = multiplier.value;
        if (landlordWon) {
            coins.value[landlord.value] += score * 2;
            for (const farmer of farmerPlayers) coins.value[farmer] -= score;
        } else {
            coins.value[landlord.value] -= score * 2;
            for (const farmer of farmerPlayers) coins.value[farmer] += score;
        }

        if (coins.value[0] < 1) {
            sessionEnded.value = true;
        }
    }

    function getSettlementSummary(): string {
        const springLabel =
            springType.value === 'spring' ? ' 春天x2' : springType.value === 'antiSpring' ? ' 反春天x2' : '';
        const endLabel = sessionEnded.value ? ` 资金不足，游戏结束，坚持 ${roundNo.value} 轮。` : '';
        return ` 底分${baseScore.value} 倍率x${multiplier.value}${springLabel}，你剩余${coins.value[0]}。${endLabel}`;
    }

    function getHandLabel(hand: PlayedHand): string {
        const labels: Record<HandType, string> = {
            single: '单张',
            pair: '对子',
            triple: '三条',
            triple1: '三带一',
            triple2: '三带二',
            straight: '顺子',
            pair_straight: '连对',
            airplane: '飞机',
            airplane1: '飞机带单',
            airplane2: '飞机带双',
            bomb: '炸弹',
            rocket: '火箭',
            four2: '四带二',
            four22: '四带两对',
        };
        return labels[hand.type];
    }

    async function requestDouZeroPlay(player: PlayerIdx, isLeading: boolean): Promise<Card[] | null | undefined> {
        const positions = getDouZeroPositions(landlord.value);
        if (!positions) return undefined;

        const hand = getHand(player);
        const allPlays = findAllPlays(hand);
        const legalPlays = isLeading || !lastPlay.value ? allPlays : findSmallerPlays(allPlays, lastPlay.value.hand);
        if (legalPlays.length === 0) return null;
        const legalActions = legalPlays.map(play => cardsToValues(play.cards));
        if (!isLeading && lastPlay.value) {
            legalActions.push([]);
        }

        const payload: DouZeroPlayRequest = {
            player,
            position: positions[player],
            playerPositions: positions,
            hands: hands.value.map(cardsToValues),
            landlordCards: cardsToValues(landlordCards.value),
            history: roundHistory.value
                .filter(item => item.label !== 'new_round')
                .map(item => ({
                    player: item.player,
                    position: positions[item.player],
                    values: cardsToValues(item.cards),
                })),
            legalActions,
            bombCount: getBombCountFromHistory(roundHistory.value),
        };

        try {
            const response = await fetch('/api/douzero/play', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                console.warn('DouZero request failed', await response.text());
                return undefined;
            }

            const result = await response.json();
            if (!result?.ok || !Array.isArray(result.actionValues)) {
                console.warn('DouZero returned invalid result', result);
                return undefined;
            }
            if (result.actionValues.length === 0) return [];

            const selected = findCardsByValues(hand, result.actionValues.map(Number));
            if (!selected) return undefined;

            const selectedHand = classifyHand(selected);
            if (!selectedHand) return undefined;
            if (!isLeading && lastPlay.value && !canBeat(selectedHand, lastPlay.value.hand)) return undefined;
            return selected;
        } catch {
            return undefined;
        }
    }

    function scheduleAIPlay(player: PlayerIdx) {
        clearAITimer();
        const scheduledGameSeq = gameSeq;
        aiTimer = setTimeout(
            async () => {
                if (scheduledGameSeq !== gameSeq || phase.value !== 'playing' || currentPlayer.value !== player) return;

                const hand = getHand(player);
                const isLeading =
                    !lastPlay.value ||
                    lastPlayPlayer.value === player ||
                    lastPlayPlayer.value === -1 ||
                    passCount.value >= 2;

                const opponents = ([0, 1, 2] as PlayerIdx[]).filter(p => p !== player && !isSameTeam(player, p));
                const opponentMinCards =
                    opponents.length > 0 ? Math.min(...opponents.map(p => hands.value[p].length)) : Infinity;

                let cards: Card[] | null = null;

                if (!isLeading && lastPlay.value && isSameTeam(player, lastPlay.value.player)) {
                    const douZeroCards = await requestDouZeroPlay(player, false);
                    if (scheduledGameSeq !== gameSeq || phase.value !== 'playing' || currentPlayer.value !== player)
                        return;
                    if (douZeroCards && douZeroCards.length > 0) {
                        const finishing = classifyHand(douZeroCards);
                        if (finishing && canBeat(finishing, lastPlay.value.hand)) {
                            executePlay(player, douZeroCards, finishing);
                            return;
                        }
                    }
                    executePass(player);
                    return;
                }

                if (isLeading) {
                    const douZeroCards = await requestDouZeroPlay(player, true);
                    cards = Array.isArray(douZeroCards) ? douZeroCards : null;
                } else {
                    const douZeroCards = await requestDouZeroPlay(player, false);
                    cards = Array.isArray(douZeroCards) ? douZeroCards : null;
                }

                if (scheduledGameSeq !== gameSeq || phase.value !== 'playing' || currentPlayer.value !== player) return;

                if (cards && cards.length > 0) {
                    const h = classifyHand(cards);
                    if (h) {
                        executePlay(player, cards, h);
                        return;
                    }
                }

                // Emergency: opponent close to winning - force play even if it means using bombs
                if (isLeading) {
                    updateMessage('DouZero AI 不可用，电脑无法出牌');
                } else {
                    executePass(player);
                }
            },
            800 + Math.random() * 1000,
        );
    }

    function clearAITimer() {
        if (aiTimer !== null) {
            clearTimeout(aiTimer);
            aiTimer = null;
        }
    }

    function getLandlordCards(): Card[] {
        return [...landlordCards.value];
    }

    function getPlayerHand(player: PlayerIdx): Card[] {
        return [...hands.value[player]];
    }

    function getPlayerCardsSorted(player: PlayerIdx): Card[] {
        return [...hands.value[player]].sort(sortCards);
    }

    return {
        phase,
        hands,
        landlordCards,
        landlord,
        currentPlayer,
        lastPlay,
        lastPlayPlayer,
        playSeq,
        passCount,
        selectedCards,
        hintCards,
        message,
        bidder,
        bidPhase,
        currentBid,
        highestBidder,
        baseScore,
        multiplier,
        bombCount,
        springType,
        coins,
        roundNo,
        sessionEnded,
        roundHistory,
        playerCall,
        startGame,
        toggleSelect,
        isSelected,
        playerPlay,
        playerPass,
        playerHint,
        playerBidAction,
        getHand,
        getPlayerHand,
        getPlayerCardsSorted,
        getLandlordCards,
        clearAITimer,
    };
}
