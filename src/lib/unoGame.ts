export type UnoColor = 'red' | 'yellow' | 'green' | 'blue' | 'wild';
export type UnoKind = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';
export type PlayerId = 0 | 1 | 2 | 3;

export interface UnoCard {
    id: string;
    color: UnoColor;
    kind: UnoKind;
    value?: number;
}

export interface PlayerState {
    name: string;
    hand: UnoCard[];
}

export interface UnoSnapshot {
    players: [PlayerState, PlayerState, PlayerState, PlayerState];
    deck: UnoCard[];
    discard: UnoCard[];
    currentPlayer: PlayerId;
    direction: 1 | -1;
    drawnCardId: string | null;
    pendingColor: UnoColor | null;
    phase: 'lobby' | 'playing' | 'ended';
    winner: PlayerId | null;
    message: string;
    turnNo: number;
}

export type UnoAction =
    | { type: 'start' }
    | { type: 'play'; player: PlayerId; cardId: string; color?: UnoColor }
    | { type: 'draw'; player: PlayerId }
    | { type: 'keep'; player: PlayerId }
    | { type: 'restart' };

export const UNO_PLAYER_COUNT = 4;
export const UNO_COLORS: Exclude<UnoColor, 'wild'>[] = ['red', 'yellow', 'green', 'blue'];

export const UNO_COLOR_LABELS: Record<UnoColor, string> = {
    red: '红',
    yellow: '黄',
    green: '绿',
    blue: '蓝',
    wild: '万能',
};

export const UNO_KIND_LABELS: Record<UnoKind, string> = {
    number: '',
    skip: '禁',
    reverse: '转',
    draw2: '+2',
    wild: '变色',
    wild4: '+4',
};

function shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function makeDeck(): UnoCard[] {
    const deck: UnoCard[] = [];
    let id = 0;
    for (const color of UNO_COLORS) {
        deck.push({ id: `${color}-0-${id++}`, color, kind: 'number', value: 0 });
        for (let value = 1; value <= 9; value++) {
            deck.push({ id: `${color}-${value}-a-${id++}`, color, kind: 'number', value });
            deck.push({ id: `${color}-${value}-b-${id++}`, color, kind: 'number', value });
        }
        for (const kind of ['skip', 'reverse', 'draw2'] as const) {
            deck.push({ id: `${color}-${kind}-a-${id++}`, color, kind });
            deck.push({ id: `${color}-${kind}-b-${id++}`, color, kind });
        }
    }
    for (let i = 0; i < 4; i++) {
        deck.push({ id: `wild-${i}-${id++}`, color: 'wild', kind: 'wild' });
        deck.push({ id: `wild4-${i}-${id++}`, color: 'wild', kind: 'wild4' });
    }
    return shuffle(deck);
}

function createPlayers(): [PlayerState, PlayerState, PlayerState, PlayerState] {
    return [
        { name: '房主', hand: [] },
        { name: '玩家2', hand: [] },
        { name: '玩家3', hand: [] },
        { name: '玩家4', hand: [] },
    ];
}

export function createInitialUnoState(): UnoSnapshot {
    return {
        players: createPlayers(),
        deck: [],
        discard: [],
        currentPlayer: 0,
        direction: 1,
        drawnCardId: null,
        pendingColor: null,
        phase: 'lobby',
        winner: null,
        message: '创建房间后，让另外三名玩家输入房间号加入。',
        turnNo: 0,
    };
}

export function createDealtUnoState(): UnoSnapshot {
    const deck = makeDeck();
    const players = createPlayers();
    for (const player of players) {
        player.hand = deck.splice(0, 7);
    }

    let first = deck.shift()!;
    while (first.color === 'wild' || first.kind !== 'number') {
        deck.push(first);
        first = deck.shift()!;
    }

    return {
        players,
        deck,
        discard: [first],
        currentPlayer: 0,
        direction: 1,
        drawnCardId: null,
        pendingColor: first.color,
        phase: 'playing',
        winner: null,
        message: '牌局开始，房主先手。',
        turnNo: 1,
    };
}

function cloneState(state: UnoSnapshot): UnoSnapshot {
    return JSON.parse(JSON.stringify(state));
}

function normalizeColor(color: UnoColor | null): UnoColor {
    return color && color !== 'wild' ? color : 'red';
}

function normalizePlayerId(value: number): PlayerId {
    const wrapped = ((value % UNO_PLAYER_COUNT) + UNO_PLAYER_COUNT) % UNO_PLAYER_COUNT;
    return wrapped as PlayerId;
}

function stepPlayer(current: PlayerId, direction: 1 | -1, steps = 1): PlayerId {
    return normalizePlayerId(current + direction * steps);
}

