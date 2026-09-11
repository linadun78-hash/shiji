import base64
import sys
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend.main import create_app


REQUEST = {
    "html": "<!doctype html><html><body><p>page fixture</p></body></html>",
    "pageNumbers": [1, 3],
}


def test_workbook_image_endpoint_returns_injected_selected_pages() -> None:
    captured = []

    def render(request):
        captured.append(request)
        return {
            "pages": [
                {
                    "pageNumber": 1,
                    "filename": "shiji-report-page-01.png",
                    "mimeType": "image/png",
                    "dataBase64": base64.b64encode(b"page-1").decode("ascii"),
                },
                {
                    "pageNumber": 3,
                    "filename": "shiji-report-page-03.png",
                    "mimeType": "image/png",
                    "dataBase64": base64.b64encode(b"page-3").decode("ascii"),
                },
            ],
        }

    client = TestClient(create_app(workbook_image_renderer=render))
    response = client.post("/api/v1/experimental/workbook-images", json=REQUEST)

    assert response.status_code == 200
    assert [page["pageNumber"] for page in response.json()["pages"]] == [1, 3]
    assert captured[0].page_numbers == [1, 3]


@pytest.mark.parametrize("page_numbers", [[], [1, 1], [0], [6], [1, 2, 3, 4, 5, 6]])
def test_workbook_image_endpoint_rejects_invalid_page_selection(page_numbers) -> None:
    called = False

    def render(_request):
        nonlocal called
        called = True
        return {"pages": []}

    client = TestClient(create_app(workbook_image_renderer=render))
    response = client.post(
        "/api/v1/experimental/workbook-images",
        json={**REQUEST, "pageNumbers": page_numbers},
    )

    assert response.status_code == 422
    assert called is False


def test_workbook_image_request_defaults_to_a4_canvas() -> None:
    from backend.models import WorkbookImageExportRequest

    request = WorkbookImageExportRequest.model_validate(REQUEST)

    assert request.canvas_mode == "a4"


def test_workbook_image_endpoint_accepts_adaptive_canvas() -> None:
    captured = []

    def render(request):
        captured.append(request)
        return {
            "pages": [
                {
                    "pageNumber": 1,
                    "filename": "shiji-report-page-01.png",
                    "mimeType": "image/png",
                    "dataBase64": base64.b64encode(b"page-1").decode("ascii"),
                },
            ],
        }

    client = TestClient(create_app(workbook_image_renderer=render))
    response = client.post(
        "/api/v1/experimental/workbook-images",
        json={**REQUEST, "pageNumbers": [1], "canvasMode": "adaptive"},
    )

    assert response.status_code == 200
    assert captured[0].canvas_mode == "adaptive"


def test_workbook_image_endpoint_rejects_unknown_canvas_mode() -> None:
    client = TestClient(create_app(workbook_image_renderer=lambda _request: {"pages": []}))

    response = client.post(
        "/api/v1/experimental/workbook-images",
        json={**REQUEST, "canvasMode": "stretch"},
    )

    assert response.status_code == 422


def test_service_passes_memory_pdf_to_rasterizer_and_sorts_pages() -> None:
    from backend.workbook_image_service import render_workbook_images
    from backend.models import WorkbookImageExportRequest

    calls = []

    def produce_pdf(html):
        calls.append(("pdf", html))
        return b"%PDF-memory-only"

    def rasterize(pdf_bytes, page_numbers, canvas_mode):
        calls.append(("raster", pdf_bytes, page_numbers, canvas_mode))
        return {3: b"png-three", 1: b"png-one"}

    result = render_workbook_images(
        WorkbookImageExportRequest.model_validate({**REQUEST, "canvasMode": "adaptive"}),
        pdf_producer=produce_pdf,
        rasterizer=rasterize,
    )

    assert calls[1] == ("raster", b"%PDF-memory-only", [1, 3], "adaptive")
    assert [page.page_number for page in result.pages] == [1, 3]
    assert [page.filename for page in result.pages] == [
        "shiji-report-page-01.png",
        "shiji-report-page-03.png",
    ]


def test_service_routes_legacy_request_to_a4_rasterizer() -> None:
    from backend.models import WorkbookImageExportRequest
    from backend.workbook_image_service import render_workbook_images

    modes = []

    def rasterize(_pdf_bytes, page_numbers, canvas_mode):
        modes.append(canvas_mode)
        return {page_number: b"png" for page_number in page_numbers}

    render_workbook_images(
        WorkbookImageExportRequest.model_validate({**REQUEST, "pageNumbers": [1]}),
        pdf_producer=lambda _html: b"%PDF-memory-only",
        rasterizer=rasterize,
    )

    assert modes == ["a4"]


