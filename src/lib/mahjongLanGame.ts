export type MahjongPlayerId = 0 | 1 | 2 | 3;
export type MahjongSuit = 'wan' | 'tong' | 'suo' | 'feng' | 'jian';

export interface MahjongTile {
    id: string;
    suit: MahjongSuit;
    value: number;
    name: string;
}

export interface MahjongPlayerState {
    name: string;
    hand: MahjongTile[];
    discarded: MahjongTile[];
}

export interface MahjongSnapshot {
    players: [MahjongPlayerState, MahjongPlayerState, MahjongPlayerState, MahjongPlayerState];
    deck: MahjongTile[];
    currentPlayer: MahjongPlayerId;
    dealer: MahjongPlayerId;
    phase: 'lobby' | 'playing' | 'claim' | 'ended' | 'draw';
    winner: MahjongPlayerId | null;
    lastDiscard: MahjongTile | null;
    lastDiscardSeat: MahjongPlayerId | null;
    claimPlayers: MahjongPlayerId[];
    claimPassed: MahjongPlayerId[];
    message: string;
    turnNo: number;
}

export type MahjongAction =
    | { type: 'start' }
    | { type: 'restart' }
    | { type: 'discard'; player: MahjongPlayerId; tileId: string }
    | { type: 'claimWin'; player: MahjongPlayerId }
    | { type: 'passClaim'; player: MahjongPlayerId };

export const MAHJONG_PLAYER_COUNT = 4;

const TILE_NAMES: Record<MahjongSuit, string[]> = {
    wan: ['一万', '二万', '三万', '四万', '五万', '六万', '七万', '八万', '九万'],
    tong: ['一筒', '二筒', '三筒', '四筒', '五筒', '六筒', '七筒', '八筒', '九筒'],
    suo: ['一索', '二索', '三索', '四索', '五索', '六索', '七索', '八索', '九索'],
    feng: ['东风', '南风', '西风', '北风'],
    jian: ['红中', '发财', '白板'],
};

const TILE_SUITS: MahjongSuit[] = ['wan', 'tong', 'suo', 'feng', 'jian'];
const NUMBER_SUITS: MahjongSuit[] = ['wan', 'tong', 'suo'];
const SUIT_BASE: Record<MahjongSuit, number> = { wan: 0, tong: 9, suo: 18, feng: 27, jian: 31 };

function shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function makeDeck(): MahjongTile[] {
    const deck: MahjongTile[] = [];
    let id = 0;
    for (const suit of TILE_SUITS) {
        const max = TILE_NAMES[suit].length;
        for (let value = 1; value <= max; value++) {
            for (let copy = 0; copy < 4; copy++) {
                deck.push({
                    id: `${suit}-${value}-${copy}-${id++}`,
                    suit,
                    value,
                    name: TILE_NAMES[suit][value - 1],
                });
            }
        }
    }
    return shuffle(deck);
}

function createPlayers(): [MahjongPlayerState, MahjongPlayerState, MahjongPlayerState, MahjongPlayerState] {
    return [
        { name: '房主', hand: [], discarded: [] },
        { name: '玩家2', hand: [], discarded: [] },
        { name: '玩家3', hand: [], discarded: [] },
        { name: '玩家4', hand: [], discarded: [] },
    ];
}

function cloneState(state: MahjongSnapshot): MahjongSnapshot {
    return JSON.parse(JSON.stringify(state));
}

function normalizePlayerId(value: number): MahjongPlayerId {
    return (((value % MAHJONG_PLAYER_COUNT) + MAHJONG_PLAYER_COUNT) % MAHJONG_PLAYER_COUNT) as MahjongPlayerId;
}

function nextPlayer(player: MahjongPlayerId): MahjongPlayerId {
    return normalizePlayerId(player + 1);
}

