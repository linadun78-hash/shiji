(function exposeDirectReportValidator(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.XhsDirectReportValidator = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createValidator() {
  function fail(message) { throw new Error(message); }
  function withoutListMarkers(text) {
    return String(text || '').replace(/^[ \t]*\d{1,3}[.)、][ \t]+/gm, '');
  }
  function numericText(text) {
    return withoutListMarkers(text).replace(/([0-9])\uFE0F?\u20E3/g, '$1');
  }
  function numericMatches(text) {
    return [...text.matchAll(/\d{1,2}:\d{2}|\d+(?:\.\d+)?\s*(?:个\s*(?:小时|分钟|月|星期)|元|小时|分钟|点|日|天|周|月|公里|km|版|号线|号|人|位|个|项|条|次|张|份|件|晚|%|％)?/gi)];
  }
  function numericTokens(text) {
    // Keep source ordinal boundaries: 2 + keycap + a name starting with 日 is not 2日.
    return numericMatches(withoutListMarkers(text)).map((match) => match[0].replace(/\s+/g, '').toLowerCase());
  }
  function sourceList(materialId, evidence) {
    let offset = 0;
    const spans = [];
    for (const [id, quote] of evidence) {
      if (typeof quote !== 'string') return null;
      spans.push({ id, quote, start: offset, end: offset + quote.length });
      offset += quote.length;
    }
    const text = spans.map((span) => span.quote).join('');
    const markers = [...text.matchAll(/([1-9])\uFE0F?\u20E3|(\u{1F51F})/gu)];
    if (markers.length < 2 || markers.some((marker, index) => (
      Number(marker[1] || 10) !== index + 1 || /[+\-\d.]/.test(text[marker.index - 1] || '')
    ))) return null;
    const names = [];
    const evidenceIds = new Set();
    for (const [index, marker] of markers.entries()) {
      const start = marker.index + marker[0].length;
      const end = markers[index + 1]?.index ?? text.length;
      const heading = text.slice(start, end).match(/^\s*([\p{L}\p{N}·（）()\-]+)/u);
      if (!heading || heading[1].length > 80 || !/\p{L}/u.test(heading[1])) return null;
      names.push(heading[1]);
      // Preserve heading coverage even when a source chunk splits a name/marker.
      const headingEnd = start + heading[0].length;
      for (const span of spans) if (span.start < headingEnd && span.end > marker.index) evidenceIds.add(span.id);
    }
    if (new Set(names).size !== names.length) return null;
    return { materialId, count: names.length, names, evidenceIds: [...evidenceIds] };
  }
  function coversList(list, citationIds, citations) {
    const ids = new Set((citationIds || []).flatMap((id) => {
      const citation = citations.get(id);
      return citation?.materialId === list.materialId ? citation.evidenceIds : [];
    }));
    return list.evidenceIds.every((id) => ids.has(id));
  }
  function buildSourceLists(request) {
    return (request.selectedMaterials || []).map((material) => sourceList(material.materialId,
      new Map((material.evidence || []).map((item) => [item.id, item.quote])))).filter(Boolean)
      .map(({ names, ...list }, index) => ({ id: `L${index + 1}`, ...list, members: names }));
  }
  function listError(code, field, message) {
    return Object.assign(new Error(message), { code, field });
  }
  function hasListSyntax(text) {
    return /\{\{|\}\}|sourceList\s*:/i.test(text);
  }
  function validateNumbers(text, sources, field, label, eligibleLists, issues) {
    const allowed = new Set(sources.flatMap(numericTokens));
    const input = numericText(text);
    for (const match of numericMatches(input)) {
      const token = match[0].replace(/\s+/g, '').toLowerCase();
      if (allowed.has(token)) continue;
      const error = Object.assign(new Error(`${label}包含未经支持的数字：${token.slice(0, 40)}`),
        { code: 'unsupported_numeric_claim', field, token });
      // Only a list-format issue may request correction, never authorize the claim.
      error.correctableListFormat = /^\d+(?:个|项|条)$/.test(token)
        && !/[+\-\d.]/.test(input[match.index - 1] || '')
        && eligibleLists.some((list) => list.count === Number.parseInt(token, 10));
      issues.push(error);
    }
  }
  function normalizedUserStatement(text) {
    return withoutListMarkers(text).toLowerCase().replace(/[^0-9a-z\u4e00-\u9fff]+/g, '');
  }
  function validateDirectReport(input, request) {
    if (!input || !Array.isArray(input.citations)) fail('报告缺少引用');
    if ('sourceLists' in input) fail('报告不能改写程序清单');
    if (request.sourceRevision !== undefined && input.sourceRevision !== request.sourceRevision) fail('报告素材版本不一致');
    const report = JSON.parse(JSON.stringify(input));
    const evidenceByMaterial = new Map((request.selectedMaterials || []).map((material) => [
      material.materialId, new Map((material.evidence || []).map((item) => [item.id, item.quote])),
    ]));
    const citations = new Map();
    const quotesByCitation = new Map();
    const citedText = [];
    for (const citation of report.citations) {
      if (citations.has(citation.id)) fail('报告包含重复引用');
      const evidence = evidenceByMaterial.get(citation.materialId);
      if (!evidence) fail('引用指向了未选中的素材');
      if (!Array.isArray(citation.evidenceIds) || !citation.evidenceIds.length
        || citation.evidenceIds.some((id) => !evidence.has(id))) fail('引用包含未知证据');
      citations.set(citation.id, citation);
      const quotes = citation.evidenceIds.map((id) => evidence.get(id));
      quotesByCitation.set(citation.id, quotes);
      citedText.push(...quotes);
    }
    if (request.supplementMode === 'source_only' && report.supplements?.length) fail('仅素材模式不能包含 AI 补充');
    const lists = buildSourceLists(request);
    const userContext = [request.goal || '', ...(request.constraints || [])];
    const fields = [];
    const add = (owner, key, field, label, sources, ids, origin) => {
      fields.push({ owner, key, field, label, sources, ids, origin });
    };
    add(report, 'goalUnderstanding', 'goalUnderstanding', '目标理解', userContext, [], 'user');
    add(report, 'executiveSummary', 'executiveSummary', '报告摘要', [...citedText, ...userContext], [...citations.keys()], 'source');
    (report.informationGaps || []).forEach((text, index) => {
      add(report.informationGaps, index, `informationGaps[${index}]`, `信息缺口第${index + 1}项`, [...citedText, ...userContext], [...citations.keys()], 'source');
    });
    for (const group of ['themes', 'conflicts', 'nextActions']) {
      for (const [index, statement] of (report[group] || []).entries()) {
        if (statement.origin !== 'user' && (!Array.isArray(statement.citationIds) || !statement.citationIds.length)) fail('来源结论必须包含引用');
        for (const id of statement.citationIds || []) if (!citations.has(id)) fail('结论引用不存在');
        const fromUser = statement.origin === 'user';
        if (fromUser && statement.citationIds?.length) fail('用户要求不能引用素材证据');
        if (fromUser && hasListSyntax(statement.text)) throw listError('invalid_source_list_origin', group, '用户要求不能包含程序清单引用');
        if (fromUser && !userContext.some((text) => normalizedUserStatement(text) && normalizedUserStatement(text) === normalizedUserStatement(statement.text))) {
          fail('用户结论必须对应明确填写的目标或限制');
        }
        const sources = fromUser ? userContext : statement.citationIds.flatMap((id) => quotesByCitation.get(id));
        const label = { themes: '主题', conflicts: '冲突', nextActions: '下一步' }[group];
        add(statement, 'text', `${group}[${index}].text`, `${label}第${index + 1}项`, sources, statement.citationIds || [], statement.origin);
      }
    }
    for (const [index, action] of (report.preflightActions || []).entries()) {
      if (action.origin !== 'user' && (!Array.isArray(action.citationIds) || !action.citationIds.length)) fail('操作项必须包含引用');
      for (const id of action.citationIds || []) if (!citations.has(id)) fail('操作项引用不存在');
      const sources = (action.citationIds || []).flatMap((id) => quotesByCitation.get(id));
      for (const key of ['title', 'purpose', 'successCheck', 'fallback']) {
        add(action, key, `preflightActions[${index}].${key}`, `前置操作第${index + 1}项`, sources, action.citationIds || [], action.origin);
      }
      (action.steps || []).forEach((text, step) => {
        add(action.steps, step, `preflightActions[${index}].steps[${step}]`, `前置操作第${index + 1}项步骤${step + 1}`, sources, action.citationIds || [], action.origin);
      });
    }
    // Scan unhandled fields too: tokens must never leak into metadata or supplements.
    function checkOtherFields(value, field = '') {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        const childField = Array.isArray(value) ? `${field}[${key}]` : (field ? `${field}.${key}` : key);
        if (typeof child === 'string' && hasListSyntax(child)
          && !fields.some((entry) => entry.owner === value && String(entry.key) === key)) {
          throw listError('invalid_source_list_origin', childField, '该字段不能包含程序清单引用');
        }
        checkOtherFields(child, childField);
      }
    }
    checkOtherFields(report);
    const issues = [];
    const modelText = [];
    for (const { owner, key, field, label, sources, ids, origin } of fields) {
      const text = owner[key];
      if (text === undefined) continue;
      if (typeof text !== 'string') fail('报告文字字段格式无效');
      const eligible = origin === 'source' ? lists.filter((list) => coversList(list, ids, citations)) : [];
      const edits = [];
      // Consume only placeholder syntax, never prose following an unclosed marker.
      const tokenPattern = /\{\{[ \t]*[A-Za-z][A-Za-z0-9]*[ \t]*:[ \t]*[A-Za-z0-9]+[ \t]*\}*/g;
      for (const match of text.matchAll(tokenPattern)) {
        if (origin !== 'source') throw listError('invalid_source_list_origin', field, '该字段不能包含程序清单引用');
        const id = match[0].match(/^\{\{sourceList:(L[1-9]\d*)\}\}$/)?.[1];
        const list = lists.find((item) => item.id === id);
        const before = text.slice(0, match.index);
        const after = text.slice(match.index + match[0].length);
        const standalone = /(?:^|[。！？.!?；;\r\n])[ \t]*$/.test(before)
          && /^(?:[ \t]*$|[ \t]*(?:[。！？.!?；;]|\r?\n))/.test(after);
        if (list && !eligible.includes(list)) throw listError('invalid_source_list_citation', field, '清单引用未覆盖完整原文证据');
        if (!list || !standalone) {
          const error = listError('invalid_source_list_token', field, '清单引用格式无效，必须独立成句');
          error.correctableListFormat = eligible.length > 0;
          issues.push(error);
        }
        edits.push({ start: match.index, end: match.index + match[0].length, list });
      }
      let prose = text;
      for (const edit of [...edits].reverse()) prose = prose.slice(0, edit.start) + '\n' + prose.slice(edit.end);
      if (hasListSyntax(prose)) {
        const error = listError(origin === 'source' ? 'invalid_source_list_token' : 'invalid_source_list_origin', field, '清单引用格式无效');
        error.correctableListFormat = eligible.length > 0;
        issues.push(error);
      }
      validateNumbers(prose, sources, field, label, eligible, issues);
      modelText.push(prose);
      let expanded = text;
      for (const edit of [...edits].reverse()) {
        if (!edit.list) continue;
        const rendered = `原文编号清单共${edit.list.count}项：${edit.list.members.join('、')}。`;
        const end = text[edit.end] === '。' ? edit.end + 1 : edit.end;
        expanded = expanded.slice(0, edit.start) + rendered + expanded.slice(end);
      }
      owner[key] = expanded;
    }
    const claimText = modelText.join(' ');
    for (const term of ['今天', '明天', '最近', '近期', '现在', '本周', '下周']) {
      if (claimText.includes(term) && !new RegExp(`${term}.{0,18}(需核验|待确认|可能过时|发布时间)`).test(claimText)) fail('相对时间必须明确标注待核验');
    }
    // A format error earlier in the report must not hide a non-retryable failure later.
    const failure = issues.find((error) => !error.correctableListFormat) || issues[0];
    if (failure) throw failure;
    return report;
  }
  return { validateDirectReport, buildSourceLists };
}));
