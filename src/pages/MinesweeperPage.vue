<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useMinesweeper } from '@/composables/useMinesweeper';
import GameControls from '@/components/GameControls.vue';
import GameBoard from '@/components/GameBoard.vue';
import GameOverlay from '@/components/GameOverlay.vue';
import { ArrowLeft } from 'lucide-vue-next';

const router = useRouter();
const game = useMinesweeper();
</script>

<template>
    <div
        class="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800 flex flex-col items-center select-none"
    >
        <header class="pt-4 pb-1 w-full max-w-4xl px-4">
            <div class="flex items-center gap-3">
                <button
                    class="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors duration-200 text-sm"
                    @click="router.push('/')"
                >
                    <ArrowLeft class="w-4 h-4" />
                    返回
                </button>
                <h1 class="text-xl sm:text-2xl font-bold tracking-tight flex-1 text-center mr-10">
                    <span class="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">扫雷</span>
                    <span class="text-gray-600 text-base ml-2">Minesweeper</span>
                </h1>
            </div>
        </header>

        <main class="flex-1 flex flex-col items-center gap-3 pb-8 px-2 max-w-full">
            <GameControls
                :timer="game.timer.value"
                :remaining-mines="game.remainingMines.value"
                :game-status="game.gameStatus.value"
                :difficulties="game.allDifficulties.value"
                :current-difficulty-key="game.difficultyKey.value"
                @restart="game.initGame()"
                @change-difficulty="game.initGame($event)"
            />

            <div class="relative">
                <GameBoard
                    :board="game.board.value"
                    :rows="game.rows.value"
                    :cols="game.cols.value"
                    :game-status="game.gameStatus.value"
                    @reveal="game.revealCell($event.row, $event.col)"
                    @flag="game.toggleFlag($event.row, $event.col)"
                    @chord="game.chordClick($event.row, $event.col)"
                />
                <GameOverlay
                    :game-status="game.gameStatus.value"
                    :timer="game.timer.value"
                    @restart="game.initGame()"
                />
            </div>
        </main>
    </div>
</template>
