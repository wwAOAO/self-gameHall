import {
    clonePieces,
    createInitialPieces,
    getLegalMovesForPiece,
    getPieceAt,
    isCheckmate,
    isInCheck,
    isStalemate,
    oppositeSide,
    type Piece,
    type Side,
} from '../composables/useChineseChess';

export type ChineseChessPlayerId = 0 | 1;
export type ChineseChessPhase = 'lobby' | 'playing' | 'ended';

export interface ChineseChessMoveRecord {
    side: Side;
    fromRow: number;
    fromCol: number;
    toRow: number;
    toCol: number;
    captured: Piece | null;
    label: string;
}

export interface ChineseChessSnapshot {
    pieces: Piece[];
    currentSide: Side;
    phase: ChineseChessPhase;
    winner: Side | null;
    message: string;
    lastMove: ChineseChessMoveRecord | null;
    moveHistory: string[];
    turnNo: number;
}

export type ChineseChessAction =
    | { type: 'start' }
    | { type: 'restart' }
    | { type: 'move'; player: ChineseChessPlayerId; fromRow: number; fromCol: number; toRow: number; toCol: number };

export const CHINESE_CHESS_PLAYER_COUNT = 2;

export function playerSide(player: ChineseChessPlayerId): Side {
    return player === 0 ? 'red' : 'black';
}

function sideName(side: Side): string {
    return side === 'red' ? '\u7ea2\u65b9' : '\u9ed1\u65b9';
}

function pieceName(piece: Piece): string {
    const names = {
        red: { king: '\u5e05', advisor: '\u4ed5', elephant: '\u76f8', horse: '\u9a6c', rook: '\u8f66', cannon: '\u70ae', pawn: '\u5175' },
        black: { king: '\u5c06', advisor: '\u58eb', elephant: '\u8c61', horse: '\u9a6c', rook: '\u8f66', cannon: '\u7832', pawn: '\u5352' },
    } as const;
    return names[piece.side][piece.type];
}

function moveLabel(piece: Piece, toRow: number, toCol: number): string {
    const dir = toRow < piece.row ? '\u8fdb' : toRow > piece.row ? '\u9000' : toCol > piece.col ? '\u8fdb' : '\u9000';
    const redCols = ['\u4e00', '\u4e8c', '\u4e09', '\u56db', '\u4e94', '\u516d', '\u4e03', '\u516b', '\u4e5d'];
    const blackCols = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const colNames = piece.side === 'red' ? redCols : blackCols;
    const fromCol = colNames[piece.col];
    const targetCol = colNames[toCol];
    if (piece.type === 'horse' || piece.type === 'elephant' || piece.type === 'advisor') {
        return `${pieceName(piece)}${fromCol}${dir}${targetCol}`;
    }
    const dist = Math.abs(toRow !== piece.row ? toRow - piece.row : toCol - piece.col);
    const distStr =
        piece.side === 'red'
            ? ['\u96f6', '\u4e00', '\u4e8c', '\u4e09', '\u56db', '\u4e94', '\u516d', '\u4e03', '\u516b', '\u4e5d'][dist] || `${dist}`
            : `${dist}`;
    return `${pieceName(piece)}${fromCol}${dir}${distStr}`;
}

export function createInitialChineseChessState(): ChineseChessSnapshot {
    return {
        pieces: createInitialPieces(),
        currentSide: 'red',
        phase: 'lobby',
        winner: null,
        message: '\u521b\u5efa\u623f\u95f4\u540e\uff0c\u628a\u623f\u95f4\u53f7\u53d1\u7ed9\u540c\u4e00\u5c40\u57df\u7f51\u91cc\u7684\u53e6\u4e00\u540d\u73a9\u5bb6\u3002',
        lastMove: null,
        moveHistory: [],
        turnNo: 0,
    };
}

export function createStartedChineseChessState(): ChineseChessSnapshot {
    return {
        pieces: createInitialPieces(),
        currentSide: 'red',
        phase: 'playing',
        winner: null,
        message: '\u68cb\u5c40\u5f00\u59cb\uff0c\u7ea2\u65b9\u5148\u884c\u3002',
        lastMove: null,
        moveHistory: [],
        turnNo: 1,
    };
}

function cloneState(state: ChineseChessSnapshot): ChineseChessSnapshot {
    return JSON.parse(JSON.stringify(state));
}

export function applyChineseChessAction(source: ChineseChessSnapshot, action: ChineseChessAction): ChineseChessSnapshot {
    if (action.type === 'start' || action.type === 'restart') return createStartedChineseChessState();

    const state = cloneState(source);
    if (state.phase !== 'playing') return state;

    const side = playerSide(action.player);
    if (state.currentSide !== side) {
        state.message = '\u8fd8\u6ca1\u6709\u8f6e\u5230\u4f60\u8d70\u68cb\u3002';
        return state;
    }

    const piece = getPieceAt(state.pieces, action.fromRow, action.fromCol);
    if (!piece || piece.side !== side) {
        state.message = '\u8bf7\u9009\u62e9\u81ea\u5df1\u7684\u68cb\u5b50\u3002';
        return state;
    }

    const legal = getLegalMovesForPiece(piece, state.pieces).some(([row, col]) => row === action.toRow && col === action.toCol);
    if (!legal) {
        state.message = '\u8fd9\u6b65\u68cb\u4e0d\u7b26\u5408\u89c4\u5219\u3002';
        return state;
    }

    const nextPieces = clonePieces(state.pieces);
    const moving = getPieceAt(nextPieces, action.fromRow, action.fromCol);
    if (!moving) return state;
    const captured = getPieceAt(nextPieces, action.toRow, action.toCol);
    const capturedRecord = captured ? { ...captured } : null;
    const label = moveLabel(moving, action.toRow, action.toCol);

    moving.row = action.toRow;
    moving.col = action.toCol;
    if (captured) captured.alive = false;

    const opponent = oppositeSide(side);
    state.pieces = nextPieces;
    state.lastMove = {
        side,
        fromRow: action.fromRow,
        fromCol: action.fromCol,
        toRow: action.toRow,
        toCol: action.toCol,
        captured: capturedRecord,
        label,
    };
    state.moveHistory.push(`${side === 'red' ? '\u7ea2' : '\u9ed1'}: ${label}`);
    state.turnNo++;

    const opponentKing = state.pieces.find(item => item.alive && item.type === 'king' && item.side === opponent);
    if (!opponentKing) {
        state.phase = 'ended';
        state.winner = side;
        state.message = `${sideName(side)}\u83b7\u80dc\uff01`;
        return state;
    }

    if (isCheckmate(state.pieces, opponent)) {
        state.phase = 'ended';
        state.winner = side;
        state.message = `${sideName(side)}\u5c06\u6b7b\u83b7\u80dc\uff01`;
        return state;
    }

    if (isStalemate(state.pieces, opponent)) {
        state.phase = 'ended';
        state.winner = null;
        state.message = '\u56f0\u6bd9\uff0c\u548c\u68cb\u3002';
        return state;
    }

    state.currentSide = opponent;
    state.message = isInCheck(state.pieces, opponent)
        ? `\u5c06\u519b\uff01${sideName(opponent)}\u8bf7\u5e94\u5c06\u3002`
        : `\u8f6e\u5230${sideName(opponent)}\u8d70\u68cb\u3002`;
    return state;
}
