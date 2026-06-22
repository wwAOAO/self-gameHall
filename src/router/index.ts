import { createRouter, createWebHistory } from 'vue-router';
import GameHub from '@/pages/GameHub.vue';
import MinesweeperPage from '@/pages/MinesweeperPage.vue';
import SnakePage from '@/pages/SnakePage.vue';
import TetrisPage from '@/pages/TetrisPage.vue';
import GoldMinerPage from '@/pages/GoldMinerPage.vue';
import TankBattlePage from '@/pages/TankBattlePage.vue';
import SpiderSolitairePage from '@/pages/SpiderSolitairePage.vue';
import FightTheLandlordPage from '@/pages/FightTheLandlordPage.vue';
import SokobanPage from '@/pages/SokobanPage.vue';
import SudokuPage from '@/pages/SudokuPage.vue';
import ChineseChessPage from '@/pages/ChineseChessPage.vue';
import ChineseChessLanPage from '@/pages/ChineseChessLanPage.vue';
import KlondikePage from '@/pages/KlondikePage.vue';
import GomokuPage from '@/pages/GomokuPage.vue';
import Connect6Page from '@/pages/Connect6Page.vue';
import SixPieceChessPage from '@/pages/SixPieceChessPage.vue';
import FlappyBirdPage from '@/pages/FlappyBirdPage.vue';
import JumpJumpPage from '@/pages/JumpJumpPage.vue';
import MahjongPage from '@/pages/MahjongPage.vue';
import BilliardsPage from '@/pages/BilliardsPage.vue';
import LudoPage from '@/pages/LudoPage.vue';
import MilitaryChessPage from '@/pages/MilitaryChessPage.vue';
import GoPage from '@/pages/GoPage.vue';
import InternationalChessPage from '@/pages/InternationalChessPage.vue';
import JapaneseShogiPage from '@/pages/JapaneseShogiPage.vue';
import TexasHoldemPage from '@/pages/TexasHoldemPage.vue';
import BlackjackPage from '@/pages/BlackjackPage.vue';
import Game2048Page from '@/pages/Game2048Page.vue';
import UnoLanPage from '@/pages/UnoLanPage.vue';
import FightLandlordLanPage from '@/pages/FightLandlordLanPage.vue';
import GomokuLanPage from '@/pages/GomokuLanPage.vue';
import ReversiPage from '@/pages/ReversiPage.vue';
import CheckersPage from '@/pages/CheckersPage.vue';

const routes = [
    {
        path: '/',
        name: 'home',
        component: GameHub,
    },
    {
        path: '/minesweeper',
        name: 'minesweeper',
        component: MinesweeperPage,
    },
    {
        path: '/snake',
        name: 'snake',
        component: SnakePage,
    },
    {
        path: '/tetris',
        name: 'tetris',
        component: TetrisPage,
    },
    {
        path: '/goldminer',
        name: 'goldminer',
        component: GoldMinerPage,
    },
    {
        path: '/tank',
        name: 'tank',
        component: TankBattlePage,
    },
    {
        path: '/spider',
        name: 'spider',
        component: SpiderSolitairePage,
    },
    {
        path: '/fight',
        name: 'fight',
        component: FightTheLandlordPage,
    },
    {
        path: '/fight-lan',
        name: 'fight-lan',
        component: FightLandlordLanPage,
    },
    {
        path: '/sokoban',
        name: 'sokoban',
        component: SokobanPage,
    },
    {
        path: '/sudoku',
        name: 'sudoku',
        component: SudokuPage,
    },
    {
        path: '/chess',
        name: 'chess',
        component: ChineseChessPage,
    },
    {
        path: '/chess-lan',
        name: 'chess-lan',
        component: ChineseChessLanPage,
    },
    {
        path: '/klondike',
        name: 'klondike',
        component: KlondikePage,
    },
    {
        path: '/gomoku',
        name: 'gomoku',
        component: GomokuPage,
    },
    {
        path: '/connect6',
        name: 'connect6',
        component: Connect6Page,
    },
    {
        path: '/six-piece-chess',
        name: 'six-piece-chess',
        component: SixPieceChessPage,
    },
    {
        path: '/gomoku-lan',
        name: 'gomoku-lan',
        component: GomokuLanPage,
    },
    {
        path: '/reversi',
        name: 'reversi',
        component: ReversiPage,
    },
    {
        path: '/checkers',
        name: 'checkers',
        component: CheckersPage,
    },
    {
        path: '/flappy',
        name: 'flappy',
        component: FlappyBirdPage,
    },
    {
        path: '/jump',
        name: 'jump',
        component: JumpJumpPage,
    },
    {
        path: '/mahjong',
        name: 'mahjong',
        component: MahjongPage,
    },
    {
        path: '/billiards',
        name: 'billiards',
        component: BilliardsPage,
    },
    {
        path: '/ludo',
        name: 'ludo',
        component: LudoPage,
    },
    {
        path: '/military',
        name: 'military',
        component: MilitaryChessPage,
    },
    {
        path: '/go',
        name: 'go',
        component: GoPage,
    },
    {
        path: '/international-chess',
        name: 'international-chess',
        component: InternationalChessPage,
    },
    {
        path: '/japanese-shogi',
        name: 'japanese-shogi',
        component: JapaneseShogiPage,
    },
    {
        path: '/texas-holdem',
        name: 'texas-holdem',
        component: TexasHoldemPage,
    },
    {
        path: '/blackjack',
        name: 'blackjack',
        component: BlackjackPage,
    },
    {
        path: '/uno',
        name: 'uno',
        component: UnoLanPage,
    },
    {
        path: '/2048',
        name: '2048',
        component: Game2048Page,
    },
    {
        path: '/fc',
        name: 'fc',
        component: () => import('@/pages/FcLibraryPage.vue'),
    },
    {
        path: '/fc/:id',
        name: 'fc-game',
        component: () => import('@/pages/FcGamePage.vue'),
    },
    {
        path: '/gba',
        name: 'gba',
        component: () => import('@/pages/GbaLibraryPage.vue'),
    },
    {
        path: '/gba/:id',
        name: 'gba-game',
        component: () => import('@/pages/GbaGamePage.vue'),
    },
];

const router = createRouter({
    history: createWebHistory(),
    routes,
});

export default router;