export function sortMahjongHand(hand: MahjongTile[]): MahjongTile[] {
    const suitOrder: Record<MahjongSuit, number> = { wan: 0, tong: 1, suo: 2, feng: 3, jian: 4 };
    return [...hand].sort((a, b) => suitOrder[a.suit] - suitOrder[b.suit] || a.value - b.value);
}

function isNumberSuit(suit: MahjongSuit): boolean {
    return NUMBER_SUITS.includes(suit);
}

function tileIndex(suit: MahjongSuit, value: number): number {
    return SUIT_BASE[suit] + value - 1;
}

function tileFromIndex(index: number): Omit<MahjongTile, 'id'> {
    const suit = TILE_SUITS.find(item => index >= SUIT_BASE[item] && index < SUIT_BASE[item] + TILE_NAMES[item].length)!;
    const value = index - SUIT_BASE[suit] + 1;
    return { suit, value, name: TILE_NAMES[suit][value - 1] };
}

function tileCounts(hand: MahjongTile[]): number[] {
    const counts = Array(34).fill(0);
    for (const tile of hand) counts[tileIndex(tile.suit, tile.value)]++;
    return counts;
}

function canSevenPairs(counts: number[], total: number): boolean {
    if (total !== 14) return false;
    let pairs = 0;
    for (const count of counts) {
        if (count === 0) continue;
        if (count === 2) pairs++;
        else if (count === 4) pairs += 2;
        else return false;
    }
    return pairs === 7;
}

function canFormMelds(counts: number[], memo: Map<string, boolean>): boolean {
    const first = counts.findIndex(count => count > 0);
    if (first < 0) return true;

    const key = counts.join(',');
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    if (counts[first] >= 3) {
        counts[first] -= 3;
        if (canFormMelds(counts, memo)) {
            counts[first] += 3;
            memo.set(key, true);
            return true;
        }
        counts[first] += 3;
    }

    const tile = tileFromIndex(first);
    if (isNumberSuit(tile.suit) && tile.value <= 7) {
        const second = tileIndex(tile.suit, tile.value + 1);
        const third = tileIndex(tile.suit, tile.value + 2);
        if (counts[second] > 0 && counts[third] > 0) {
            counts[first]--;
            counts[second]--;
            counts[third]--;
            if (canFormMelds(counts, memo)) {
                counts[first]++;
                counts[second]++;
                counts[third]++;
                memo.set(key, true);
                return true;
            }
            counts[first]++;
            counts[second]++;
            counts[third]++;
        }
    }

    memo.set(key, false);
    return false;
}

export function canMahjongWin(hand: MahjongTile[]): boolean {
    if (hand.length % 3 !== 2) return false;

    const counts = tileCounts(hand);
    if (canSevenPairs(counts, hand.length)) return true;

    for (let i = 0; i < counts.length; i++) {
        if (counts[i] < 2) continue;
        counts[i] -= 2;
        if (canFormMelds(counts, new Map())) {
            counts[i] += 2;
            return true;
        }
        counts[i] += 2;
    }
    return false;
}

export function createInitialMahjongState(): MahjongSnapshot {
    return {
        players: createPlayers(),
        deck: [],
        currentPlayer: 0,
        dealer: 0,
        phase: 'lobby',
        winner: null,
        lastDiscard: null,
        lastDiscardSeat: null,
        claimPlayers: [],
        claimPassed: [],
        message: '创建房间后，让另外三名玩家输入房间号加入。',
        turnNo: 0,
    };
}

function drawForPlayer(state: MahjongSnapshot, player: MahjongPlayerId): boolean {
    const tile = state.deck.shift();
    if (!tile) {
        state.phase = 'draw';
        state.message = '牌墙摸完，本局流局。';
        return false;
    }
    state.players[player].hand = sortMahjongHand([...state.players[player].hand, tile]);
    return true;
}

