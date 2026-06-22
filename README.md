# Game Hall

一个基于 Vue 3、TypeScript、Vite 的网页游戏大厅。项目内置多款棋类、牌类和休闲游戏，并集成 GBA / FC 模拟器入口。部分棋类 AI 需要额外下载本地引擎后才能启用，否则会使用页面内置的简化 AI 或降级逻辑。

## 技术栈

- Vue 3 + Vue Router
- TypeScript
- Vite
- Tailwind CSS
- EmulatorJS
- Node.js Vite 中间件
- 可选本地 AI 引擎：Stockfish、Pikafish、Rapfi、KataGo、Connect6 KataGo、YaneuraOu、DouZero、Texas AI

## 快速开始

请先安装 Node.js 18 或更高版本。

```bash
npm install
npm run dev
```

开发服务启动后，按终端输出的地址访问。默认 Vite 会以局域网可访问方式启动。

构建生产包：

```bash
npm run build
```

本地预览生产包：

```bash
npm run preview
```

类型检查：

```bash
npm run check
```

## 目录说明

```text
src/pages/                 游戏页面
src/composables/           游戏逻辑
src/data/gbaGames.ts       GBA 游戏入口配置
src/data/fcGames.ts        FC 游戏入口配置
scripts/                   Vite 插件和本地 AI 桥接脚本
public/emulatorjs/         EmulatorJS 前端资源
public/roms/gba/           GBA ROM 放置目录
public/roms/fc/            FC ROM 放置目录
engines/                   本地 AI 引擎放置目录
```

## EmulatorJS 资源

项目依赖 `@emulatorjs/emulatorjs` 和 `@emulatorjs/cores`。执行 `npm run dev` 或 `npm run build` 时，会先运行：

```bash
node scripts/sync-emulatorjs-assets.mjs
```

该脚本会把 EmulatorJS 的 loader、样式、语言文件，以及 `fceumm`、`nestopia`、`mgba` 核心同步到 `public/emulatorjs/data`。一般不需要手动复制这些文件，只要正常执行 npm 脚本即可。

## GBA 使用说明

GBA 页面使用 EmulatorJS 的 `mgba` 核心。

使用方式：

1. 打开 GBA 游戏库页面。
2. 可以选择本地导入你拥有合法授权的 `.gba` 文件，导入后仅在当前浏览器会话中运行。
3. 也可以把 `.gba` 文件放到 `public/roms/gba/`，项目会自动生成 `public/roms/gba/manifest.json`，并在 GBA 游戏库中显示。

示例：

```text
public/roms/gba/sample.gba
public/roms/gba/your-game.gba
```

添加或删除 ROM 后，开发服务会监听目录并重新生成清单；构建时也会重新生成清单。

## FC 使用说明

FC 页面使用 EmulatorJS 的 `fceumm` / `nestopia` 核心。

支持文件：

- `.nes`
- `.zip`，压缩包中需要包含至少一个 `.nes` 文件

使用方式：

1. 打开 FC 游戏库页面。
2. 可以选择本地导入你拥有合法授权的 `.nes` 或 `.zip` 文件。
3. 也可以把 ROM 放到 `public/roms/fc/`，项目会自动生成 `public/roms/fc/manifest.json`，并在 FC 游戏库中显示。

示例：

```text
public/roms/fc/super-mario.nes
public/roms/fc/contra.zip
```

FC 的 zip 读取由 `scripts/fc-rom-manifest-vite-plugin.ts` 处理。进入游戏时，开发服务会通过 `/api/fc-rom/...` 读取 zip 中的 `.nes` 文件。

## Engines 下载与放置

`engines/` 目录用于存放可选本地 AI 引擎。由于引擎和模型文件通常较大，建议自行从官方发布页下载，不随项目源码提交。

建议目录结构：

```text
engines/
  stockfish/
    stockfish.exe
  pikafish/
    pikafish.exe
  rapfi/
    rapfi.exe
    pbrain-rapfi.exe
  katago/
    katago.exe
    gtp.cfg
    model.bin.gz
  connect6-katago/
    katago.exe
    engine.cfg
    connectsix19x_b18_20250801.bin.gz
  yaneuraou/
    YaneuraOu.exe
    eval/
      model.onnx
  douzero/
    douzero_ADP/
      landlord.ckpt
      landlord_up.ckpt
      landlord_down.ckpt
```

Windows 下通常使用 `.exe`。macOS / Linux 下去掉 `.exe`，并确保文件有可执行权限。

### Stockfish

用途：国际象棋 AI。

下载 Stockfish 后，将可执行文件放到：

```text
engines/stockfish/stockfish.exe
```

也可以通过环境变量指定：

```bash
STOCKFISH_EXECUTABLE=/absolute/path/to/stockfish
```

状态接口：

```text
/api/stockfish/status
```

### Pikafish

用途：中国象棋 AI。

下载 Pikafish 后，将可执行文件放到：

```text
engines/pikafish/pikafish.exe
```

也可以通过环境变量指定：

```bash
PIKAFISH_EXECUTABLE=/absolute/path/to/pikafish
```

状态接口：

