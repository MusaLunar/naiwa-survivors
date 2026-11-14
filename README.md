# 奶蛙幸存者 (Naiwa Survivors)

以「奶蛙艺术圣殿」为世界观的类《吸血鬼幸存者》网页动作肉鸽生存游戏，可纯静态构建并一键部署至 GitHub Pages。

## 核心特色
- **深度联动馆藏素材与叙事**：素材全部源自 [Orliss/nailong](https://github.com/Orliss/nailong)（MIT 协议），并在「圣殿图鉴」中收录原作名画、大笑变体与配套 `.txt` 叙事档案。
- **完整幸存者玩法循环**：5 名可选奶蛙角色、8 种基础武器 + 6 种圣物 + **6 组超武进化**、递增波次与《奶破蛙》《天启四奶蛙》《大天使长的最后审判》名画 Boss 战、双难度地图与局外「香油功德强化商店」。
- **桌面与移动端兼顾**：桌面端支持 `WASD` / 方向键与 `1/2/3` 快捷选卡，移动端支持全屏自适应与触屏虚拟摇杆。
- **零外部音频依赖**：内置 Web Audio API 合成圣殿音效与背景节拍。

## 本地开发

```bash
npm install
# 可选：重新从 Orliss/nailong 拉取并生成轻量 WebP 素材与图鉴清单
npm run assets
npm run dev
```

## 验证命令

```bash
npm run assets:verify
npm run typecheck
npm test
npm run build
```

## GitHub Pages 自动部署

仓库已内置 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)。推送至 `main` 分支后，在 GitHub 仓库 `Settings -> Pages -> Source` 选择 **GitHub Actions** 即可自动完成构建与发布。

## 素材授权说明

游戏内图片与叙事文本源自 [Orliss/nailong](https://github.com/Orliss/nailong)（MIT License）。部分表情包原形象仅供非商业粉丝二创交流，请勿用于商业用途。
