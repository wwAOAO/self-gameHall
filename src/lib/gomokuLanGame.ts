export const GOMOKU_BOARD_SIZE = 15;
export const GOMOKU_PLAYER_COUNT = 2;

export type GomokuCell = 0 | 1 | 2;
export type GomokuPlayerId = 0 | 1;
export type GomokuPhase = 'lobby' | 'playing' | 'ended';
export type GomokuResult = 'playing' | 'black_win' | 'white_win' | 'draw';

export interface GomokuSnapshot {
    board: GomokuCell[][];
    currentPlayer: GomokuCell;
    phase: GomokuPhase;
    result: GomokuResult;
    winner: GomokuPlayerId | null;
    lastMove: [number, number] | null;
    winLine: [number, number][] | null;
    moveCount: number;
    message: string;
    turnNo: number;
}

export type GomokuAction =
    | { type: 'start' }
    | { type: 'restart' }
    | { type: 'place'; player: GomokuPlayerId; row: number; col: number };

const DIRECTIONS = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
];

export function createEmptyGomokuBoard(): GomokuCell[][] {
    return Array.from({ length: GOMOKU_BOARD_SIZE }, () => Array(GOMOKU_BOARD_SIZE).fill(0));
}

export function playerStone(player: GomokuPlayerId): GomokuCell {
    return player === 0 ? 1 : 2;
}

export function stonePlayer(stone: GomokuCell): GomokuPlayerId | null {
    if (stone === 1) return 0;
    if (stone === 2) return 1;
    return null;
}

function isInside(row: number, col: number): boolean {
    return row >= 0 && row < GOMOKU_BOARD_SIZE && col >= 0 && col < GOMOKU_BOARD_SIZE;
}

function checkWin(board: GomokuCell[][], row: number, col: number, player: GomokuCell): boolean {
    if (player === 0) return false;
    for (const [dr, dc] of DIRECTIONS) {
        let count = 1;
        for (let i = 1; i < 5; i++) {
            const r = row + dr * i;
            const c = col + dc * i;
            if (!isInside(r, c) || board[r][c] !== player) break;
            count++;
        }
        for (let i = 1; i < 5; i++) {
            const r = row - dr * i;
            const c = col - dc * i;
            if (!isInside(r, c) || board[r][c] !== player) break;
            count++;
        }
        if (count >= 5) return true;
    }
    return false;
}

function findWinLine(board: GomokuCell[][], row: number, col: number, player: GomokuCell): [number, number][] {
    for (const [dr, dc] of DIRECTIONS) {
        const line: [number, number][] = [];
        for (let i = -4; i <= 4; i++) {
            const r = row + dr * i;
            const c = col + dc * i;
            if (!isInside(r, c) || board[r][c] !== player) continue;
            line.push([r, c]);
        }
        if (line.length < 5) continue;

        const sorted = line.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        for (let i = 0; i <= sorted.length - 5; i++) {
            const seq = sorted.slice(i, i + 5);
            const valid = seq.every(([r, c], idx) => {
                if (idx === 0) return true;
                return r === seq[idx - 1][0] + dr && c === seq[idx - 1][1] + dc;
            });
            if (valid) return seq;
        }
    }
    return [];
}

export function createInitialGomokuState(): GomokuSnapshot {
    return {
        board: createEmptyGomokuBoard(),
        currentPlayer: 1,
        phase: 'lobby',
        result: 'playing',
        winner: null,
        lastMove: null,
        winLine: null,
        moveCount: 0,
        message: '创建房间后，让另一名玩家输入房间号加入。',
        turnNo: 0,
    };
}

export function createStartedGomokuState(): GomokuSnapshot {
    return {
        board: createEmptyGomokuBoard(),
        currentPlayer: 1,
        phase: 'playing',
        result: 'playing',
        winner: null,
        lastMove: null,
        winLine: null,
        moveCount: 0,
        message: '棋局开始，黑棋先行。',
        turnNo: 1,
    };
}

function cloneState(state: GomokuSnapshot): GomokuSnapshot {
    return JSON.parse(JSON.stringify(state));
}

export function applyGomokuAction(source: GomokuSnapshot, action: GomokuAction): GomokuSnapshot {
    if (action.type === 'start' || action.type === 'restart') return createStartedGomokuState();

    const state = cloneState(source);
    if (state.phase !== 'playing') return state;

    const stone = playerStone(action.player);
    if (stone !== state.currentPlayer) {
        state.message = '还没有轮到你落子。';
        return state;
    }
    if (!isInside(action.row, action.col) || state.board[action.row][action.col] !== 0) {
        state.message = '这里不能落子。';
        return state;
    }

    state.board[action.row][action.col] = stone;
    state.lastMove = [action.row, action.col];
    state.moveCount++;

    if (checkWin(state.board, action.row, action.col, stone)) {
        state.phase = 'ended';
        state.result = stone === 1 ? 'black_win' : 'white_win';
        state.winner = action.player;
        state.winLine = findWinLine(state.board, action.row, action.col, stone);
        state.message = stone === 1 ? '黑棋获胜。' : '白棋获胜。';
        return state;
    }

    if (state.moveCount >= GOMOKU_BOARD_SIZE * GOMOKU_BOARD_SIZE) {
        state.phase = 'ended';
        state.result = 'draw';
        state.message = '平局。';
        return state;
    }

    state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
    state.message = state.currentPlayer === 1 ? '轮到黑棋落子。' : '轮到白棋落子。';
    state.turnNo++;
    return state;
}
