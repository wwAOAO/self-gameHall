<script setup lang="ts">
import { computed } from 'vue';
import type { GameStatus } from '@/types/minesweeper';

const props = defineProps<{
    gameStatus: GameStatus;
    timer: number;
}>();

const emit = defineEmits<{
    restart: [];
}>();

const show = computed(() => props.gameStatus === 'won' || props.gameStatus === 'lost');

const overlayContent = computed(() => {
    if (props.gameStatus === 'won') {
        return {
            title: '恭喜通关！',
            subtitle: `用时 ${props.timer} 秒`,
            emoji: '🎉',
            buttonText: '再来一局',
            accent: 'text-yellow-400',
            bg: 'from-yellow-500/20 to-amber-500/5',
            border: 'border-yellow-500/30',
        };
    }
    if (props.gameStatus === 'lost') {
        return {
            title: '踩雷了！',
            subtitle: '下次小心哦',
            emoji: '💥',
            buttonText: '重新开始',
            accent: 'text-red-400',
            bg: 'from-red-500/20 to-rose-500/5',
            border: 'border-red-500/30',
        };
    }
    return null;
});
</script>

<template>
    <Transition name="overlay">
        <div
            v-if="show"
            class="absolute inset-0 z-10 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-xl"
        >
            <div
                v-if="overlayContent"
                :class="[
                    'flex flex-col items-center gap-4 px-8 py-6 rounded-2xl bg-gray-800/90 border shadow-2xl',
                    overlayContent.bg,
                    overlayContent.border,
                ]"
            >
                <span class="text-5xl">{{ overlayContent.emoji }}</span>
                <h2 :class="['text-2xl font-bold', overlayContent.accent]">
                    {{ overlayContent.title }}
                </h2>
                <p class="text-gray-400 text-sm">{{ overlayContent.subtitle }}</p>
                <button
                    class="mt-2 px-6 py-2 rounded-xl font-medium transition-all duration-200 bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/30 active:scale-95"
                    @click="emit('restart')"
                >
                    {{ overlayContent.buttonText }}
                </button>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
.overlay-enter-active {
    transition: all 0.3s ease-out;
}
.overlay-leave-active {
    transition: all 0.2s ease-in;
}
.overlay-enter-from {
    opacity: 0;
}
.overlay-enter-from > div {
    transform: scale(0.8);
}
.overlay-leave-to {
    opacity: 0;
}
</style>
