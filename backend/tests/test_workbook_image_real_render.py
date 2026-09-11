import os
import struct
from pathlib import Path

import pytest

from backend.workbook_image_crop import calculate_adaptive_crop
from backend.workbook_image_service import produce_pdf_bytes, rasterize_pdf_pages


pytestmark = pytest.mark.skipif(
    os.getenv("XMC_RUN_REAL_IMAGE_RENDER") != "1",
    reason="set XMC_RUN_REAL_IMAGE_RENDER=1 to launch installed Edge",
)


HTML = """<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><style>
@page { size: A4 portrait; margin: 12mm; }
html, body { margin: 0; }
.page {
  position: relative;
  box-sizing: border-box;
  width: 186mm;
  height: 273mm;
  padding: 18mm 14mm;
  border: 1px solid #281f1b;
  background-color: #f7eee1;
  background-image:
    linear-gradient(rgba(153, 124, 100, .12) 1px, transparent 1px),
    linear-gradient(90deg, rgba(153, 124, 100, .12) 1px, transparent 1px);
  background-size: 5mm 5mm;
  break-after: page;
  page-break-after: always;
  color: #281f1b;
}
.page::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 8mm;
  width: 1px;
  background: #281f1b;
}
.page:last-child { break-after: auto; page-break-after: auto; }
.dense p { margin: 0 0 5mm; font-size: 16pt; line-height: 1.6; }
.short h1 { margin: 0 0 8mm; font-size: 28pt; }
.short p { margin: 0 0 8mm; font-size: 18pt; }
.end-marker { width: 30mm; height: 3mm; margin-top: 7mm; background: #9b2c2c; }
</style></head>
<body>
<section class="page dense">""" + "".join(
    f"<p>密集内容行 {index:02d}：用于验证页面底部不会被裁断。</p>"
    for index in range(1, 15)
) + """</section>
<section class="page short"><h1>短内容页</h1>
<p>行动项目一：确认目标。</p><p>行动项目二：整理材料。</p>
<p>行动项目三：核实来源。</p><p>行动项目四：排定顺序。</p>
<p>行动项目五：确认负责人。</p><p>行动项目六：设置期限。</p>
<p>行动项目七：完成复核。</p><div class="end-marker"></div></section>
</body></html>"""


def png_size(data: bytes) -> tuple[int, int]:
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    return struct.unpack(">II", data[16:24])


def red_pixel_rows(data: bytes) -> list[int]:
    import fitz

    pixmap = fitz.Pixmap(data)
    rows = []
    for y in range(pixmap.height):
        offset = y * pixmap.stride
        row = pixmap.samples[offset:offset + pixmap.width * pixmap.n]
        if any(
            row[index] > 120 and row[index + 1] < 90 and row[index + 2] < 90
            for index in range(0, len(row), pixmap.n)
        ):
            rows.append(y)
    return rows


def analysis_crop(pdf_bytes: bytes, page_number: int) -> tuple[int, int, int, int]:
    import fitz

    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        page = document.load_page(page_number - 1)
        pixmap = page.get_pixmap(matrix=fitz.Matrix(1, 1), alpha=False)
        return calculate_adaptive_crop(
            pixmap.samples,
            width=pixmap.width,
            height=pixmap.height,
            channels=pixmap.n,
        )
    finally:
        document.close()


def test_real_adaptive_render_preserves_content_and_leaves_no_pdf(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    pdf_bytes = produce_pdf_bytes(HTML)
    short_crop = analysis_crop(pdf_bytes, 2)
    assert short_crop[3] - short_crop[1] < (short_crop[2] - short_crop[0]) * 1.2
    a4 = rasterize_pdf_pages(pdf_bytes, [1, 2], "a4")
    adaptive = rasterize_pdf_pages(pdf_bytes, [1, 2], "adaptive")

    a4_dense = png_size(a4[1])
    a4_short = png_size(a4[2])
    adaptive_dense = png_size(adaptive[1])
    adaptive_short = png_size(adaptive[2])

    assert a4_dense == a4_short
    assert 1640 <= a4_short[0] <= 1665
    assert 2325 <= a4_short[1] <= 2350
    assert adaptive_dense[0] == adaptive_short[0]
    assert adaptive_short[1] < a4_short[1] * 0.75
    assert adaptive_dense[1] > adaptive_short[1]

    marker_rows = red_pixel_rows(adaptive[2])
    assert marker_rows
    bottom_padding = adaptive_short[1] - 1 - marker_rows[-1]
    assert 60 <= bottom_padding <= 100
    assert list(tmp_path.rglob("*.pdf")) == []
