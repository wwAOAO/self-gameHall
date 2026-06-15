<script setup lang="ts">
import { computed, ref } from 'vue';
import { Flag, Bomb } from 'lucide-vue-next';
import type { Cell as CellType } from '@/types/minesweeper';

const props = defineProps<{
    cell: CellType;
    gameOver: boolean;
}>();

const emit = defineEmits<{
    reveal: [payload: { row: number; col: number }];
    flag: [payload: { row: number; col: number }];
    chord: [payload: { row: number; col: number }];
}>();

const bothDown = ref(false);

const numberColors: Record<number, string> = {
    1: '#4a90d9',
    2: '#4caf50',
    3: '#e94560',
    4: '#1a237e',
    5: '#7b1fa2',
    6: '#00838f',
    7: '#212121',
    8: '#757575',
};

const cellClasses = computed(() => {
    const c = props.cell;
    if (c.isRevealed) {
        if (bothDown.value && c.adjacentMines > 0) {
            return 'bg-gray-600/80 border-gray-500/50 cursor-default';
        }
        return 'bg-gray-700/60 border-gray-600/30 cursor-default';
    }
    return 'bg-gray-700 border-gray-600/50 cursor-pointer hover:bg-gray-600 hover:border-gray-500 active:scale-95';
});

const content = computed(() => {
    const c = props.cell;
    if (!c.isRevealed) {
        if (c.isFlagged) return 'flag';
        return null;
    }
    if (c.isMine) return 'mine';
    if (c.adjacentMines > 0) return c.adjacentMines;
    return 'empty';
});

function handleClick() {
    if (props.cell.isRevealed && props.cell.adjacentMines > 0) {
        emit('chord', { row: props.cell.row, col: props.cell.col });
        return;
    }
    emit('reveal', { row: props.cell.row, col: props.cell.col });
}

function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    emit('flag', { row: props.cell.row, col: props.cell.col });
}

function handlePointerDown(e: PointerEvent) {
    if (e.buttons === 3 && props.cell.isRevealed && props.cell.adjacentMines > 0) {
        bothDown.value = true;
    }
}

function handlePointerUp() {
    if (bothDown.value) {
        emit('chord', { row: props.cell.row, col: props.cell.col });
        bothDown.value = false;
    }
}

function handlePointerLeave() {
    bothDown.value = false;
}
</script>

<template>
    <button
        :class="[
            'w-full h-full flex items-center justify-center border text-sm font-bold rounded-sm transition-all duration-100 select-none',
            cellClasses,
            cell.isDetonated && 'bg-red-600/60 border-red-500',
            cell.isRevealed && cell.isMine && !cell.isDetonated && 'bg-gray-700/60',
        ]"
        @click="handleClick"
        @contextmenu="handleContextMenu"
        @pointerdown="handlePointerDown"
        @pointerup="handlePointerUp"
        @pointerleave="handlePointerLeave"
    >
        <template v-if="content === 'flag'">
            <Flag class="w-4 h-4 text-red-400" />
        </template>
        <template v-else-if="content === 'mine'">
            <Bomb class="w-4 h-4 text-red-300" :class="{ 'animate-ping': cell.isDetonated }" />
        </template>
        <template v-else-if="typeof content === 'number'">
            <span :style="{ color: numberColors[content] || '#fff' }">{{ content }}</span>
        </template>
    </button>
</template>