def test_service_returns_no_partial_response_when_rasterization_fails() -> None:
    from backend.workbook_image_service import WorkbookImageExportError, render_workbook_images
    from backend.models import WorkbookImageExportRequest

    def fail_after_first_page(_pdf_bytes, _page_numbers, _canvas_mode):
        raise WorkbookImageExportError("image_rasterization_failed", "第 3 页转换失败")

    with pytest.raises(WorkbookImageExportError, match="第 3 页转换失败"):
        render_workbook_images(
            WorkbookImageExportRequest.model_validate(REQUEST),
            pdf_producer=lambda _html: b"%PDF-memory-only",
            rasterizer=fail_after_first_page,
        )


@pytest.mark.parametrize(
    ("adaptive_payload", "adaptive_error"),
    [
        (None, RuntimeError("adaptive encoding failed")),
        (b"", None),
        (b"not-a-png", None),
    ],
)
def test_invalid_adaptive_png_falls_back_to_full_a4(
    monkeypatch,
    adaptive_payload,
    adaptive_error,
) -> None:
    from backend import workbook_image_service

    full_png = b"\x89PNG\r\n\x1a\nfull-a4"

    class Pixmap:
        width = 100
        height = 140
        n = 3
        samples = bytes([247, 238, 225]) * width * height

        def __init__(self, payload=None, error=None):
            self.payload = payload
            self.error = error

        def set_rect(self, *_args):
            return None

        def tobytes(self, _format):
            if self.error:
                raise self.error
            return self.payload

    class Page:
        rect = SimpleNamespace(width=100, height=140)

        def get_pixmap(self, *, matrix, alpha, clip=None):
            if matrix == (1, 1):
                return Pixmap()
            if clip is not None:
                return Pixmap(payload=adaptive_payload, error=adaptive_error)
            return Pixmap(payload=full_png)

    class Document:
        page_count = 1

        def load_page(self, _index):
            return Page()

        def close(self):
            return None

    fake_fitz = SimpleNamespace(
        open=lambda **_kwargs: Document(),
        Matrix=lambda x, y: (x, y),
        Rect=lambda *values: values,
        IRect=lambda *values: values,
    )
    monkeypatch.setitem(sys.modules, "fitz", fake_fitz)
    monkeypatch.setattr(
        workbook_image_service,
        "calculate_adaptive_crop",
        lambda *_args, **_kwargs: (0, 0, 100, 80),
    )

    images = workbook_image_service.rasterize_pdf_pages(
        b"%PDF-memory-only",
        [1],
        "adaptive",
    )

    assert images == {1: full_png}


def test_adaptive_rasterization_normalizes_scaled_page_to_printable_width(
    monkeypatch,
) -> None:
    from backend import workbook_image_service

    rendered_matrices = []
    png = b"\x89PNG\r\n\x1a\nadaptive"

    class Pixmap:
        width = 100
        height = 140
        n = 3
        samples = bytes([247, 238, 225]) * width * height

        def tobytes(self, _format):
            return png

        def set_rect(self, *_args):
            return None

    class Page:
        rect = SimpleNamespace(width=100, height=140)

        def get_pixmap(self, *, matrix, alpha, clip=None):
            if clip is not None:
                rendered_matrices.append(matrix)
            return Pixmap()

    class Document:
        page_count = 1

        def load_page(self, _index):
            return Page()

        def close(self):
            return None

    fake_fitz = SimpleNamespace(
        open=lambda **_kwargs: Document(),
        Matrix=lambda x, y: (x, y),
        Rect=lambda *values: SimpleNamespace(
            x0=values[0],
            y0=values[1],
            x1=values[2],
            y1=values[3],
            width=values[2] - values[0],
            height=values[3] - values[1],
        ),
        IRect=lambda *values: values,
    )
    monkeypatch.setitem(sys.modules, "fitz", fake_fitz)
    monkeypatch.setattr(
        workbook_image_service,
        "calculate_adaptive_crop",
        lambda *_args, **_kwargs: (10, 10, 40, 90),
    )

    images = workbook_image_service.rasterize_pdf_pages(
        b"%PDF-memory-only",
        [1],
        "adaptive",
    )

    expected_scale = round(186 / 25.4 * 200) / 30
    assert images == {1: png}
    assert rendered_matrices == [pytest.approx((expected_scale, expected_scale))]