export function createDealtMahjongState(): MahjongSnapshot {
    const deck = makeDeck();
    const players = createPlayers();
    for (let round = 0; round < 13; round++) {
        for (const player of players) {
            player.hand.push(deck.shift()!);
        }
    }

    const state: MahjongSnapshot = {
        players,
        deck,
        currentPlayer: 0,
        dealer: 0,
        phase: 'playing',
        winner: null,
        lastDiscard: null,
        lastDiscardSeat: null,
        claimPlayers: [],
        claimPassed: [],
        message: '牌局开始，房主坐庄，请先出牌。',
        turnNo: 1,
    };
    drawForPlayer(state, 0);
    for (const player of state.players) player.hand = sortMahjongHand(player.hand);
    return state;
}

function continueAfterClaim(state: MahjongSnapshot) {
    const from = state.lastDiscardSeat;
    state.lastDiscard = null;
    state.lastDiscardSeat = null;
    state.claimPlayers = [];
    state.claimPassed = [];
    if (from === null) return;
    const target = nextPlayer(from);
    state.currentPlayer = target;
    state.phase = 'playing';
    if (drawForPlayer(state, target)) {
        state.message = `轮到${state.players[target].name}摸牌出牌。`;
        state.turnNo++;
    }
}

export function applyMahjongAction(source: MahjongSnapshot, action: MahjongAction): MahjongSnapshot {
    if (action.type === 'start' || action.type === 'restart') return createDealtMahjongState();

    const state = cloneState(source);

    if (action.type === 'claimWin') {
        if (state.phase !== 'claim' || !state.lastDiscard || !state.claimPlayers.includes(action.player)) return state;
        state.players[action.player].hand = sortMahjongHand([...state.players[action.player].hand, state.lastDiscard]);
        state.phase = 'ended';
        state.winner = action.player;
        state.message = `${state.players[action.player].name}胡了${state.players[state.lastDiscardSeat ?? 0].name}打出的${state.lastDiscard.name}。`;
        state.claimPlayers = [];
        state.claimPassed = [];
        return state;
    }

    if (action.type === 'passClaim') {
        if (state.phase !== 'claim' || !state.claimPlayers.includes(action.player)) return state;
        if (!state.claimPassed.includes(action.player)) state.claimPassed.push(action.player);
        if (state.claimPlayers.every(player => state.claimPassed.includes(player))) continueAfterClaim(state);
        else state.message = `${state.players[action.player].name}选择过，等待其他可胡玩家。`;
        return state;
    }

    if (action.type !== 'discard' || state.phase !== 'playing' || action.player !== state.currentPlayer) return state;

    const hand = state.players[action.player].hand;
    const tileIndexInHand = hand.findIndex(tile => tile.id === action.tileId);
    if (tileIndexInHand < 0 || hand.length % 3 !== 2) return state;

    const [tile] = hand.splice(tileIndexInHand, 1);
    state.players[action.player].hand = sortMahjongHand(hand);
    state.players[action.player].discarded.push(tile);
    state.lastDiscard = tile;
    state.lastDiscardSeat = action.player;
    state.claimPassed = [];

    const claimPlayers = state.players
        .map((player, id) => ({ player, id: id as MahjongPlayerId }))
        .filter(seat => seat.id !== action.player && canMahjongWin([...seat.player.hand, tile]))
        .map(seat => seat.id);

    if (claimPlayers.length > 0) {
        state.phase = 'claim';
        state.claimPlayers = claimPlayers;
        state.message = `${state.players[action.player].name}打出${tile.name}，可胡玩家请选择。`;
        return state;
    }

    state.claimPlayers = [];
    state.claimPassed = [];
    const target = nextPlayer(action.player);
    state.currentPlayer = target;
    if (drawForPlayer(state, target)) {
        state.message = `${state.players[action.player].name}打出${tile.name}，轮到${state.players[target].name}。`;
        state.turnNo++;
    }
    return state;
}

export function mahjongTileLabel(tile: MahjongTile): string {
    return tile.name;
}
