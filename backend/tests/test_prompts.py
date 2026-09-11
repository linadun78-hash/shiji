import json

from backend.models import MaterialBriefRequest
from backend.prompts import build_messages


def request() -> MaterialBriefRequest:
    return MaterialBriefRequest.model_validate({
        "materialId": "task-1:xhs:note-1",
        "title": "广州秋季路线",
        "author": "测试作者",
        "bodyText": "未来一周去哪里比较好？ #广州旅游",
        "sourceUrl": "https://www.xiaohongshu.com/explore/note-1",
        "capturedAt": "2026-08-17T10:00:00Z",
        "contentHash": "v1-abcd1234",
    })


def test_prompt_marks_capture_time_as_not_publication_time() -> None:
    messages = build_messages(request())
    source = json.loads(messages[1]["content"].split("待分析资料：\n", 1)[1])
    assert source["capturedAt"] == "2026-08-17T10:00:00Z"
    assert "不是笔记发布时间" in messages[0]["content"]


def test_prompt_protects_relative_time_and_question_only_sources() -> None:
    rules = build_messages(request())[0]["content"]
    assert "未来一周" in rules
    assert "warnings" in rules
    assert "只有提问" in rules
    assert "不得把用户的求推荐问题整理成推荐结果" in rules
