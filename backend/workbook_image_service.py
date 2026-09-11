import base64
from collections.abc import Callable
from pathlib import Path

from .models import WorkbookImageExportRequest, WorkbookImageExportResponse, WorkbookImagePage
from .workbook_image_crop import calculate_adaptive_crop


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
RASTER_DPI = 200
PRINTABLE_WIDTH_MM = 186


class WorkbookImageExportError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def find_edge_executable() -> str:
    candidates = (
        Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
        Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
    )
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    raise WorkbookImageExportError("edge_not_found", "未找到 Microsoft Edge，无法生成实验图片")


def produce_pdf_bytes(html: str) -> bytes:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise WorkbookImageExportError(
            "playwright_unavailable",
            "实验图片组件尚未安装，请安装后重启本机服务",
        ) from exc

    browser = None
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=find_edge_executable(),
                headless=True,
            )
            context = browser.new_context(java_script_enabled=False)
            page = context.new_page()
            page.set_content(html, wait_until="networkidle", timeout=15_000)
            page.emulate_media(media="print")
            pdf_bytes = page.pdf(
                format="A4",
                print_background=True,
                prefer_css_page_size=True,
            )
            context.close()
            browser.close()
            browser = None
            if not pdf_bytes.startswith(b"%PDF"):
                raise WorkbookImageExportError("pdf_generation_failed", "浏览器未生成有效 PDF")
            return pdf_bytes
    except WorkbookImageExportError:
        raise
    except Exception as exc:
        raise WorkbookImageExportError("pdf_generation_failed", f"打印版生成失败：{exc}") from exc
    finally:
        if browser is not None:
            try:
                browser.close()
            except Exception:
                pass


def encode_png(pixmap) -> bytes:
    data = pixmap.tobytes("png")
    if not isinstance(data, bytes) or not data.startswith(PNG_SIGNATURE):
        raise ValueError("PNG encoder returned invalid data")
    return data


def rasterize_pdf_pages(
    pdf_bytes: bytes,
    page_numbers: list[int],
    canvas_mode: str = "a4",
) -> dict[int, bytes]:
    try:
        import fitz
    except ImportError as exc:
        raise WorkbookImageExportError(
            "pymupdf_unavailable",
            "PDF 转图片组件尚未安装，请安装后重启本机服务",
        ) from exc

    document = None
    try:
        document = fitz.open(stream=pdf_bytes, filetype="pdf")
        if document.page_count < max(page_numbers):
            raise WorkbookImageExportError(
                "page_count_mismatch",
                f"打印版只有 {document.page_count} 页，无法导出所选页面",
            )
        matrix = fitz.Matrix(RASTER_DPI / 72, RASTER_DPI / 72)
        images = {}
        for page_number in page_numbers:
            page = document.load_page(page_number - 1)
            if canvas_mode == "adaptive":
                try:
                    analysis = page.get_pixmap(matrix=fitz.Matrix(1, 1), alpha=False)
                    left, top, right, bottom = calculate_adaptive_crop(
                        analysis.samples,
                        width=analysis.width,
                        height=analysis.height,
                        channels=analysis.n,
                    )
                    scale_x = page.rect.width / analysis.width
                    scale_y = page.rect.height / analysis.height
                    clip = fitz.Rect(
                        left * scale_x,
                        top * scale_y,
                        right * scale_x,
                        bottom * scale_y,
                    )
                    target_width = round(PRINTABLE_WIDTH_MM / 25.4 * RASTER_DPI)
                    adaptive_scale = target_width / clip.width
                    adaptive_matrix = fitz.Matrix(adaptive_scale, adaptive_scale)
                    pixmap = page.get_pixmap(
                        matrix=adaptive_matrix,
                        clip=clip,
                        alpha=False,
                    )
                    if bottom < analysis.height:
                        pixmap.set_rect(
                            fitz.IRect(0, max(0, pixmap.height - 3), pixmap.width, pixmap.height),
                            (40, 31, 27),
                        )
                    images[page_number] = encode_png(pixmap)
                    continue
                except Exception:
                    pass
            pixmap = page.get_pixmap(matrix=matrix, alpha=False)
            images[page_number] = encode_png(pixmap)
        return images
    except WorkbookImageExportError:
        raise
    except Exception as exc:
        raise WorkbookImageExportError("image_rasterization_failed", f"PDF 转 PNG 失败：{exc}") from exc
    finally:
        if document is not None:
            document.close()


def render_workbook_images(
    request: WorkbookImageExportRequest,
    *,
    pdf_producer: Callable[[str], bytes] = produce_pdf_bytes,
    rasterizer: Callable[[bytes, list[int], str], dict[int, bytes]] = rasterize_pdf_pages,
) -> WorkbookImageExportResponse:
    pdf_bytes = pdf_producer(request.html)
    images = rasterizer(pdf_bytes, request.page_numbers, request.canvas_mode)
    if set(images) != set(request.page_numbers):
        raise WorkbookImageExportError("page_result_mismatch", "图片转换结果与所选页面不一致")
    pages = [
        WorkbookImagePage(
            page_number=page_number,
            filename=f"shiji-report-page-{page_number:02d}.png",
            data_base64=base64.b64encode(images[page_number]).decode("ascii"),
        )
        for page_number in request.page_numbers
    ]
    return WorkbookImageExportResponse(pages=pages)
