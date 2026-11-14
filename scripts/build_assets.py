#!/usr/bin/env python3
"""Curate, optimize, and verify Orliss/nailong assets for Naiwa Survivors.

Usage:
  python scripts/build_assets.py [--refresh] [--qa-sheet PATH]
  python scripts/build_assets.py --verify
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

REPO_URL = "https://github.com/Orliss/nailong.git"
ROOT_DIR = Path(__file__).resolve().parent.parent
PUBLIC_ASSETS = ROOT_DIR / "public" / "assets"
SPRITES_DIR = PUBLIC_ASSETS / "sprites"
GALLERY_DIR = PUBLIC_ASSETS / "gallery"
MEDALLIONS_DIR = PUBLIC_ASSETS / "medallions"
TILES_DIR = PUBLIC_ASSETS / "tiles"
NANOBANANA_SRC_DIR = ROOT_DIR / "assets_src" / "nanobanana"
MANIFEST_PATH = ROOT_DIR / "src" / "data" / "nailongManifest.json"

MAX_TOTAL_BYTES = 15 * 1024 * 1024  # 15 MB GitHub Pages budget
SPRITE_MAX_DIM = 280
GALLERY_MAX_DIM = 760
MEDALLION_SIZE = 256
TILE_SIZE = 256
NANOBANANA_ICON_DIM = 192

# Curated sprites for characters, enemies, and weapon icons.
# 'mode': 'cutout' (edge flood-fill + defringe) or 'medallion' (circular gold frame).
CURATED_SPRITES: list[dict[str, str]] = [
    # Playable heroes (laugh-gallery)
    {"id": "hero-classic", "src": "laugh-gallery/奶蛙-亮黄站姿.png", "role": "hero", "mode": "auto"},
    {"id": "hero-nezha", "src": "laugh-gallery/奶蛙-哪吒.png", "role": "hero", "mode": "auto"},
    {"id": "hero-santa", "src": "laugh-gallery/奶蛙-圣诞老人.png", "role": "hero", "mode": "auto"},
    {"id": "hero-kitsune", "src": "laugh-gallery/奶蛙-狐面和服.png", "role": "hero", "mode": "auto"},
    {"id": "hero-galaxy", "src": "laugh-gallery/奶蛙-银河隐藏款.png", "role": "hero", "mode": "medallion"},
    # Weapon / action sprites (laugh-gallery + emotes)
    {"id": "laugh-bend", "src": "laugh-gallery/奶蛙-弯腰大笑.png", "role": "sprite", "mode": "auto"},
    {"id": "laugh-point", "src": "laugh-gallery/奶蛙-叉腰指点.png", "role": "sprite", "mode": "auto"},
    {"id": "laugh-double-v", "src": "laugh-gallery/奶蛙-双V大笑.png", "role": "sprite", "mode": "auto"},
    {"id": "laugh-leap", "src": "laugh-gallery/奶蛙-雀跃.png", "role": "sprite", "mode": "auto"},
    {"id": "laugh-all-fours", "src": "laugh-gallery/奶蛙-四肢着地.png", "role": "enemy", "mode": "auto"},
    {"id": "laugh-rainbow", "src": "laugh-gallery/奶蛙-彩虹渐变.png", "role": "enemy", "mode": "auto"},
    {"id": "laugh-headhold", "src": "laugh-gallery/奶蛙-抱头大笑.png", "role": "enemy", "mode": "medallion"},
    {"id": "laugh-baby", "src": "laugh-gallery/奶蛙-抱婴大笑.png", "role": "enemy", "mode": "auto"},
    {"id": "laugh-finger", "src": "laugh-gallery/奶蛙-指你大笑.png", "role": "enemy", "mode": "auto"},
    {"id": "laugh-orange", "src": "laugh-gallery/奶蛙-橙肤捧腹.png", "role": "enemy", "mode": "auto"},
    {"id": "laugh-white", "src": "laugh-gallery/奶蛙-白肤捧腹.png", "role": "enemy", "mode": "auto"},
    {"id": "laugh-pink", "src": "laugh-gallery/奶蛙-粉肤捧腹.png", "role": "enemy", "mode": "auto"},
    {"id": "laugh-squint", "src": "laugh-gallery/奶蛙-眯眼张嘴.png", "role": "enemy", "mode": "auto"},
    {"id": "laugh-calm", "src": "laugh-gallery/奶蛙-静站绿眼.png", "role": "sprite", "mode": "medallion"},
    # Emotes (clean frog reactions)
    {"id": "emote-angry", "src": "emotes/奶蛙-气鼓鼓.png", "role": "enemy", "mode": "auto"},
    {"id": "emote-confused", "src": "emotes/奶蛙-疑惑.png", "role": "enemy", "mode": "auto"},
    {"id": "emote-side", "src": "emotes/奶蛙-侧立.png", "role": "enemy", "mode": "auto"},
    {"id": "emote-grin", "src": "emotes/奶蛙-露齿大笑.png", "role": "enemy", "mode": "auto"},
    {"id": "emote-heart", "src": "emotes/奶蛙-吐舌比心.png", "role": "sprite", "mode": "auto"},
    {"id": "emote-double-v", "src": "emotes/奶蛙-双V吐舌.png", "role": "sprite", "mode": "auto"},
    {"id": "emote-cheek", "src": "emotes/奶蛙-托腮.png", "role": "sprite", "mode": "auto"},
    {"id": "emote-blush", "src": "emotes/奶蛙-红晕托颌.png", "role": "sprite", "mode": "auto"},
    {"id": "emote-pout", "src": "emotes/奶蛙-微愠.png", "role": "enemy", "mode": "medallion"},
    {"id": "emote-nose", "src": "emotes/奶蛙-点鼻.png", "role": "sprite", "mode": "auto"},
    {"id": "emote-squat", "src": "emotes/奶蛙-蹲坐托腮.png", "role": "sprite", "mode": "auto"},
]

# Boss medallions cropped from classic paintings for crisp battlefield readability.
BOSS_MEDALLIONS: list[dict[str, str]] = [
    {"id": "boss-alps", "src": "classic/奶破蛙翻越阿尔卑斯山.jpg"},
    {"id": "boss-four-horsemen", "src": "classic/天启四奶蛙.jpg"},
    {"id": "boss-judgment", "src": "classic/大天使长的最后审判.jpg"},
    {"id": "boss-thunder", "src": "classic/奶蛙雷帝杀龙.jpg"},
    {"id": "boss-creation", "src": "classic/创造奶蛙_02.jpg"},
    {"id": "boss-liberty", "src": "classic/自由引导奶蛙.jpg"},
    {"id": "boss-nightwatch", "src": "classic/奶蛙夜巡_02.jpg"},
    {"id": "boss-logo", "src": "assets/奶蛙-logo.jpg"},
]

# Nano Banana 2x2 sheets: (quadrant_index 0=TL,1=TR,2=BL,3=BR, id, title, lore)
NANOBANANA_ICON_SHEETS: dict[str, list[tuple[int, str, str, str]]] = {
    "sheet_relics_1.png": [
        (0, "item-chalice", "金箔圣杯", "圣殿纯金打造的祝福圣杯，盛满令人捧腹的欢愉甘露。"),
        (1, "item-wings", "雀跃羽翼", "鎏金雀跃之翼，赐予圣殿行者踏风而行的轻盈步伐。"),
        (2, "item-codex", "沉思法典", "镌刻奶蛙托腮哲思的鎏金法典，令圣殿术式长久驻留。"),
        (3, "item-sachet", "红晕香囊", "织金绯红香囊，芬芳催动武器与笑声以更高频律动。"),
    ],
    "sheet_relics_2.png": [
        (0, "item-scroll", "雷帝秘卷", "封印雷帝裁决真言的鎏金卷轴，令一切攻击威能倍增。"),
        (1, "item-hourglass", "天启沙漏", "流淌星砂的圣殿沙漏，逆转因果并折射出额外投射物。"),
        (2, "wpn-icon-oil-lamp", "圣殿香油环", "长明不熄的圣殿鎏金香油灯，环绕护体灼烧近身狂徒。"),
        (3, "wpn-icon-sanctuary-wheel", "永恒香油大结界", "八辐炽金香油圣轮，化作不可侵犯的永恒圣殿结界。"),
    ],
    "sheet_pickups.png": [
        (0, "pickup-chest", "圣殿密匣", "收纳名画嘉奖与丰厚香油功德的黑曜鎏金密匣。"),
        (1, "pickup-gold", "香油功德币", "铸有奶蛙笑颜的圣殿纯金功德币。"),
        (2, "pickup-meat", "圣餐蜜瓜包", "刚出炉的鎏金酥皮蜜瓜包，瞬间抚平战斗创伤。"),
        (3, "pickup-magnet", "功德磁印", "铭刻引流符文的马蹄金磁，将四方晶石尽数吸入囊中。"),
    ],
    "sheet_evolutions.png": [
        (0, "wpn-icon-heart-star", "无限告白星雨", "生有金翼的绯红结晶比心，漫天散射追踪告白星雨。"),
        (1, "wpn-icon-tsunami-bell", "圣殿大笑海啸", "震荡圣殿穹顶的鎏金狂笑洪钟，掀起金色音波海啸。"),
        (2, "pickup-xp-gem", "圣殿经验晶石", "凝结大笑灵韵的圣殿棱晶，拾取后积蓄赐福经验。"),
        (3, "zone-liberty-crest", "自由圣旗法阵", "烙印大地的鎏金圣殿徽记，持续净化踏入其中的敌潮。"),
    ],
}

NANOBANANA_TILES: list[dict[str, Any]] = [
    {
        "id": "tile-sanctuary",
        "src": "tile_sanctuary.png",
        "title": "圣殿黑曜金箔地砖",
        "darken": 0.52,
        "tint": (18, 14, 26),
    },
    {
        "id": "tile-nightwatch",
        "src": "tile_nightwatch.png",
        "title": "夜巡石板暗金地砖",
        "darken": 0.56,
        "tint": (12, 18, 34),
    },
]


def _force_rmtree(path: Path) -> None:
    """Remove directory tree including read-only .git objects on Windows."""
    def _handle_readonly(func: Any, p: str, _exc: Any) -> None:
        os.chmod(p, stat.S_IWRITE)
        func(p)

    if path.exists():
        shutil.rmtree(path, onexc=_handle_readonly)


def ensure_nailong_checkout(cache_dir: Path, refresh: bool) -> Path:
    """Shallow sparse-clone Orliss/nailong into a temp cache directory."""
    if refresh and cache_dir.exists():
        _force_rmtree(cache_dir)

    if not (cache_dir / ".git" / "HEAD").exists():
        _force_rmtree(cache_dir)
        cache_dir.parent.mkdir(parents=True, exist_ok=True)
        print(f"Cloning Orliss/nailong (sparse) into {cache_dir}...")
        subprocess.run(
            [
                "git",
                "clone",
                "--depth",
                "1",
                "--filter=blob:none",
                "--sparse",
                REPO_URL,
                str(cache_dir),
            ],
            check=True,
        )
        subprocess.run(
            [
                "git",
                "-C",
                str(cache_dir),
                "sparse-checkout",
                "set",
                "assets",
                "classic",
                "laugh-gallery",
                "emotes",
                "4k/thumbs",
            ],
            check=True,
        )
    return cache_dir


def read_lore(src_path: Path) -> tuple[str, str]:
    """Read companion .txt file for an asset and return (title, lore)."""
    txt_path = Path(str(src_path) + ".txt")
    fallback_title = src_path.stem.replace("_02", "").strip("《》")
    if not txt_path.exists():
        return fallback_title, f"{fallback_title} —— 奶蛙艺术圣殿馆藏。"
    raw = txt_path.read_text(encoding="utf-8", errors="replace").strip()
    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    if not lines:
        return fallback_title, f"{fallback_title} —— 奶蛙艺术圣殿馆藏。"
    header = lines[0]
    raw_title = (
        header.split("·")[0]
        .strip()
        .replace("_02", "")
        .replace("《", "")
        .replace("》", "")
        .strip()
    )
    title = raw_title or fallback_title
    body = "\n".join(lines[1:]) if len(lines) > 1 else header
    return title, body


def _border_connected_mask(bg_candidate: np.ndarray) -> np.ndarray:
    """Fast BFS flood-fill from image borders over boolean bg_candidate (H x W)."""
    h, w = bg_candidate.shape
    visited = np.zeros((h, w), dtype=np.uint8)
    flat_cand = bg_candidate.ravel()
    flat_vis = visited.ravel()

    stack: list[int] = []
    # Seed top & bottom rows
    for x in range(w):
        if flat_cand[x] and not flat_vis[x]:
            flat_vis[x] = 1
            stack.append(x)
        bot = (h - 1) * w + x
        if flat_cand[bot] and not flat_vis[bot]:
            flat_vis[bot] = 1
            stack.append(bot)
    # Seed left & right columns
    for y in range(1, h - 1):
        left = y * w
        if flat_cand[left] and not flat_vis[left]:
            flat_vis[left] = 1
            stack.append(left)
        right = y * w + (w - 1)
        if flat_cand[right] and not flat_vis[right]:
            flat_vis[right] = 1
            stack.append(right)

    while stack:
        idx = stack.pop()
        y, x = divmod(idx, w)
        if x > 0:
            n = idx - 1
            if flat_cand[n] and not flat_vis[n]:
                flat_vis[n] = 1
                stack.append(n)
        if x + 1 < w:
            n = idx + 1
            if flat_cand[n] and not flat_vis[n]:
                flat_vis[n] = 1
                stack.append(n)
        if y > 0:
            n = idx - w
            if flat_cand[n] and not flat_vis[n]:
                flat_vis[n] = 1
                stack.append(n)
        if y + 1 < h:
            n = idx + w
            if flat_cand[n] and not flat_vis[n]:
                flat_vis[n] = 1
                stack.append(n)

    return visited.astype(bool)


def _sample_border_neutral(arr_rgb: np.ndarray) -> bool:
    """Check whether perimeter pixels are predominantly low-saturation neutral colors."""
    border = np.concatenate(
        [arr_rgb[0, :], arr_rgb[-1, :], arr_rgb[:, 0], arr_rgb[:, -1]],
        axis=0,
    ).astype(np.int16)
    sat = border.max(axis=1) - border.min(axis=1)
    lum = 0.299 * border[:, 0] + 0.587 * border[:, 1] + 0.114 * border[:, 2]
    neutral_ratio = float(np.mean((sat <= 40) & (lum >= 132)))
    return neutral_ratio >= 0.45


def make_medallion(img: Image.Image, size: int = MEDALLION_SIZE, gold_ring: bool = True) -> Image.Image:
    """Crop an image into a circular sanctuary medallion with a beveled gold frame."""
    rgb = img.convert("RGBA")
    w, h = rgb.size
    side = min(w, h)
    # Center-biased upper crop keeps faces/characters framed well
    left = (w - side) // 2
    top = max(0, min(h - side, int((h - side) * 0.35)))
    cropped = rgb.crop((left, top, left + side, top + side)).resize(
        (size, size), Image.Resampling.LANCZOS
    )

    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    inset = 8 if gold_ring else 2
    draw.ellipse((inset, inset, size - inset, size - inset), fill=255)

    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(cropped, (0, 0), mask)

    if gold_ring:
        ring_draw = ImageDraw.Draw(out)
        ring_draw.ellipse((3, 3, size - 3, size - 3), outline=(140, 98, 28, 255), width=6)
        ring_draw.ellipse((6, 6, size - 6, size - 6), outline=(244, 197, 66, 255), width=4)
        ring_draw.ellipse((10, 10, size - 10, size - 10), outline=(42, 24, 12, 220), width=2)
    return out


def remove_background_smart(img: Image.Image, max_dim: int = SPRITE_MAX_DIM) -> tuple[Image.Image, str]:
    """Remove neutral white/gray/checkerboard backgrounds using edge flood-fill.

    Falls back to a gold medallion frame if the perimeter is non-neutral photography
    or flood-fill fails coverage sanity checks.
    """
    rgba = img.convert("RGBA")
    # If image already has meaningful transparency, just trim and scale.
    alpha_arr = np.array(rgba)[:, :, 3]
    if np.mean(alpha_arr < 240) > 0.08:
        bbox = rgba.getbbox()
        if bbox:
            rgba = rgba.crop(bbox)
        rgba.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
        return rgba, "native-alpha"

    # Downscale very large images with NEAREST before flood-fill so baked checkerboard stays sharp
    if max(rgba.size) > 560:
        scale = 560.0 / max(rgba.size)
        rgba = rgba.resize(
            (max(1, int(rgba.width * scale)), max(1, int(rgba.height * scale))),
            Image.Resampling.NEAREST,
        )

    arr = np.array(rgba, dtype=np.uint8)
    rgb = arr[:, :, :3].astype(np.int16)

    if not _sample_border_neutral(rgb):
        return make_medallion(img, size=min(max_dim, MEDALLION_SIZE)), "medallion-fallback"

    sat = rgb.max(axis=2) - rgb.min(axis=2)
    lum = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]

    # Match uniform white/off-white and gray-white checkerboard pixels
    bg_candidate = (sat <= 36) & (lum >= 134)
    bg_mask = _border_connected_mask(bg_candidate)

    bg_ratio = float(np.mean(bg_mask))
    fg_ratio = 1.0 - bg_ratio
    if bg_ratio < 0.05 or fg_ratio < 0.10:
        return make_medallion(img, size=min(max_dim, MEDALLION_SIZE)), "medallion-fallback"

    # Build clean alpha channel with 1px soft transition & bright-fringe neutralization
    alpha = np.where(bg_mask, 0, 255).astype(np.uint8)

    # Identify 1-pixel inner contour touching background
    padded = np.pad(bg_mask, 1, mode="constant", constant_values=True)
    touches_bg = (
        padded[:-2, 1:-1] | padded[2:, 1:-1] | padded[1:-1, :-2] | padded[1:-1, 2:]
    ) & (~bg_mask)

    fringe = touches_bg & (sat <= 48) & (lum >= 165)
    alpha[fringe] = 95
    # Darken fringe slightly to avoid bright white halo against obsidian floor
    arr[fringe, 0] = (arr[fringe, 0].astype(np.float32) * 0.72).astype(np.uint8)
    arr[fringe, 1] = (arr[fringe, 1].astype(np.float32) * 0.72).astype(np.uint8)
    arr[fringe, 2] = (arr[fringe, 2].astype(np.float32) * 0.72).astype(np.uint8)
    arr[:, :, 3] = alpha

    out = Image.fromarray(arr, mode="RGBA")
    # Remove isolated 1px speckles on alpha via slight alpha smoothing only on outer contour
    bbox = out.getbbox()
    if not bbox:
        return make_medallion(img, size=min(max_dim, MEDALLION_SIZE)), "medallion-fallback"
    out = out.crop(bbox)

    # Pad 4px transparent margin so sprites never clip against canvas bounds
    pad = 4
    canvas = Image.new("RGBA", (out.width + pad * 2, out.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(out, (pad, pad), out)
    canvas.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
    return canvas, "cutout"


def cutout_quadrant_icon(quad_img: Image.Image, max_dim: int = NANOBANANA_ICON_DIM) -> tuple[Image.Image, str]:
    """Extract an isolated icon from a 2x2 Nano Banana quadrant with clean dark-floor edges."""
    qw, qh = quad_img.size
    mx = max(2, int(qw * 0.04))
    my = max(2, int(qh * 0.04))
    cropped = quad_img.crop((mx, my, max(mx + 1, qw - mx), max(my + 1, qh - my))).convert("RGBA")
    cropped.thumbnail((384, 384), Image.Resampling.LANCZOS)

    arr = np.array(cropped, dtype=np.uint8)
    rgb = arr[:, :, :3].astype(np.float32)

    border_pixels = np.concatenate(
        [
            rgb[:3, :, :].reshape(-1, 3),
            rgb[-3:, :, :].reshape(-1, 3),
            rgb[:, :3, :].reshape(-1, 3),
            rgb[:, -3:, :].reshape(-1, 3),
        ],
        axis=0,
    )
    bg_med = np.median(border_pixels, axis=0)
    rgb_i16 = arr[:, :, :3].astype(np.int16)
    sat = rgb_i16.max(axis=2) - rgb_i16.min(axis=2)
    lum = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]

    dist = np.linalg.norm(rgb - bg_med, axis=2)
    bg_candidate = (dist <= 44.0) | ((sat <= 38) & (lum >= 188.0))
    bg_mask = _border_connected_mask(bg_candidate)

    bg_ratio = float(np.mean(bg_mask))
    fg_ratio = 1.0 - bg_ratio
    if bg_ratio < 0.08 or fg_ratio < 0.05:
        return make_medallion(quad_img, size=max_dim, gold_ring=True), "medallion-fallback"

    alpha = np.where(bg_mask, 0, 255).astype(np.uint8)
    padded = np.pad(bg_mask, 1, mode="constant", constant_values=True)
    touches_bg = (
        padded[:-2, 1:-1] | padded[2:, 1:-1] | padded[1:-1, :-2] | padded[1:-1, 2:]
    ) & (~bg_mask)

    fringe = touches_bg & (((sat <= 48) & (lum >= 150.0)) | (dist <= 76.0))
    alpha[fringe] = 110
    arr[fringe, 0] = (arr[fringe, 0].astype(np.float32) * 0.75).astype(np.uint8)
    arr[fringe, 1] = (arr[fringe, 1].astype(np.float32) * 0.75).astype(np.uint8)
    arr[fringe, 2] = (arr[fringe, 2].astype(np.float32) * 0.75).astype(np.uint8)
    arr[:, :, 3] = alpha

    out = Image.fromarray(arr, mode="RGBA")
    bbox = out.getbbox()
    if not bbox:
        return make_medallion(quad_img, size=max_dim, gold_ring=True), "medallion-fallback"
    out = out.crop(bbox)

    pad = 6
    side = max(out.width, out.height) + pad * 2
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(out, ((side - out.width) // 2, (side - out.height) // 2), out)
    square = square.resize((max_dim, max_dim), Image.Resampling.LANCZOS)
    return square, "cutout"


def make_seamless_tile(
    img: Image.Image,
    size: int = TILE_SIZE,
    darken: float = 0.52,
    tint: tuple[int, int, int] = (16, 13, 22),
) -> Image.Image:
    """Create a seamlessly periodic dark-toned floor tile with subtle gold-leaf inner border."""
    resized = img.convert("RGB").resize((size, size), Image.Resampling.LANCZOS)
    arr = np.array(resized, dtype=np.float32)

    margin = 28
    coords = np.arange(size, dtype=np.float32)
    dist_edge = np.minimum(coords, size - 1 - coords)
    ramp = 0.5 * (1.0 - np.cos(np.pi * np.clip(dist_edge / margin, 0.0, 1.0)))
    sx = ramp[None, :, None]
    sy = ramp[:, None, None]

    half = size // 2
    roll_x = np.roll(arr, half, axis=1)
    roll_y = np.roll(arr, half, axis=0)
    roll_xy = np.roll(arr, (half, half), axis=(0, 1))

    blended = sy * (sx * arr + (1.0 - sx) * roll_x) + (1.0 - sy) * (sx * roll_y + (1.0 - sx) * roll_xy)

    tint_arr = np.array(tint, dtype=np.float32).reshape((1, 1, 3))
    toned = np.clip(blended * darken * 0.75 + tint_arr * 0.25, 0, 255).astype(np.uint8)

    tile_rgba = Image.fromarray(toned, mode="RGB").convert("RGBA")
    overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)
    odraw.rectangle((0, 0, size - 1, size - 1), outline=(244, 197, 66, 36), width=1)
    return Image.alpha_composite(tile_rgba, overlay).convert("RGB")


def build_qa_sheet(sprite_paths: list[tuple[str, Path, str]], out_path: Path) -> None:
    """Render all processed sprites onto a dark obsidian + gold grid for visual QA."""
    if not sprite_paths:
        return
    cols = 6
    cell = 160
    rows = (len(sprite_paths) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * cell), (18, 16, 24))
    draw = ImageDraw.Draw(sheet)

    for idx, (sid, spath, method) in enumerate(sprite_paths):
        r, c = divmod(idx, cols)
        x0, y0 = c * cell, r * cell
        # Subtle dark checkerboard inside cell so alpha transparency is obvious
        for py in range(0, cell - 24, 16):
            for px in range(0, cell, 16):
                col = (28, 25, 36) if ((px // 16 + py // 16) % 2 == 0) else (20, 18, 27)
                draw.rectangle((x0 + px, y0 + py, x0 + px + 15, y0 + py + 15), fill=col)
        draw.rectangle((x0, y0, x0 + cell - 1, y0 + cell - 1), outline=(90, 70, 32), width=1)

        with Image.open(spath) as sim:
            s = sim.convert("RGBA")
            s.thumbnail((cell - 20, cell - 34), Image.Resampling.LANCZOS)
            px = x0 + (cell - s.width) // 2
            py = y0 + (cell - 24 - s.height) // 2
            sheet.paste(s, (px, py), s)
        draw.text((x0 + 6, y0 + cell - 20), f"{sid[:18]} ({method[:3]})", fill=(244, 197, 66))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path, format="PNG")
    print(f"QA contact sheet written: {out_path}")


def build_assets(source_dir: Path, refresh: bool, qa_sheet: Path | None) -> None:
    repo_dir = ensure_nailong_checkout(source_dir, refresh=refresh)

    for d in (SPRITES_DIR, GALLERY_DIR, MEDALLIONS_DIR, TILES_DIR):
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True, exist_ok=True)

    sprites_manifest: dict[str, Any] = {}
    qa_items: list[tuple[str, Path, str]] = []

    print("Processing curated character & enemy sprites...")
    for item in CURATED_SPRITES:
        sid = item["id"]
        src_rel = item["src"]
        src_file = repo_dir / src_rel
        if not src_file.exists():
            raise FileNotFoundError(f"Missing curated sprite in nailong repo: {src_rel}")

        title, lore = read_lore(src_file)
        with Image.open(src_file) as im:
            if item["mode"] == "medallion":
                processed = make_medallion(im)
                method = "medallion"
            else:
                processed, method = remove_background_smart(im)

        out_rel = f"assets/sprites/{sid}.webp"
        out_path = ROOT_DIR / "public" / out_rel
        processed.save(out_path, format="WEBP", quality=86, method=6)
        qa_items.append((sid, out_path, method))

        sprites_manifest[sid] = {
            "id": sid,
            "role": item["role"],
            "title": title,
            "lore": lore,
            "sourcePath": src_rel,
            "url": out_rel,
            "width": processed.width,
            "height": processed.height,
            "cutoutMethod": method,
        }

    print("Processing boss & relic medallions...")
    medallions_manifest: dict[str, Any] = {}
    for item in BOSS_MEDALLIONS:
        mid = item["id"]
        src_rel = item["src"]
        src_file = repo_dir / src_rel
        if not src_file.exists():
            raise FileNotFoundError(f"Missing medallion source: {src_rel}")
        title, lore = read_lore(src_file)
        with Image.open(src_file) as im:
            med = make_medallion(im, size=MEDALLION_SIZE, gold_ring=True)
        out_rel = f"assets/medallions/{mid}.webp"
        out_path = ROOT_DIR / "public" / out_rel
        med.save(out_path, format="WEBP", quality=85, method=6)
        qa_items.append((mid, out_path, "medallion"))
        medallions_manifest[mid] = {
            "id": mid,
            "title": title,
            "lore": lore,
            "sourcePath": src_rel,
            "url": out_rel,
            "width": med.width,
            "height": med.height,
        }

    print("Processing Nano Banana custom relic, pickup & weapon icon sheets...")
    for sheet_name, specs in NANOBANANA_ICON_SHEETS.items():
        sheet_path = NANOBANANA_SRC_DIR / sheet_name
        if not sheet_path.exists():
            raise FileNotFoundError(f"Missing Nano Banana sheet: {sheet_path}")
        with Image.open(sheet_path) as sheet_im:
            sw, sh = sheet_im.size
            hw, hh = sw // 2, sh // 2
            for quad_idx, sid, title, lore in specs:
                row, col = divmod(quad_idx, 2)
                x0 = col * hw
                y0 = row * hh
                x1 = sw if col == 1 else hw
                y1 = sh if row == 1 else hh
                quad = sheet_im.crop((x0, y0, x1, y1))
                processed, method = cutout_quadrant_icon(quad, max_dim=NANOBANANA_ICON_DIM)

                out_rel = f"assets/sprites/{sid}.webp"
                out_path = ROOT_DIR / "public" / out_rel
                processed.save(out_path, format="WEBP", quality=88, method=6)
                qa_items.append((sid, out_path, method))

                sprites_manifest[sid] = {
                    "id": sid,
                    "role": "nanobanana",
                    "title": title,
                    "lore": lore,
                    "sourcePath": f"nanobanana/{sheet_name}#q{quad_idx}",
                    "url": out_rel,
                    "width": processed.width,
                    "height": processed.height,
                    "cutoutMethod": method,
                }

    print("Processing Nano Banana seamless floor tiles...")
    tiles_manifest: dict[str, Any] = {}
    for tile_spec in NANOBANANA_TILES:
        tid = str(tile_spec["id"])
        src_name = str(tile_spec["src"])
        src_path = NANOBANANA_SRC_DIR / src_name
        if not src_path.exists():
            raise FileNotFoundError(f"Missing Nano Banana floor tile: {src_path}")
        with Image.open(src_path) as tim:
            seamless = make_seamless_tile(
                tim,
                size=TILE_SIZE,
                darken=float(tile_spec["darken"]),
                tint=tuple(tile_spec["tint"]),
            )
        out_rel = f"assets/tiles/{tid}.webp"
        out_path = ROOT_DIR / "public" / out_rel
        seamless.save(out_path, format="WEBP", quality=84, method=6)
        tiles_manifest[tid] = {
            "id": tid,
            "title": tile_spec["title"],
            "sourcePath": f"nanobanana/{src_name}",
            "url": out_rel,
            "width": seamless.width,
            "height": seamless.height,
        }

    print("Processing classic paintings, 4K thumbs & brand logo for Sanctuary Codex...")
    gallery_entries: list[dict[str, Any]] = []
    gallery_sources: list[tuple[str, Path]] = []
    for f in sorted((repo_dir / "classic").glob("*.jpg")):
        gallery_sources.append(("classic", f))
    for f in sorted((repo_dir / "4k" / "thumbs").glob("*.jpg")):
        gallery_sources.append(("4k", f))
    for f in sorted((repo_dir / "laugh-gallery").glob("*.png")):
        gallery_sources.append(("laugh-gallery", f))
    for f in sorted((repo_dir / "emotes").glob("奶蛙-*.png")):
        gallery_sources.append(("emotes", f))

    for idx, (category, src_file) in enumerate(gallery_sources, start=1):
        rel_src = src_file.relative_to(repo_dir).as_posix()
        title, lore = read_lore(src_file)
        slug = f"{category}-{idx:03d}"
        out_rel = f"assets/gallery/{slug}.webp"
        out_path = ROOT_DIR / "public" / out_rel
        with Image.open(src_file) as im:
            conv = im.convert("RGB")
            conv.thumbnail((GALLERY_MAX_DIM, GALLERY_MAX_DIM), Image.Resampling.LANCZOS)
            conv.save(out_path, format="WEBP", quality=80, method=6)

        gallery_entries.append(
            {
                "id": slug,
                "category": category,
                "title": title,
                "lore": lore,
                "sourcePath": rel_src,
                "url": out_rel,
            }
        )

    # Copy logo cleanly for header/favicon usage
    logo_src = repo_dir / "assets" / "奶蛙-logo.jpg"
    logo_rel = "assets/gallery/brand-logo.webp"
    if logo_src.exists():
        with Image.open(logo_src) as im:
            conv = im.convert("RGB")
            conv.thumbnail((512, 512), Image.Resampling.LANCZOS)
            conv.save(ROOT_DIR / "public" / logo_rel, format="WEBP", quality=86)

    manifest = {
        "attribution": {
            "repo": "Orliss/nailong",
            "url": "https://github.com/Orliss/nailong",
            "license": "MIT",
            "notice": "素材源自 Orliss/nailong（奶蛙艺术圣殿官方素材仓库，MIT 协议），奶蛙角色衍生仅供非商业粉丝二创交流。",
        },
        "logoUrl": logo_rel,
        "sprites": sprites_manifest,
        "medallions": medallions_manifest,
        "tiles": tiles_manifest,
        "gallery": gallery_entries,
    }
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    if qa_sheet is not None:
        build_qa_sheet(qa_items, qa_sheet)

    verify_assets()


def verify_assets() -> None:
    if not MANIFEST_PATH.exists():
        raise SystemExit(f"Missing manifest: {MANIFEST_PATH}")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    missing: list[str] = []
    no_alpha: list[str] = []
    for sid, entry in manifest.get("sprites", {}).items():
        fpath = ROOT_DIR / "public" / entry["url"]
        if not fpath.exists() or fpath.stat().st_size == 0:
            missing.append(entry["url"])
            continue
        with Image.open(fpath) as im:
            if "A" not in im.getbands():
                no_alpha.append(sid)

    for entry in manifest.get("medallions", {}).values():
        fpath = ROOT_DIR / "public" / entry["url"]
        if not fpath.exists() or fpath.stat().st_size == 0:
            missing.append(entry["url"])

    tiles = manifest.get("tiles", {})
    if not tiles:
        missing.append("tiles (empty)")
    for entry in tiles.values():
        fpath = ROOT_DIR / "public" / entry["url"]
        if not fpath.exists() or fpath.stat().st_size == 0:
            missing.append(entry["url"])

    for entry in manifest.get("gallery", []):
        fpath = ROOT_DIR / "public" / entry["url"]
        if not fpath.exists() or fpath.stat().st_size == 0:
            missing.append(entry["url"])

    total_bytes = sum(p.stat().st_size for p in PUBLIC_ASSETS.rglob("*") if p.is_file())
    mb = total_bytes / (1024 * 1024)
    print(
        f"Verified manifest: {len(manifest['sprites'])} sprites, "
        f"{len(manifest['medallions'])} medallions, "
        f"{len(manifest.get('tiles', {}))} tiles, "
        f"{len(manifest['gallery'])} gallery entries. Total size: {mb:.2f} MB"
    )
    if missing:
        raise SystemExit(f"Missing asset files: {missing}")
    if no_alpha:
        raise SystemExit(f"Sprites missing alpha channel: {no_alpha}")
    if total_bytes > MAX_TOTAL_BYTES:
        raise SystemExit(f"Asset bundle exceeds {MAX_TOTAL_BYTES / (1024*1024):.1f} MB budget ({mb:.2f} MB)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build curated Naiwa Survivors assets.")
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=Path(tempfile.gettempdir()) / "nailong-repo-cache",
        help="Local cache path for Orliss/nailong clone.",
    )
    parser.add_argument("--refresh", action="store_true", help="Force refresh remote clone.")
    parser.add_argument("--verify", action="store_true", help="Verify generated assets only.")
    parser.add_argument("--qa-sheet", type=Path, default=None, help="Optional QA contact sheet PNG path.")
    args = parser.parse_args()

    if args.verify:
        verify_assets()
    else:
        build_assets(args.source_dir, refresh=args.refresh, qa_sheet=args.qa_sheet)


if __name__ == "__main__":
    main()
