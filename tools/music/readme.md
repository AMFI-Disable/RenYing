# 配乐源文件

`assets/music/` 里的九首曲子都从这里的 Python 脚本生成：脚本里写谱（MIDI），用 FluidSynth 按声部渲染，再用 numpy 做每个声部的均衡、声像、卷积混响，最后总线压缩、真峰值限幅，按响度拉平后编码成 mp3。循环曲渲染三遍取中间一遍，首尾无缝。

| 脚本 | 曲子 |
| --- | --- |
| `menu.py` | `menu`：主页「山河入梦」 |
| `battle.py` | `battle`：对战「刃影交锋」，`overtime`：加时 |
| `rest.py` | `select` 选人「点将台」、`practice` 木人桩「竹院晨练」、`gacha` 武库「藏锋阁」，和 `victory`、`defeat`、`legendary` 三段短曲 |

工具：`song.py`（一首曲子 = 声部 + 合成层 + 渲染流程，以及记谱用的 `line`、`arp`、`block`、`swell`），`midi.py`（写 MIDI），`mixlib.py`（混音、合成打击乐和氛围层、编码），`analyze.py`（频谱图、每倍频程能量、响度曲线），`stems.py`（每个声部占多少响度），`seam.py`（查循环接缝）。

## 需要

- Python 3 和 numpy（`analyze.py` 还要 Pillow）
- FluidSynth 2.3 以上、ffmpeg（带 libmp3lame）
- MuseScore General 音色库（`MuseScore_General_Full.sf3`）。Ubuntu 装 `musescore-general-soundfont` 就在 `/usr/share/sounds/sf3/`；放在别处的话用环境变量 `MUSIC_SF` 指过去

## 用法

```sh
cd tools/music
python3 battle.py                 # 输出 out/battle.mp3、out/overtime.mp3
python3 rest.py select gacha      # 只出这两首
python3 analyze.py out/battle.mp3 out/battle.png
python3 stems.py battle build     # 每个声部的响度占比（要先渲染过一遍）
cp out/*.mp3 ../../assets/music/
```

渲染时每个声部的 wav 留在 `out/<曲名>/`，音符没改的声部下次不再重跑 FluidSynth，只重新混音。`out/` 不进仓库。
