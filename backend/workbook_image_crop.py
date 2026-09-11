from collections import Counter


PixelCrop = tuple[int, int, int, int]


def calculate_adaptive_crop(
    samples: bytes,
    *,
    width: int,
    height: int,
    channels: int,
    safe_padding_mm: float = 10,
    analysis_dpi: float = 72,
    minimum_height_ratio: float = 0.55,
) -> PixelCrop:
    full_canvas = (0, 0, width, height)
    if width <= 0 or height <= 0 or channels < 3:
        return full_canvas
    if len(samples) < width * height * channels:
        return full_canvas

    def pixel(x: int, y: int) -> tuple[int, int, int]:
        offset = (y * width + x) * channels
        return tuple(samples[offset:offset + 3])

    nonwhite_rows = [
        y
        for y in range(height)
        if sum(
            max(255 - channel for channel in pixel(x, y)) > 10
            for x in range(0, width, 2)
        ) >= 4
    ]
    nonwhite_columns = [
        x
        for x in range(width)
        if sum(
            max(255 - channel for channel in pixel(x, y)) > 10
            for y in range(0, height, 2)
        ) >= 4
    ]
    if not nonwhite_rows or not nonwhite_columns:
        return full_canvas

    left, right = min(nonwhite_columns), max(nonwhite_columns) + 1
    top, bottom = min(nonwhite_rows), max(nonwhite_rows) + 1
    paper_width = right - left
    paper_height = bottom - top
    if paper_width < width * 0.25 or paper_height < height * 0.5:
        return full_canvas

    paper_samples = [
        pixel(x, y)
        for y in range(top, bottom, 3)
        for x in range(left, right, 3)
    ]
    paper_fill_ratio = sum(
        max(255 - channel for channel in value) > 10
        for value in paper_samples
    ) / len(paper_samples)
    if paper_fill_ratio < 0.65:
        return full_canvas

    inner_left = left + max(4, round(paper_width * 0.10))
    inner_right = right - max(4, round(paper_width * 0.04))
    scan_bottom = bottom - max(3, round(paper_height * 0.02))
    if inner_left >= inner_right or top + 4 >= scan_bottom:
        return (left, top, right, bottom)

    sampled_colors = Counter(
        pixel(x, y)
        for y in range(top + 4, scan_bottom, 4)
        for x in range(inner_left, inner_right, 4)
    )
    if not sampled_colors:
        return (left, top, right, bottom)
    background = sampled_colors.most_common(1)[0][0]
    background_palette = [
        color
        for color, _count in sampled_colors.most_common(8)
        if max(abs(color[index] - background[index]) for index in range(3)) <= 70
    ]

    def differs_from_background(value: tuple[int, int, int]) -> bool:
        return all(
            max(abs(value[index] - color[index]) for index in range(3)) >= 28
            for color in background_palette
        )

    scan_height = scan_bottom - top
    persistent_columns = {
        x
        for x in range(inner_left, inner_right)
        if sum(
            differs_from_background(pixel(x, y))
            for y in range(top, scan_bottom)
        ) >= scan_height * 0.8
    }
    scan_columns = [
        x
        for x in range(inner_left, inner_right)
        if x not in persistent_columns
    ]
    if len(scan_columns) < (inner_right - inner_left) * 0.5:
        return (left, top, right, bottom)
    row_threshold = max(4, len(scan_columns) // 150)

    row_activity = {
        y: sum(
            differs_from_background(pixel(x, y))
            for x in scan_columns
        )
        for y in range(top, scan_bottom)
    }
    dense_threshold = round(len(scan_columns) * 0.65)
    dense_rows = {
        y
        for y, activity in row_activity.items()
        if activity >= dense_threshold
    }
    short_dense_rows = set()
    run_start = None
    for y in range(top, scan_bottom + 1):
        if y in dense_rows and run_start is None:
            run_start = y
        if y not in dense_rows and run_start is not None:
            if y - run_start <= 4:
                short_dense_rows.update(range(run_start, y))
            run_start = None

    def is_isolated_background_line(y: int) -> bool:
        return y in short_dense_rows

    meaningful_rows = [
        y
        for y, activity in row_activity.items()
        if activity >= row_threshold and not is_isolated_background_line(y)
    ]
    if not meaningful_rows:
        return (left, top, right, bottom)

    padding = max(4, round(safe_padding_mm * analysis_dpi / 25.4))
    minimum_bottom = top + round(paper_height * minimum_height_ratio)
    crop_bottom = max(minimum_bottom, meaningful_rows[-1] + 1 + padding)
    if bottom - crop_bottom < padding:
        crop_bottom = bottom
    return (left, top, right, min(bottom, crop_bottom))