export function canPlayUnoCard(card: UnoCard, top: UnoCard, activeColor: UnoColor | null): boolean {
    if (card.color === 'wild') return true;
    if (card.color === activeColor) return true;
    if (card.color === top.color) return true;
    if (card.kind === top.kind && card.kind !== 'number') return true;
    return card.kind === 'number' && top.kind === 'number' && card.value === top.value;
}

function drawCards(state: UnoSnapshot, player: PlayerId, count: number) {
    for (let i = 0; i < count; i++) {
        if (state.deck.length === 0) {
            const top = state.discard.pop();
            state.deck = shuffle(state.discard);
            state.discard = top ? [top] : [];
        }
        const card = state.deck.shift();
        if (card) state.players[player].hand.push(card);
    }
}

export function unoCardLabel(card: UnoCard): string {
    if (card.kind === 'number') return `${UNO_COLOR_LABELS[card.color]} ${card.value}`;
    return `${card.color === 'wild' ? '' : UNO_COLOR_LABELS[card.color]} ${UNO_KIND_LABELS[card.kind]}`.trim();
}

export function applyUnoAction(source: UnoSnapshot, action: UnoAction): UnoSnapshot {
    if (action.type === 'start' || action.type === 'restart') return createDealtUnoState();

    const state = cloneState(source);
    if (state.phase !== 'playing' || action.player !== state.currentPlayer) return state;

    const player = action.player;
    const top = state.discard[state.discard.length - 1];

    if (action.type === 'draw') {
        if (state.drawnCardId) {
            state.message = `${state.players[player].name}本回合已经摸过牌。`;
            return state;
        }
        drawCards(state, player, 1);
        const drawn = state.players[player].hand[state.players[player].hand.length - 1];
        state.drawnCardId = drawn?.id || null;
        state.message =
            drawn && canPlayUnoCard(drawn, top, state.pendingColor)
                ? `${state.players[player].name}摸到一张可出的牌，可以打出或保留。`
                : `${state.players[player].name}摸牌，只能保留并结束。`;
        return state;
    }

    if (action.type === 'keep') {
        if (!state.drawnCardId) {
            state.message = '需要先摸一张牌，才能保留并结束。';
            return state;
        }
        state.drawnCardId = null;
        state.currentPlayer = stepPlayer(player, state.direction);
        state.message = `${state.players[player].name}保留手牌，轮到${state.players[state.currentPlayer].name}。`;
        state.turnNo++;
        return state;
    }

    const cardIndex = state.players[player].hand.findIndex(card => card.id === action.cardId);
    if (action.type !== 'play' || cardIndex < 0) return state;
    const card = state.players[player].hand[cardIndex];

    if (state.drawnCardId && card.id !== state.drawnCardId) {
        state.message = '摸牌后只能打出刚摸到的牌，或保留并结束。';
        return state;
    }
    if (!canPlayUnoCard(card, top, state.pendingColor)) {
        state.message = '这张牌现在不能出。';
        return state;
    }

    state.players[player].hand.splice(cardIndex, 1);
    state.discard.push(card);
    state.drawnCardId = null;
    state.pendingColor = card.color === 'wild' ? normalizeColor(action.color || null) : card.color;

    if (state.players[player].hand.length === 0) {
        state.phase = 'ended';
        state.winner = player;
        state.message = `${state.players[player].name}出完手牌，赢下本局。`;
        return state;
    }

    if (card.kind === 'reverse') {
        state.direction = state.direction === 1 ? -1 : 1;
        state.currentPlayer = stepPlayer(player, state.direction);
        state.message = `${state.players[player].name}打出${unoCardLabel(card)}，方向反转，轮到${state.players[state.currentPlayer].name}。`;
    } else if (card.kind === 'skip') {
        const skipped = stepPlayer(player, state.direction);
        state.currentPlayer = stepPlayer(player, state.direction, 2);
        state.message = `${state.players[player].name}打出${unoCardLabel(card)}，${state.players[skipped].name}被跳过。`;
    } else if (card.kind === 'draw2') {
        const target = stepPlayer(player, state.direction);
        drawCards(state, target, 2);
        state.currentPlayer = stepPlayer(player, state.direction, 2);
        state.message = `${state.players[player].name}打出${unoCardLabel(card)}，${state.players[target].name}摸2张并跳过。`;
    } else if (card.kind === 'wild4') {
        const target = stepPlayer(player, state.direction);
        drawCards(state, target, 4);
        state.currentPlayer = stepPlayer(player, state.direction, 2);
        state.message = `${state.players[player].name}打出+4并指定${UNO_COLOR_LABELS[state.pendingColor]}色，${state.players[target].name}摸4张并跳过。`;
    } else {
        state.currentPlayer = stepPlayer(player, state.direction);
        state.message = `${state.players[player].name}打出${unoCardLabel(card)}，轮到${state.players[state.currentPlayer].name}。`;
    }
    state.turnNo++;
    return state;
}
