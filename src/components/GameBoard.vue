<script setup lang="ts">
import { computed } from 'vue';
import Cell from './Cell.vue';
import type { Cell as CellType } from '@/types/minesweeper';
import type { GameStatus } from '@/types/minesweeper';

const props = defineProps<{
    board: CellType[][];
    rows: number;
    cols: number;
    gameStatus: GameStatus;
}>();

const emit = defineEmits<{
    reveal: [payload: { row: number; col: number }];
    flag: [payload: { row: number; col: number }];
    chord: [payload: { row: number; col: number }];
}>();

const cellSize = computed(() => {
    const maxWidth = Math.min(window.innerWidth - 40, 900);
    const maxHeight = window.innerHeight - 240;
    const sizeByWidth = Math.floor(maxWidth / props.cols);
    const sizeByHeight = Math.floor(maxHeight / props.rows);
    return Math.max(20, Math.min(sizeByWidth, sizeByHeight, 36));
});

const boardStyle = computed(() => ({
    display: 'grid',
    gridTemplateColumns: `repeat(${props.cols}, ${cellSize.value}px)`,
    gridTemplateRows: `repeat(${props.rows}, ${cellSize.value}px)`,
    gap: '1px',
}));

function handleReveal(payload: { row: number; col: number }) {
    emit('reveal', payload);
}

function handleFlag(payload: { row: number; col: number }) {
    emit('flag', payload);
}

function handleChord(payload: { row: number; col: number }) {
    emit('chord', payload);
}
</script>

<template>
    <div class="flex justify-center overflow-auto px-1 py-2">
        <div
            :style="boardStyle"
            class="bg-gray-800/40 rounded-lg p-1 border border-gray-700/50 shadow-lg shadow-black/20"
        >
            <template v-for="(row, rowIdx) in board" :key="rowIdx">
                <Cell
                    v-for="(cell, colIdx) in row"
                    :key="`${rowIdx}-${colIdx}`"
                    :cell="cell"
                    :game-over="gameStatus === 'lost' || gameStatus === 'won'"
                    @reveal="handleReveal"
                    @flag="handleFlag"
                    @chord="handleChord"
                />
            </template>
        </div>
    </div>
</template>