```text
/api/pikafish/status
```

### Rapfi

用途：五子棋 AI。

下载 Rapfi 后，将可执行文件放到 `engines/rapfi/`。项目会依次查找这些常见文件名：

```text
rapfi.exe
pbrain-rapfi.exe
pbrain-rapfi-windows-avx2.exe
pbrain-rapfi-windows-sse.exe
pbrain-rapfi-windows-avxvnni.exe
pbrain-rapfi-windows-avx512.exe
pbrain-rapfi-windows-avx512vnni.exe
```

也可以通过环境变量指定：

```bash
RAPFI_EXECUTABLE=/absolute/path/to/rapfi
```

状态接口：

```text
/api/rapfi/status
```

### KataGo

用途：围棋 AI。

KataGo 至少需要三个文件：

- 可执行文件：`katago.exe`
- GTP 配置：如 `gtp.cfg`、`default_gtp.cfg` 或其他 `.cfg`
- 神经网络模型：如 `model.bin.gz`、`model.txt.gz`、`network.bin.gz`、`network.txt.gz`

推荐放置：

```text
engines/katago/katago.exe
engines/katago/gtp.cfg
engines/katago/model.bin.gz
```

也可以通过环境变量指定：

```bash
KATAGO_EXECUTABLE=/absolute/path/to/katago
KATAGO_CONFIG=/absolute/path/to/gtp.cfg
KATAGO_MODEL=/absolute/path/to/model.bin.gz
```

状态接口：

```text
/api/katago/status
```

### Connect6 KataGo

用途：六子棋 AI。

六子棋使用单独的 KataGo / KataGomo 引擎目录，避免和围棋 KataGo 的模型、配置混用。至少需要三个文件：

- 可执行文件：如 `katago.exe`、`katagomo.exe`、`katago-opencl.exe`
- GTP 配置：如 `engine.cfg`、`gtp.cfg`、`default_gtp.cfg`、`analysis.cfg`
- 六子棋模型：如 `connectsix19x_b18_20250801.bin.gz`、`model.bin.gz`、`network.bin.gz`

推荐放置：

```text
engines/connect6-katago/katago.exe
engines/connect6-katago/engine.cfg
engines/connect6-katago/connectsix19x_b18_20250801.bin.gz
```

也可以通过环境变量指定：

```bash
CONNECT6_KATAGO_EXECUTABLE=/absolute/path/to/katago
CONNECT6_KATAGO_CONFIG=/absolute/path/to/engine.cfg
CONNECT6_KATAGO_MODEL=/absolute/path/to/connectsix19x_b18_20250801.bin.gz
```

状态接口：

```text
/api/connect6-katago/status
```

### YaneuraOu

用途：日本将棋 AI。

下载 YaneuraOu 后，将可执行文件和评估模型放到：

```text
engines/yaneuraou/YaneuraOu.exe
engines/yaneuraou/eval/model.onnx
```

项目会在 `engines/yaneuraou/` 和 `engines/YaneuraOu/` 中查找常见的 YaneuraOu 可执行文件名，也可以通过环境变量指定：

```bash
YANEURAOU_EXECUTABLE=/absolute/path/to/YaneuraOu
```

状态接口：

```text
/api/yaneuraou/status
```

### DouZero

用途：斗地主 AI。

DouZero 通过 Python 桥接脚本 `scripts/douzero_bridge.py` 调用。项目会查找以下模型：

```text
engines/douzero/douzero_ADP/landlord.ckpt
engines/douzero/douzero_ADP/landlord_up.ckpt
engines/douzero/douzero_ADP/landlord_down.ckpt
```

也支持 `douzero_WP` 或 `baselines/douzero_ADP`、`baselines/douzero_WP` 目录。

如果 Python 命令不是默认的 `py -3` 或 `python3`，可以设置：

```bash
DOUZERO_PYTHON=/absolute/path/to/python
```

也可以分别指定模型：

```bash
DOUZERO_LANDLORD_MODEL=/absolute/path/to/landlord.ckpt
DOUZERO_LANDLORD_UP_MODEL=/absolute/path/to/landlord_up.ckpt
DOUZERO_LANDLORD_DOWN_MODEL=/absolute/path/to/landlord_down.ckpt
```

状态接口：

```text
/api/douzero/status
```

### Texas AI

用途：德州扑克 AI。

德州扑克 AI 通过 Python 桥接脚本 `scripts/texas_ai_bridge.py` 调用，当前不需要额外模型文件。如果 Python 命令不是默认的 `py -3` 或 `python3`，可以设置：

```bash
TEXAS_AI_PYTHON=/absolute/path/to/python
```

状态接口：

```text
/api/texas-ai/status
```

## 引擎不可用时

如果某个引擎没有下载或路径不正确，对应状态接口会返回 `available: false`，页面会尽量使用内置逻辑或提示不可用。引擎是增强 AI 体验的可选项，不影响普通前端页面启动。

## ROM 与版权

请只使用你拥有合法授权的 ROM 和模型文件。项目不会提供商业游戏 ROM，也不建议把 ROM、大模型、引擎二进制提交到公开仓库。

