export interface Cell {
    row: number;
    col: number;
    isMine: boolean;
    isRevealed: boolean;
    isFlagged: boolean;
    adjacentMines: number;
    isDetonated: boolean;
}

export type GameStatus = 'idle' | 'playing' | 'won' | 'lost';

export interface Difficulty {
    label: string;
    rows: number;
    cols: number;
    mines: number;
}

export interface GameState {
    board: Cell[][];
    rows: number;
    cols: number;
    totalMines: number;
    flagCount: number;
    revealedCount: number;
    status: GameStatus;
    difficulty: Difficulty;
    timer: number;
}

export const DIFFICULTIES: Record<string, Difficulty> = {
    beginner: { label: '初级', rows: 9, cols: 9, mines: 10 },
    intermediate: { label: '中级', rows: 16, cols: 16, mines: 40 },
    expert: { label: '高级', rows: 16, cols: 30, mines: 99 },
};
