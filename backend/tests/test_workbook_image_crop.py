from backend.workbook_image_crop import calculate_adaptive_crop


WIDTH = 120
HEIGHT = 180
PAPER = (10, 8, 110, 172)
TEST_DPI = (PAPER[3] - PAPER[1]) * 25.4 / 273


def rgb_page(color=(255, 255, 255)) -> bytearray:
    return bytearray(color * (WIDTH * HEIGHT))


def fill_rect(samples: bytearray, rect: tuple[int, int, int, int], color) -> None:
    left, top, right, bottom = rect
    for y in range(top, bottom):
        for x in range(left, right):
            offset = (y * WIDTH + x) * 3
            samples[offset:offset + 3] = bytes(color)


def make_page(content_bottom: int = 106) -> bytes:
    samples = rgb_page()
    fill_rect(samples, PAPER, (247, 238, 225))
    fill_rect(samples, (10, 8, 110, 10), (40, 31, 27))
    fill_rect(samples, (10, 170, 110, 172), (40, 31, 27))
    fill_rect(samples, (10, 8, 12, 172), (40, 31, 27))
    fill_rect(samples, (108, 8, 110, 172), (40, 31, 27))
    for row_top in range(30, content_bottom, 12):
        fill_rect(samples, (24, row_top, 74, min(row_top + 4, content_bottom)), (65, 50, 43))
    return bytes(samples)


def crop_page(samples: bytes) -> tuple[int, int, int, int]:
    return calculate_adaptive_crop(
        samples,
        width=WIDTH,
        height=HEIGHT,
        channels=3,
        analysis_dpi=TEST_DPI,
    )


def test_adaptive_crop_removes_print_margin_and_bottom_whitespace() -> None:
    crop = crop_page(make_page())

    assert crop == (10, 8, 110, 112)


def test_adaptive_crop_keeps_minimum_page_height() -> None:
    crop = crop_page(make_page(content_bottom=46))

    assert crop == (10, 8, 110, 98)


def test_adaptive_crop_falls_back_to_full_paper_when_content_is_near_bottom() -> None:
    crop = crop_page(make_page(content_bottom=166))

    assert crop == PAPER


def test_adaptive_crop_falls_back_to_full_canvas_without_reliable_paper() -> None:
    crop = crop_page(bytes(rgb_page()))

    assert crop == (0, 0, WIDTH, HEIGHT)


def test_adaptive_crop_falls_back_when_text_is_mistaken_for_paper() -> None:
    samples = rgb_page()
    for row_top in range(30, 151, 12):
        fill_rect(samples, (20, row_top, 101, min(row_top + 4, 151)), (40, 31, 27))

    crop = crop_page(bytes(samples))

    assert crop == (0, 0, WIDTH, HEIGHT)


def test_adaptive_crop_accepts_reliably_filled_scaled_narrow_paper() -> None:
    samples = rgb_page()
    narrow_paper = (10, 8, 50, 172)
    fill_rect(samples, narrow_paper, (247, 238, 225))
    fill_rect(samples, (10, 8, 50, 10), (40, 31, 27))
    fill_rect(samples, (10, 170, 50, 172), (40, 31, 27))
    fill_rect(samples, (10, 8, 12, 172), (40, 31, 27))
    fill_rect(samples, (48, 8, 50, 172), (40, 31, 27))
    for row_top in range(30, 106, 12):
        fill_rect(samples, (18, row_top, 38, row_top + 4), (65, 50, 43))

    crop = crop_page(bytes(samples))

    assert crop == (10, 8, 50, 112)


def test_adaptive_crop_ignores_repeated_full_width_grid_lines() -> None:
    samples = bytearray(make_page())
    for y in range(20, 165, 14):
        fill_rect(samples, (12, y, 108, min(y + 3, 165)), (205, 190, 174))
    for x in range(18, 108, 14):
        fill_rect(samples, (x, 10, min(x + 2, 108), 170), (205, 190, 174))
    for row_top in range(30, 106, 12):
        fill_rect(samples, (24, row_top, 74, row_top + 4), (65, 50, 43))

    crop = crop_page(bytes(samples))

    assert crop == (10, 8, 110, 112)


def test_adaptive_crop_converts_safe_padding_from_analysis_dpi() -> None:
    crop = calculate_adaptive_crop(
        make_page(),
        width=WIDTH,
        height=HEIGHT,
        channels=3,
        analysis_dpi=25.4,
    )

    assert crop == (10, 8, 110, 116)


def test_adaptive_crop_keeps_padding_stable_across_paper_heights_at_72dpi() -> None:
    def make_variable_page(canvas_height: int, paper_bottom: int, content_bottom: int) -> bytes:
        samples = bytearray((255, 255, 255) * (WIDTH * canvas_height))
        fill_rect(samples, (10, 8, 110, paper_bottom), (247, 238, 225))
        fill_rect(samples, (10, 8, 110, 10), (40, 31, 27))
        fill_rect(samples, (10, paper_bottom - 2, 110, paper_bottom), (40, 31, 27))
        fill_rect(samples, (10, 8, 12, paper_bottom), (40, 31, 27))
        fill_rect(samples, (108, 8, 110, paper_bottom), (40, 31, 27))
        for row_top in range(30, content_bottom, 12):
            fill_rect(
                samples,
                (24, row_top, 74, min(row_top + 4, content_bottom)),
                (65, 50, 43),
            )
        return bytes(samples)

    short_crop = calculate_adaptive_crop(
        make_variable_page(180, 172, 106),
        width=WIDTH,
        height=180,
        channels=3,
    )
    tall_crop = calculate_adaptive_crop(
        make_variable_page(330, 300, 190),
        width=WIDTH,
        height=330,
        channels=3,
    )

    assert short_crop[3] - 106 == 28
    assert tall_crop[3] - 190 == 28
