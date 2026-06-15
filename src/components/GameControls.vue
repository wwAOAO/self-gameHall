<script setup lang="ts">
import { computed } from 'vue';
import { Bomb, Timer } from 'lucide-vue-next';
import type { GameStatus } from '@/types/minesweeper';

const props = defineProps<{
    timer: number;
    remainingMines: number;
    gameStatus: GameStatus;
    difficulties: Array<{ key: string; label: string; rows: number; cols: number; mines: number }>;
    currentDifficultyKey: string;
}>();

const emit = defineEmits<{
    restart: [];
    changeDifficulty: [key: string];
}>();

const formattedTimer = computed(() => {
    return String(Math.min(props.timer, 999)).padStart(3, '0');
});

const formattedMines = computed(() => {
    const val = Math.max(-99, Math.min(props.remainingMines, 999));
    return String(val).padStart(3, '0');
});

const faceButton = computed(() => {
    switch (props.gameStatus) {
        case 'won':
            return '😎';
        case 'lost':
            return '😵';
        case 'playing':
            return '😊';
        default:
            return '🙂';
    }
});
</script>

<template>
    <div class="flex flex-col items-center gap-3">
        <div class="flex items-center gap-2">
            <button
                v-for="diff in difficulties"
                :key="diff.key"
                class="px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 border"
                :class="
                    currentDifficultyKey === diff.key
                        ? 'bg-cyan-600 border-cyan-500 text-white shadow-lg shadow-cyan-600/30'
                        : 'bg-gray-700/50 border-gray-600/50 text-gray-300 hover:bg-gray-600 hover:border-gray-500'
                "
                @click="emit('changeDifficulty', diff.key)"
            >
                {{ diff.label }}
                <span class="text-xs opacity-60 ml-1">({{ diff.rows }}×{{ diff.cols }}/{{ diff.mines }})</span>
            </button>
        </div>

        <div class="flex items-center gap-4 bg-gray-800/60 rounded-xl px-5 py-2.5 border border-gray-700/50">
            <div class="flex items-center gap-1.5 min-w-[60px]">
                <Bomb class="w-4 h-4 text-red-400" />
                <span class="font-mono text-lg font-bold text-red-400 tabular-nums">{{ formattedMines }}</span>
            </div>

            <button
                class="text-2xl leading-none px-3 py-1 rounded-lg transition-all duration-200 hover:bg-gray-700 active:scale-90 select-none"
                :class="{
                    'animate-bounce': gameStatus === 'won',
                    'animate-shake': gameStatus === 'lost',
                }"
                @click="emit('restart')"
                :title="'重新开始'"
            >
                {{ faceButton }}
            </button>

            <div class="flex items-center gap-1.5 min-w-[60px]">
                <Timer class="w-4 h-4 text-cyan-400" />
                <span class="font-mono text-lg font-bold text-cyan-400 tabular-nums">{{ formattedTimer }}</span>
            </div>
        </div>
    </div>
</template>
