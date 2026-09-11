import argparse
import json
import sys
from collections import Counter
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.acceptance_runner import AcceptanceSafetyError, rundll32_snapshot, run_acceptance
from backend.config import get_llm_config


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="逐条执行并断点保存拾集真实素材可靠性验收。",
    )
    parser.add_argument("--fixture", required=True, type=Path, help="真实素材夹具 JSON 路径")
    parser.add_argument("--checkpoint", required=True, type=Path, help="断点结果 JSON 路径")
    parser.add_argument("--no-report", action="store_true", help="只运行 Agent 1，不生成 Agent 2 报告")
    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    try:
        fixture = json.loads(arguments.fixture.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"无法读取真实素材夹具：{exc}", file=sys.stderr)
        return 2

    config = get_llm_config()
    if config is None:
        print("模型尚未配置，请先在扩展设置页保存并测试模型连接。", file=sys.stderr)
        return 2

    try:
        result = run_acceptance(
            fixture,
            arguments.checkpoint,
            config,
            generate_report=not arguments.no_report,
            process_snapshot=rundll32_snapshot,
        )
    except AcceptanceSafetyError as exc:
        print(f"验收已安全停止：{exc}", file=sys.stderr)
        return 3


    counts = Counter(record.get("status", "unknown") for record in result["materials"].values())
    print(json.dumps({
        "runStatus": result.get("runStatus"),
        "materialStatusCounts": dict(sorted(counts.items())),
        "reportStatus": result.get("reportStatus"),
        "checkpoint": str(arguments.checkpoint.resolve()),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
