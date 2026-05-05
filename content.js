(() => {
  const STORAGE_DEFAULTS = { enabled: true };
  const VIEW_CLASS = "aa-vc-chart";
  const ORIGINAL_CLASS = "aa-vc-original-hidden";
  const SCRIPT_ID_ATTR = "data-aa-vc-id";
  const DOM_ID_ATTR = "data-aa-vc-dom-id";
  const ORIGINAL_ID_ATTR = "data-aa-vc-original-id";
  const MAX_ITEMS = 40;
  const BREAKDOWN_ITEM_LIMIT = 12;
  const BREAKDOWN_GRID_CLASS = "aa-vc-breakdown-grid";
  const BREAKDOWN_CARD_CLASS = "aa-vc-breakdown-card";
  const INTEREST_MODEL_CLASS_PREFIX = "aa-vc-interest-";
  const INTEREST_MODELS = [
    { className: "gpt-55", pattern: /\bgpt-?5\.5\b/i },
    { className: "claude-opus-47", pattern: /\bclaude\s+opus\s+4\.7\b/i },
    { className: "glm-51", pattern: /\bglm-?5\.1\b/i },
    { className: "mimo", pattern: /\bmimo\b/i }
  ];
  const BENCHMARK_DESCRIPTIONS = new Map([
    ["GDPval-AA", "실제 지식 업무 수행 평가"],
    ["Terminal-Bench Hard", "터미널 작업 해결 평가"],
    ["𝜏²-Bench Telecom", "통신 고객 지원 대화 평가"],
    ["AA-LCR", "긴 문서 추론 평가"],
    ["AA-Omniscience Accuracy", "지식 정답률 평가"],
    ["AA-Omniscience Non-Hallucination Rate", "모를 때 지어내지 않는지 평가"],
    ["Humanity's Last Exam", "전문가급 종합 지식 시험"],
    ["GPQA Diamond", "박사급 과학 문제 평가"],
    ["SciCode", "과학 연구 코드 작성 평가"],
    ["IFBench", "지시 따르기 평가"],
    ["CritPt", "고급 물리 추론 평가"],
    ["APEX-Agents-AA", "긴 실무형 에이전트 작업 평가"],
    ["MMMU-Pro", "어려운 멀티모달 이해 평가"]
  ]);

  let enabled = true;
  let observer;
  let scheduled = false;
  let nextId = 1;

  const ignoredKeys = new Set([
    "@context",
    "@type",
    "modelName",
    "label",
    "Provider",
    "provider",
    "name",
    "detailsUrl",
    "detailsURL",
    "details_url",
    "url",
    "modelUrl",
    "modelURL",
    "model_url",
    "hostsUrl",
    "hosts_url"
  ]);

  const nameKeys = ["modelName", "label", "Provider", "provider", "name", "model", "creator"];
  const urlKeys = ["detailsUrl", "detailsURL", "details_url", "modelUrl", "modelURL", "model_url", "hostsUrl", "hosts_url", "url"];

  function readEnabled() {
    if (!globalThis.chrome?.storage?.sync) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      chrome.storage.sync.get(STORAGE_DEFAULTS, ({ enabled: stored }) => {
        resolve(Boolean(stored));
      });
    });
  }

  function scheduleApply() {
    if (!enabled || scheduled) return;

    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      convertCharts();
    });
  }

  function getDataset(script) {
    let parsed;
    try {
      parsed = JSON.parse(script.textContent || "");
    } catch {
      return null;
    }

    if (
      !parsed ||
      parsed["@type"] !== "Dataset" ||
      !Array.isArray(parsed.data) ||
      parsed.data.length === 0 ||
      typeof parsed.data[0] !== "object"
    ) {
      return null;
    }

    const nameKey = findNameKey(parsed.data);
    if (!nameKey) return null;

    const rows = parsed.data
      .map((item) => {
        const values = collectNumericValues(item);
        if (values.length === 0) return null;

        return {
          name: String(item[nameKey] || "").trim(),
          value: values.reduce((total, value) => total + value, 0),
          href: getHref(item)
        };
      })
      .filter(Boolean)
      .filter((row) => row.name && Number.isFinite(row.value))
      .slice(0, MAX_ITEMS);

    if (rows.length < 2) return null;

    return {
      title: typeof parsed.name === "string" ? parsed.name : "Artificial Analysis",
      description: typeof parsed.description === "string" ? parsed.description : "",
      valueKey: "normalized",
      rows
    };
  }

  function findNameKey(rows) {
    return nameKeys.find((key) => rows.some((row) => typeof row?.[key] === "string" && row[key].trim()));
  }

  function getHref(item) {
    const key = urlKeys.find((candidate) => typeof item[candidate] === "string");
    return key ? item[key] : null;
  }

  function collectNumericValues(source) {
    const values = [];
    walkNumericValues(source, values, []);
    return values;
  }

  function walkNumericValues(value, values, path) {
    if (value == null) return;

    if (typeof value === "number" || typeof value === "string") {
      const key = path[path.length - 1] || "";
      if (isUsableNumberKey(key)) {
        const number = Number(value);
        if (Number.isFinite(number)) values.push(number);
      }
      return;
    }

    if (typeof value !== "object" || Array.isArray(value)) return;

    for (const [key, nestedValue] of Object.entries(value)) {
      if (ignoredKeys.has(key) || key === "displayValue" || key === "tooltipValue" || key === "color" || key === "key") {
        continue;
      }

      walkNumericValues(nestedValue, values, path.concat(key));
    }
  }

  function isUsableNumberKey(key) {
    return key === "value" || !ignoredKeys.has(key);
  }

  function findChartBlock(script) {
    let candidate = script.previousElementSibling;
    let checked = 0;

    while (candidate && checked < 8) {
      checked += 1;

      if (
        !candidate.classList.contains(VIEW_CLASS) &&
        !candidate.classList.contains("sr-only") &&
        (candidate.matches(`[${ORIGINAL_ID_ATTR}]`) || candidate.querySelector("svg, canvas"))
      ) {
        return candidate;
      }

      candidate = candidate.previousElementSibling;
    }

    return null;
  }

  function convertCharts() {
    cleanupConvertedCharts();

    const scripts = document.querySelectorAll('script[type="application/ld+json"]');

    for (const script of scripts) {
      const dataset = getDataset(script);
      if (!dataset) continue;

      const original = findChartBlock(script);
      if (!original) continue;

      const id = ensureScriptId(script);
      original.setAttribute(ORIGINAL_ID_ATTR, id);
      original.classList.add(ORIGINAL_CLASS);

      const existing = document.querySelector(`.${VIEW_CLASS}[data-aa-vc-for="${CSS.escape(id)}"]`);
      if (existing) {
        if (existing.dataset.aaVcSignature !== signature(dataset)) {
          existing.replaceWith(renderChart(dataset, id));
        }
        continue;
      }

      original.insertAdjacentElement("afterend", renderChart(dataset, id));
    }

    convertDomBarCharts();
    convertSvgBarCharts();
    convertDetachedProviderCharts(scripts);
    annotateBenchmarkHeadings();
    cleanupConvertedCharts();
  }

  function cleanupConvertedCharts() {
    const seen = new Set();
    const signaturesByScope = new WeakMap();

    document.querySelectorAll(`.${VIEW_CLASS}`).forEach((view) => {
      const id = view.dataset.aaVcFor;
      const original = id ? document.querySelector(`[${ORIGINAL_ID_ATTR}="${CSS.escape(id)}"]`) : null;
      const signatureValue = view.dataset.aaVcSignature || "";
      const scope = view.parentElement?.closest('[role="tabpanel"], section') || view.parentElement || document.body;
      let scopeSignatures = signaturesByScope.get(scope);

      if (!scopeSignatures) {
        scopeSignatures = new Set();
        signaturesByScope.set(scope, scopeSignatures);
      }

      if (!id || !original || seen.has(id) || scopeSignatures.has(signatureValue)) {
        view.remove();
        return;
      }

      seen.add(id);
      if (signatureValue) scopeSignatures.add(signatureValue);
    });

    cleanupBreakdownGrids();
  }

  function cleanupBreakdownGrids() {
    document.querySelectorAll(`.${BREAKDOWN_GRID_CLASS}`).forEach((grid) => {
      if (!grid.querySelector(`.${VIEW_CLASS}.${BREAKDOWN_CARD_CLASS}`)) {
        grid.classList.remove(BREAKDOWN_GRID_CLASS);
      }
    });
  }

  function convertDetachedProviderCharts(scripts) {
    for (const script of scripts) {
      const dataset = getDetachedProviderDataset(script);
      if (!dataset) continue;

      const original = findDetachedProviderBlock(dataset);
      if (!original) continue;

      dataset.title = findDomChartTitle(original);
      const id = ensureScriptId(script);
      original.setAttribute(ORIGINAL_ID_ATTR, id);
      original.classList.add(ORIGINAL_CLASS);

      const existing = document.querySelector(`.${VIEW_CLASS}[data-aa-vc-for="${CSS.escape(id)}"]`);
      if (existing) {
        if (existing.dataset.aaVcSignature !== signature(dataset)) {
          existing.replaceWith(renderChart(dataset, id));
        }
        continue;
      }

      original.insertAdjacentElement("afterend", renderChart(dataset, id));
    }
  }

  function getDetachedProviderDataset(script) {
    let parsed;
    try {
      parsed = JSON.parse(script.textContent || "");
    } catch {
      return null;
    }

    if (
      !parsed ||
      parsed["@type"] !== "Dataset" ||
      !Array.isArray(parsed.data) ||
      !/Pricing:\s*Input and Output by Provider/i.test(parsed.name || "")
    ) {
      return null;
    }

    const rows = parsed.data
      .map((item) => {
        const inputPrice = Number(item["Input price"]);
        const outputPrice = Number(item["Output price"]);
        const value = Number.isFinite(inputPrice) && Number.isFinite(outputPrice)
          ? inputPrice * 0.75 + outputPrice * 0.25
          : Number.NaN;

        return {
          name: String(item.Provider || "").trim(),
          value,
          href: null
        };
      })
      .filter((row) => row.name && Number.isFinite(row.value))
      .slice(0, MAX_ITEMS);

    if (rows.length < 2) return null;

    return {
      title: typeof parsed.name === "string" ? parsed.name : "Pricing: Input and Output by Provider",
      description: "",
      valueKey: "normalized-provider-pricing",
      rows
    };
  }

  function findDetachedProviderBlock(dataset) {
    const exactMatch = document.querySelector('[id^="pricing-input-and-output-prices"]');
    if (
      exactMatch &&
      !exactMatch.classList.contains(ORIGINAL_CLASS) &&
      !exactMatch.closest(`.${VIEW_CLASS}, .${ORIGINAL_CLASS}`)
    ) {
      return exactMatch;
    }

    if (exactMatch) return null;

    const candidates = [...document.querySelectorAll("section, div")]
      .filter((element) => {
        if (
          element.classList.contains(VIEW_CLASS) ||
          element.classList.contains(ORIGINAL_CLASS) ||
          element.closest(`.${VIEW_CLASS}, .${ORIGINAL_CLASS}`)
        ) {
          return false;
        }

        if (!isVisibleElement(element) || !element.querySelector("svg, canvas")) return false;

        const text = (element.textContent || "").replace(/\s+/g, " ");
        return /\bproviders?\b/i.test(text) && /Pricing \(Input and Output Prices\):/i.test(text) && /Input price/i.test(text) && /Output price/i.test(text);
      })
      .filter((candidate, _, allCandidates) => {
        return !allCandidates.some((other) => other !== candidate && candidate.contains(other));
      });

    return candidates[0] || null;
  }

  function convertDomBarCharts() {
    const candidates = [...document.querySelectorAll("section, div")]
      .filter(isDomBarCandidate)
      .filter((candidate, _, allCandidates) => {
        return !allCandidates.some((other) => other !== candidate && candidate.contains(other));
      });

    for (const original of candidates) {
      const dataset = getDomBarDataset(original);
      if (!dataset) continue;

      const id = ensureDomId(original);
      if (dataset.variant === "breakdown") {
        markBreakdownGrid(original);
      }

      original.setAttribute(ORIGINAL_ID_ATTR, id);
      original.classList.add(ORIGINAL_CLASS);

      const existing = document.querySelector(`.${VIEW_CLASS}[data-aa-vc-for="${CSS.escape(id)}"]`);
      if (existing) {
        if (existing.dataset.aaVcSignature !== signature(dataset)) {
          existing.replaceWith(renderChart(dataset, id));
        }
        continue;
      }

      original.insertAdjacentElement("afterend", renderChart(dataset, id));
    }
  }

  function convertSvgBarCharts() {
    const candidates = [...document.querySelectorAll("svg")]
      .filter(isSvgBarCandidate)
      .filter((candidate, _, allCandidates) => {
        return !allCandidates.some((other) => other !== candidate && candidate.contains(other));
      });

    for (const svg of candidates) {
      const dataset = getSvgBarDataset(svg);
      if (!dataset) continue;

      const original = findEvaluationChartBlock(svg) || findSvgChartBlock(svg);
      if (dataset.variant === "breakdown") {
        markBreakdownGrid(original);
      }

      const id = ensureDomId(original);
      original.setAttribute(ORIGINAL_ID_ATTR, id);
      original.classList.add(ORIGINAL_CLASS);

      const existing = document.querySelector(`.${VIEW_CLASS}[data-aa-vc-for="${CSS.escape(id)}"]`);
      if (existing) {
        if (existing.dataset.aaVcSignature !== signature(dataset)) {
          existing.replaceWith(renderChart(dataset, id));
        }
        continue;
      }

      original.insertAdjacentElement("afterend", renderChart(dataset, id));
    }
  }

  function isSvgBarCandidate(svg) {
    if (
      svg.classList.contains(VIEW_CLASS) ||
      svg.classList.contains(ORIGINAL_CLASS) ||
      svg.closest(`.${VIEW_CLASS}, .${ORIGINAL_CLASS}`)
    ) {
      return false;
    }

    if (!isVisibleElement(svg)) return false;

    const bars = getSvgBars(svg);
    if (bars.length < 5) return false;

    const widths = bars.map((bar) => bar.width).sort((a, b) => a - b);
    const medianWidth = widths[Math.floor(widths.length / 2)] || 0;
    const similarWidthCount = bars.filter((bar) => Math.abs(bar.width - medianWidth) <= Math.max(2, medianWidth * 0.25)).length;
    const maxHeight = Math.max(...bars.map((bar) => bar.height));

    if (similarWidthCount < 5 || maxHeight < 20) return false;

    const dataset = getSvgBarDataset(svg);
    return Boolean(dataset);
  }

  function getSvgBarDataset(svg) {
    const bars = getSvgBars(svg);
    const names = getSvgModelNames(svg);
    const values = getSvgValueLabels(svg);
    const isBreakdown = isSvgBreakdownChart(svg);
    const rowLimit = isBreakdown ? BREAKDOWN_ITEM_LIMIT : MAX_ITEMS;
    const rowCount = Math.min(names.length, values.length, rowLimit);

    if (rowCount < 5) return null;

    const rows = names.slice(0, rowCount)
      .map((name, index) => ({
        name,
        value: values[index],
        href: null
      }))
      .filter((row) => row.name && Number.isFinite(row.value));

    if (rows.length < 5) return null;

    return {
      title: findSvgChartTitle(svg),
      description: "",
      valueKey: "normalized-svg",
      variant: isBreakdown ? "breakdown" : "",
      rows
    };
  }

  function isSvgBreakdownChart(svg) {
    return Boolean(findEvaluationChartBlock(svg));
  }

  function findEvaluationChartBlock(node) {
    let candidate = node.parentElement;

    for (let depth = 0; candidate && depth < 10; depth += 1, candidate = candidate.parentElement) {
      if (candidate.classList.contains(VIEW_CLASS) || candidate.classList.contains(ORIGINAL_CLASS)) {
        continue;
      }

      const scope = candidate.parentElement;
      if (hasEvaluationLink(candidate) && scope?.querySelectorAll('a[href*="/evaluations/"]').length >= 3) {
        return candidate;
      }
    }

    return null;
  }

  function markBreakdownGrid(original) {
    const scope = original?.parentElement;
    if (!scope || scope.querySelectorAll('a[href*="/evaluations/"]').length < 3) return;

    const chartItems = [...scope.children].filter((child) => hasEvaluationLink(child));
    if (chartItems.length >= 3) {
      scope.classList.add(BREAKDOWN_GRID_CLASS);
    }
  }

  function getSvgBars(svg) {
    const bounds = svg.getBoundingClientRect();

    return [...svg.querySelectorAll("rect")]
      .map((rect) => ({
        width: Number(rect.getAttribute("width")),
        height: Number(rect.getAttribute("height")),
        fill: rect.getAttribute("fill") || "",
        rect
      }))
      .filter((bar) => {
        if (!Number.isFinite(bar.width) || !Number.isFinite(bar.height)) return false;
        if (bar.width <= 3 || bar.height <= 8) return false;
        if (/transparent|none/i.test(bar.fill)) return false;
        if (bar.width >= bounds.width * 0.8 || bar.height >= bounds.height * 0.8) return false;
        return true;
      });
  }

  function getSvgModelNames(svg) {
    const seen = new Set();
    return [...svg.querySelectorAll("title")]
      .map((title) => title.textContent.replace(/\s+/g, " ").trim())
      .filter((text) => text && !/^reasoning model$/i.test(text))
      .filter((text) => {
        if (seen.has(text)) return false;
        seen.add(text);
        return true;
      });
  }

  function getSvgValueLabels(svg) {
    const labels = [...svg.querySelectorAll("text")]
      .map((text) => (text.textContent || "").trim().replace(/,/g, ""));
    const percentValues = labels
      .filter((text) => /^-?\d+(?:\.\d+)?%$/.test(text))
      .map((text) => Number(text.replace(/%$/, "")))
      .filter(Number.isFinite);
    const values = (percentValues.length >= 5 ? percentValues : labels
      .filter((text) => /^-?\d+(?:\.\d+)?$/.test(text))
      .map(Number)
      .filter(Number.isFinite));

    return values.slice(-MAX_ITEMS);
  }

  function findSvgChartBlock(svg) {
    const svgBounds = svg.getBoundingClientRect();
    let candidate = svg.parentElement;

    for (let depth = 0; candidate && depth < 8; depth += 1, candidate = candidate.parentElement) {
      if (candidate.classList.contains(VIEW_CLASS) || candidate.classList.contains(ORIGINAL_CLASS)) {
        continue;
      }

      const bounds = candidate.getBoundingClientRect();
      const textBeforeSvg = getTextBeforeNode(candidate, svg);

      if (
        textBeforeSvg &&
        bounds.width >= Math.max(120, svgBounds.width) &&
        bounds.width <= Math.max(700, svgBounds.width + 160) &&
        bounds.height >= Math.max(120, svgBounds.height) &&
        bounds.height <= Math.max(700, svgBounds.height + 240)
      ) {
        return candidate;
      }
    }

    return svg;
  }

  function findSvgChartTitle(svg) {
    let candidate = svg.parentElement;

    for (let depth = 0; candidate && depth < 8; depth += 1, candidate = candidate.parentElement) {
      const text = getFirstTextBeforeNode(candidate, svg) || getTextBeforeNode(candidate, svg);
      if (text) {
        return text.match(/^[A-Za-z][A-Za-z0-9 &'()/:.$-]+/)?.[0]?.trim() || text;
      }
    }

    return findDomChartTitle(svg);
  }

  function getTextBeforeNode(root, node) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(textNode) {
        if (!textNode.textContent.trim()) return NodeFilter.FILTER_REJECT;
        if (node.contains(textNode)) return NodeFilter.FILTER_REJECT;
        if (textNode.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const parts = [];
    while (walker.nextNode()) {
      parts.push(walker.currentNode.textContent.trim());
      if (parts.join(" ").length > 80) break;
    }

    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function getFirstTextBeforeNode(root, node) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(textNode) {
        if (!textNode.textContent.trim()) return NodeFilter.FILTER_REJECT;
        if (node.contains(textNode)) return NodeFilter.FILTER_REJECT;
        if (textNode.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    return walker.nextNode() ? walker.currentNode.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function isDomBarCandidate(element) {
    if (
      element.classList.contains(VIEW_CLASS) ||
      element.classList.contains(ORIGINAL_CLASS) ||
      element.closest(`.${VIEW_CLASS}, .${ORIGINAL_CLASS}`)
    ) {
      return false;
    }

    if (!isVisibleElement(element)) return false;

    const links = getSeriesLinks(element);
    if (links.length < 5 || links.length > MAX_ITEMS) return false;

    const isBreakdown = isDomBreakdownChart(element);
    if (!isBreakdown && !/\bproviders?\b/i.test(element.textContent || "")) return false;

    const values = getNumericTextValues(element);
    if (values.length < links.length) return false;
    if (values.length > links.length * 3) return false;

    return true;
  }

  function getDomBarDataset(element) {
    const links = getSeriesLinks(element);
    const values = getNumericTextValues(element);
    const isBreakdown = isDomBreakdownChart(element);
    const rowLimit = isBreakdown ? BREAKDOWN_ITEM_LIMIT : MAX_ITEMS;
    const chartValues = isBreakdown
      ? extractRankedScores(values, links.length).slice(0, rowLimit)
      : values.slice(-Math.min(links.length, values.length, rowLimit));
    const rowCount = Math.min(links.length, chartValues.length, rowLimit);
    if (rowCount < 2) return null;

    const rows = links.slice(0, rowCount)
      .map((link, index) => ({
        name: getSeriesName(link),
        value: chartValues[index],
        href: link.href || null
      }))
      .filter((row) => row.name && Number.isFinite(row.value));

    if (rows.length < 2) return null;

    return {
      title: findDomChartTitle(element),
      description: "",
      valueKey: isBreakdown ? "normalized-dom-breakdown" : "normalized-dom",
      variant: isBreakdown ? "breakdown" : "",
      rows
    };
  }

  function isDomBreakdownChart(element) {
    if (!hasEvaluationLink(element)) return false;

    const scope = element.parentElement;
    if (!scope) return false;
    return scope.querySelectorAll('a[href*="/evaluations/"]').length >= 3;
  }

  function hasEvaluationLink(element) {
    return Boolean(element?.matches?.('a[href*="/evaluations/"]') || element?.querySelector?.(':scope > a[href*="/evaluations/"]'));
  }

  function extractRankedScores(values, totalRows) {
    const candidates = values[0] === totalRows ? values.slice(1) : values;
    const scores = [];
    let expectedRank = 1;

    for (const value of candidates) {
      if (Number.isInteger(value) && value === expectedRank && scores.length === expectedRank - 1) {
        expectedRank += 1;
        continue;
      }

      scores.push(value);
      if (scores.length >= totalRows) break;
    }

    return scores;
  }

  function getSeriesLinks(element) {
    const seen = new Set();
    return [...element.querySelectorAll('a[href*="/models/"], a[href*="/providers/"]')]
      .filter(isVisibleElement)
      .filter((link) => {
        const name = getSeriesName(link);
        const key = `${link.href}|${name}`;
        if (!name || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function getSeriesName(link) {
    return (link.getAttribute("aria-label") || link.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\d+\s*/, "");
  }

  function getNumericTextValues(element) {
    const values = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || parent.closest("button, select, input, textarea, [role='button'], [role='tab']")) {
            return NodeFilter.FILTER_REJECT;
          }

          const text = (node.textContent || "").trim().replace(/,/g, "");
          if (!/^-?\d+(?:\.\d+)?$/.test(text)) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    while (walker.nextNode()) {
      const number = Number((walker.currentNode.textContent || "").trim().replace(/,/g, ""));
      if (Number.isFinite(number)) values.push(number);
    }

    return values;
  }

  function findDomChartTitle(element) {
    const ownText = (element.textContent || "").replace(/\s+/g, " ").trim();
    const ownTitle =
      ownText.match(/Output Speed:\s*.+?(?=Output Speed:|Price:|;|\d+ of \d+ providers?|$)/i) ||
      ownText.match(/Pricing[^:]*:\s*.+?(?=Output Speed:|Price:|;|\d+ of \d+ providers?|$)/i);

    if (ownTitle?.[0]) return ownTitle[0].trim();

    const headingSelector = "h1, h2, h3, h4, [role='heading']";
    let scope = element.parentElement;

    for (let depth = 0; scope && depth < 5; depth += 1, scope = scope.parentElement) {
      const headings = [...scope.querySelectorAll(headingSelector)]
        .filter((heading) => heading !== element && !element.contains(heading) && isBefore(heading, element))
        .map((heading) => heading.textContent.replace(/\s+/g, " ").trim())
        .filter(Boolean);

      if (headings.length > 0) return headings[headings.length - 1];
    }

    return "Artificial Analysis";
  }

  function isBefore(a, b) {
    return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function isVisibleElement(element) {
    return Boolean(element.offsetParent || element.getClientRects().length);
  }

  function ensureScriptId(script) {
    let id = script.getAttribute(SCRIPT_ID_ATTR);
    if (!id) {
      id = `chart-${nextId}`;
      nextId += 1;
      script.setAttribute(SCRIPT_ID_ATTR, id);
    }
    return id;
  }

  function ensureDomId(element) {
    let id = element.getAttribute(DOM_ID_ATTR);
    if (!id) {
      id = `dom-chart-${nextId}`;
      nextId += 1;
      element.setAttribute(DOM_ID_ATTR, id);
    }
    return id;
  }

  function signature(dataset) {
    return `${dataset.title}|${dataset.valueKey}|${dataset.variant || ""}|${dataset.rows.map((row) => `${row.name}:${row.value}`).join(",")}`;
  }

  function annotateBenchmarkHeadings() {
    document.querySelectorAll("h1, h2, h3, h4, h5, h6, div, span, p").forEach((element) => {
      if (element.closest(`.${VIEW_CLASS}`) || element.closest(`.${ORIGINAL_CLASS}`)) return;
      if (element.children.length > 0) return;
      if (!isVisibleElement(element)) return;

      const title = cleanBenchmarkTitle(element.textContent || "");
      const description = BENCHMARK_DESCRIPTIONS.get(title);
      if (!description) return;

      element.textContent = formatBenchmarkTitle(title, description);
    });
  }

  function cleanBenchmarkTitle(title) {
    return title
      .replace(/\s+/g, " ")
      .replace(/\s*\([^)]*\)\s*$/, "")
      .trim();
  }

  function formatBenchmarkTitle(title, description = BENCHMARK_DESCRIPTIONS.get(cleanBenchmarkTitle(title))) {
    const cleanTitle = cleanBenchmarkTitle(title);
    return description ? `${cleanTitle} (${description})` : title;
  }

  function renderChart(dataset, id) {
    const max = Math.max(...dataset.rows.map((row) => Math.abs(row.value)), 1);
    const wrapper = document.createElement("section");
    wrapper.className = VIEW_CLASS;
    if (dataset.variant === "breakdown") {
      wrapper.classList.add(BREAKDOWN_CARD_CLASS);
    }
    wrapper.dataset.aaVcFor = id;
    wrapper.dataset.aaVcSignature = signature(dataset);

    const head = document.createElement("div");
    head.className = "aa-vc-head";

    const title = document.createElement("h3");
    title.className = "aa-vc-title";
    title.textContent = formatBenchmarkTitle(dataset.title);

    const meta = document.createElement("div");
    meta.className = "aa-vc-meta";
    meta.textContent = `${dataset.rows.length} items`;

    head.append(title, meta);

    const body = document.createElement("div");
    body.className = "aa-vc-body";

    dataset.rows.forEach((row, index) => {
      body.append(renderRow(row, index, max, dataset));
    });

    wrapper.append(head, body);
    return wrapper;
  }

  function renderRow(row, index, max, dataset) {
    const fragment = document.createDocumentFragment();
    const percent = Math.max(0.01, Math.min(1, normalizedScore(row, index, dataset) / 100)) * 100;

    const rowMarker = document.createElement("div");
    rowMarker.className = "aa-vc-row";
    const interestClass = getInterestModelClass(row.name);
    if (interestClass) {
      rowMarker.classList.add("aa-vc-row-interest", interestClass);
    }

    const nameCell = document.createElement(row.href ? "a" : "div");
    nameCell.className = "aa-vc-name";
    if (row.href) {
      nameCell.href = row.href;
    }

    const indexNode = document.createElement("span");
    indexNode.className = "aa-vc-index";
    indexNode.textContent = String(index + 1);

    const labelNode = document.createElement("span");
    labelNode.textContent = row.name;
    nameCell.append(indexNode, labelNode);

    const valueCell = document.createElement("div");
    valueCell.className = "aa-vc-value";

    const track = document.createElement("div");
    track.className = "aa-vc-bar-track";

    const bar = document.createElement("div");
    bar.className = "aa-vc-bar";
    bar.style.width = `${percent.toFixed(2)}%`;
    track.append(bar);

    const number = document.createElement("span");
    number.className = "aa-vc-number";
    number.title = "Normalized score, with the first ranked item set to 100";
    number.textContent = formatScore(normalizedScore(row, index, dataset));

    valueCell.append(track, number);
    rowMarker.append(nameCell, valueCell);
    fragment.append(rowMarker);

    return fragment;
  }

  function getInterestModelClass(name) {
    const matched = INTEREST_MODELS.find((model) => model.pattern.test(name || ""));
    return matched ? `${INTEREST_MODEL_CLASS_PREFIX}${matched.className}` : "";
  }

  function normalizedScore(row, index, dataset) {
    if (index === 0) return 100;

    const bestValue = dataset.rows[0]?.value;
    if (!Number.isFinite(bestValue) || !Number.isFinite(row.value)) return 0;
    if (bestValue === 0 || row.value === 0) return 0;

    const rawScore =
      Math.abs(row.value) <= Math.abs(bestValue)
        ? (row.value / bestValue) * 100
        : (bestValue / row.value) * 100;

    return Math.max(0, Math.min(100, rawScore));
  }

  function formatScore(score) {
    return String(Math.round(score));
  }

  function restoreOriginalCharts() {
    document.querySelectorAll(`.${VIEW_CLASS}`).forEach((node) => node.remove());
    document.querySelectorAll(`.${ORIGINAL_CLASS}`).forEach((node) => {
      node.classList.remove(ORIGINAL_CLASS);
      node.removeAttribute(ORIGINAL_ID_ATTR);
    });
    document.querySelectorAll(`.${BREAKDOWN_GRID_CLASS}`).forEach((node) => {
      node.classList.remove(BREAKDOWN_GRID_CLASS);
    });
  }

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver((mutations) => {
      if (
        mutations.some((mutation) =>
          [...mutation.addedNodes, ...mutation.removedNodes].some((node) => node.nodeType === Node.ELEMENT_NODE)
        )
      ) {
        scheduleApply();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  async function init() {
    enabled = await readEnabled();

    if (enabled) {
      convertCharts();
      startObserver();
    }

    if (globalThis.chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "sync" || !changes.enabled) return;

        enabled = Boolean(changes.enabled.newValue);
        if (enabled) {
          convertCharts();
          startObserver();
        } else {
          restoreOriginalCharts();
        }
      });
    }
  }

  init();
})();
