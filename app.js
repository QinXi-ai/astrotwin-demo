(function () {
  "use strict";

  const isPublicStatic = window.ASTROTWIN_PUBLIC_STATIC === true;

  const state = {
    evidence: null,
    run: null,
    pollTimer: null,
    dialogOpener: null,
    toastTimer: null,
    labPollTimer: null,
    labOptionsReady: false,
    labAllowedModels: [],
    labFile: null,
    labRun: null,
    labModelSubmitted: null,
    labServerCredentialAvailable: null,
    labResumeAvailable: false,
    labResumeRunId: null,
    labLimits: { requestBytes: 262144, materialChars: 40000, totalMaterialChars: 120000 },
    scientificChain: null,
    scientificChainStep: "source_facts",
    signalData: null,
    signalHash: null,
    signalMode: "raw",
    signalSampleRole: "canonical_correct",
    signalFrame: null,
    signalReveal: 1,
    signalResizeObserver: null,
    signalResizeTimer: null,
    signalTourFrame: null,
    signalTourStartedAt: null,
    signalTourElapsed: 0,
    signalTourStep: -1,
    signalTourRunning: false,
    errorAtlas: null,
    errorAtlasRecords: [],
    errorAtlasFilteredRecords: [],
    errorAtlasModality: "all",
    errorAtlasSelectedIndex: null,
    errorAtlasSelectedExperimentIndex: 0,
    errorAtlasSelectedExperiments: [],
    scienceOptions: null,
    scienceResult: null,
    scienceMode: "guided",
    scienceExperimentId: "pixel_incremental_value",
    scienceRunning: false,
  };

  const $ = (id) => document.getElementById(id);
  const startButton = $("startDemo");
  const verifyButton = $("verifyEvidence");
  const dialog = $("evidenceDialog");
  const labForm = $("judgeLabForm");
  const labRunButton = $("runJudgeLab");
  const labResumeButton = $("resumeJudgeLab");
  const signalStage = $("signalStage");
  const signalCanvas = $("lightCurveCanvas");
  const signalTourButton = $("signalTourButton");
  $("labApiKey").value = "";

  const SIGNAL_MODES = ["raw", "phase", "duel", "error"];
  const SIGNAL_ROLES = ["canonical_correct", "periodic_binary", "hard_error"];
  const SIGNAL_MODEL_IDS = ["metadata_pixel", "qlp_enhanced", "fixed_half_fusion"];
  const SIGNAL_CLASS_NAMES = ["PC", "EB", "V", "IS"];
  const SIGNAL_HASH = /^[0-9a-f]{64}$/;
  const SIGNAL_TOUR_DURATION = 30000;
  const SIGNAL_TOUR_STEPS = [
    { at: 0, mode: "raw", role: "canonical_correct", message: "第一幕：真实 TESS 光变逐点进入视野，观测缺口与信号点同步标出。" },
    { at: 7500, mode: "phase", role: "periodic_binary", message: "第二幕：固定星历完成相位折叠，多次亮度下降对齐成周期双星形态。" },
    { at: 15000, mode: "duel", role: "periodic_binary", message: "第三幕：Metadata、QLP 与固定融合模型现场亮票，程序读取同一份概率证据。" },
    { at: 22500, mode: "error", role: "hard_error", message: "第四幕：高置信错例 V 到 IS 被完整保留，系统展示失败而不是隐藏失败。" },
  ];
  const ERROR_ATLAS_MODALITIES = ["all", "qwen", "pixel", "cross_modal"];
  const SIGNAL_MODE_META = {
    raw: { badge: "RAW", title: "真实 TESS 原始光变", x: "TIME / DAYS" },
    phase: { badge: "PHASE", title: "固定星历相位折叠", x: "ORBITAL PHASE" },
    duel: { badge: "MODEL DUEL", title: "三路固定模型概率对决", x: "CLASS PROBABILITY" },
    error: { badge: "ERROR MAP", title: "保留错例的程序解剖", x: "TIME / DAYS" },
  };
  const signalMotionQuery = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  const LAB_AGENT_ORDER = [
    "fact_extractor",
    "hypothesis_generator",
    "adversarial_critic_pre",
    "hypothesis_reviser",
    "experiment_designer",
    "report_writer",
    "hard_validator",
  ];

  const LAB_STAGE_AGENT = {
    FACT_EXTRACTION: "fact_extractor",
    HYPOTHESIS_GENERATION: "hypothesis_generator",
    ADVERSARIAL_REVIEW: "adversarial_critic_pre",
    HYPOTHESIS_REVISION: "hypothesis_reviser",
    EXPERIMENT_DESIGN: "experiment_designer",
    REPORT_SYNTHESIS: "report_writer",
    HARD_VALIDATION: "hard_validator",
    PACKAGING: "hard_validator",
  };

  const LAB_STANDARD_FIELDS = [
    "Problem Statement",
    "Rationale",
    "Technical Details",
    "Datasets",
    "Paper Title",
    "Paper Abstract",
    "Methods",
    "Experiments",
    "Results",
    "References",
  ];

  const SCIENTIFIC_CHAIN_ORDER = [
    "source_facts",
    "hypothesis",
    "experiment",
    "local_result",
    "sector4_stress_test",
    "verdict",
  ];

  const SCIENTIFIC_CHAIN_META = {
    source_facts: { index: "01 / SOURCE / FACTS", title: "原文 / 事实" },
    hypothesis: { index: "02 / FALSIFIABLE CLAIM", title: "假设" },
    experiment: { index: "03 / FIXED PROTOCOL", title: "实验" },
    local_result: { index: "04 / LOCAL RESULT", title: "本地结果" },
    sector4_stress_test: { index: "05 / EXTERNAL STRESS TEST", title: "Sector 4 压力测试" },
    verdict: { index: "06 / PROGRAM VERDICT", title: "Verdict" },
  };

  const ROLE_LABELS = {
    fact_extractor: ["事实提取", "FACT"],
    hypothesis_generator: ["假设生成", "HYP"],
    adversarial_critic_pre: ["实验前反方审查", "CRIT"],
    experiment_designer: ["实验设计", "EXP"],
    conclusion_generator: ["科学结论", "CONC"],
    adversarial_critic_post: ["结果反方审查", "AUDIT"],
    report_writer: ["结构化报告", "DOC"],
  };

  const PIPELINE_STAGES = {
    LOCK_AND_BIND: "source_facts",
    PREFLIGHT: "source_facts",
    P05_DETERMINISTIC_REPLAY: "local_result",
    P06_AUTOMATIC_ADJUDICATION: "hypothesis",
    PACKAGE_AND_SCAN: "verdict",
    FINAL_VERIFY: "verdict",
    ATOMIC_PUBLISH: "verdict",
    COMPLETE: "verdict",
  };

  const BINDING_LABELS = {
    authorization: "数据授权",
    case: "固定案例",
    config: "运行配置",
    inputs: "输入证据",
    models: "模型",
    code: "执行代码",
    frontend: "前端与主视觉",
    schemas: "Schemas",
    source_evidence: "源证据",
    outputs: "输出产物",
  };

  function setText(id, value, fallback = "—") {
    const node = $(id);
    if (node) node.textContent = value === null || value === undefined || value === "" ? fallback : String(value);
  }

  function humanizeKey(key) {
    return String(key).replaceAll("_", " ").replace(/\s+/g, " ").trim();
  }

  function richElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Structured evidence (boundaries, facts, records) rendered as readable chips instead of "key: value" dumps.
  // Only inline elements are produced so the output stays valid inside <p> containers.
  function buildRich(value) {
    const wrap = richElement("span", "rich");
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item === null || item === undefined || item === "") return;
        const row = richElement("span", "rich-item");
        if (isRecord(item) || Array.isArray(item)) row.append(buildRich(item));
        else row.textContent = String(item);
        wrap.append(row);
      });
      return wrap;
    }
    const prose = richElement("span", "rich-prose-group");
    const meta = richElement("span", "rich-meta");
    const flags = richElement("span", "rich-flags");
    Object.entries(value).forEach(([key, item]) => {
      if (item === null || item === undefined || item === "") return;
      if (typeof item === "boolean") {
        const flag = richElement("span", "rich-flag");
        flag.dataset.on = String(item);
        flag.append(richElement("b", "", item ? "✓" : "✕"), document.createTextNode(humanizeKey(key)));
        flags.append(flag);
      } else if (isRecord(item) || Array.isArray(item) || (typeof item === "string" && item.length > 64)) {
        const block = richElement("span", "rich-prose");
        block.append(richElement("i", "", humanizeKey(key)));
        if (isRecord(item) || Array.isArray(item)) block.append(buildRich(item));
        else block.append(richElement("span", "", item));
        prose.append(block);
      } else {
        const pair = richElement("span", "rich-kv");
        pair.append(richElement("i", "", humanizeKey(key)), richElement("b", "", String(item)));
        meta.append(pair);
      }
    });
    [prose, meta, flags].forEach((group) => { if (group.childNodes.length) wrap.append(group); });
    return wrap;
  }

  function renderRich(id, value, fallback = "—") {
    const node = typeof id === "string" ? $(id) : id;
    if (!node) return;
    node.replaceChildren();
    node.classList.remove("rich-host");
    if (value === null || value === undefined || value === "") {
      node.textContent = fallback;
      return;
    }
    if (!isRecord(value) && !Array.isArray(value)) {
      node.textContent = typeof value === "boolean" ? (value ? "是" : "否") : String(value);
      return;
    }
    node.classList.add("rich-host");
    node.append(buildRich(value));
  }

  const QWEN_ERROR_SYSTEMS = { QWEN_VL: "Qwen-VL 读图", P05_FIXED_HALF_BASELINE: "P5 固定融合基线" };

  function renderQwenErrorCard(item, error) {
    if (!isRecord(error)) {
      item.textContent = displayValue(error);
      return;
    }
    item.className = "qwen-error-card";
    item.dataset.system = String(error.system || "");
    const head = richElement("span", "qwen-error-head");
    head.append(richElement("span", "qwen-error-system", QWEN_ERROR_SYSTEMS[error.system] || humanizeKey(error.system || "system")));
    const classes = richElement("span", "qwen-error-classes");
    classes.append(
      richElement("b", "truth", `真 ${error.true_class ?? "—"}`),
      richElement("span", "", "→"),
      richElement("b", "pred", `判 ${error.predicted_class ?? "—"}`),
    );
    head.append(classes);
    const probabilities = Array.isArray(error.class_probabilities) ? error.class_probabilities.map(finite).filter((value) => value !== null) : [];
    const confidence = finite(error.confidence) ?? (probabilities.length ? Math.max(...probabilities) : null);
    if (confidence !== null) head.append(richElement("span", "qwen-error-conf", `置信 ${(confidence * 100).toFixed(1)}%`));
    item.append(head);
    if (error.sample_id) item.append(richElement("code", "qwen-error-sample", String(error.sample_id)));
    const notes = [].concat(error.evidence || [], error.limitations || []).filter((note) => typeof note === "string" && note);
    if (notes.length) item.append(richElement("small", "qwen-error-notes", notes.join(" · ")));
  }

  function finite(value) {
    if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
    if (typeof value === "string" && !value.trim()) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function fixed(value, digits = 4) {
    const number = finite(value);
    return number === null ? "—" : number.toFixed(digits);
  }

  function percent(value) {
    const number = finite(value);
    return number === null ? "—" : `${(number * 100).toFixed(2)}%`;
  }

  function shortHash(value) {
    return typeof value === "string" && value.length >= 12 ? `${value.slice(0, 8)}…${value.slice(-6)}` : "—";
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function firstRecord(...values) {
    return values.find((value) => isRecord(value)) || null;
  }

  function firstPresent(...values) {
    return values.find((value) => value !== null && value !== undefined && value !== "");
  }

  function normalizeChainStatus(value) {
    if (value === true) return "pass";
    if (value === false) return "fail";
    const status = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (["pass", "passed", "complete", "completed", "supported", "succeeded", "success", "verified", "ready"].includes(status)) return "pass";
    if (["fail", "failed", "blocked", "refuted", "rejected", "error", "ineligible"].includes(status)) return "fail";
    if (["active", "running", "in_progress", "started"].includes(status)) return "active";
    if (["pending", "queued", "waiting"].includes(status)) return "pending";
    return "unavailable";
  }

  function scientificChainEntries(evidence) {
    const root = firstRecord(evidence && evidence.scientific_chain, evidence && evidence.science_chain);
    const source = root && firstPresent(root.steps, root.chain, root);
    const entries = {};
    if (Array.isArray(source)) {
      source.forEach((entry) => {
        if (!isRecord(entry)) return;
        const key = firstPresent(entry.key, entry.id, entry.stage, entry.step);
        if (typeof key === "string") entries[key] = entry;
      });
    } else if (isRecord(source)) {
      Object.assign(entries, source);
    }
    const aliases = {
      source_facts: ["source_facts", "source", "facts", "source_and_facts", "sourceFacts"],
      hypothesis: ["hypothesis", "falsifiable_hypothesis", "claim"],
      experiment: ["experiment", "experimental_protocol", "protocol", "methods"],
      local_result: ["local_result", "local_results", "development_result", "local"],
      sector4_stress_test: ["sector4_stress_test", "sector_4_stress_test", "external_validation", "sector4", "external_result"],
      verdict: ["verdict", "scientific_verdict", "decision"],
    };
    const normalized = {};
    SCIENTIFIC_CHAIN_ORDER.forEach((key) => {
      const match = aliases[key].map((alias) => entries[alias]).find((entry) => isRecord(entry));
      normalized[key] = match || null;
    });
    const validation = firstRecord(evidence && evidence.validation) || {};
    if (!normalized.local_result && isRecord(evidence && evidence.metrics)) {
      normalized.local_result = {
        status: validation.p05,
        metrics: evidence.metrics,
        counts: isRecord(evidence.counts) ? evidence.counts : null,
      };
    }
    const external = firstRecord(
      evidence && evidence.external_validation,
      evidence && evidence.sector4_external_validation,
      evidence && evidence.sector_4_external_validation,
      evidence && evidence.sector4_stress_test,
    );
    if (!normalized.sector4_stress_test && external) normalized.sector4_stress_test = external;
    if (!normalized.verdict && evidence) {
      normalized.verdict = {
        status: evidence.effective_product_release_eligible,
        verdict: evidence.verdict,
        product_release_eligible: evidence.effective_product_release_eligible,
        boundary: evidence.evidence_boundary,
      };
    }
    return normalized;
  }

  function chainStatus(entry, key, evidence) {
    if (!entry) return "unavailable";
    const explicit = normalizeChainStatus(firstPresent(entry.status, entry.state, entry.result, entry.passed, entry.verified));
    if (explicit !== "unavailable") return explicit;
    const validation = firstRecord(evidence && evidence.validation) || {};
    const inferred = {
      source_facts: validation.preflight,
      hypothesis: validation.p06,
      experiment: validation.p05,
      local_result: validation.p05,
      sector4_stress_test: firstPresent(entry.final_external_validation_eligible, entry.eligible, entry.verified),
      verdict: evidence && evidence.effective_product_release_eligible,
    };
    return normalizeChainStatus(inferred[key]);
  }

  function chainSummary(entry) {
    if (!entry) return "API 未提供本段证据；页面保持空缺，不据此推断科学结论。";
    const hypothesis = firstRecord(entry.hypothesis);
    const summary = firstPresent(
      entry.summary,
      entry.statement,
      entry.description,
      entry.narrative,
      entry.claim,
      entry.conclusion,
      hypothesis && hypothesis.claim,
    );
    return summary === undefined ? "API 已返回本段结构化证据，但没有可展示的摘要。" : displayValue(summary);
  }

  function chainEvidenceItems(entry) {
    if (!entry) return [];
    const candidate = firstPresent(entry.evidence, entry.facts, entry.citations, entry.sources, entry.quotes, entry.evidence_ids);
    if (Array.isArray(candidate)) return candidate.filter((value) => displayValue(value) !== "—");
    if (isRecord(candidate)) return [candidate];
    return candidate === undefined ? [] : [candidate];
  }

  function appendDefinitionRows(root, object, prefix = "") {
    if (!isRecord(object)) return;
    Object.entries(object).forEach(([key, value]) => {
      if (value === null || value === undefined || isRecord(value) || Array.isArray(value)) return;
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = prefix ? `${prefix} · ${humanizeKey(key)}` : humanizeKey(key);
      description.textContent = displayValue(value);
      row.append(term, description);
      root.append(row);
    });
  }

  function renderScientificChainDetail(key, announce = false) {
    const entry = state.scientificChain && state.scientificChain[key];
    const meta = SCIENTIFIC_CHAIN_META[key] || { index: key, title: key };
    const status = chainStatus(entry, key, state.evidence);
    setText("scientificChainDetailIndex", meta.index);
    setText("scientificChainDetailTitle", meta.title);
    setText("scientificChainDetailSummary", chainSummary(entry));
    const stateNode = $("scientificChainDetailState");
    stateNode.dataset.state = status;
    stateNode.textContent = status === "pass" ? "VERIFIED" : status === "fail" ? "BLOCKED" : status === "active" ? "RUNNING" : status === "pending" ? "WAIT" : "NO API EVIDENCE";

    const evidenceList = $("scientificChainEvidence");
    evidenceList.replaceChildren();
    const evidenceItems = chainEvidenceItems(entry);
    (evidenceItems.length ? evidenceItems : ["API 没有返回本段逐项证据。"]).forEach((value) => {
      const item = document.createElement("li");
      renderRich(item, value);
      evidenceList.append(item);
    });

    const metricsRoot = $("scientificChainMetrics");
    metricsRoot.replaceChildren();
    if (entry) {
      appendDefinitionRows(metricsRoot, firstRecord(entry.metrics));
      appendDefinitionRows(metricsRoot, firstRecord(entry.counts), "counts");
      appendDefinitionRows(metricsRoot, firstRecord(entry.hashes), "sha256");
      appendDefinitionRows(metricsRoot, {
        sample_count: firstPresent(entry.sample_count, entry.record_count),
        error_case_count: firstPresent(entry.error_case_count, entry.error_count),
        verdict: entry.verdict,
        product_release_eligible: firstPresent(entry.product_release_eligible, entry.eligible),
      });
    }
    if (!metricsRoot.children.length) {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const value = document.createElement("dd");
      term.textContent = "API";
      value.textContent = "未返回数值或哈希";
      row.append(term, value);
      metricsRoot.append(row);
    }
    if (announce) setText("scientificChainAnnouncer", `已打开${meta.title}证据段。`);
  }

  function selectScientificChainStep(key, options = {}) {
    if (!SCIENTIFIC_CHAIN_ORDER.includes(key)) return;
    state.scientificChainStep = key;
    document.querySelectorAll("[data-science-chain]").forEach((node) => {
      const selected = node.dataset.scienceChain === key;
      const button = node.querySelector(".chain-trigger");
      node.dataset.selected = selected ? "true" : "false";
      if (!button) return;
      button.setAttribute("aria-expanded", selected ? "true" : "false");
      button.tabIndex = selected ? 0 : -1;
      if (selected) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
      if (selected && options.focus) button.focus();
    });
    renderScientificChainDetail(key, options.announce === true);
  }

  function renderScientificChain(evidence) {
    state.scientificChain = scientificChainEntries(evidence);
    document.querySelectorAll("[data-science-chain]").forEach((node) => {
      const key = node.dataset.scienceChain;
      const status = chainStatus(state.scientificChain[key], key, evidence);
      node.dataset.state = status;
      const tag = node.querySelector(".node-state");
      if (tag) tag.textContent = status === "pass" ? "PASS" : status === "fail" ? "BLOCKED" : status === "active" ? "RUN" : status === "pending" ? "WAIT" : "NO DATA";
    });
    selectScientificChainStep(state.scientificChainStep);
  }

  function externalEvidence(evidence, chain = null) {
    const normalized = chain || scientificChainEntries(evidence);
    return firstRecord(
      normalized.sector4_stress_test,
      evidence && evidence.external_validation,
      evidence && evidence.sector4_external_validation,
      evidence && evidence.sector_4_external_validation,
      evidence && evidence.sector4_stress_test,
    );
  }

  function renderGeneralizationComparison(evidence) {
    const chain = state.scientificChain || scientificChainEntries(evidence);
    const local = firstRecord(chain.local_result) || {};
    const localMetrics = firstRecord(local.metrics, evidence && evidence.metrics) || {};
    const localCounts = firstRecord(local.counts, evidence && evidence.counts) || {};
    const external = externalEvidence(evidence, chain);
    const externalMetrics = firstRecord(external && external.metrics, external && external.score) || {};
    const externalCounts = firstRecord(external && external.counts) || {};
    const localMacro = finite(firstPresent(localMetrics.macro_f1, localMetrics.macroF1));
    const externalMacro = finite(firstPresent(externalMetrics.macro_f1, externalMetrics.macroF1));
    const localSamples = finite(firstPresent(local.sample_count, local.record_count, localCounts.record_count, localCounts.sample_count));
    const externalSamples = finite(firstPresent(external && external.sample_count, external && external.record_count, externalCounts.sample_count, externalCounts.record_count));
    setText("localComparisonF1", fixed(localMacro));
    setText("sector4ComparisonF1", fixed(externalMacro));
    setText("localComparisonSamples", localSamples === null ? null : `${localSamples} 条`);
    setText("sector4ComparisonSamples", externalSamples === null ? null : `${externalSamples} 条`);
    setText("localComparisonScope", firstPresent(local.scope, local.dataset, local.data_scope), "API 未提供范围");
    const sectorIds = external && firstPresent(external.sector_ids, external.sectors);
    const externalScope = firstPresent(external && external.scope, external && external.dataset, external && external.data_scope, Array.isArray(sectorIds) ? `Sector ${sectorIds.join(", ")}` : undefined);
    setText("sector4ComparisonScope", externalScope, "API 未提供范围");
    const boundary = firstPresent(
      external && external.boundary,
      external && external.evidence_boundary,
      external && external.scientific_boundary,
      evidence && evidence.evidence_boundary && evidence.evidence_boundary.scientific_limits,
    );
    if (boundary !== undefined) renderRich("generalizationBoundary", boundary);
    const ready = localMacro !== null && externalMacro !== null;
    const partial = localMacro !== null || externalMacro !== null;
    $("generalizationCompare").dataset.state = ready ? "ready" : partial ? "partial" : "unavailable";
    setText("generalizationState", ready ? "两端 API 指标已载入" : partial ? "仅一端指标可用" : "API 未提供可比较指标");
  }

  function pixelDevelopmentEvidence(evidence) {
    return firstRecord(evidence && evidence.pixel_development);
  }

  function pixelEngineeringStatus(value) {
    const normalized = normalizeChainStatus(value);
    if (normalized !== "unavailable") return normalized;
    const status = typeof value === "string" ? value.trim().toLowerCase() : "";
    return [
      "post_release_development_ablation_complete",
      "label_free_predictions_hashed",
      "verified_pixel_development",
    ].includes(status) ? "pass" : "unavailable";
  }

  function setPixelEngineeringState(id, status) {
    const node = $(id);
    if (!node) return;
    node.dataset.state = status;
    node.textContent = status === "pass" ? "PASS" : status === "fail" ? "FAIL" : status === "active" ? "RUNNING" : status === "pending" ? "WAIT" : "NO API";
  }

  function signedFixed(value, digits = 4) {
    const number = finite(value);
    if (number === null) return "—";
    const threshold = 0.5 * (10 ** -digits);
    const normalized = Math.abs(number) < threshold ? 0 : number;
    return `${normalized > 0 ? "+" : ""}${normalized.toFixed(digits)}`;
  }

  function signedPercentagePoints(value) {
    const number = finite(value);
    if (number === null) return "—";
    const points = Math.abs(number * 100) < 0.005 ? 0 : number * 100;
    return `${points > 0 ? "+" : ""}${points.toFixed(2)} pp`;
  }

  function sha256OrNull(value) {
    return typeof value === "string" && SIGNAL_HASH.test(value) ? value : null;
  }

  function pixelOutcomeCount(pixel, outcomeCounts, outcomeName, aliases) {
    const direct = firstPresent(
      ...aliases.map((key) => pixel[key]),
      ...aliases.map((key) => outcomeCounts[key]),
      outcomeCounts[outcomeName],
    );
    const count = finite(direct);
    if (count !== null) return count;
    const rows = Array.isArray(pixel.rows) ? pixel.rows : [];
    return rows.length ? rows.filter((row) => row && row.outcome_change === outcomeName).length : null;
  }

  function resetPixelDevelopment() {
    const panel = $("pixelDevelopment");
    panel.dataset.state = "unavailable";
    setText("pixelDevelopmentState", "API 未提供 Pixel 开发消融");
    setPixelEngineeringState("pixelExecutionState", "unavailable");
    setPixelEngineeringState("pixelVerificationState", "unavailable");
    [
      "pixelSampleCount",
      "pixelAvailableCount",
      "pixelMissingCount",
      "pixelFixedCount",
      "pixelRegressionCount",
      "pixelBaselineMacroF1",
      "pixelEnhancedMacroF1",
      "pixelDeltaMacroF1",
      "pixelBaselineAccuracy",
      "pixelEnhancedAccuracy",
      "pixelDeltaAccuracy",
      "pixelBaselineLogLoss",
      "pixelEnhancedLogLoss",
      "pixelDeltaLogLoss",
      "pixelAvailabilityShift",
      "pixelCentroidRangeShift",
      "pixelApertureRangeShift",
      "pixelReportHash",
      "pixelPredictionManifestHash",
      "pixelEvaluationManifestHash",
      "pixelVerificationReceiptHash",
      "pixelVerificationManifestHash",
      "pixelTesscutReceiptHash",
      "pixelTesscutManifestHash",
    ].forEach((id) => setText(id, null));
    setText("pixelAcquisitionProvenanceBoundary", "API 未公开 TESSCut 来源 provenance；页面不推断供应商认证，也不提供原始 FITS。");
    setText("pixelEngineeringSummary", "只有 API 绑定真实运行与验证 receipt 后才显示 PASS。");
    setText("pixelScientificConclusion", "尚无可发布的科学结论");
    setText("pixelDevelopmentBoundary", "安全降级：当前证据 API 没有绑定 Pixel 开发消融。页面不填入默认成绩，也不把工程可运行性解释成性能提升。");
  }

  function renderPixelDevelopment(evidence) {
    const pixel = pixelDevelopmentEvidence(evidence);
    if (!pixel) {
      resetPixelDevelopment();
      return;
    }

    const execution = firstRecord(pixel.execution, pixel.prediction, pixel.prediction_integrity) || {};
    const verification = firstRecord(pixel.verification, pixel.verify_only, pixel.verification_receipt) || {};
    const verificationReceipt = firstRecord(verification.receipt) || {};
    const features = firstRecord(pixel.pixel_features, pixel.coverage, pixel.availability) || {};
    const counts = firstRecord(pixel.counts) || {};
    const baseline = firstRecord(pixel.baseline, pixel.no_pixel_baseline) || {};
    const enhanced = firstRecord(pixel.pixel_enhanced, pixel.enhanced, pixel.with_pixel) || {};
    const baselineMetrics = firstRecord(baseline.metrics, pixel.baseline_metrics, baseline) || {};
    const enhancedMetrics = firstRecord(enhanced.metrics, pixel.pixel_metrics, pixel.enhanced_metrics, enhanced) || {};
    const delta = firstRecord(pixel.delta, pixel.metric_delta, pixel.comparison && pixel.comparison.delta, pixel.comparison) || {};
    const outcomeCounts = firstRecord(pixel.outcome_change_counts, pixel.outcome_counts, pixel.outcome_changes, counts.outcome_change_counts, counts.outcomes) || {};
    const availabilityShift = firstRecord(pixel.availability_shift) || {};
    const featureRangeShift = firstRecord(availabilityShift.feature_range_shift) || {};
    const centroidShift = firstRecord(featureRangeShift.difference_centroid) || {};
    const apertureShift = firstRecord(featureRangeShift.aperture_depth) || {};
    const hashes = firstRecord(pixel.hashes) || {};
    const acquisitionProvenance = firstRecord(pixel.acquisition_provenance) || {};
    const sampleCount = finite(firstPresent(pixel.sample_count, pixel.record_count, features.requested_count, counts.sample_count, counts.record_count));
    const requestedCount = finite(firstPresent(features.requested_count, counts.requested_count, sampleCount));
    const availableCount = finite(firstPresent(features.available_count, pixel.pixel_available_count, counts.pixel_available_count, counts.available_count));
    const missingCount = finite(firstPresent(features.missing_count, pixel.pixel_missing_count, counts.pixel_missing_count, counts.missing_count));
    const fixedCount = pixelOutcomeCount(pixel, outcomeCounts, "PIXEL_FIXED_ERROR", ["fixed_error_count", "pixel_fixed_error_count", "fixed_count", "fixed_errors"]);
    const regressionCount = pixelOutcomeCount(pixel, outcomeCounts, "PIXEL_REGRESSION", ["regression_count", "pixel_regression_count", "regressions"]);
    const baselineMacro = finite(firstPresent(baselineMetrics.macro_f1, baselineMetrics.macroF1));
    const enhancedMacro = finite(firstPresent(enhancedMetrics.macro_f1, enhancedMetrics.macroF1));
    const deltaMacro = finite(firstPresent(delta.macro_f1, delta.macroF1, delta.macro_f1_delta, pixel.macro_f1_delta));
    const baselineAccuracy = finite(baselineMetrics.accuracy);
    const enhancedAccuracy = finite(enhancedMetrics.accuracy);
    const deltaAccuracy = finite(firstPresent(delta.accuracy, delta.accuracy_delta, pixel.accuracy_delta));
    const baselineLogLoss = finite(firstPresent(baselineMetrics.log_loss, baselineMetrics.logLoss));
    const enhancedLogLoss = finite(firstPresent(enhancedMetrics.log_loss, enhancedMetrics.logLoss));
    const deltaLogLoss = finite(firstPresent(delta.log_loss, delta.logLoss, delta.log_loss_delta, pixel.log_loss_delta));
    const trainingAvailable = finite(availabilityShift.training_available_count);
    const trainingSamples = finite(availabilityShift.training_sample_count);
    const sectorAvailable = finite(availabilityShift.sector4_available_count);
    const sectorSamples = finite(availabilityShift.sector4_sample_count);
    const centroidOutside = finite(centroidShift.sector4_outside_training_range_count);
    const centroidEvaluated = finite(centroidShift.sector4_evaluated_count);
    const apertureOutside = finite(apertureShift.sector4_outside_training_range_count);
    const apertureEvaluated = finite(apertureShift.sector4_evaluated_count);
    const evidenceHashes = {
      report: sha256OrNull(hashes.report_sha256),
      predictionManifest: sha256OrNull(hashes.prediction_manifest_sha256),
      evaluationManifest: sha256OrNull(hashes.evaluation_manifest_sha256),
      verificationReceipt: sha256OrNull(hashes.verification_receipt_sha256),
      verificationManifest: sha256OrNull(hashes.verification_manifest_sha256),
    };
    const acquisitionHashes = {
      receipt: sha256OrNull(hashes.tesscut_acquisition_receipt_sha256),
      manifest: sha256OrNull(hashes.tesscut_acquisition_manifest_sha256),
    };
    const executionStatus = pixelEngineeringStatus(firstPresent(execution.status, pixel.execution_status, pixel.status));
    const verificationStatus = pixelEngineeringStatus(firstPresent(verification.status, verificationReceipt.status, pixel.verification_status, pixel.verify_status));

    setPixelEngineeringState("pixelExecutionState", executionStatus);
    setPixelEngineeringState("pixelVerificationState", verificationStatus);
    setText("pixelSampleCount", sampleCount);
    setText("pixelAvailableCount", availableCount === null ? null : `${availableCount} / ${requestedCount ?? "—"}`);
    setText("pixelMissingCount", missingCount);
    setText("pixelFixedCount", fixedCount);
    setText("pixelRegressionCount", regressionCount);
    setText("pixelBaselineMacroF1", fixed(baselineMacro));
    setText("pixelEnhancedMacroF1", fixed(enhancedMacro));
    setText("pixelDeltaMacroF1", signedFixed(deltaMacro));
    setText("pixelBaselineAccuracy", percent(baselineAccuracy));
    setText("pixelEnhancedAccuracy", percent(enhancedAccuracy));
    setText("pixelDeltaAccuracy", signedPercentagePoints(deltaAccuracy));
    setText("pixelBaselineLogLoss", fixed(baselineLogLoss));
    setText("pixelEnhancedLogLoss", fixed(enhancedLogLoss));
    setText("pixelDeltaLogLoss", signedFixed(deltaLogLoss));
    setText(
      "pixelAvailabilityShift",
      [trainingAvailable, trainingSamples, sectorAvailable, sectorSamples].every((value) => value !== null)
        ? `${trainingAvailable}/${trainingSamples} → ${sectorAvailable}/${sectorSamples}`
        : null,
    );
    setText("pixelCentroidRangeShift", centroidOutside === null || centroidEvaluated === null ? null : `${centroidOutside}/${centroidEvaluated}`);
    setText("pixelApertureRangeShift", apertureOutside === null || apertureEvaluated === null ? null : `${apertureOutside}/${apertureEvaluated}`);
    setText("pixelReportHash", evidenceHashes.report);
    setText("pixelPredictionManifestHash", evidenceHashes.predictionManifest);
    setText("pixelEvaluationManifestHash", evidenceHashes.evaluationManifest);
    setText("pixelVerificationReceiptHash", evidenceHashes.verificationReceipt);
    setText("pixelVerificationManifestHash", evidenceHashes.verificationManifest);
    setText("pixelTesscutReceiptHash", acquisitionHashes.receipt);
    setText("pixelTesscutManifestHash", acquisitionHashes.manifest);
    const acquisitionProvenanceComplete = acquisitionProvenance.role === "RECORDED_VERIFY_ONLY_SOURCE_PROVENANCE"
      && acquisitionProvenance.server_reacquired_raw_fits === false
      && acquisitionProvenance.server_redistributed_raw_fits === false
      && acquisitionProvenance.source_hashes_are_provenance_not_provider_signatures === true
      && acquisitionProvenance.remote_provider_cryptographic_authentication_established === false
      && Object.values(acquisitionHashes).every((value) => value !== null);
    setText(
      "pixelAcquisitionProvenanceBoundary",
      acquisitionProvenanceComplete
        ? "RECORDED VERIFY-ONLY SOURCE PROVENANCE：服务端未重新获取、未重分发原始 FITS；这两项哈希不是 provider signature，也不建立远端密码学认证。"
        : "TESSCut 来源哈希或边界不完整；页面不推断供应商认证，也不提供原始 FITS。",
    );

    const completeMetrics = [
      sampleCount,
      availableCount,
      missingCount,
      fixedCount,
      regressionCount,
      baselineMacro,
      enhancedMacro,
      deltaMacro,
      baselineAccuracy,
      enhancedAccuracy,
      deltaAccuracy,
      baselineLogLoss,
      enhancedLogLoss,
      deltaLogLoss,
      trainingAvailable,
      trainingSamples,
      sectorAvailable,
      sectorSamples,
      centroidOutside,
      centroidEvaluated,
      apertureOutside,
      apertureEvaluated,
    ].every((value) => value !== null);
    const completeHashes = Object.values(evidenceHashes).every((value) => value !== null);
    const diagnosticsBoundToCoverage = sectorAvailable === availableCount && sectorSamples === requestedCount;
    const engineeringPass = executionStatus === "pass" && verificationStatus === "pass";
    const engineeringFail = executionStatus === "fail" || verificationStatus === "fail";
    const panel = $("pixelDevelopment");
    const completeEvidence = completeMetrics && completeHashes && acquisitionProvenanceComplete && diagnosticsBoundToCoverage;
    panel.dataset.state = engineeringFail ? "blocked" : engineeringPass && completeEvidence ? "available" : "partial";
    setText(
      "pixelDevelopmentState",
      engineeringFail
        ? "工程证据未通过 · 科学结论封锁"
        : engineeringPass && completeEvidence
          ? "执行 PASS · 验证 PASS · 科学结论独立"
          : "Pixel API 证据不完整 · 保守展示",
    );
    setText(
      "pixelEngineeringSummary",
      engineeringPass && sampleCount !== null && availableCount !== null
        ? `${sampleCount} 条全部保留；${availableCount} / ${requestedCount ?? sampleCount} 条 Pixel 特征可用；范围迁移、五段执行哈希与两段来源 provenance 独立列示。`
        : "执行和 verify-only 必须各自返回 PASS；缺少任一状态时不把工程链标为完成。",
    );

    const establishesAccuracyAndMacroGain = deltaAccuracy !== null && deltaAccuracy > 0 && deltaMacro !== null && deltaMacro > 0;
    setText(
      "pixelScientificConclusion",
      !engineeringPass
        ? "执行或验证未通过，不发布性能结论"
        : establishesAccuracyAndMacroGain
          ? "开发集数值提高，但仍未构成新的外部确认"
          : "未建立 accuracy / Macro-F1 提升",
    );
    setText(
      "pixelDevelopmentBoundary",
      "POST-RELEASE DEVELOPMENT_ONLY：Sector 4 标签已在本次 Pixel 消融前释放，因此结果仅是开发证据；本结果未建立可外推的 accuracy / Macro-F1 提升。未来科学确认必须换用全新 unseen Sector，并在标签释放前密封预测。",
    );
  }

  function qwenVlEvidence(evidence) {
    return firstRecord(
      evidence && evidence.qwen_vl_benchmark,
      evidence && evidence.qwen_multimodal_benchmark,
      evidence && evidence.multimodal_benchmark,
      evidence && evidence.qwen_vision_benchmark,
      evidence && evidence.scientific_chain && evidence.scientific_chain.qwen_vl_benchmark,
    );
  }

  function renderQwenVlBenchmark(evidence) {
    const benchmark = qwenVlEvidence(evidence);
    const panel = $("qwenVlBenchmark");
    const errorsRoot = $("qwenVlErrorList");
    errorsRoot.replaceChildren();
    if (!benchmark) {
      panel.dataset.state = "unavailable";
      setText("qwenVlState", "API 未提供基准");
      [
        "qwenVlSampleCount",
        "qwenVlMacroF1",
        "qwenVlAccuracy",
        "qwenVlErrorCount",
        "qwenVlBaselineErrorCount",
        "qwenVlRetainedErrorCount",
        "qwenVlBaselineMacroF1",
        "qwenVlDeltaMacroF1",
        "qwenVlOriginalRecord",
        "qwenVlResealRecord",
        "qwenVlResealSamples",
        "qwenVlDataset",
        "qwenVlCallEvidence",
      ].forEach((id) => setText(id, null));
      setText("qwenVlProvenanceBoundary", "API 未提供 provenance 边界；页面不会把 request IDs、usage 或 model identifiers 当作供应商签名或密码学认证。");
      const item = document.createElement("li");
      item.textContent = "仅在 API 返回真实基准后展示。";
      errorsRoot.append(item);
      setText("qwenVlBoundary", "安全降级：当前证据 API 没有绑定 Qwen-VL 基准，因此页面不展示默认成绩，也不推断多模态能力。");
      return;
    }
    const protocol = firstRecord(benchmark.protocol) || {};
    const metrics = firstRecord(benchmark.metrics, benchmark.qwen_metrics, benchmark.evaluation, benchmark.score) || {};
    const baselineMetrics = firstRecord(benchmark.baseline_metrics) || {};
    const comparison = firstRecord(benchmark.comparison) || {};
    const counts = firstRecord(benchmark.counts) || {};
    const errorCounts = firstRecord(benchmark.error_counts) || {};
    const provider = firstRecord(benchmark.provider) || {};
    const verification = firstRecord(benchmark.verification) || {};
    const reseal = firstRecord(benchmark.reseal, benchmark.report && benchmark.report.reseal, verification.reseal) || {};
    const providerBoundary = firstRecord(verification.provider_provenance_boundary) || {};
    const errors = firstPresent(benchmark.errors, benchmark.error_cases, benchmark.misclassifications, benchmark.all_errors);
    const errorItems = Array.isArray(errors) ? errors : [];
    const sampleCount = finite(firstPresent(benchmark.sample_count, benchmark.record_count, protocol.sample_count, metrics.sample_count, counts.sample_count, counts.record_count));
    const macroF1 = finite(firstPresent(metrics.macro_f1, metrics.macroF1, benchmark.macro_f1));
    const accuracy = finite(firstPresent(metrics.accuracy, benchmark.accuracy));
    const errorCount = finite(firstPresent(benchmark.error_count, benchmark.error_case_count, metrics.error_count, errorCounts.qwen, counts.error_count, counts.error_case_count));
    const baselineErrorCount = finite(firstPresent(baselineMetrics.error_count, errorCounts.baseline));
    const retainedErrorCount = finite(firstPresent(errorCounts.system_error_record_count, counts.system_error_record_count, Array.isArray(errors) ? errors.length : undefined));
    const baselineMacroF1 = finite(baselineMetrics.macro_f1);
    const macroDelta = finite(firstPresent(comparison.qwen_minus_baseline_macro_f1, benchmark.qwen_minus_baseline_macro_f1));
    setText("qwenVlSampleCount", sampleCount);
    setText("qwenVlMacroF1", fixed(macroF1));
    setText("qwenVlAccuracy", percent(accuracy));
    setText("qwenVlErrorCount", errorCount);
    setText("qwenVlBaselineErrorCount", baselineErrorCount);
    setText("qwenVlRetainedErrorCount", retainedErrorCount);
    setText("qwenVlBaselineMacroF1", fixed(baselineMacroF1));
    setText("qwenVlDeltaMacroF1", macroDelta === null ? null : `${macroDelta >= 0 ? "+" : ""}${fixed(macroDelta)}`);
    setText("qwenVlDataset", firstPresent(benchmark.dataset, benchmark.scope, benchmark.data_scope, benchmark.benchmark_id, protocol.protocol_id), "API 未提供范围");
    const sampleRequestIds = Array.isArray(benchmark.samples)
      ? benchmark.samples.map((sample) => sample && sample.request_id).filter((value) => typeof value === "string" && value)
      : [];
    const requestIds = Array.isArray(benchmark.request_ids) ? benchmark.request_ids : sampleRequestIds;
    const usage = firstRecord(benchmark.usage, provider.usage) || {};
    const callCount = finite(firstPresent(provider.network_calls_completed, usage.call_count, benchmark.call_count, requestIds.length || undefined));
    const newApiCalls = finite(firstPresent(reseal.new_api_calls, provider.reseal_api_calls_completed));
    const copiedSampleCount = finite(firstPresent(reseal.copied_sample_count, verification.sample_count));
    const originalBenchmarkId = firstPresent(reseal.source_benchmark_id, provider.execution_origin_benchmark_id);
    const resealBenchmarkId = firstPresent(benchmark.benchmark_id, verification.benchmark_id);
    const sameSampleIds = comparison.same_40_sample_ids === true;
    const totalTokens = finite(usage.total_tokens);
    const requestedModels = firstRecord(provider.requested_model_counts) || {};
    const returnedModels = firstRecord(provider.returned_model_counts) || {};
    const modelIdentifiers = [...new Set([...Object.keys(requestedModels), ...Object.keys(returnedModels)])];
    const callEvidence = [];
    if (callCount !== null) callEvidence.push(`${callCount} original calls`);
    if (requestIds.length) callEvidence.push(`${requestIds.length} request IDs`);
    if (totalTokens !== null) callEvidence.push(`${totalTokens} tokens`);
    if (modelIdentifiers.length) callEvidence.push(`models ${modelIdentifiers.join(", ")}`);
    setText("qwenVlCallEvidence", callEvidence.length ? callEvidence.join(" · ") : null);
    setText(
      "qwenVlOriginalRecord",
      originalBenchmarkId === undefined && callCount === null
        ? null
        : `${originalBenchmarkId ?? "ID 未提供"} · ${callCount ?? "—"} original calls`,
    );
    setText(
      "qwenVlResealRecord",
      resealBenchmarkId === undefined && newApiCalls === null
        ? null
        : `${resealBenchmarkId ?? "ID 未提供"} · ${newApiCalls ?? "—"} new API calls`,
    );
    setText(
      "qwenVlResealSamples",
      copiedSampleCount === null || sampleCount === null
        ? null
        : `${copiedSampleCount}/${sampleCount} copied · ${sameSampleIds ? "same sample IDs" : "identity not established"}`,
    );
    const provenanceNotSignatures = firstPresent(
      provider.recorded_request_ids_usage_and_model_are_not_provider_signatures,
      providerBoundary.request_ids_usage_and_model_are_recorded_provenance_not_provider_signatures,
    ) === true;
    const cryptographicAuthenticationOutOfScope = firstPresent(
      provider.provider_execution_cryptographic_authentication_out_of_scope,
      providerBoundary.provider_execution_cryptographic_authentication_out_of_scope,
    ) === true;
    setText(
      "qwenVlProvenanceBoundary",
      provenanceNotSignatures && cryptographicAuthenticationOutOfScope
        ? "Request IDs、usage 与 model identifiers 是记录的 provenance，不是供应商签名；供应商执行的密码学认证不在本证据范围内。"
        : "API 未完整声明 provenance 边界；页面不会把 request IDs、usage 或 model identifiers 当作供应商签名或密码学认证。",
    );
    if (errorItems.length) {
      errorItems.forEach((error) => {
        const item = document.createElement("li");
        renderQwenErrorCard(item, error);
        errorsRoot.append(item);
      });
    } else {
      const item = document.createElement("li");
      item.textContent = errorCount === 0 ? "API 报告没有错例。" : errorCount === null ? "API 未返回错例清单或错例数。" : "API 返回了错例数，但没有返回逐条错例。";
      errorsRoot.append(item);
    }
    const boundary = firstPresent(benchmark.boundary, benchmark.evidence_boundary, benchmark.development_set_boundary, benchmark.claim_boundary);
    renderRich("qwenVlBoundary", boundary === undefined ? "API 未给出可核验的集合边界；本页保守地把该基准视为开发集，不据此声称新的密封外部泛化。" : boundary);
    const benchmarkStatus = normalizeChainStatus(benchmark.status);
    const verificationStatus = normalizeChainStatus(verification.status);
    const executionFailed = benchmarkStatus === "fail" || verificationStatus === "fail";
    const errorsComplete = errorCount !== null
      && baselineErrorCount !== null
      && retainedErrorCount === errorCount + baselineErrorCount
      && errorItems.length === retainedErrorCount;
    const resealComplete = sampleCount !== null
      && callCount === sampleCount
      && newApiCalls === 0
      && copiedSampleCount === sampleCount
      && reseal.mode === "SAME_40_RESEALED_NO_NEW_API_CALLS"
      && verification.network_executed === false
      && sameSampleIds
      && typeof originalBenchmarkId === "string"
      && typeof resealBenchmarkId === "string"
      && originalBenchmarkId !== resealBenchmarkId;
    const provenanceComplete = provenanceNotSignatures
      && cryptographicAuthenticationOutOfScope
      && requestIds.length === sampleCount
      && new Set(requestIds).size === sampleCount
      && modelIdentifiers.length > 0;
    const completeEvidence = benchmarkStatus === "pass"
      && verificationStatus === "pass"
      && macroF1 !== null
      && accuracy !== null
      && baselineMacroF1 !== null
      && macroDelta !== null
      && errorsComplete
      && resealComplete
      && provenanceComplete;
    panel.dataset.state = executionFailed ? "blocked" : completeEvidence ? "available" : "partial";
    const underperforms = macroDelta !== null && macroDelta < 0;
    setText(
      "qwenVlState",
      executionFailed
        ? "执行未通过 · 不发布科学结论"
        : !completeEvidence
          ? "重封、错例或 provenance 证据不完整 · 保守展示"
          : underperforms
          ? "执行通过 · 科学结果落后固定基线"
          : "执行通过 · 科学结果已载入",
    );
  }

  function atlasValue(value) {
    if (value === null || value === undefined || value === "") return "unavailable";
    if (Array.isArray(value)) {
      const items = value.map(atlasValue).filter((item) => item !== "unavailable");
      return items.length ? items.join("·") : "unavailable";
    }
    if (isRecord(value)) {
      const items = Object.entries(value)
        .filter(([, item]) => item !== null && item !== undefined && item !== "")
        .map(([key, item]) => `${key}: ${atlasValue(item)}`);
      return items.length ? items.join("·") : "unavailable";
    }
    if (typeof value === "boolean") return value ? "yes" : "no";
    return String(value);
  }

  function atlasStringList(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
  }

  function atlasTaxonomyList(value) {
    if (!Array.isArray(value)) return { codes: [], labels: [] };
    const codes = [];
    const labels = [];
    value.forEach((entry) => {
      if (typeof entry === "string" && entry.trim()) {
        codes.push(entry.trim());
        labels.push(entry.trim());
        return;
      }
      if (!isRecord(entry)) return;
      const code = firstPresent(entry.code, entry.tag, entry.id, entry.key);
      if (typeof code !== "string" || !code.trim()) return;
      const normalizedCode = code.trim();
      const subtype = firstPresent(entry.subtype, entry.variant);
      codes.push(normalizedCode);
      labels.push(typeof subtype === "string" && subtype ? `${normalizedCode} / ${subtype}` : normalizedCode);
    });
    return { codes: [...new Set(codes)], labels: [...new Set(labels)] };
  }

  function atlasPrediction(prediction, confidence) {
    const label = atlasValue(prediction);
    const score = finite(confidence);
    if (score === null) return label;
    const percentage = score <= 1 ? score * 100 : score;
    return `${label} · ${percentage.toFixed(1)}%`;
  }

  function normalizeErrorAtlasRecord(record, index, atlas) {
    const pixel = firstRecord(record && record.pixel) || {};
    const baseline = firstRecord(record && record.baseline, pixel.baseline) || {};
    const enhanced = firstRecord(record && record.pixel_enhanced, pixel.enhanced) || {};
    const enhancedFeatures = firstRecord(enhanced.features, pixel.features) || {};
    const qwen = firstRecord(record && record.qwen_vl, record && record.qwen) || {};
    const crossModalEvidence = firstRecord(record && record.cross_modal) || {};
    const taxonomy = atlasTaxonomyList(firstPresent(record && record.taxonomy_tags, record && record.taxonomies));
    const taxonomyTags = taxonomy.codes;
    const errorSources = atlasStringList(record && record.error_sources);
    const hasQwen = isRecord(record && record.qwen_vl) || isRecord(record && record.qwen) || errorSources.includes("QWEN_VL") || taxonomyTags.some((tag) => tag.startsWith("QWEN"));
    const hasPixel = isRecord(record && record.pixel_enhanced) || isRecord(record && record.pixel)
      || errorSources.some((source) => ["BASELINE", "PIXEL_ENHANCED", "PIXEL_MISSING", "FEATURE_OUTLIER"].includes(source))
      || taxonomyTags.some((tag) => tag.includes("PIXEL") || tag.startsWith("BOTH_WRONG"));
    const crossModal = crossModalEvidence.coverage === "QWEN_PIXEL"
      || taxonomyTags.some((tag) => tag.startsWith("CROSS_MODAL"))
      || taxonomyTags.includes("QWEN_AND_PIXEL_ERROR")
      || (hasQwen && hasPixel && !crossModalEvidence.coverage);
    let featureOutliers = firstPresent(
      enhancedFeatures.range_flags,
      pixel.feature_outliers,
      pixel.feature_out_of_range,
      record && record.feature_outliers,
    );
    if (featureOutliers === undefined && typeof enhancedFeatures.out_of_training_range === "boolean") {
      featureOutliers = enhancedFeatures.out_of_training_range ? true : [];
    }
    const scientificBoundary = firstPresent(
      record && record.scientific_boundary,
      atlas && atlas.scientific_boundary,
      atlas && atlas.summary && atlas.summary.scientific_boundary,
    );
    return {
      index,
      raw: record,
      sampleId: firstPresent(record && record.sample_id, record && record.sample, record && record.record_id),
      targetGroupId: firstPresent(record && record.target_group_id, record && record.target_group),
      ticId: firstPresent(record && record.tic_id, record && record.tic),
      truth: firstPresent(record && record.true_class, record && record.truth, record && record.label),
      baselinePrediction: firstPresent(baseline.predicted_class, baseline.prediction),
      baselineConfidence: firstPresent(baseline.confidence, baseline.max_probability),
      pixelPrediction: firstPresent(enhanced.predicted_class, enhanced.prediction),
      pixelConfidence: firstPresent(enhanced.confidence, enhanced.max_probability),
      qwenPrediction: firstPresent(qwen.predicted_class, qwen.prediction),
      qwenConfidence: qwen.confidence,
      qwenEvidence: qwen.evidence,
      qwenLimitations: qwen.limitations,
      pixelAvailable: typeof enhanced.pixel_available === "boolean" ? enhanced.pixel_available : typeof pixel.available === "boolean" ? pixel.available : null,
      pixelMissingReason: firstPresent(enhanced.pixel_missing_reason, pixel.missing_reason),
      outcome: firstPresent(enhanced.outcome_change, pixel.outcome, record && record.outcome),
      featureOutliers,
      taxonomyTags,
      taxonomyLabels: taxonomy.labels,
      errorSources,
      hasQwen,
      hasPixel,
      crossModal,
      crossModalCoverage: crossModalEvidence.coverage,
      crossModalPattern: crossModalEvidence.correctness_pattern,
      scientificBoundary,
    };
  }

  function errorAtlasModalityLabel(record) {
    if (record.crossModalCoverage === "PIXEL_ONLY") return "PIXEL_ONLY";
    if (record.crossModalCoverage === "QWEN_PIXEL") return "QWEN × PIXEL";
    if (record.crossModal) return "QWEN × PIXEL";
    if (record.hasQwen) return "QWEN";
    if (record.hasPixel) return "PIXEL";
    return "unavailable";
  }

  function errorAtlasOutcomeLabel(outcome) {
    const labels = {
      PIXEL_FIXED_ERROR: "fixed",
      PIXEL_REGRESSION: "regression",
      BOTH_CORRECT: "both correct",
      BOTH_WRONG_SAME_CLASS: "both wrong · same class",
      BOTH_WRONG_DIFFERENT_CLASS: "both wrong · different class",
    };
    return labels[outcome] || atlasValue(outcome);
  }

  function errorAtlasPixelState(record) {
    if (record.pixelAvailable === true) return "available";
    if (record.pixelAvailable === false) {
      const reason = atlasValue(record.pixelMissingReason);
      return reason === "unavailable" ? "missing" : `missing · ${reason}`;
    }
    return "unavailable";
  }

  function errorAtlasRangeText(record) {
    const outliers = record.featureOutliers;
    if (Array.isArray(outliers)) return outliers.length ? outliers.map(atlasValue).join("·") : "none";
    if (isRecord(outliers)) {
      const entries = Object.entries(outliers).filter(([, value]) => value !== false && value !== null && value !== undefined);
      return entries.length ? entries.map(([key, value]) => value === true ? key : `${key}: ${atlasValue(value)}`).join("·") : "none";
    }
    if (typeof outliers === "boolean") return outliers ? "out-of-range" : "none";
    return "unavailable";
  }

  function errorAtlasHasRangeOutlier(record) {
    const outliers = record.featureOutliers;
    if (Array.isArray(outliers)) return outliers.length > 0;
    if (isRecord(outliers)) return Object.values(outliers).some((value) => value !== false && value !== null && value !== undefined);
    return outliers === true;
  }

  function errorAtlasTaxonomyDefinitions(value) {
    const definitions = new Map();
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (typeof entry === "string" && entry) definitions.set(entry, entry);
        else if (isRecord(entry)) {
          const key = firstPresent(entry.code, entry.tag, entry.id, entry.key, entry.name);
          if (typeof key === "string" && key) definitions.set(key, String(firstPresent(entry.label, entry.title, key)));
        }
      });
    } else if (isRecord(value)) {
      Object.entries(value).forEach(([key, entry]) => {
        const label = isRecord(entry) ? firstPresent(entry.label, entry.title, entry.name, key) : firstPresent(entry, key);
        definitions.set(key, String(label));
      });
    }
    return definitions;
  }

  function replaceErrorAtlasOptions(select, defaultLabel, entries) {
    const current = select.value;
    select.replaceChildren();
    const defaultOption = document.createElement("option");
    defaultOption.value = "all";
    defaultOption.textContent = defaultLabel;
    select.append(defaultOption);
    entries.forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    });
    select.value = Array.from(select.options).some((option) => option.value === current) ? current : "all";
  }

  function errorAtlasSummaryText(summary) {
    if (typeof summary === "string") return summary || "unavailable";
    if (!isRecord(summary)) return "unavailable";
    const narrative = firstPresent(summary.description, summary.summary, summary.scope, summary.headline);
    if (narrative !== undefined) return atlasValue(narrative);
    const fragments = [
      ["sample_count", "fixed samples"],
      ["any_classifier_error_count", "records with classifier error"],
      ["qwen_error_count", "Qwen errors"],
      ["pixel_fixed_error_count", "Pixel fixed"],
      ["pixel_regression_count", "Pixel regression"],
      ["feature_outlier_count", "feature outliers"],
    ].filter(([key]) => finite(summary[key]) !== null).map(([key, label]) => `${summary[key]} ${label}`);
    return fragments.length ? fragments.join(" · ") : "unavailable";
  }

  function errorAtlasExperimentMatches(record, experiment) {
    const cohort = firstRecord(experiment && experiment.cohort) || {};
    const sampleIds = atlasStringList(firstPresent(cohort.sample_ids, experiment && experiment.sample_ids));
    const taxonomyTag = firstPresent(cohort.taxonomy_tag, experiment && experiment.taxonomy_tag);
    const linkedTaxonomyCodes = atlasStringList(experiment && experiment.linked_taxonomy_codes);
    const directSample = firstPresent(experiment && experiment.sample_id, experiment && experiment.record_id);
    const hasTarget = sampleIds.length > 0 || typeof taxonomyTag === "string" || linkedTaxonomyCodes.length > 0 || directSample !== undefined;
    if (!hasTarget) return true;
    if (record.sampleId !== undefined && (sampleIds.includes(String(record.sampleId)) || String(directSample) === String(record.sampleId))) return true;
    if (typeof taxonomyTag === "string" && record.taxonomyTags.includes(taxonomyTag)) return true;
    return linkedTaxonomyCodes.some((code) => record.taxonomyTags.includes(code));
  }

  function errorAtlasExperimentsForRecord(record) {
    const atlas = state.errorAtlas || {};
    const globalExperiments = Array.isArray(atlas.next_experiments) ? atlas.next_experiments.filter(isRecord) : [];
    const experimentIds = atlasStringList(record && record.raw && record.raw.experiment_ids);
    if (experimentIds.length) {
      const resolved = experimentIds.map((id) => globalExperiments.find((experiment) => String(firstPresent(experiment.id, experiment.experiment_id)) === id)).filter(isRecord);
      if (resolved.length) return resolved;
    }
    const direct = record && record.raw && record.raw.next_experiments;
    if (Array.isArray(direct) && direct.length) {
      const resolved = direct.map((entry) => {
        if (isRecord(entry)) return entry;
        return globalExperiments.find((experiment) => String(firstPresent(experiment.id, experiment.experiment_id)) === String(entry));
      }).filter(isRecord);
      if (resolved.length) return resolved;
    }
    return globalExperiments.filter((experiment) => errorAtlasExperimentMatches(record, experiment));
  }

  function renderErrorAtlasExperiments(record) {
    const root = $("errorAtlasExperiments");
    root.replaceChildren();
    const experiments = record ? errorAtlasExperimentsForRecord(record) : [];
    state.errorAtlasSelectedExperiments = experiments;
    if (state.errorAtlasSelectedExperimentIndex >= experiments.length) state.errorAtlasSelectedExperimentIndex = 0;
    if (!experiments.length) {
      const item = document.createElement("li");
      item.textContent = "unavailable";
      root.append(item);
      $("sendErrorAtlasToJudgeLab").disabled = true;
      return;
    }
    experiments.forEach((experiment, index) => {
      const prefill = firstRecord(experiment.judge_lab_prefill) || {};
      const item = document.createElement("li");
      const button = document.createElement("button");
      const kicker = document.createElement("small");
      const title = document.createElement("strong");
      const rationale = document.createElement("span");
      const hypothesis = document.createElement("p");
      const controls = document.createElement("p");
      const boundary = document.createElement("p");
      button.type = "button";
      button.dataset.errorAtlasExperiment = String(index);
      button.setAttribute("aria-pressed", String(index === state.errorAtlasSelectedExperimentIndex));
      kicker.textContent = atlasValue(firstPresent(experiment.id, experiment.experiment_id));
      title.textContent = atlasValue(experiment.title);
      rationale.textContent = atlasValue(experiment.rationale);
      hypothesis.textContent = `可证伪假设 · ${atlasValue(prefill.hypothesis)}`;
      controls.textContent = `指标 / 对照 · ${atlasValue(firstPresent(prefill.primary_endpoint, prefill.primary_metric))} / ${atlasValue(firstPresent(prefill.comparator, prefill.controls))}`;
      boundary.textContent = `失败条件 / 证据边界 · ${atlasValue(firstPresent(prefill.falsification_rule, prefill.evidence_boundary))}`;
      button.append(kicker, title, rationale, hypothesis, controls, boundary);
      item.append(button);
      root.append(item);
    });
    $("sendErrorAtlasToJudgeLab").disabled = false;
  }

  function renderErrorAtlasDetail(record) {
    const detail = $("errorAtlasDetail");
    const unavailableIds = [
      "errorAtlasDetailTitle", "errorAtlasDetailModality", "errorAtlasDetailSample", "errorAtlasDetailTic",
      "errorAtlasDetailTruth", "errorAtlasDetailBaseline", "errorAtlasDetailPixel", "errorAtlasDetailQwen",
      "errorAtlasDetailPixelState", "errorAtlasDetailOutcome", "errorAtlasDetailTaxonomy",
      "errorAtlasDetailRange", "errorAtlasDetailBoundary",
    ];
    if (!record) {
      detail.dataset.state = "empty";
      unavailableIds.forEach((id) => setText(id, null, "unavailable"));
      renderErrorAtlasExperiments(null);
      return;
    }
    detail.dataset.state = "selected";
    const title = firstPresent(record.sampleId, record.ticId, record.targetGroupId);
    setText("errorAtlasDetailTitle", title, "unavailable");
    setText("errorAtlasDetailModality", errorAtlasModalityLabel(record), "unavailable");
    setText("errorAtlasDetailSample", record.sampleId, "unavailable");
    setText("errorAtlasDetailTic", record.ticId, "unavailable");
    setText("errorAtlasDetailTruth", record.truth, "unavailable");
    setText("errorAtlasDetailBaseline", atlasPrediction(record.baselinePrediction, record.baselineConfidence), "unavailable");
    setText("errorAtlasDetailPixel", atlasPrediction(record.pixelPrediction, record.pixelConfidence), "unavailable");
    setText("errorAtlasDetailQwen", atlasPrediction(record.qwenPrediction, record.qwenConfidence), "unavailable");
    setText("errorAtlasDetailPixelState", errorAtlasPixelState(record), "unavailable");
    setText("errorAtlasDetailOutcome", errorAtlasOutcomeLabel(record.outcome), "unavailable");
    setText("errorAtlasDetailTaxonomy", record.taxonomyLabels.length ? record.taxonomyLabels.join(" · ") : null, "unavailable");
    setText("errorAtlasDetailRange", errorAtlasRangeText(record), "unavailable");
    renderRich("errorAtlasDetailBoundary", record.scientificBoundary, "unavailable");
    renderErrorAtlasExperiments(record);
  }

  function renderErrorAtlasRecords() {
    const root = $("errorAtlasRecords");
    root.replaceChildren();
    const records = state.errorAtlasFilteredRecords;
    if (!records.length) {
      const item = document.createElement("li");
      item.className = "error-atlas-empty";
      item.textContent = "没有匹配当前筛选条件的记录。";
      root.append(item);
      return;
    }
    records.forEach((record, position) => {
      const selected = record.index === state.errorAtlasSelectedIndex;
      const item = document.createElement("li");
      const button = document.createElement("button");
      const top = document.createElement("span");
      const identity = document.createElement("strong");
      const taxonomy = document.createElement("small");
      const predictions = document.createElement("span");
      const badges = document.createElement("span");
      button.type = "button";
      button.dataset.errorAtlasRecord = String(record.index);
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected || (state.errorAtlasSelectedIndex === null && position === 0) ? 0 : -1;
      top.className = "error-atlas-record-top";
      identity.textContent = `SAMPLE ${atlasValue(record.sampleId)} · TIC ${atlasValue(record.ticId)}`;
      taxonomy.textContent = record.taxonomyLabels.length ? record.taxonomyLabels.join(" · ") : "taxonomy unavailable";
      top.append(identity, taxonomy);
      predictions.className = "error-atlas-record-predictions";
      predictions.textContent = `TRUE ${atlasValue(record.truth)} → BASE ${atlasValue(record.baselinePrediction)} / PIXEL ${atlasValue(record.pixelPrediction)} / QWEN ${atlasValue(record.qwenPrediction)}`;
      badges.className = "error-atlas-record-badges";
      [errorAtlasModalityLabel(record), errorAtlasPixelState(record), errorAtlasOutcomeLabel(record.outcome), errorAtlasRangeText(record) === "none" ? "in range" : `range ${errorAtlasRangeText(record)}`].forEach((label, index) => {
        const badge = document.createElement("span");
        badge.dataset.kind = ["modality", "pixel", "outcome", "range"][index];
        badge.textContent = label;
        badges.append(badge);
      });
      button.append(top, predictions, badges);
      item.append(button);
      root.append(item);
    });
  }

  function errorAtlasRecordMatchesModality(record, modality) {
    if (modality === "qwen") return record.hasQwen;
    if (modality === "pixel") return record.hasPixel;
    if (modality === "cross_modal") return record.crossModal;
    return true;
  }

  function applyErrorAtlasFilters() {
    if (!state.errorAtlas) return;
    const truth = $("errorAtlasTruthFilter").value;
    const taxonomy = $("errorAtlasTaxonomyFilter").value;
    const pixelFilter = $("errorAtlasPixelFilter").value;
    const query = $("errorAtlasSearch").value.trim().toLocaleLowerCase("zh-CN");
    state.errorAtlasFilteredRecords = state.errorAtlasRecords.filter((record) => {
      if (!errorAtlasRecordMatchesModality(record, state.errorAtlasModality)) return false;
      if (truth !== "all" && String(record.truth) !== truth) return false;
      if (taxonomy !== "all" && !record.taxonomyTags.includes(taxonomy)) return false;
      if (pixelFilter === "missing" && record.pixelAvailable !== false) return false;
      if (pixelFilter === "fixed" && record.outcome !== "PIXEL_FIXED_ERROR") return false;
      if (pixelFilter === "regression" && record.outcome !== "PIXEL_REGRESSION") return false;
      if (pixelFilter === "out_of_range" && !errorAtlasHasRangeOutlier(record)) return false;
      if (query) {
        const searchable = [record.sampleId, record.ticId, record.targetGroupId].filter((value) => value !== undefined && value !== null).join(" ").toLocaleLowerCase("zh-CN");
        if (!searchable.includes(query)) return false;
      }
      return true;
    });
    if (!state.errorAtlasFilteredRecords.some((record) => record.index === state.errorAtlasSelectedIndex)) {
      state.errorAtlasSelectedIndex = state.errorAtlasFilteredRecords.length ? state.errorAtlasFilteredRecords[0].index : null;
      state.errorAtlasSelectedExperimentIndex = 0;
    }
    renderErrorAtlasRecords();
    renderErrorAtlasDetail(state.errorAtlasRecords.find((record) => record.index === state.errorAtlasSelectedIndex) || null);
    setText("errorAtlasResultCount", `${state.errorAtlasFilteredRecords.length} / ${state.errorAtlasRecords.length} records`, "unavailable");
  }

  function selectErrorAtlasModality(modality, options = {}) {
    if (!ERROR_ATLAS_MODALITIES.includes(modality)) return;
    state.errorAtlasModality = modality;
    const buttons = Array.from(document.querySelectorAll("[data-error-atlas-modality]"));
    buttons.forEach((button) => {
      const selected = button.dataset.errorAtlasModality === modality;
      button.setAttribute("aria-checked", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    applyErrorAtlasFilters();
    if (options.focus) {
      const selected = document.querySelector(`[data-error-atlas-modality="${modality}"]`);
      if (selected) selected.focus();
    }
  }

  function selectErrorAtlasRecord(index, options = {}) {
    const record = state.errorAtlasFilteredRecords.find((entry) => entry.index === index);
    if (!record) return;
    state.errorAtlasSelectedIndex = record.index;
    state.errorAtlasSelectedExperimentIndex = 0;
    renderErrorAtlasRecords();
    renderErrorAtlasDetail(record);
    if (options.announce) setText("errorAtlasAnnouncer", `已选择 ${atlasValue(firstPresent(record.sampleId, record.ticId))}，已展示其科学边界与可证伪后续实验。`, "");
    if (options.focus) {
      const button = document.querySelector(`[data-error-atlas-record="${record.index}"]`);
      if (button) button.focus();
    }
  }

  function renderErrorAtlasComplementarity(summary) {
    const panel = $("errorAtlasComplementarity");
    const complementarity = firstRecord(summary && summary.cross_modal_complementarity);
    const ids = [
      "errorAtlasJoinedCount", "errorAtlasBothCorrect", "errorAtlasQwenCorrectPixelWrong",
      "errorAtlasQwenWrongPixelCorrect", "errorAtlasBothWrong", "errorAtlasOracleCount",
      "errorAtlasOracleRate", "errorAtlasOracleBoundary",
    ];
    if (!complementarity) {
      panel.dataset.state = "unavailable";
      ids.forEach((id) => setText(id, null, "unavailable"));
      return;
    }
    const oracle = firstRecord(complementarity.either_correct_oracle) || {};
    const joined = finite(firstPresent(complementarity.joined_count, oracle.evaluated_count));
    const qwenWrongPixelCorrect = finite(complementarity.qwen_wrong_pixel_correct);
    const qwenCorrectPixelWrong = finite(complementarity.qwen_correct_pixel_wrong);
    const bothCorrect = finite(complementarity.both_correct);
    const bothWrong = finite(complementarity.both_wrong);
    const oracleCount = finite(firstPresent(oracle.correct_count, complementarity.either_correct_oracle_count));
    const oracleRate = finite(firstPresent(oracle.accuracy, complementarity.either_correct_oracle_rate));
    const nonDeployable = complementarity.oracle_is_non_deployable === true
      || complementarity.role === "non_deployable_diagnostic_upper_bound"
      || oracle.role === "non_deployable_diagnostic_upper_bound";
    const complete = [joined, qwenWrongPixelCorrect, qwenCorrectPixelWrong, bothCorrect, bothWrong, oracleCount, oracleRate].every((value) => value !== null)
      && nonDeployable;
    panel.dataset.state = complete ? "available" : "partial";
    setText("errorAtlasJoinedCount", joined, "unavailable");
    setText("errorAtlasBothCorrect", bothCorrect, "unavailable");
    setText("errorAtlasQwenCorrectPixelWrong", qwenCorrectPixelWrong, "unavailable");
    setText("errorAtlasQwenWrongPixelCorrect", qwenWrongPixelCorrect, "unavailable");
    setText("errorAtlasBothWrong", bothWrong, "unavailable");
    setText("errorAtlasOracleCount", oracleCount, "unavailable");
    setText("errorAtlasOracleRate", oracleRate === null ? null : `${(oracleRate * 100).toFixed(1)}%`, "unavailable");
    setText(
      "errorAtlasOracleBoundary",
      nonDeployable ? "either-correct oracle 只是事后诊断上界；它是不可部署的标签 oracle，也不是现有系统已获得的提升。" : null,
      "unavailable",
    );
  }

  function renderErrorAtlas(evidence) {
    const atlas = firstRecord(evidence && evidence.error_atlas);
    const panel = $("errorAtlas");
    if (!atlas) {
      state.errorAtlas = null;
      state.errorAtlasRecords = [];
      state.errorAtlasFilteredRecords = [];
      state.errorAtlasSelectedIndex = null;
      state.errorAtlasSelectedExperiments = [];
      panel.dataset.state = "unavailable";
      ["errorAtlasState", "errorAtlasSummary", "errorAtlasAllCount", "errorAtlasQwenCount", "errorAtlasPixelCount", "errorAtlasCrossModalCount", "errorAtlasResultCount"].forEach((id) => setText(id, null, "unavailable"));
      renderErrorAtlasComplementarity(null);
      $("errorAtlasRecords").replaceChildren(Object.assign(document.createElement("li"), { textContent: "unavailable", className: "error-atlas-empty" }));
      renderErrorAtlasDetail(null);
      return;
    }
    state.errorAtlas = atlas;
    state.errorAtlasRecords = Array.isArray(atlas.records)
      ? atlas.records.filter(isRecord).map((record, index) => normalizeErrorAtlasRecord(record, index, atlas))
      : [];
    panel.dataset.state = Array.isArray(atlas.records) ? "available" : "partial";
    setText("errorAtlasState", Array.isArray(atlas.records) ? `${state.errorAtlasRecords.length} records ready` : "records unavailable", "unavailable");
    setText("errorAtlasSummary", errorAtlasSummaryText(atlas.summary), "unavailable");
    setText("errorAtlasAllCount", Array.isArray(atlas.records) ? state.errorAtlasRecords.length : null, "unavailable");
    setText("errorAtlasQwenCount", Array.isArray(atlas.records) ? state.errorAtlasRecords.filter((record) => record.hasQwen).length : null, "unavailable");
    setText("errorAtlasPixelCount", Array.isArray(atlas.records) ? state.errorAtlasRecords.filter((record) => record.hasPixel).length : null, "unavailable");
    setText("errorAtlasCrossModalCount", Array.isArray(atlas.records) ? state.errorAtlasRecords.filter((record) => record.crossModal).length : null, "unavailable");
    renderErrorAtlasComplementarity(atlas.summary);
    const truths = [...new Set(state.errorAtlasRecords.map((record) => record.truth).filter((value) => value !== undefined && value !== null && value !== ""))]
      .map(String).sort((left, right) => left.localeCompare(right, "zh-CN"));
    replaceErrorAtlasOptions($("errorAtlasTruthFilter"), "全部真实类", truths.map((truth) => [truth, truth]));
    const taxonomyDefinitions = errorAtlasTaxonomyDefinitions(atlas.taxonomies);
    state.errorAtlasRecords.forEach((record) => record.taxonomyTags.forEach((tag) => {
      if (!taxonomyDefinitions.has(tag)) taxonomyDefinitions.set(tag, tag);
    }));
    replaceErrorAtlasOptions($("errorAtlasTaxonomyFilter"), "全部 taxonomy", [...taxonomyDefinitions.entries()].sort(([left], [right]) => left.localeCompare(right, "zh-CN")));
    if (!state.errorAtlasRecords.some((record) => record.index === state.errorAtlasSelectedIndex)) state.errorAtlasSelectedIndex = state.errorAtlasRecords.length ? state.errorAtlasRecords[0].index : null;
    selectErrorAtlasModality(state.errorAtlasModality);
  }

  function prefillJudgeLabFromErrorAtlas() {
    const record = state.errorAtlasRecords.find((entry) => entry.index === state.errorAtlasSelectedIndex);
    const experiment = state.errorAtlasSelectedExperiments[state.errorAtlasSelectedExperimentIndex];
    if (!record || !experiment) return;
    const prefill = firstRecord(experiment.judge_lab_prefill) || {};
    const hypothesis = firstPresent(prefill.problem, prefill.research_question, prefill.hypothesis, experiment.hypothesis, experiment.title);
    const evidenceBoundary = firstPresent(prefill.evidence_boundary, experiment.evidence_boundary, record.scientificBoundary);
    const humanChallenge = firstPresent(prefill.human_challenge, prefill.falsification_rule, experiment.falsification_rule, evidenceBoundary);
    const materials = [
      "ERROR ATLAS CASE EVIDENCE",
      `sample_id: ${atlasValue(record.sampleId)}`,
      `tic_id: ${atlasValue(record.ticId)}`,
      `target_group_id: ${atlasValue(record.targetGroupId)}`,
      `true_class: ${atlasValue(record.truth)}`,
      `baseline_prediction: ${atlasPrediction(record.baselinePrediction, record.baselineConfidence)}`,
      `pixel_enhanced_prediction: ${atlasPrediction(record.pixelPrediction, record.pixelConfidence)}`,
      `qwen_prediction: ${atlasPrediction(record.qwenPrediction, record.qwenConfidence)}`,
      `pixel_state: ${errorAtlasPixelState(record)}`,
      `pixel_outcome: ${errorAtlasOutcomeLabel(record.outcome)}`,
      `taxonomy_tags: ${record.taxonomyTags.length ? record.taxonomyTags.join(", ") : "unavailable"}`,
      `feature_out_of_range: ${errorAtlasRangeText(record)}`,
      `qwen_evidence: ${atlasValue(record.qwenEvidence)}`,
      `qwen_limitations: ${atlasValue(record.qwenLimitations)}`,
      `next_experiment: ${atlasValue(experiment.title)}`,
      `hypothesis: ${atlasValue(firstPresent(prefill.hypothesis, experiment.hypothesis))}`,
      `intervention: ${atlasValue(firstPresent(prefill.intervention, experiment.intervention))}`,
      `comparator: ${atlasValue(firstPresent(prefill.comparator, prefill.controls, experiment.comparator))}`,
      `primary_endpoint: ${atlasValue(firstPresent(prefill.primary_endpoint, prefill.primary_metric, experiment.primary_endpoint))}`,
      `success_criterion: ${atlasValue(firstPresent(prefill.success_criterion, experiment.success_criterion))}`,
      `falsification_rule: ${atlasValue(firstPresent(prefill.falsification_rule, experiment.falsification_rule))}`,
      `scientific_boundary: ${atlasValue(evidenceBoundary)}`,
    ].join("\n");
    const domainInput = $("labDomain");
    const problemInput = $("labQuestion");
    const materialInput = $("labMaterial");
    const challengeInput = $("labHumanChallenge");
    if (!domainInput.value.trim()) domainInput.value = "时域天文 · TESS 多模态错例分析";
    problemInput.value = atlasValue(hypothesis);
    materialInput.value = materials;
    challengeInput.value = humanChallenge === undefined
      ? "unavailable"
      : `请优先挑战这一失败条件，并要求假设在被证伪时实质修订：${atlasValue(humanChallenge)}`;
    [domainInput, problemInput, materialInput, challengeInput].forEach((input) => input.dispatchEvent(new Event("input", { bubbles: true })));
    setText("errorAtlasAnnouncer", "已预填 Judge Lab 的研究问题、证据材料与人工质疑；尚未调用任何 API。", "");
    toast("错例实验已预填；请在 Judge Lab 审阅后手动启动");
    $("judgeLab").scrollIntoView({ behavior: signalMotionQuery.matches ? "auto" : "smooth", block: "start" });
    problemInput.focus({ preventScroll: true });
  }

  function signalObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function signalNumber(value, label, minimum = null, maximum = null) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`真实光变舞台 ${label} 不是有限数值`);
    if (minimum !== null && value < minimum) throw new Error(`真实光变舞台 ${label} 低于允许范围`);
    if (maximum !== null && value > maximum) throw new Error(`真实光变舞台 ${label} 超出允许范围`);
    return value;
  }

  function signalIndexArray(value, length, label) {
    if (!Array.isArray(value)) throw new Error(`真实光变舞台缺少 ${label}`);
    let previous = -1;
    value.forEach((entry) => {
      if (!Number.isInteger(entry) || entry < 0 || entry >= length || entry <= previous) {
        throw new Error(`真实光变舞台 ${label} 索引污染`);
      }
      previous = entry;
    });
    return value;
  }

  function normalizeSignalStage(evidence) {
    const data = evidence && evidence.light_curve_stage;
    const hash = evidence && evidence.hashes && evidence.hashes.light_curve_stage_sha256;
    if (!signalObject(data)) throw new Error("真实光变舞台证据缺失");
    if (typeof hash !== "string" || !SIGNAL_HASH.test(hash)) throw new Error("真实光变舞台 SHA-256 无效");
    if (data.artifact_type !== "P07_REAL_TESS_LIGHT_CURVE_SHOWCASE" || data.schema_version !== "1.0") {
      throw new Error("真实光变舞台 Schema 不兼容");
    }
    if (typeof data.showcase_id !== "string" || !data.showcase_id || typeof data.source_scope !== "string" || !data.source_scope) {
      throw new Error("真实光变舞台来源标识不完整");
    }
    if (!Array.isArray(data.class_names) || data.class_names.length !== SIGNAL_CLASS_NAMES.length
      || data.class_names.some((name, index) => name !== SIGNAL_CLASS_NAMES[index])) {
      throw new Error("真实光变舞台类别顺序不匹配固定模型");
    }
    if (!signalObject(data.derivation)
      || data.derivation.sector4_used !== false
      || data.derivation.waveform_generated_or_synthesized !== false
      || data.derivation.raw_fits_redistributed !== false) {
      throw new Error("真实光变舞台数据来源声明未通过预检");
    }
    if (typeof data.source_bindings_sha256 !== "string" || !SIGNAL_HASH.test(data.source_bindings_sha256)) {
      throw new Error("真实光变舞台源绑定哈希无效");
    }
    if (!Array.isArray(data.source_bindings) || data.source_bindings.length < SIGNAL_ROLES.length) {
      throw new Error("真实光变舞台源绑定缺失");
    }
    data.source_bindings.forEach((binding) => {
      if (!signalObject(binding) || typeof binding.role !== "string"
        || typeof binding.sha256 !== "string" || !SIGNAL_HASH.test(binding.sha256)
        || !Number.isInteger(binding.size_bytes) || binding.size_bytes < 0) {
        throw new Error("真实光变舞台源绑定格式无效");
      }
    });
    if (!Array.isArray(data.samples) || data.samples.length !== SIGNAL_ROLES.length) {
      throw new Error("真实光变舞台必须包含三种固定真实样本");
    }
    if (data.samples.some((sample, index) => !signalObject(sample) || sample.role !== SIGNAL_ROLES[index])) {
      throw new Error("真实光变舞台样本角色或顺序无效");
    }
    if (new Set(data.samples.map((sample) => sample.display_id)).size !== data.samples.length) {
      throw new Error("真实光变舞台样本标识重复");
    }

    data.samples.forEach((sample) => {
      if (typeof sample.display_id !== "string" || !sample.display_id || sample.display_id.length > 160
        || typeof sample.headline !== "string" || !sample.headline || sample.headline.length > 160
        || typeof sample.story !== "string" || !sample.story || sample.story.length > 600) {
        throw new Error("真实光变舞台样本文本字段无效");
      }
      if (!Number.isInteger(sample.sector) || sample.sector < 1 || sample.sector > 3) {
        throw new Error("真实光变舞台拒绝 Sector 4 或未知 Sector");
      }
      if (!SIGNAL_CLASS_NAMES.includes(sample.truth) || !SIGNAL_CLASS_NAMES.includes(sample.prediction)
        || typeof sample.correct !== "boolean" || sample.correct !== (sample.truth === sample.prediction)) {
        throw new Error("真实光变舞台标签与 verdict 不一致");
      }
      signalNumber(sample.confidence, `${sample.role} 置信度`, 0, 1);
      signalNumber(sample.period_days, `${sample.role} 周期`, Number.EPSILON);
      signalNumber(sample.epoch_btjd, `${sample.role} 星历`);
      signalNumber(sample.duration_hours, `${sample.role} 持续时间`, Number.EPSILON);
      if (typeof sample.source_fits_sha256 !== "string" || !SIGNAL_HASH.test(sample.source_fits_sha256)) {
        throw new Error("真实光变舞台 FITS SHA-256 无效");
      }

      const time = sample.time_days;
      const flux = sample.normalized_flux;
      const phase = sample.phase;
      if (!Array.isArray(time) || !Array.isArray(flux) || !Array.isArray(phase)
        || time.length < 32 || time.length > 5000 || flux.length !== time.length || phase.length !== time.length) {
        throw new Error("真实光变舞台点列长度无效");
      }
      let fluxMinimum = Infinity;
      let fluxMaximum = -Infinity;
      for (let index = 0; index < time.length; index += 1) {
        const timeValue = signalNumber(time[index], `${sample.role} 时间点`);
        const fluxValue = signalNumber(flux[index], `${sample.role} 光度`, Number.EPSILON, 10);
        signalNumber(phase[index], `${sample.role} 相位`, 0, 1);
        if (phase[index] >= 1) throw new Error("真实光变舞台相位必须位于 [0, 1)");
        if (index && timeValue <= time[index - 1]) throw new Error("真实光变舞台时间轴不是严格递增");
        fluxMinimum = Math.min(fluxMinimum, fluxValue);
        fluxMaximum = Math.max(fluxMaximum, fluxValue);
      }
      const gaps = signalIndexArray(sample.gap_after_indices, Math.max(1, time.length - 1), `${sample.role} 观测缺口`);
      const signals = signalIndexArray(sample.signal_indices, time.length, `${sample.role} 信号标记`);
      if (!signalObject(sample.statistics)
        || sample.statistics.cadence_count !== time.length
        || sample.statistics.gap_count !== gaps.length
        || sample.statistics.signal_marker_count !== signals.length
        || Math.abs(signalNumber(sample.statistics.flux_min, `${sample.role} 最低光度`) - fluxMinimum) > 1e-7
        || Math.abs(signalNumber(sample.statistics.flux_max, `${sample.role} 最高光度`) - fluxMaximum) > 1e-7) {
        throw new Error("真实光变舞台统计摘要与点列不一致");
      }

      if (!Array.isArray(sample.model_votes) || sample.model_votes.length !== SIGNAL_MODEL_IDS.length) {
        throw new Error("真实光变舞台模型投票不完整");
      }
      sample.model_votes.forEach((vote, voteIndex) => {
        if (!signalObject(vote) || vote.model_id !== SIGNAL_MODEL_IDS[voteIndex]
          || typeof vote.display_name !== "string" || !vote.display_name
          || !SIGNAL_CLASS_NAMES.includes(vote.prediction)
          || !Array.isArray(vote.class_probabilities)
          || vote.class_probabilities.length !== SIGNAL_CLASS_NAMES.length) {
          throw new Error("真实光变舞台模型投票格式无效");
        }
        const probabilities = vote.class_probabilities.map((value) => signalNumber(value, `${vote.model_id} 概率`, 0, 1));
        const probabilitySum = probabilities.reduce((total, value) => total + value, 0);
        const maximum = Math.max(...probabilities);
        const prediction = SIGNAL_CLASS_NAMES[probabilities.indexOf(maximum)];
        if (Math.abs(probabilitySum - 1) > 1e-5 || prediction !== vote.prediction
          || Math.abs(signalNumber(vote.confidence, `${vote.model_id} 置信度`, 0, 1) - maximum) > 1e-7) {
          throw new Error("真实光变舞台模型概率与预测不一致");
        }
      });
      const fusion = sample.model_votes[sample.model_votes.length - 1];
      for (let classIndex = 0; classIndex < SIGNAL_CLASS_NAMES.length; classIndex += 1) {
        const expected = (sample.model_votes[0].class_probabilities[classIndex]
          + sample.model_votes[1].class_probabilities[classIndex]) / 2;
        if (Math.abs(fusion.class_probabilities[classIndex] - expected) > 1e-7) {
          throw new Error("真实光变舞台固定融合概率不是两组成模型的 0.5 / 0.5 均值");
        }
      }
      if (fusion.prediction !== sample.prediction || Math.abs(fusion.confidence - sample.confidence) > 1e-7) {
        throw new Error("真实光变舞台融合票与样本 verdict 不一致");
      }
      const sourceBinding = data.source_bindings.find((binding) => binding.role === sample.role);
      if (!sourceBinding || sourceBinding.source_type !== "MAST_TESS_QLP_FITS"
        || sourceBinding.sector !== sample.sector || sourceBinding.sha256 !== sample.source_fits_sha256) {
        throw new Error("真实光变舞台样本与 FITS 源绑定不一致");
      }
    });

    const canonical = data.samples[0];
    const binary = data.samples[1];
    const hardError = data.samples[2];
    if (!canonical.correct || !binary.correct || binary.truth !== "EB"
      || hardError.correct || hardError.truth !== "V" || hardError.prediction !== "IS") {
      throw new Error("真实光变舞台三例语义不满足固定演示契约");
    }
    return { data, hash };
  }

  function currentSignalSample() {
    if (!state.signalData) return null;
    return state.signalData.samples.find((sample) => sample.role === state.signalSampleRole) || null;
  }

  function dispatchStellarEvent(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function broadcastStellarSample() {
    const sample = currentSignalSample();
    if (!sample) return;
    dispatchStellarEvent("astrotwin:stellar-sample", {
      role: sample.role,
      sample,
    });
  }

  function signalCanvasSurface() {
    if (!signalCanvas || !$("signalCanvasWrap")) return null;
    const context = signalCanvas.getContext("2d");
    if (!context) return null;
    const rectangle = $("signalCanvasWrap").getBoundingClientRect();
    const width = Math.max(280, Math.round(rectangle.width));
    const height = Math.max(280, Math.round(rectangle.height));
    const ratio = Math.min(2, Math.max(1, finite(window.devicePixelRatio) || 1));
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (signalCanvas.width !== pixelWidth || signalCanvas.height !== pixelHeight) {
      signalCanvas.width = pixelWidth;
      signalCanvas.height = pixelHeight;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    return { context, width, height };
  }

  function signalRoundRect(context, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + safeRadius, y);
    context.arcTo(x + width, y, x + width, y + height, safeRadius);
    context.arcTo(x + width, y + height, x, y + height, safeRadius);
    context.arcTo(x, y + height, x, y, safeRadius);
    context.arcTo(x, y, x + width, y, safeRadius);
    context.closePath();
  }

  function signalPlotGrid(context, plot, yMinimum, yMaximum, xMinimum, xMaximum, xFormatter) {
    context.save();
    context.lineWidth = 1;
    context.font = "9px Consolas, monospace";
    context.textBaseline = "middle";
    for (let tick = 0; tick <= 4; tick += 1) {
      const ratio = tick / 4;
      const y = plot.top + ratio * plot.height;
      context.strokeStyle = "rgba(115, 158, 228, 0.10)";
      context.beginPath();
      context.moveTo(plot.left, y);
      context.lineTo(plot.left + plot.width, y);
      context.stroke();
      const value = yMaximum - ratio * (yMaximum - yMinimum);
      context.fillStyle = "rgba(126, 146, 181, 0.62)";
      context.textAlign = "right";
      context.fillText(value.toFixed(value < 0.1 ? 4 : 3), plot.left - 8, y);
    }
    context.textBaseline = "top";
    for (let tick = 0; tick <= 6; tick += 1) {
      const ratio = tick / 6;
      const x = plot.left + ratio * plot.width;
      context.strokeStyle = "rgba(115, 158, 228, 0.075)";
      context.beginPath();
      context.moveTo(x, plot.top);
      context.lineTo(x, plot.top + plot.height);
      context.stroke();
      context.fillStyle = "rgba(126, 146, 181, 0.62)";
      context.textAlign = tick === 0 ? "left" : tick === 6 ? "right" : "center";
      context.fillText(xFormatter(xMinimum + ratio * (xMaximum - xMinimum)), x, plot.top + plot.height + 9);
    }
    context.restore();
  }

  function signalFluxRange(sample) {
    const minimum = sample.statistics.flux_min;
    const maximum = sample.statistics.flux_max;
    const span = Math.max(maximum - minimum, Math.abs(maximum) * 0.0002, 0.0002);
    return { minimum: minimum - span * 0.12, maximum: maximum + span * 0.12 };
  }

  function drawSignalHeader(context, width, label, accent = "#55ddff") {
    context.save();
    context.fillStyle = accent;
    context.font = "700 9px Consolas, monospace";
    context.textAlign = "left";
    context.fillText(label, 48, 19);
    context.fillStyle = "rgba(114, 137, 177, 0.58)";
    context.textAlign = "right";
    context.fillText("QUALITY = 0 · HASH VERIFIED", width - 22, 19);
    context.restore();
  }

  function updateSignalScanline(plot, progress, width, hidden = false) {
    const scanline = $("signalScanline");
    if (!scanline) return;
    scanline.hidden = hidden || signalMotionQuery.matches;
    if (!scanline.hidden) {
      const position = plot ? (plot.left + plot.width * Math.max(0, Math.min(1, progress))) / width : 0.92;
      scanline.style.left = `${Math.max(0.06, Math.min(0.94, position)) * 100}%`;
    }
  }

  function drawTimeSignal(surface, sample, progress, options = {}) {
    const { context, width, height } = surface;
    const errorMode = options.errorMode === true;
    const bottomInset = errorMode ? 132 : 46;
    const plot = { left: 55, top: 36, width: Math.max(120, width - 78), height: Math.max(120, height - 36 - bottomInset) };
    const range = signalFluxRange(sample);
    const xMinimum = sample.time_days[0];
    const xMaximum = sample.time_days[sample.time_days.length - 1];
    signalPlotGrid(context, plot, range.minimum, range.maximum, xMinimum, xMaximum, (value) => `${value.toFixed(1)}d`);
    drawSignalHeader(context, width, errorMode ? "RETAINED ERROR / REAL QLP" : "REAL QLP NORMALIZED FLUX", errorMode ? "#ff6f91" : "#55ddff");

    const xAt = (value) => plot.left + ((value - xMinimum) / (xMaximum - xMinimum)) * plot.width;
    const yAt = (value) => plot.top + ((range.maximum - value) / (range.maximum - range.minimum)) * plot.height;
    const limit = Math.max(1, Math.min(sample.time_days.length, Math.ceil(sample.time_days.length * progress)));
    const gaps = new Set(sample.gap_after_indices);
    context.save();
    context.strokeStyle = errorMode ? "rgba(255, 128, 158, 0.88)" : "rgba(100, 222, 255, 0.88)";
    context.shadowColor = errorMode ? "rgba(255, 91, 132, 0.45)" : "rgba(71, 203, 255, 0.44)";
    context.shadowBlur = 7;
    context.lineWidth = 1.15;
    context.beginPath();
    for (let index = 0; index < limit; index += 1) {
      const x = xAt(sample.time_days[index]);
      const y = yAt(sample.normalized_flux[index]);
      if (!index || gaps.has(index - 1)) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
    context.restore();

    context.save();
    context.fillStyle = errorMode ? "rgba(255, 187, 203, 0.82)" : "rgba(196, 246, 255, 0.72)";
    for (let index = 0; index < limit; index += Math.max(1, Math.floor(sample.time_days.length / 520))) {
      context.beginPath();
      context.arc(xAt(sample.time_days[index]), yAt(sample.normalized_flux[index]), 1.05, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    context.save();
    context.strokeStyle = errorMode ? "rgba(255, 111, 145, 0.92)" : "rgba(255, 184, 106, 0.82)";
    context.fillStyle = errorMode ? "rgba(255, 111, 145, 0.20)" : "rgba(255, 184, 106, 0.17)";
    context.lineWidth = 1;
    sample.signal_indices.forEach((index, markerIndex) => {
      if (index >= limit || markerIndex % Math.max(1, Math.floor(sample.signal_indices.length / 90)) !== 0) return;
      const x = xAt(sample.time_days[index]);
      const y = yAt(sample.normalized_flux[index]);
      context.beginPath();
      context.arc(x, y, errorMode ? 3.2 : 2.4, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    });
    context.restore();

    context.save();
    context.fillStyle = "rgba(157, 108, 255, 0.75)";
    const gapStride = Math.max(1, Math.ceil(sample.gap_after_indices.length / 16));
    sample.gap_after_indices.forEach((index, gapIndex) => {
      if (gapIndex % gapStride || index >= limit) return;
      const x = xAt(sample.time_days[index]);
      context.beginPath();
      context.moveTo(x - 3, plot.top + plot.height - 2);
      context.lineTo(x + 3, plot.top + plot.height - 2);
      context.lineTo(x, plot.top + plot.height - 7);
      context.closePath();
      context.fill();
    });
    context.restore();

    if (errorMode) {
      const panelY = height - 108;
      context.save();
      signalRoundRect(context, 38, panelY, width - 60, 82, 12);
      context.fillStyle = "rgba(86, 18, 47, 0.58)";
      context.fill();
      context.strokeStyle = "rgba(255, 111, 145, 0.35)";
      context.stroke();
      context.fillStyle = "#ff9bb3";
      context.font = "700 11px Consolas, monospace";
      context.fillText("RETAINED HARD ERROR", 56, panelY + 21);
      context.fillStyle = "#f4f7ff";
      context.font = `800 ${Math.max(20, Math.min(30, width / 24))}px "Segoe UI", sans-serif`;
      context.fillText(`TRUTH ${sample.truth}  →  FUSION ${sample.prediction}`, 56, panelY + 52);
      context.fillStyle = "#ffb86a";
      context.font = "700 11px Consolas, monospace";
      context.textAlign = "right";
      context.fillText(`${(sample.confidence * 100).toFixed(1)}% CONFIDENCE · ERROR PRESERVED`, width - 40, panelY + 52);
      context.restore();
    }
    updateSignalScanline(plot, progress, width, false);
  }

  function drawPhaseSignal(surface, sample, progress) {
    const { context, width, height } = surface;
    const plot = { left: 55, top: 36, width: Math.max(120, width - 78), height: Math.max(120, height - 82) };
    const range = signalFluxRange(sample);
    signalPlotGrid(context, plot, range.minimum, range.maximum, 0, 1, (value) => value.toFixed(2));
    drawSignalHeader(context, width, `PHASE FOLD / P = ${sample.period_days.toFixed(6)} DAYS`);
    const xAt = (value) => plot.left + value * plot.width;
    const yAt = (value) => plot.top + ((range.maximum - value) / (range.maximum - range.minimum)) * plot.height;
    const indices = Array.from({ length: sample.phase.length }, (_, index) => index)
      .sort((left, right) => sample.phase[left] - sample.phase[right]);
    const limit = Math.max(1, Math.min(indices.length, Math.ceil(indices.length * progress)));
    const signalIndices = new Set(sample.signal_indices);

    context.save();
    context.fillStyle = "rgba(115, 225, 255, 0.68)";
    for (let rank = 0; rank < limit; rank += 1) {
      const index = indices[rank];
      context.beginPath();
      context.arc(xAt(sample.phase[index]), yAt(sample.normalized_flux[index]), 1.35, 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = "rgba(255, 184, 106, 0.76)";
    context.fillStyle = "rgba(255, 184, 106, 0.17)";
    indices.slice(0, limit).forEach((index) => {
      if (!signalIndices.has(index)) return;
      context.beginPath();
      context.arc(xAt(sample.phase[index]), yAt(sample.normalized_flux[index]), 2.8, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    });
    context.restore();

    context.save();
    context.setLineDash([4, 5]);
    context.strokeStyle = "rgba(157, 108, 255, 0.42)";
    [0.5].forEach((phaseValue) => {
      const x = xAt(phaseValue);
      context.beginPath();
      context.moveTo(x, plot.top);
      context.lineTo(x, plot.top + plot.height);
      context.stroke();
    });
    context.setLineDash([]);
    context.fillStyle = "rgba(177, 149, 255, 0.72)";
    context.font = "8px Consolas, monospace";
    context.textAlign = "center";
    context.fillText("φ = 0.5", xAt(0.5), plot.top + 14);
    context.restore();
    updateSignalScanline(plot, progress, width, false);
  }

  function drawModelDuel(surface, sample, progress) {
    const { context, width, height } = surface;
    const classColors = ["#55ddff", "#9d6cff", "#ffb86a", "#56f0bd"];
    drawSignalHeader(context, width, "DETERMINISTIC MODEL VOTE MATRIX", "#a989ff");
    context.save();
    context.fillStyle = "rgba(220, 231, 255, 0.94)";
    context.font = `800 ${Math.max(21, Math.min(32, width / 23))}px "Segoe UI", sans-serif`;
    context.fillText("Metadata × QLP × Fixed Fusion", 46, 62);
    context.fillStyle = "rgba(125, 143, 180, 0.72)";
    context.font = "10px Consolas, monospace";
    context.fillText("四分类概率完整亮票，最高概率对应程序 prediction", 47, 84);

    const left = 47;
    const right = 30;
    const barWidth = Math.max(170, width - left - right);
    const available = Math.max(240, height - 155);
    const laneHeight = available / 3;
    sample.model_votes.forEach((vote, voteIndex) => {
      const top = 104 + laneHeight * voteIndex;
      context.fillStyle = voteIndex === 2 ? "#56f0bd" : "rgba(200, 214, 241, 0.82)";
      context.font = "700 11px Consolas, monospace";
      context.textAlign = "left";
      context.fillText(`${String(voteIndex + 1).padStart(2, "0")}  ${vote.display_name}`, left, top);
      context.textAlign = "right";
      context.fillText(`${vote.prediction}  ${(vote.confidence * 100).toFixed(1)}%`, left + barWidth, top);
      const barTop = top + 17;
      const barHeight = Math.max(25, Math.min(38, laneHeight - 42));
      signalRoundRect(context, left, barTop, barWidth, barHeight, 8);
      context.fillStyle = "rgba(64, 82, 124, 0.18)";
      context.fill();
      let cursor = left;
      vote.class_probabilities.forEach((probability, classIndex) => {
        const segmentWidth = barWidth * probability * progress;
        context.fillStyle = `${classColors[classIndex]}${voteIndex === 2 ? "cc" : "99"}`;
        context.fillRect(cursor, barTop, Math.max(0, segmentWidth - 1), barHeight);
        if (segmentWidth > 45 && progress > 0.7) {
          context.fillStyle = "#07101e";
          context.font = "700 8px Consolas, monospace";
          context.textAlign = "center";
          context.fillText(`${SIGNAL_CLASS_NAMES[classIndex]} ${(probability * 100).toFixed(0)}%`, cursor + segmentWidth / 2, barTop + barHeight / 2 + 3);
        }
        cursor += segmentWidth;
      });
      context.fillStyle = "rgba(105, 119, 151, 0.72)";
      context.font = "8px Consolas, monospace";
      context.textAlign = "left";
      context.fillText(SIGNAL_CLASS_NAMES.map((name, index) => `${name} ${(vote.class_probabilities[index] * 100).toFixed(1)}%`).join("  /  "), left, barTop + barHeight + 15);
    });
    context.restore();
    updateSignalScanline(null, progress, width, true);
  }

  function renderSignalCanvas(progress = 1) {
    const sample = currentSignalSample();
    if (!sample || !state.signalData) return;
    const surface = signalCanvasSurface();
    if (!surface) throw new Error("浏览器不支持真实光变 Canvas");
    const safeProgress = Math.max(0.02, Math.min(1, progress));
    state.signalReveal = safeProgress;
    if (state.signalMode === "phase") drawPhaseSignal(surface, sample, safeProgress);
    else if (state.signalMode === "duel") drawModelDuel(surface, sample, safeProgress);
    else drawTimeSignal(surface, sample, safeProgress, { errorMode: state.signalMode === "error" });
  }

  function cancelSignalReveal() {
    if (state.signalFrame !== null) window.cancelAnimationFrame(state.signalFrame);
    state.signalFrame = null;
  }

  function animateSignalCanvas() {
    cancelSignalReveal();
    if (signalMotionQuery.matches || document.hidden) {
      renderSignalCanvas(1);
      return;
    }
    const started = performance.now();
    const duration = state.signalMode === "duel" ? 1150 : 1550;
    const frame = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - ((1 - progress) ** 3);
      renderSignalCanvas(eased);
      if (progress < 1) state.signalFrame = window.requestAnimationFrame(frame);
      else state.signalFrame = null;
    };
    state.signalFrame = window.requestAnimationFrame(frame);
  }

  function signalModeStory(sample) {
    if (state.signalMode === "raw") return `${sample.story} 当前原始视图保留 ${sample.statistics.gap_count} 个真实观测缺口。`;
    if (state.signalMode === "phase") return `固定周期 ${sample.period_days.toFixed(6)} 天把 ${sample.statistics.cadence_count} 个真实 cadence 折叠到同一轨道相位；没有生成或平滑波形。`;
    if (state.signalMode === "duel") return `两路固定组成模型分别亮票，第三路只执行冻结的 0.5 / 0.5 概率平均，最终投向 ${sample.prediction}。`;
    return `${sample.story} 真实标签 ${sample.truth}，固定融合却以 ${(sample.confidence * 100).toFixed(1)}% 置信度投向 ${sample.prediction}；错例不被删掉。`;
  }

  function renderSignalVotes(sample) {
    const root = $("signalModelVotes");
    root.replaceChildren();
    sample.model_votes.forEach((vote, voteIndex) => {
      const item = document.createElement("li");
      item.dataset.final = vote.model_id === "fixed_half_fusion" ? "true" : "false";
      item.style.setProperty("--prob", String(vote.confidence));
      const row = document.createElement("div");
      row.className = "vote-row";
      const name = document.createElement("strong");
      name.textContent = vote.display_name;
      const prediction = document.createElement("b");
      prediction.textContent = `${vote.prediction} ${(vote.confidence * 100).toFixed(1)}%`;
      row.append(name, prediction);
      const classes = document.createElement("div");
      classes.className = "vote-classes";
      SIGNAL_CLASS_NAMES.forEach((className, classIndex) => {
        const label = document.createElement("span");
        label.dataset.win = vote.prediction === className ? "true" : "false";
        label.textContent = `${className} ${(vote.class_probabilities[classIndex] * 100).toFixed(1)}%`;
        classes.append(label);
      });
      item.append(row, classes);
      root.append(item);
    });
  }

  function renderSignalDossier({ announce = false } = {}) {
    const sample = currentSignalSample();
    if (!sample) return;
    const meta = SIGNAL_MODE_META[state.signalMode];
    setText("signalModeBadge", meta.badge);
    setText("signalMonitorTitle", meta.title);
    setText("signalInspectorTitle", sample.headline);
    setText("signalStory", signalModeStory(sample));
    setText("signalSector", `SECTOR ${sample.sector}`);
    setText("signalObjectId", sample.display_id.toUpperCase());
    setText("signalTruth", sample.truth);
    setText("signalPrediction", sample.prediction);
    setText("signalConfidence", `${(sample.confidence * 100).toFixed(1)}%`);
    setText("signalPeriod", `${sample.period_days.toFixed(6)} d`);
    setText("signalCadences", sample.statistics.cadence_count.toLocaleString("zh-CN"));
    setText("signalGaps", sample.statistics.gap_count);
    setText("signalFitsHash", shortHash(sample.source_fits_sha256));
    setText("signalDataHash", `舞台 ${shortHash(state.signalHash)} · FITS ${shortHash(sample.source_fits_sha256)}`);
    setText("signalXAxis", meta.x);
    $("signalVerdictLock").dataset.state = sample.correct ? "pass" : "error";
    renderSignalVotes(sample);

    const fluxMinimum = sample.statistics.flux_min.toFixed(6);
    const fluxMaximum = sample.statistics.flux_max.toFixed(6);
    const correctness = sample.correct ? "分类正确" : "这是完整保留的错误分类";
    const summary = `${meta.title}。真实 ${sample.display_id}，TESS Sector ${sample.sector}，${sample.statistics.cadence_count} 个有效 cadence，归一化光度范围 ${fluxMinimum} 到 ${fluxMaximum}，周期 ${sample.period_days.toFixed(6)} 天。真实标签 ${sample.truth}，固定融合预测 ${sample.prediction}，置信度 ${(sample.confidence * 100).toFixed(1)}%，${correctness}。`;
    setText("signalAccessibleSummary", summary);
    signalCanvas.setAttribute("aria-label", summary);

    document.querySelectorAll("[data-signal-sample]").forEach((button) => {
      const role = button.dataset.signalSample;
      const target = state.signalData.samples.find((entry) => entry.role === role);
      button.setAttribute("aria-current", role === state.signalSampleRole ? "true" : "false");
      button.dataset.error = target && !target.correct ? "true" : "false";
      const detail = button.querySelector("small");
      if (detail && target) detail.textContent = `S${target.sector} · ${target.truth}→${target.prediction} · ${(target.confidence * 100).toFixed(1)}%`;
    });
    if (announce) setText("signalAnnouncer", summary);
  }

  function setSignalTabs(mode, focus = false) {
    document.querySelectorAll("[data-signal-mode]").forEach((button) => {
      const selected = button.dataset.signalMode === mode;
      button.setAttribute("aria-selected", selected ? "true" : "false");
      button.tabIndex = selected ? 0 : -1;
      if (selected) {
        $("signalPanel").setAttribute("aria-labelledby", button.id);
        if (focus) button.focus();
      }
    });
  }

  function pauseSignalTour(message = "30 秒答辩动画已暂停，可继续播放。") {
    if (state.signalTourFrame !== null) window.cancelAnimationFrame(state.signalTourFrame);
    state.signalTourFrame = null;
    state.signalTourRunning = false;
    state.signalTourStartedAt = null;
    signalTourButton.setAttribute("aria-pressed", "false");
    setText("signalTourLabel", state.signalTourElapsed > 0 ? "继续 30 秒答辩动画" : "播放 30 秒答辩动画");
    if (message) setText("signalAnnouncer", message);
  }

  function chooseSignalSample(role, options = {}) {
    if (!state.signalData || !SIGNAL_ROLES.includes(role)) return;
    if (!options.fromTour && state.signalTourRunning) pauseSignalTour();
    if (state.signalMode === "error" && role !== "hard_error") {
      state.signalMode = "raw";
      $("signalWorkbench").dataset.mode = "raw";
      setSignalTabs("raw");
    }
    state.signalSampleRole = role;
    renderSignalDossier({ announce: options.announce !== false });
    animateSignalCanvas();
    broadcastStellarSample();
  }

  function chooseSignalMode(mode, options = {}) {
    if (!state.signalData || !SIGNAL_MODES.includes(mode)) return;
    if (!options.fromTour && state.signalTourRunning) pauseSignalTour();
    if (mode === "error") state.signalSampleRole = "hard_error";
    state.signalMode = mode;
    $("signalWorkbench").dataset.mode = mode;
    setSignalTabs(mode, options.focus === true);
    renderSignalDossier({ announce: options.announce !== false });
    animateSignalCanvas();
    broadcastStellarSample();
  }

  function finishSignalTour() {
    if (state.signalTourFrame !== null) window.cancelAnimationFrame(state.signalTourFrame);
    state.signalTourFrame = null;
    state.signalTourRunning = false;
    state.signalTourStartedAt = null;
    state.signalTourElapsed = 0;
    state.signalTourStep = -1;
    signalTourButton.setAttribute("aria-pressed", "false");
    setText("signalTourLabel", "重播 30 秒答辩动画");
    $("signalTourProgress").style.width = "100%";
    setText("signalAnnouncer", "30 秒演示完成：真实输入、周期结构、三路模型和完整错例已经依次展示。当前停留在错例解剖。 ");
  }

  function signalTourTick(now) {
    if (!state.signalTourRunning) return;
    if (state.signalTourStartedAt === null) state.signalTourStartedAt = now - state.signalTourElapsed;
    const elapsed = Math.min(SIGNAL_TOUR_DURATION, now - state.signalTourStartedAt);
    state.signalTourElapsed = elapsed;
    $("signalTourProgress").style.width = `${(elapsed / SIGNAL_TOUR_DURATION) * 100}%`;
    let stepIndex = 0;
    SIGNAL_TOUR_STEPS.forEach((step, index) => {
      if (elapsed >= step.at) stepIndex = index;
    });
    if (stepIndex !== state.signalTourStep) {
      state.signalTourStep = stepIndex;
      const step = SIGNAL_TOUR_STEPS[stepIndex];
      state.signalSampleRole = step.role;
      state.signalMode = step.mode;
      $("signalWorkbench").dataset.mode = step.mode;
      setSignalTabs(step.mode);
      renderSignalDossier();
      setText("signalAnnouncer", step.message);
      animateSignalCanvas();
    }
    if (elapsed >= SIGNAL_TOUR_DURATION) finishSignalTour();
    else state.signalTourFrame = window.requestAnimationFrame(signalTourTick);
  }

  function toggleSignalTour() {
    if (!state.signalData) return;
    if (state.signalTourRunning) {
      pauseSignalTour();
      return;
    }
    if (state.signalTourElapsed >= SIGNAL_TOUR_DURATION) state.signalTourElapsed = 0;
    state.signalTourRunning = true;
    state.signalTourStartedAt = null;
    state.signalTourStep = -1;
    signalTourButton.setAttribute("aria-pressed", "true");
    setText("signalTourLabel", "暂停 30 秒答辩动画");
    state.signalTourFrame = window.requestAnimationFrame(signalTourTick);
  }

  function setSignalControlsDisabled(disabled) {
    signalTourButton.disabled = disabled;
    document.querySelectorAll("[data-signal-mode], [data-signal-sample]").forEach((button) => { button.disabled = disabled; });
  }

  function failSignalStage(message) {
    cancelSignalReveal();
    pauseSignalTour("");
    if (state.signalResizeObserver) state.signalResizeObserver.disconnect();
    state.signalResizeObserver = null;
    window.clearTimeout(state.signalResizeTimer);
    state.signalData = null;
    state.signalHash = null;
    signalStage.dataset.state = "failed";
    setSignalControlsDisabled(true);
    const loadingText = $("signalLoading").querySelector("span");
    if (loadingText) loadingText.textContent = "REAL LIGHT CURVE EVIDENCE BLOCKED";
    setText("signalMonitorTitle", "真实光变证据未通过验真");
    setText("signalInspectorTitle", "主舞台安全关闭");
    setText("signalStory", message || "光变证据缺失或污染，系统拒绝绘制与发布。");
    setText("signalAccessibleSummary", message || "真实光变舞台证据不可用，交互已关闭。");
    setText("signalAnnouncer", message || "真实光变舞台证据不可用，交互已关闭。");
    signalCanvas.setAttribute("aria-label", "真实光变证据未通过校验，Canvas 已关闭");
    const surface = signalCanvasSurface();
    if (surface) {
      const { context, width, height } = surface;
      context.save();
      context.strokeStyle = "rgba(255, 111, 145, 0.16)";
      for (let x = 25; x < width; x += 42) {
        context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
      }
      context.fillStyle = "#ff6f91";
      context.font = "700 12px Consolas, monospace";
      context.textAlign = "center";
      context.fillText("FAIL-CLOSED / EVIDENCE UNAVAILABLE", width / 2, height / 2);
      context.restore();
    }
    dispatchStellarEvent("astrotwin:stellar-failed", {
      message: message || "真实光变证据不可用，恒星数字孪生核心已安全关闭。",
    });
  }

  function activateSignalStage(evidence, normalizedStage = null) {
    const normalized = normalizedStage || normalizeSignalStage(evidence);
    if (evidence.effective_product_release_eligible !== true) {
      failSignalStage("当前证据包未取得发布资格，真实光变主舞台已安全关闭。");
      return;
    }
    state.signalData = normalized.data;
    state.signalHash = normalized.hash;
    state.signalMode = "raw";
    state.signalSampleRole = "canonical_correct";
    state.signalTourElapsed = 0;
    state.signalTourStep = -1;
    signalStage.dataset.state = "ready";
    dispatchStellarEvent("astrotwin:stellar-evidence", {
      stage: normalized.data,
      sha256: normalized.hash,
      eligible: true,
    });
    $("signalWorkbench").dataset.mode = "raw";
    const loadingText = $("signalLoading").querySelector("span");
    if (loadingText) loadingText.textContent = "REAL CADENCES VERIFIED";
    setSignalControlsDisabled(false);
    setSignalTabs("raw");
    renderSignalDossier();
    animateSignalCanvas();
    broadcastStellarSample();

    if (state.signalResizeObserver) state.signalResizeObserver.disconnect();
    if (typeof window.ResizeObserver === "function") {
      state.signalResizeObserver = new ResizeObserver(() => {
        cancelSignalReveal();
        if (state.signalData) renderSignalCanvas(1);
      });
      state.signalResizeObserver.observe($("signalCanvasWrap"));
    }
    setText("signalAnnouncer", "三条真实 TESS 光变证据已通过同一份 receipt 验真，主舞台可以操作。");
  }

  const SCIENCE_ROUTE_LABELS = { baseline: "BASELINE", pixel: "PIXEL", qwen: "QWEN-VL" };
  const SCIENCE_CLASS_COLORS = { PC: "#55ddff", EB: "#a77cff", V: "#ffb44d", IS: "#65efa4" };

  function scienceRequest() {
    if (state.scienceMode === "guided") {
      return { mode: "guided", experiment_id: state.scienceExperimentId };
    }
    const routes = Array.from(document.querySelectorAll("input[name='scienceRoute']:checked")).map((node) => node.value);
    if (!routes.length) throw new Error("请至少选择一条比较路线。");
    const truth = $("scienceTruthFilter").value;
    const taxonomy = $("scienceTaxonomyFilter").value;
    return {
      mode: "explore",
      routes,
      filters: {
        true_classes: truth === "all" ? [] : [truth],
        pixel_state: $("sciencePixelFilter").value,
        qwen_coverage: $("scienceQwenFilter").value,
        taxonomies: taxonomy === "all" ? [] : [taxonomy],
      },
    };
  }

  function selectScienceMode(mode) {
    if (!['guided', 'explore'].includes(mode)) return;
    if (isPublicStatic && mode === "explore") return;
    state.scienceMode = mode;
    document.querySelectorAll("[data-science-mode]").forEach((button) => {
      const active = button.dataset.scienceMode === mode;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    $("scienceExperimentCards").hidden = mode !== "guided";
    $("scienceExplorer").hidden = mode !== "explore";
    setText("scienceControlTitle", mode === "guided" ? "选择固定科学问题" : "定义探索性共同 cohort");
    setText("scienceRunStatus", mode === "guided" ? "固定主问题与结论规则已锁定。" : "探索结果只做描述性重算，不升级为确认性结论。");
  }

  function selectScienceExperiment(experimentId) {
    if (!state.scienceOptions || !state.scienceOptions.experiments.some((entry) => entry.id === experimentId)) return;
    state.scienceExperimentId = experimentId;
    document.querySelectorAll("[data-science-experiment]").forEach((button) => {
      const active = button.dataset.scienceExperiment === experimentId;
      button.setAttribute("aria-checked", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    const experiment = state.scienceOptions.experiments.find((entry) => entry.id === experimentId);
    setText("scienceRunStatus", `${experiment.question} 主终点：${experiment.primary_endpoint}`);
  }

  function scienceMetricCard(route, metrics) {
    const card = document.createElement("article");
    card.className = `science-route-card science-route-${route}`;
    const probability = metrics.log_loss === null ? "分类结果" : `Log-loss ${fixed(metrics.log_loss, 4)}`;
    const label = document.createElement("span");
    const score = document.createElement("strong");
    const summary = document.createElement("p");
    const detail = document.createElement("small");
    label.textContent = SCIENCE_ROUTE_LABELS[route] || route;
    score.textContent = fixed(metrics.macro_f1, 4);
    summary.textContent = `Macro-F1 · Accuracy ${percent(metrics.accuracy)}`;
    detail.textContent = `${metrics.correct_count}/${metrics.evaluated_count} 正确 · ${probability}`;
    card.append(label, score, summary, detail);
    return card;
  }

  function renderScienceMetrics(result) {
    const root = $("scienceRouteMetrics");
    root.replaceChildren();
    Object.entries(result.route_metrics || {}).forEach(([route, metrics]) => root.appendChild(scienceMetricCard(route, metrics)));
  }

  function renderScienceMatrices(result) {
    const root = $("scienceMatrices");
    root.replaceChildren();
    const classes = result.charts.class_names;
    Object.entries(result.charts.confusion_matrices || {}).forEach(([route, matrix]) => {
      const article = document.createElement("article");
      article.className = "science-matrix";
      const title = document.createElement("h5");
      title.textContent = SCIENCE_ROUTE_LABELS[route] || route;
      const grid = document.createElement("div");
      grid.className = "science-matrix-grid";
      grid.setAttribute("role", "table");
      const corner = document.createElement("span");
      corner.textContent = "真↓ / 预→";
      corner.className = "matrix-label";
      grid.appendChild(corner);
      classes.forEach((name) => { const node = document.createElement("b"); node.textContent = name; grid.appendChild(node); });
      matrix.forEach((row, rowIndex) => {
        const rowLabel = document.createElement("b");
        rowLabel.textContent = classes[rowIndex];
        grid.appendChild(rowLabel);
        row.forEach((value, columnIndex) => {
          const cell = document.createElement("span");
          cell.textContent = String(value);
          cell.dataset.diagonal = String(rowIndex === columnIndex);
          cell.style.setProperty("--cell-strength", String(Math.min(1, value / Math.max(1, ...row))));
          grid.appendChild(cell);
        });
      });
      article.append(title, grid);
      root.appendChild(article);
    });
  }

  function scienceSvgNode(name, attributes = {}) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  }

  function renderScienceScatter(result) {
    const svg = $("scienceScatter");
    svg.replaceChildren();
    const points = (result.charts.feature_scatter || []).filter((point) => finite(point.x) !== null && finite(point.y) !== null);
    if (!points.length) {
      setText("scienceScatterSummary", "当前 cohort 没有可绘制的 Pixel 特征。");
      return;
    }
    const xs = points.map((point) => Number(point.x));
    const ys = points.map((point) => Number(point.y));
    let xMin = Math.min(...xs); let xMax = Math.max(...xs);
    let yMin = Math.min(...ys); let yMax = Math.max(...ys);
    if (xMin === xMax) { xMin -= 1; xMax += 1; }
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    const xPad = (xMax - xMin) * 0.08;
    const yPad = (yMax - yMin) * 0.08;
    xMin -= xPad; xMax += xPad; yMin -= yPad; yMax += yPad;
    const plot = { left: 52, right: 500, top: 20, bottom: 256 };
    const sx = (value) => plot.left + (value - xMin) / (xMax - xMin) * (plot.right - plot.left);
    const sy = (value) => plot.bottom - (value - yMin) / (yMax - yMin) * (plot.bottom - plot.top);
    svg.appendChild(scienceSvgNode("rect", { x: plot.left, y: plot.top, width: plot.right - plot.left, height: plot.bottom - plot.top, class: "science-scatter-bg" }));
    for (let index = 0; index <= 4; index += 1) {
      const x = plot.left + index / 4 * (plot.right - plot.left);
      const y = plot.top + index / 4 * (plot.bottom - plot.top);
      svg.appendChild(scienceSvgNode("line", { x1: x, y1: plot.top, x2: x, y2: plot.bottom, class: "science-scatter-grid" }));
      svg.appendChild(scienceSvgNode("line", { x1: plot.left, y1: y, x2: plot.right, y2: y, class: "science-scatter-grid" }));
    }
    points.forEach((point) => {
      const circle = scienceSvgNode("circle", {
        cx: sx(Number(point.x)), cy: sy(Number(point.y)), r: point.out_of_range ? 5.5 : 4,
        fill: SCIENCE_CLASS_COLORS[point.true_class] || "#fff",
        class: `science-scatter-point ${point.pixel_correct ? "is-correct" : "is-error"} ${point.out_of_range ? "is-outlier" : ""}`,
      });
      const title = scienceSvgNode("title");
      title.textContent = `${point.sample_id} · ${point.true_class} · ${point.pixel_correct ? "正确" : "错误"}${point.out_of_range ? " · 越界" : ""}`;
      circle.appendChild(title);
      svg.appendChild(circle);
    });
    const xLabel = scienceSvgNode("text", { x: 276, y: 287, class: "science-scatter-label" });
    xLabel.textContent = "P04 DIFFERENCE CENTROID";
    const yLabel = scienceSvgNode("text", { x: 14, y: 150, class: "science-scatter-label", transform: "rotate(-90 14 150)" });
    yLabel.textContent = "P04 APERTURE DEPTH";
    svg.append(xLabel, yLabel);
    const outliers = points.filter((point) => point.out_of_range).length;
    setText("scienceScatterSummary", `${points.length} 条可用特征 · ${outliers} 条超出训练范围 · 颜色表示真实类，空心表示分类错误。`);
  }

  function renderScienceStatistics(result) {
    const root = $("scienceStatTests");
    root.replaceChildren();
    (result.statistical_tests || []).forEach((test) => {
      const card = document.createElement("article");
      const name = document.createElement("span");
      const comparison = document.createElement("strong");
      const values = document.createElement("p");
      name.textContent = test.test;
      comparison.textContent = test.comparison;
      values.textContent = `effect ${test.effect === null ? "—" : fixed(test.effect, 4)} · p ${test.p_value === null ? "—" : fixed(test.p_value, 4)}`;
      card.append(name, comparison, values);
      root.appendChild(card);
    });
    const bootstrap = result.bootstrap;
    setText("scienceBootstrap", `${bootstrap.replicates.toLocaleString("zh-CN")} 次 ${bootstrap.unit} bootstrap · ${bootstrap.metric} = ${fixed(bootstrap.estimate, 4)} · 95% CI [${fixed(bootstrap.confidence_interval[0], 4)}, ${fixed(bootstrap.confidence_interval[1], 4)}] · seed ${bootstrap.seed}`);
  }

  function renderScienceFinding(result) {
    const finding = result.finding;
    const root = $("scienceFinding");
    root.replaceChildren();
    const summary = document.createElement("div");
    const summaryLabel = document.createElement("span");
    const headline = document.createElement("h4");
    const rationale = document.createElement("p");
    summaryLabel.textContent = "证据回答";
    headline.textContent = finding.headline;
    rationale.textContent = finding.rationale;
    summary.append(summaryLabel, headline, rationale);
    const alternatives = document.createElement("dl");
    const alternative = document.createElement("div");
    const alternativeTerm = document.createElement("dt");
    const alternativeDescription = document.createElement("dd");
    alternativeTerm.textContent = "替代解释";
    alternativeDescription.textContent = finding.alternative_explanation;
    alternative.append(alternativeTerm, alternativeDescription);
    const next = document.createElement("div");
    const nextTerm = document.createElement("dt");
    const nextDescription = document.createElement("dd");
    nextTerm.textContent = "下一项可证伪实验";
    nextDescription.textContent = finding.next_experiment;
    next.append(nextTerm, nextDescription);
    alternatives.append(alternative, next);
    root.append(summary, alternatives);
  }

  function renderScienceResult(result) {
    if (!result || typeof result !== "object" || typeof result.analysis_id !== "string") throw new Error("科学实验结果结构无效");
    if (!result.finding || result.finding.changes_product_verdict !== false) throw new Error("科学实验越过了只读 verdict 边界");
    state.scienceResult = result;
    const root = $("scienceResult");
    root.dataset.state = result.finding.verdict.toLowerCase();
    setText("scienceResultTitle", result.experiment.title);
    setText("scienceVerdict", result.finding.verdict);
    $("scienceVerdict").dataset.state = result.finding.verdict.toLowerCase();
    setText("scienceQuestion", `${result.analysis_mode} · ${result.experiment.question} · ${result.cohort.label} · N=${result.cohort.sample_count}`);
    renderScienceMetrics(result);
    renderScienceMatrices(result);
    renderScienceScatter(result);
    renderScienceStatistics(result);
    renderScienceFinding(result);
    ["downloadScienceJson", "downloadScienceMarkdown", "sendScienceToJudgeLab"].forEach((id) => { $(id).disabled = false; });
    setText("scienceRunStatus", `分析 ${result.analysis_id.slice(0, 12)} 已完成；原产品 verdict 未改变。`);
  }

  async function runScience() {
    if (!state.scienceOptions || state.scienceRunning) return;
    let request;
    try { request = scienceRequest(); } catch (error) { setText("scienceRunStatus", error.message); return; }
    state.scienceRunning = true;
    $("runScience").disabled = true;
    $("scienceWorkbench").dataset.state = "running";
    setText("scienceRunStatus", "正在对当前共同 cohort 重算指标、配对检验与 5,000 次 bootstrap…");
    try {
      const payload = await api("/api/science/run", { method: "POST", body: JSON.stringify(request) });
      renderScienceResult(payload.result);
      $("scienceWorkbench").dataset.state = "ready";
    } catch (error) {
      $("scienceWorkbench").dataset.state = "error";
      setText("scienceRunStatus", error.message || "科学实验未完成。");
    } finally {
      state.scienceRunning = false;
      $("runScience").disabled = !state.scienceOptions;
    }
  }

  // Public snapshot: replay the first guided experiment once the workbench scrolls into view,
  // so judges land on a computed finding instead of empty panels.
  function autoRunScienceWhenVisible() {
    if (!isPublicStatic || state.scienceResult || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      if (!state.scienceResult && !state.scienceRunning) runScience();
    }, { threshold: 0.2 });
    observer.observe($("scienceWorkbench"));
  }

  async function loadScienceOptions() {
    try {
      const payload = await api("/api/science/options");
      const options = payload.options;
      if (!options || !Array.isArray(options.experiments) || options.experiments.length !== 4) throw new Error("科学实验选项结构无效");
      state.scienceOptions = options;
      setText("scienceObjectCount", options.source.sample_count);
      setText("scienceSourceState", `${options.source.sample_count} 条 Sector 4 · ${options.source.qwen_subset_count} 条 Qwen 联表 · Atlas ${options.source.atlas_sha256.slice(0, 10)}…`);
      const taxonomy = $("scienceTaxonomyFilter");
      options.filters.taxonomies.forEach((value) => {
        const entry = document.createElement("option");
        entry.value = value; entry.textContent = value; taxonomy.appendChild(entry);
      });
      $("runScience").disabled = false;
      $("scienceWorkbench").dataset.state = "ready";
      selectScienceExperiment(state.scienceExperimentId);
      autoRunScienceWhenVisible();
    } catch (error) {
      $("scienceWorkbench").dataset.state = "error";
      setText("scienceSourceState", "科学实验 API 不可用");
      setText("scienceRunStatus", error.message || "无法读取科学实验选项。");
    }
  }

  function downloadScience(kind) {
    const result = state.scienceResult;
    if (!result) return;
    const markdown = kind === "markdown";
    const content = markdown ? result.export.markdown : `${JSON.stringify(result, null, 2)}\n`;
    const blob = new Blob([content], { type: markdown ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${result.export.filename_stem}.${markdown ? "md" : "json"}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    toast(`科学实验 ${markdown ? "Markdown" : "JSON"} 已下载`);
  }

  function sendScienceToJudgeLab() {
    const result = state.scienceResult;
    if (!result) return;
    $("labDomain").value = "时域天文 / TESS 分类诊断";
    $("labQuestion").value = `${result.experiment.question}\n当前现场结果：${result.finding.headline}\n请基于固定 cohort 提出下一项可证伪实验。`.slice(0, 2000);
    $("labHumanChallenge").value = result.finding.alternative_explanation.slice(0, 2000);
    $("labMaterial").value = result.export.markdown.slice(0, state.labLimits.materialChars);
    setText("questionCount", $("labQuestion").value.length, "0");
    setText("humanChallengeCount", $("labHumanChallenge").value.length, "0");
    setText("materialCount", $("labMaterial").value.length, "0");
    $("judgeLab").scrollIntoView({ behavior: signalMotionQuery.matches ? "auto" : "smooth", block: "start" });
    toast("科学实验快照已预填到 Judge Lab；尚未调用 API");
  }

  function toast(message) {
    const node = $("toast");
    node.textContent = message;
    node.dataset.show = "true";
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => { node.dataset.show = "false"; }, 2600);
  }

  function setConnection(kind, message) {
    $("connectionState").dataset.state = kind;
    setText("connectionText", message);
  }

  function setEligibility(eligible, message) {
    const badge = $("eligibilityBadge");
    const dialogBadge = $("dialogStatus");
    badge.dataset.state = eligible === null ? "pending" : eligible ? "pass" : "fail";
    dialogBadge.dataset.state = badge.dataset.state;
    setText("eligibilityText", message || (eligible ? "本机验真通过 · 可发布" : "未通过发布校验"));
    setText("dialogStatusText", message || (eligible ? "证据链现场校验通过" : "证据链未通过校验"));
  }

  async function api(path, options = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(path, {
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
        ...options,
        headers: options.body ? { "Content-Type": "application/json", ...(options.headers || {}) } : options.headers,
      });
      let payload;
      try { payload = await response.json(); } catch (_) { throw new Error("服务返回了不可解析的响应"); }
      if (!response.ok || !payload || payload.ok !== true) {
        const safeMessage = payload && payload.error && payload.error.message;
        const requestError = new Error(typeof safeMessage === "string" ? safeMessage : `请求失败 (${response.status})`);
        requestError.status = response.status;
        requestError.code = payload && payload.error && payload.error.code;
        throw requestError;
      }
      return payload;
    } catch (error) {
      if (error && error.name === "AbortError") throw new Error("本地验真超时，请检查服务状态");
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function normalizeEvidence(payload) {
    const evidence = payload && payload.evidence;
    if (!evidence || typeof evidence !== "object") throw new Error("真实证据响应缺少 evidence");
    if (typeof evidence.package_id !== "string" || typeof evidence.verdict !== "string") throw new Error("真实证据字段不完整");
    return evidence;
  }

  function verdictLabel(verdict) {
    const labels = {
      SUPPORTED: "本地证据支持",
      SUPPORTED_WITH_LIMITATIONS: "本地证据支持",
      REFUTED: "当前证据推翻",
      INCONCLUSIVE: "证据尚不充分",
      REVISION_REQUIRED: "需要自动修订",
    };
    return labels[verdict] || "程序裁决已返回";
  }

  function renderPipelineFromEvidence(evidence) {
    renderScientificChain(evidence);
  }

  function renderRunPipeline(run) {
    if (state.evidence) renderScientificChain(state.evidence);
    const activeKey = PIPELINE_STAGES[run && run.stage];
    if (activeKey && SCIENTIFIC_CHAIN_ORDER.includes(activeKey)) {
      setText("scientificChainAnnouncer", `演示运行阶段：${run.stage}。科学证据节点仍以 API receipt 为准。`);
    }
  }

  function renderAgents(qwen) {
    const grid = $("agentGrid");
    grid.replaceChildren();
    const roles = Array.isArray(qwen && qwen.roles) ? qwen.roles : [];
    if (!roles.length) {
      const card = document.createElement("article");
      card.className = "agent-card agent-placeholder";
      const text = document.createElement("p");
      text.textContent = "角色证据不可用";
      card.append(text);
      grid.append(card);
      return;
    }
    roles.forEach((role) => {
      const label = ROLE_LABELS[role] || [role.replaceAll("_", " "), "AI"];
      const model = qwen.role_models && qwen.role_models[role];
      const article = document.createElement("article");
      article.className = "agent-card";
      if (role === "report_writer") article.dataset.light = "true";
      const avatar = document.createElement("span");
      avatar.className = "agent-avatar";
      avatar.textContent = label[1];
      const small = document.createElement("small");
      small.textContent = role.toUpperCase();
      const title = document.createElement("h3");
      title.textContent = label[0];
      const code = document.createElement("code");
      code.textContent = typeof model === "string" ? model : "model unavailable";
      article.append(avatar, small, title, code);
      grid.append(article);
    });
  }

  function renderFaults(fault) {
    const total = finite(fault && fault.case_count);
    const failed = finite(fault && fault.safe_failure_count);
    const blocked = finite(fault && fault.safe_blocked_count);
    const recovered = finite(fault && fault.safe_recovery_count);
    setText("faultCases", total);
    setText("faultOrbNumber", total);
    setText("safeFailures", failed);
    setText("safeBlocked", blocked);
    setText("safeRecovery", recovered);
    setText("partialCount", finite(fault && fault.publishable_partial_count));
    const wall = $("faultDots");
    wall.replaceChildren();
    if (total === null || total < 0 || total > 100) return;
    const kinds = [
      ...Array(Math.max(0, failed || 0)).fill("failed"),
      ...Array(Math.max(0, blocked || 0)).fill("blocked"),
      ...Array(Math.max(0, recovered || 0)).fill("recovered"),
    ];
    kinds.slice(0, total).forEach((kind) => {
      const dot = document.createElement("span");
      dot.className = "fault-dot";
      dot.dataset.kind = kind;
      dot.title = kind === "failed" ? "安全失败" : kind === "blocked" ? "安全阻断" : "安全恢复";
      wall.append(dot);
    });
  }

  function asBindingArray(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object" && typeof value.sha256 === "string") return [value];
    return [];
  }

  function renderBindings(evidence) {
    const counts = evidence.bindings || {};
    const countEntries = [
      ["input_count", "输入"], ["model_count", "模型"], ["code_count", "代码"],
      ["frontend_count", "前端"], ["schema_count", "Schema"], ["output_count", "输出"],
    ];
    const summary = $("bindingSummary");
    summary.replaceChildren();
    countEntries.forEach(([key, label]) => {
      const item = document.createElement("div");
      const strong = document.createElement("strong");
      const span = document.createElement("span");
      strong.textContent = finite(counts[key]) ?? "—";
      span.textContent = label;
      item.append(strong, span);
      summary.append(item);
    });

    const groups = evidence.binding_groups || {};
    const root = $("hashGroups");
    root.replaceChildren();
    Object.keys(BINDING_LABELS).forEach((key, index) => {
      const items = asBindingArray(groups[key]);
      if (!items.length) return;
      const details = document.createElement("details");
      details.className = "hash-group";
      if (index < 2) details.open = true;
      const summaryNode = document.createElement("summary");
      summaryNode.append(document.createTextNode(BINDING_LABELS[key]));
      const count = document.createElement("span");
      count.textContent = `${items.length} BINDING${items.length === 1 ? "" : "S"}`;
      summaryNode.append(count);
      const list = document.createElement("ul");
      list.className = "hash-list";
      items.forEach((entry) => {
        const row = document.createElement("li");
        const path = document.createElement("span");
        const hash = document.createElement("code");
        path.textContent = typeof entry.path === "string" ? entry.path : typeof entry.role === "string" ? entry.role : "binding";
        hash.textContent = typeof entry.sha256 === "string" ? entry.sha256 : "SHA unavailable";
        row.append(path, hash);
        list.append(row);
      });
      details.append(summaryNode, list);
      root.append(details);
    });
    if (!root.children.length) {
      const notice = document.createElement("p");
      notice.textContent = "逐项绑定将在证据服务完成加载后显示。";
      notice.className = "hash-empty";
      root.append(notice);
    }
  }

  function renderEvidence(evidence) {
    const normalizedSignal = normalizeSignalStage(evidence);
    state.evidence = evidence;
    const eligible = evidence.effective_product_release_eligible === true;
    setConnection(eligible ? "ready" : "error", eligible ? (isPublicStatic ? "公开静态快照 · 已验真" : "真实证据在线 · 已验真") : "证据未通过当前验真");
    setEligibility(eligible, eligible ? (isPublicStatic ? "来源包验真通过 · 只读展示" : "本机验真通过 · 可发布") : "Fail-closed · 不可发布");
    setText("verdictLocal", verdictLabel(evidence.verdict));
    setText("verdictRaw", evidence.verdict);
    setText("packageId", evidence.package_id);
    setText("dialogPackage", evidence.package_id);
    setText("demoMode", isPublicStatic ? "VERIFIED SNAPSHOT" : evidence.mode === "verified_evidence_replay" ? "OFFLINE REPLAY" : evidence.mode);
    const manifest = evidence.hashes && evidence.hashes.package_manifest_sha256;
    setText("manifestShort", shortHash(manifest));
    setText("manifestFull", manifest);
    setText("networkFact", evidence.network_call_executed ? "1+" : "0");

    const metrics = evidence.metrics || {};
    const counts = evidence.counts || {};
    setText("macroF1", fixed(metrics.macro_f1));
    setText("accuracy", percent(metrics.accuracy));
    setText("recordCount", finite(counts.record_count));
    setText("deltaBaseline", finite(metrics.macro_f1_delta_vs_best_baseline) === null ? "—" : `+${fixed(metrics.macro_f1_delta_vs_best_baseline)}`);
    setText("baselineF1", fixed(metrics.best_baseline_macro_f1));
    setText("errorCount", finite(counts.error_case_count));
    setText("qlpAvailable", finite(counts.qlp_available_count) === null ? "—" : `${counts.qlp_available_count}/${counts.record_count}`);
    setText("qlpComplete", finite(counts.qlp_complete_count) === null ? "—" : `${counts.qlp_complete_count}/${counts.record_count}`);
    setText("replaySeconds", finite(metrics.observed_execution_seconds) === null ? "—" : `${fixed(metrics.observed_execution_seconds, 3)}s`);

    renderPipelineFromEvidence(evidence);
    renderGeneralizationComparison(evidence);
    renderPixelDevelopment(evidence);
    renderQwenVlBenchmark(evidence);
    renderErrorAtlas(evidence);
    renderAgents(evidence.qwen_evidence || {});
    setText("qwenRoleCount", finite(evidence.qwen_evidence && evidence.qwen_evidence.role_call_count));
    setText("heroRoleCount", finite(evidence.qwen_evidence && evidence.qwen_evidence.role_call_count));
    setText("qwenProvider", evidence.qwen_evidence && evidence.qwen_evidence.provider_mode);
    setText("qwenOrigin", evidence.qwen_evidence && evidence.qwen_evidence.origin === "HASH_VERIFIED_PRIOR_REAL_RUN" ? "已验真历史实跑" : evidence.qwen_evidence && evidence.qwen_evidence.origin);
    renderFaults(evidence.failure_matrix || {});
    renderBindings(evidence);
    setText("runCommand", evidence.reproduction && evidence.reproduction.run);
    setText("verifyCommand", evidence.reproduction && evidence.reproduction.verify);
    setText("footerScope", `${counts.record_count ?? "—"} 条 Sector 1–3 固定本地证据 · 不是官方榜分 · manifest ${shortHash(manifest)}`);
    startButton.disabled = isPublicStatic || !eligible;
    verifyButton.disabled = isPublicStatic;
    setText("runMessage", isPublicStatic ? "已加载公开只读快照。导引实验与光子法庭可直接回放；重新验真和新运行仅在完整本地版提供。" : "真实证据已加载。可立即现场验真，或启动一个全新 no-clobber 离线回放。");
    setText("consoleStage", isPublicStatic ? "SNAPSHOT" : "READY");
    activateSignalStage(evidence, normalizedSignal);
  }

  function renderEvidenceFailure(error) {
    state.evidence = null;
    state.scientificChain = null;
    setConnection("error", "真实证据不可用");
    setEligibility(false, "Fail-closed · 不可发布");
    setText("verdictLocal", "证据加载失败");
    setText("verdictRaw", "EVIDENCE_UNAVAILABLE");
    setText("runMessage", error.message || "无法读取真实证据");
    setText("consoleStage", "BLOCKED");
    startButton.disabled = true;
    verifyButton.disabled = true;
    failSignalStage(error && error.message ? error.message : "真实光变证据不可用，主舞台已安全关闭。");
    document.querySelectorAll("[data-science-chain]").forEach((node) => {
      node.dataset.state = "fail";
      const tag = node.querySelector(".node-state");
      if (tag) tag.textContent = "BLOCKED";
    });
    renderGeneralizationComparison({});
    renderPixelDevelopment({});
    renderQwenVlBenchmark({});
    renderErrorAtlas({});
    selectScientificChainStep(state.scientificChainStep);
  }

  function renderActivity(run) {
    const list = $("activityList");
    list.replaceChildren();
    const activity = Array.isArray(run && run.activity) ? run.activity : [];
    activity.slice(-8).forEach((entry) => {
      const item = document.createElement("li");
      const time = document.createElement("time");
      const message = document.createElement("span");
      const date = new Date(entry.at);
      time.textContent = Number.isNaN(date.getTime()) ? "--:--:--" : date.toLocaleTimeString("zh-CN", { hour12: false });
      message.textContent = typeof entry.message === "string" ? entry.message : entry.stage;
      item.append(time, message);
      list.append(item);
    });
  }

  function renderRun(run) {
    state.run = run;
    const busy = run && run.state === "running";
    if (busy) setEligibility(null, "新运行执行中 · 尚未发布");
    startButton.disabled = busy || !state.evidence || state.evidence.effective_product_release_eligible !== true;
    verifyButton.disabled = busy || !state.evidence;
    setText("consoleStage", run && run.stage ? run.stage : "READY");
    setText("runMessage", run && run.message ? run.message : "真实证据已就绪");
    renderActivity(run || {});
    if (busy || (run && run.state === "failed")) renderRunPipeline(run);
    if (run && run.run_id) setText("packageId", run.run_id);
  }

  async function loadEvidence() {
    setConnection("loading", "正在现场核验真实证据");
    try {
      const payload = await api("/api/evidence");
      renderEvidence(normalizeEvidence(payload));
      const status = await api("/api/status");
      renderRun(status.run || {});
    } catch (error) {
      renderEvidenceFailure(error instanceof Error ? error : new Error("证据加载失败"));
    }
  }

  async function verifyEvidence() {
    if (!state.evidence) return;
    verifyButton.disabled = true;
    startButton.disabled = true;
    setText("runMessage", "正在逐文件核验 manifest、仓库绑定与产品资格…");
    setText("consoleStage", "FINAL_VERIFY");
    try {
      const payload = await api("/api/verify", {
        method: "POST",
        body: JSON.stringify({ package_id: state.evidence.package_id }),
      });
      const result = payload.verification || {};
      if (result.status !== "PASS" || result.product_release_eligible !== true) throw new Error("证据包未通过发布校验");
      setEligibility(true, "现场验真通过 · 可发布");
      setText("runMessage", `验真完成：${result.package_file_count ?? "—"} 个文件与 ${result.repository_binding_count ?? "—"} 项仓库绑定全部匹配。`);
      setText("consoleStage", "VERIFIED");
      toast("现场验真 PASS：哈希与发布资格一致");
    } catch (error) {
      if (state.evidence) state.evidence.effective_product_release_eligible = false;
      setEligibility(false, "Fail-closed · 验真未通过");
      failSignalStage("现场复验未通过，真实光变主舞台已安全关闭。");
      setText("runMessage", error.message || "验真失败");
      setText("consoleStage", "BLOCKED");
      toast("验真未通过，发布资格已关闭");
    } finally {
      verifyButton.disabled = false;
      startButton.disabled = !state.evidence || state.evidence.effective_product_release_eligible !== true;
    }
  }

  async function startDemo() {
    startButton.disabled = true;
    verifyButton.disabled = true;
    try {
      const payload = await api("/api/run", { method: "POST", body: JSON.stringify({ mode: "replay" }) });
      renderRun(payload.run || {});
      toast("全新 no-clobber 离线演示已启动");
      schedulePoll(500);
    } catch (error) {
      setEligibility(false, "Fail-closed · 新运行未发布");
      failSignalStage("新运行未取得可验证证据，真实光变主舞台已安全关闭。");
      setText("runMessage", error.message || "无法启动离线演示");
      setText("consoleStage", "BLOCKED");
      startButton.disabled = !state.evidence;
      verifyButton.disabled = !state.evidence;
      toast("启动失败，没有半成品获得发布资格");
    }
  }

  function schedulePoll(delay = 1100) {
    window.clearTimeout(state.pollTimer);
    state.pollTimer = window.setTimeout(pollStatus, delay);
  }

  async function pollStatus() {
    try {
      const payload = await api("/api/status");
      const run = payload.run || {};
      renderRun(run);
      if (run.state === "running") {
        schedulePoll();
      } else if (run.state === "succeeded") {
        toast("新证据包已原子发布并通过验真");
        await loadEvidence();
      } else if (run.state === "failed") {
        setEligibility(false, "Fail-closed · 新运行未发布");
        failSignalStage("新运行安全停止，未发布可用于光变主舞台的半成品。");
        toast("运行安全停止，没有发布半成品");
      }
    } catch (error) {
      if (state.evidence) state.evidence.effective_product_release_eligible = false;
      setEligibility(false, "Fail-closed · 状态不可验证");
      failSignalStage("运行状态不可验证，真实光变主舞台已安全关闭。");
      setText("runMessage", error.message || "无法读取运行状态");
      setText("consoleStage", "BLOCKED");
      startButton.disabled = true;
      verifyButton.disabled = true;
    }
  }

  function setLabRunState(kind, label) {
    const node = $("labRunState");
    node.dataset.state = kind;
    const text = node.querySelector("b");
    if (text) text.textContent = label;
  }

  function setLabMessage(message) {
    setText("labRunMessage", message);
  }

  function showLabFormError(message) {
    const node = $("labFormError");
    node.textContent = message || "";
    node.hidden = !message;
  }

  function labModelEntries(payload) {
    const options = payload && (payload.options || payload.config || payload);
    const candidates = options && (options.models || options.allowed_models || options.model_allowlist);
    if (!Array.isArray(candidates)) return [];
    const friendlyNames = {
      "qwen-max": "Qwen Max · 科学推理",
      "qwen-plus": "Qwen Plus · 均衡",
      "qwen-turbo": "Qwen Turbo · 快速体验",
    };
    const seen = new Set();
    return candidates.reduce((entries, item) => {
      const value = typeof item === "string" ? item : item && (item.id || item.value || item.model);
      const label = typeof item === "string" ? friendlyNames[value] || item : item && (item.label || item.name || friendlyNames[value] || value);
      if (typeof value !== "string" || !value || value.length > 80 || seen.has(value)) return entries;
      seen.add(value);
      entries.push({ value, label: typeof label === "string" ? label : value });
      return entries;
    }, []);
  }

  async function loadLabOptions() {
    labRunButton.disabled = true;
    labResumeButton.disabled = true;
    try {
      const payload = await api("/api/lab/options");
      const models = labModelEntries(payload);
      if (!models.length) throw new Error("模型白名单为空");
      const options = payload.options || payload.config || payload;
      const limits = options.limits || {};
      const requestBytes = finite(limits.request_bytes);
      const materialChars = finite(limits.material_chars);
      const totalMaterialChars = finite(limits.total_material_chars);
      state.labLimits = {
        requestBytes: requestBytes !== null && requestBytes >= 1024 && requestBytes <= 1048576 ? requestBytes : 262144,
        materialChars: materialChars !== null && materialChars >= 1000 && materialChars <= 100000 ? materialChars : 40000,
        totalMaterialChars: totalMaterialChars !== null && totalMaterialChars >= 1000 && totalMaterialChars <= 300000 ? totalMaterialChars : 120000,
      };
      const select = $("labModel");
      select.replaceChildren();
      models.forEach((model) => {
        const option = document.createElement("option");
        option.value = model.value;
        option.textContent = model.label;
        select.append(option);
      });
      const defaultModel = typeof options.default_model === "string" && models.some((model) => model.value === options.default_model) ? options.default_model : models[0].value;
      select.value = defaultModel;
      select.disabled = false;
      $("labMaterial").maxLength = state.labLimits.materialChars;
      setText("materialLimit", state.labLimits.materialChars);
      setText("labFileLimit", state.labLimits.materialChars.toLocaleString("zh-CN"));
      state.labAllowedModels = models.map((model) => model.value);
      state.labServerCredentialAvailable = options.server_credential_available === true;
      const keyInput = $("labApiKey");
      keyInput.value = "";
      keyInput.required = !state.labServerCredentialAvailable;
      keyInput.disabled = state.labServerCredentialAvailable;
      keyInput.placeholder = state.labServerCredentialAvailable ? "服务器安全凭证已启用" : (isPublicStatic ? "本次任务临时 Key（仅浏览器内存）" : "请输入本次百炼 API Key");
      setText("labApiKeyRequirement", state.labServerCredentialAvailable ? "使用服务器安全凭证" : (isPublicStatic ? "本次任务必填 · 不存储" : "本次请求必填"));
      setText(
        "labCredentialMode",
        state.labServerCredentialAvailable
          ? "服务器已配置安全凭证；Key 输入已关闭，请求体将完全省略 api_key。"
          : (isPublicStatic ? "浏览器将直连百炼；Key 只在本次任务内存中短暂存在，提交后输入框立即清空，任务结束后释放。" : "服务器未配置凭证；请提供本次 Key，发送后页面立即清空。"),
      );
      state.labOptionsReady = true;
      labRunButton.disabled = false;
      setLabRunState("ready", "READY");
      setLabMessage(state.labServerCredentialAvailable ? "实验台已连接服务器安全凭证。请定义新的科研挑战与人工质疑。" : (isPublicStatic ? "公开 BYOK 已就绪。Key 将从浏览器直接发送至百炼，不经过 GitHub Pages 服务器。" : "实验台已连接本地安全代理。请提供本次百炼 Key，并定义新的科研挑战与人工质疑。"));
      const statusPayload = await api("/api/lab/status");
      const currentRun = statusPayload && statusPayload.run;
      if (!currentRun || typeof currentRun !== "object") throw new Error("实验台状态不可验证");
      renderLabRun(currentRun);
      if (currentRun.state === "running" || currentRun.state === "queued") {
        scheduleLabPoll(300);
      } else if (currentRun.state === "complete" || currentRun.state === "succeeded") {
        await loadLabResult();
      }
    } catch (_) {
      state.labOptionsReady = false;
      state.labAllowedModels = [];
      state.labServerCredentialAvailable = null;
      $("labModel").disabled = true;
      $("labApiKey").disabled = true;
      labResumeButton.disabled = true;
      setLabRunState("failed", "BLOCKED");
      setLabMessage(isPublicStatic ? "百炼浏览器直连预检失败；Key 未发送，历史证据回放仍可浏览。" : "评委实验台配置未通过本机预检，在线任务入口已安全关闭；原 TESS 离线演示不受影响。");
      showLabFormError(isPublicStatic ? "无法初始化临时 BYOK；请检查浏览器网络策略。" : "无法取得服务器模型白名单，已阻止发送任何凭证。");
    }
  }

  async function sha256Text(value) {
    if (!window.crypto || !window.crypto.subtle || typeof TextEncoder !== "function") return "SHA-256 由服务端计算";
    const bytes = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function clearLabFile() {
    state.labFile = null;
    $("labFile").value = "";
    $("labFileChip").hidden = true;
    setText("labFileName", "—");
    setText("labFileHash", "—");
  }

  async function loadLabFile(file) {
    clearLabFile();
    showLabFormError("");
    if (!file) return;
    const allowedExtensions = new Set(["txt", "md", "csv", "tsv", "json", "jsonl", "yaml", "yml", "xml", "tex", "bib"]);
    const extension = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
    if (!allowedExtensions.has(extension)) {
      showLabFormError("仅支持 TXT、MD、CSV、TSV、JSON、YAML、XML、TEX、BIB 文本文件。");
      return;
    }
    if (file.size > state.labLimits.requestBytes) {
      showLabFormError("文件超过服务器请求安全上限，请先截取与问题最相关的文本。");
      return;
    }
    try {
      const content = await file.text();
      if (!content.trim() || content.includes("\u0000")) throw new Error("文件不是可用的纯文本");
      if (content.length > state.labLimits.materialChars) throw new Error(`文本超过 ${state.labLimits.materialChars.toLocaleString("zh-CN")} 字符，请截取最相关部分`);
      const digest = await sha256Text(content);
      state.labFile = { name: file.name.slice(0, 160), text: content, sha256: digest };
      setText("labFileName", file.name);
      setText("labFileHash", shortHash(digest));
      $("labFileChip").hidden = false;
      toast("文本资料已在浏览器读取并计算哈希");
    } catch (error) {
      clearLabFile();
      showLabFormError(error instanceof Error ? error.message : "无法读取该文本文件");
    }
  }

  function normalizeAgentStatus(value) {
    const status = typeof value === "string" ? value.toLowerCase() : "";
    if (["pass", "passed", "complete", "completed", "succeeded", "success"].includes(status)) return "pass";
    if (["active", "running", "in_progress", "started"].includes(status)) return "active";
    if (["fail", "failed", "blocked", "error"].includes(status)) return "fail";
    return "pending";
  }

  function resetLabAgents() {
    document.querySelectorAll("[data-lab-agent]").forEach((node) => {
      node.dataset.state = "pending";
      const tag = node.querySelector(":scope > b");
      if (tag) tag.textContent = "WAIT";
    });
  }

  function renderLabAgents(runOrResult) {
    const trace = Array.isArray(runOrResult && runOrResult.agent_trace) ? runOrResult.agent_trace : [];
    const statuses = new Map();
    trace.forEach((entry) => {
      const role = entry && (entry.role || entry.agent);
      if (typeof role === "string") statuses.set(role, normalizeAgentStatus(entry.status || entry.state));
    });
    const stage = runOrResult && runOrResult.stage;
    const directRole = runOrResult && (runOrResult.current_agent || runOrResult.role);
    const activeRole = typeof directRole === "string" && LAB_AGENT_ORDER.includes(directRole) ? directRole : LAB_STAGE_AGENT[stage];
    const activeIndex = LAB_AGENT_ORDER.indexOf(activeRole);
    if (activeIndex >= 0) {
      LAB_AGENT_ORDER.forEach((role, index) => {
        if (!statuses.has(role) && index < activeIndex) statuses.set(role, "pass");
      });
      if (!statuses.has(activeRole)) statuses.set(activeRole, "active");
    }
    if (runOrResult && ["complete", "succeeded"].includes(runOrResult.state)) LAB_AGENT_ORDER.forEach((role) => statuses.set(role, "pass"));
    if (runOrResult && runOrResult.state === "failed" && !trace.length) {
      document.querySelectorAll("[data-lab-agent]").forEach((node) => {
        const current = node.dataset.state;
        statuses.set(node.dataset.labAgent, current === "active" ? "fail" : current);
      });
    }

    document.querySelectorAll("[data-lab-agent]").forEach((node) => {
      const status = statuses.get(node.dataset.labAgent) || "pending";
      node.dataset.state = status;
      const tag = node.querySelector(":scope > b");
      if (tag) tag.textContent = status === "pass" ? "PASS" : status === "active" ? "RUN" : status === "fail" ? "BLOCK" : "WAIT";
    });
  }

  function renderLabRecovery(run) {
    const recovery = $("labRecovery");
    const resumeId = run && typeof run.resume_run_id === "string" && run.resume_run_id.length <= 180
      ? run.resume_run_id
      : null;
    const available = run && run.resume_available === true && resumeId !== null && run.state === "failed";
    state.labResumeAvailable = available;
    state.labResumeRunId = available ? resumeId : null;
    const checkpointCount = finite(run && run.completed_checkpoint_count);
    const deadline = run && typeof run.original_deadline_at === "string" ? run.original_deadline_at : null;
    const deadlineNode = $("labOriginalDeadline");
    setText("labResumeRunId", resumeId || (run && run.run_id));
    setText("labCheckpointCount", checkpointCount);
    setText("labOriginalDeadline", deadline);
    if (deadline) deadlineNode.setAttribute("datetime", deadline);
    else deadlineNode.removeAttribute("datetime");

    let uiState = "idle";
    let label = "没有可恢复任务";
    let hint = "恢复只复用服务端验真的 checkpoint；不会恢复 Key，也不会自动填充人工质疑或资料。";
    if (available) {
      uiState = "available";
      label = "可安全恢复";
      hint = state.labServerCredentialAvailable
        ? "请逐字重填同一 model、问题、人工质疑与资料；服务端会先核对输入摘要，再使用服务器凭证恢复。"
        : "请重新输入新 Key，并逐字重填同一 model、问题、人工质疑与资料；任何摘要不一致都会在 Qwen 调用前阻断。";
    } else if (run && (run.state === "running" || run.state === "queued")) {
      uiState = "running";
      label = "当前任务运行中";
      hint = "运行中的任务不能并发恢复；如发生安全中断，请等待服务端重新声明 resume_available。";
    } else if (run && (run.state === "succeeded" || run.state === "complete")) {
      uiState = "complete";
      label = "任务已完成，无需恢复";
      hint = "最终包已原子发布；恢复入口保持关闭。";
    } else if (run && run.state === "failed") {
      uiState = "blocked";
      label = "没有可验证的恢复前缀";
      hint = "服务端未授权恢复，可能因为 checkpoint 不完整、输入绑定失败或原始绝对截止时间已过。";
    }
    recovery.dataset.state = uiState;
    setText("labRecoveryState", label);
    setText("labRecoveryHint", hint);
    labResumeButton.disabled = !available || !state.labOptionsReady;
  }

  function renderLabRun(run) {
    state.labRun = run;
    const runState = run && run.state;
    const running = runState === "running" || runState === "queued";
    labRunButton.disabled = running || !state.labOptionsReady;
    const completed = runState === "complete" || runState === "succeeded";
    setLabRunState(running ? "running" : completed ? "complete" : runState === "failed" ? "failed" : "ready", running ? "RUNNING" : completed ? "COMPLETE" : runState === "failed" ? "BLOCKED" : "READY");
    setLabMessage(run && run.message ? run.message : running ? "多智能体科研挑战执行中…" : "等待任务状态。");
    renderLabAgents(run || {});
    renderLabRecovery(run || {});
    if (run && run.run_id) setText("labRequestId", run.run_id);
  }

  function displayValue(value) {
    if (value === null || value === undefined || value === "") return "—";
    if (Array.isArray(value)) return value.map(displayValue).filter((item) => item !== "—").join("\n");
    if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${displayValue(item)}`).join("\n");
    return String(value);
  }

  function scoreEntry(scorecard, key, maximum) {
    const entry = scorecard && scorecard[key];
    if (!entry || typeof entry !== "object") return { value: `权重 ${maximum}`, evidence: "未返回赛题证据映射" };
    const judged = entry.judge_score === null || entry.judge_score === undefined ? null : finite(entry.judge_score);
    const weight = finite(entry.weight) ?? maximum;
    const evidence = Array.isArray(entry.evidence) ? entry.evidence.join("；") : displayValue(entry.evidence);
    return { value: judged === null ? `权重 ${weight}` : `${judged} / ${weight}`, evidence };
  }

  function renderLabStandardFields(fields) {
    const root = $("labStandardFields");
    root.replaceChildren();
    LAB_STANDARD_FIELDS.forEach((key) => {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const value = document.createElement("dd");
      term.textContent = key;
      value.textContent = displayValue(fields && fields[key]);
      row.append(term, value);
      root.append(row);
    });
  }

  function renderHumanRevision(result) {
    const receipt = firstRecord(result && result.receipt) || {};
    const human = firstRecord(result && result.human_in_the_loop, receipt.human_in_the_loop);
    const panel = $("labRevision");
    const changedRoot = $("labChangedFields");
    changedRoot.replaceChildren();
    if (!human) {
      panel.dataset.state = "missing";
      setText("labRevisionState", "API 缺少修订证据");
      ["labHumanChallengeResult", "labHumanChallengeHash", "labInitialHypothesisHash", "labFinalHypothesisHash", "labChallengeResponseHash", "labFinalBlockingCount"].forEach((id) => setText(id, null));
      const item = document.createElement("li");
      item.textContent = "未返回 changed_fields；不能证明初版发生实质修订。";
      changedRoot.append(item);
      return;
    }
    const changed = Array.isArray(human.changed_fields)
      ? human.changed_fields.filter((value) => typeof value === "string" && value)
      : [];
    const blockers = finite(human.final_critic_blocking_issue_count);
    const verified = human.revision_required === true
      && changed.length >= 2
      && blockers === 0
      && typeof human.initial_hypothesis_sha256 === "string"
      && typeof human.final_hypothesis_sha256 === "string";
    panel.dataset.state = verified ? "verified" : "blocked";
    setText("labRevisionState", verified ? "实质修订已验真" : "修订证据未通过");
    setText("labHumanChallengeResult", human.human_challenge);
    setText("labHumanChallengeHash", human.human_challenge_sha256);
    setText("labInitialHypothesisHash", human.initial_hypothesis_sha256);
    setText("labFinalHypothesisHash", human.final_hypothesis_sha256);
    setText("labChallengeResponseHash", human.human_challenge_response_sha256);
    setText("labFinalBlockingCount", blockers);
    if (changed.length) {
      changed.forEach((field) => {
        const item = document.createElement("li");
        item.textContent = field;
        changedRoot.append(item);
      });
    } else {
      const item = document.createElement("li");
      item.textContent = "API 未返回发生变化的决策字段。";
      changedRoot.append(item);
    }
  }

  function secretScanStatus(result) {
    const receipt = firstRecord(result && result.receipt) || {};
    const hard = firstRecord(receipt.hard_validation, result && result.hard_validation) || {};
    const checks = Array.isArray(hard.checks) ? hard.checks : [];
    const names = checks.reduce((values, check) => {
      if (typeof check === "string") values.add(check);
      else if (isRecord(check) && check.passed !== false) {
        const name = firstPresent(check.id, check.name, check.code, check.check);
        if (typeof name === "string") values.add(name);
      }
      return values;
    }, new Set());
    return names.has("input_secret_pattern_scan_passed")
      && names.has("credential_and_secret_pattern_publish_scan_passed")
      ? "PASS · 输入与发布包"
      : "UNVERIFIED";
  }

  function renderLabResult(result) {
    const eligible = result && result.product_release_eligible === true;
    const resultCard = $("labResult");
    resultCard.dataset.state = eligible ? "complete" : "failed";
    $("labEligibility").dataset.state = eligible ? "pass" : "fail";
    setText("labEligibility", eligible ? "硬校验通过" : "Fail-closed · 不发布");
    setText("labHypothesis", displayValue(result && result.hypothesis && (result.hypothesis.claim || result.hypothesis)));
    setText("labVerdict", result && (result.verdict || result.scientific_status));
    renderHumanRevision(result);

    const scorecard = result && result.competition_scorecard;
    const science = scoreEntry(scorecard, "science_value", 40);
    const technical = scoreEntry(scorecard, "technical_depth", 30);
    const application = scoreEntry(scorecard, "application_potential", 30);
    setText("labScientificValue", science.value);
    setText("labScientificEvidence", science.evidence);
    setText("labTechnicalDepth", technical.value);
    setText("labTechnicalEvidence", technical.evidence);
    setText("labApplicationPotential", application.value);
    setText("labApplicationEvidence", application.evidence);

    const fields = result && result.competition_fields;
    const experiments = fields && fields.Experiments;
    setText("labValidationPlan", displayValue((experiments && experiments.Design) || (result && result.validation_plan) || (fields && fields.Methods)));
    setText("labLimitations", displayValue(result && result.limitations));
    renderLabStandardFields(fields || {});

    const hashes = result && result.hashes || {};
    const usage = result && result.usage || {};
    const requestIds = result && result.request_ids;
    const requestLabel = Array.isArray(requestIds) && requestIds.length ? `${requestIds[0]}${requestIds.length > 1 ? ` +${requestIds.length - 1}` : ""}` : result && result.run_id;
    const receipt = firstRecord(result && result.receipt) || {};
    const provider = firstRecord(receipt.provider) || {};
    const modelLabel = state.labModelSubmitted || provider.requested_model || "Qwen";
    const credentialSource = firstPresent(result && result.credential_source, receipt.credential_source);
    const totalTokens = finite(usage.total_tokens);
    setText("labRequestId", requestLabel);
    setText("labInputHash", hashes.input_sha256);
    setText("labOutputHash", hashes.report_sha256 || hashes.output_sha256);
    setText("labUsage", `${modelLabel}${credentialSource ? ` · ${credentialSource}` : ""} · ${totalTokens === null ? "usage unavailable" : `${totalTokens} tokens / ${finite(usage.call_count) ?? "—"} calls`}`);
    setText("labReceiptHash", hashes.receipt_sha256);
    setText("labRunMetadataHash", hashes.run_metadata_sha256);
    setText("labSecretScannerHash", hashes.secret_scanner_sha256);
    setText("labSecretScanState", secretScanStatus(result));
    renderLabAgents({ ...(result || {}), state: eligible ? "succeeded" : "failed", stage: eligible ? "COMPLETE" : "FAILED" });
    renderLabRecovery({ ...(state.labRun || {}), state: eligible ? "succeeded" : "failed", resume_available: false, resume_run_id: null });
    setLabRunState(eligible ? "complete" : "failed", eligible ? "VERIFIED" : "BLOCKED");
    setLabMessage(eligible ? "科研方案、十项赛题字段与机器 receipt 已生成，所有哈希可回查。" : "任务完成但未通过发布硬校验，结果已按 fail-closed 标记为不可发布。");
    labRunButton.disabled = !state.labOptionsReady;
    toast(eligible ? "评委挑战完成：可验证科研方案已生成" : "结果未通过硬校验，发布资格已关闭");
  }

  function failLabRun(message) {
    window.clearTimeout(state.labPollTimer);
    labRunButton.disabled = !state.labOptionsReady;
    setLabRunState("failed", "BLOCKED");
    setLabMessage(message || "任务安全停止，没有生成可发布的半成品。");
    $("labResult").dataset.state = "failed";
    $("labEligibility").dataset.state = "fail";
    setText("labEligibility", "Fail-closed · 不发布");
    document.querySelectorAll('[data-lab-agent][data-state="active"]').forEach((node) => {
      node.dataset.state = "fail";
      const tag = node.querySelector(":scope > b");
      if (tag) tag.textContent = "BLOCK";
    });
    if (!state.labRun || state.labRun.state !== "failed") renderLabRecovery({ state: "failed", resume_available: false });
    toast("在线科研任务已安全停止，凭证与不可发布半成品均未保存");
  }

  function scheduleLabPoll(delay = 1000) {
    window.clearTimeout(state.labPollTimer);
    state.labPollTimer = window.setTimeout(pollLabStatus, delay);
  }

  async function loadLabResult() {
    try {
      const payload = await api("/api/lab/result");
      const result = payload && (payload.result || payload.lab_result);
      if (!result || typeof result !== "object") throw new Error("结果响应缺少机器 receipt");
      renderLabResult(result);
    } catch (error) {
      failLabRun(error instanceof Error ? error.message : "科研结果不可验证");
    }
  }

  async function pollLabStatus() {
    try {
      const payload = await api("/api/lab/status");
      const run = payload && (payload.run || payload.status);
      if (!run || typeof run !== "object") throw new Error("任务状态不可验证");
      renderLabRun(run);
      if (run.state === "running" || run.state === "queued") scheduleLabPoll();
      else if (run.state === "complete" || run.state === "succeeded") await loadLabResult();
      else if (run.state === "failed") failLabRun(run.message || (run.error && run.error.message));
      else failLabRun("服务器返回了未知任务状态，已停止发布。");
    } catch (error) {
      failLabRun(error instanceof Error ? error.message : "无法读取任务状态");
    }
  }

  function validateLabRequest() {
    const keyInput = $("labApiKey");
    const modelInput = $("labModel");
    const domainInput = $("labDomain");
    const problemInput = $("labQuestion");
    const challengeInput = $("labHumanChallenge");
    const materialInput = $("labMaterial");
    [keyInput, modelInput, domainInput, problemInput, challengeInput, materialInput].forEach((node) => node.removeAttribute("aria-invalid"));
    if (!state.labOptionsReady) return { error: "服务器模型白名单尚未就绪，未发送凭证。" };
    const apiKey = keyInput.value.trim();
    const model = modelInput.value;
    const domain = domainInput.value.trim();
    const problem = problemInput.value.trim();
    const humanChallenge = challengeInput.value.trim();
    const pasted = materialInput.value.trim();
    if (state.labServerCredentialAvailable === true && apiKey) { keyInput.setAttribute("aria-invalid", "true"); return { error: "服务器凭证已启用，请勿同时提供请求级 Key。" }; }
    if (state.labServerCredentialAvailable !== true && (apiKey.length < 8 || apiKey.length > 512)) { keyInput.setAttribute("aria-invalid", "true"); return { error: "请输入有效的百炼 API Key（8–512 字符）。" }; }
    if (!state.labAllowedModels.includes(model)) { modelInput.setAttribute("aria-invalid", "true"); return { error: "所选模型不在服务器白名单中。" }; }
    if (domain.length < 2 || domain.length > 120) { domainInput.setAttribute("aria-invalid", "true"); return { error: "研究领域需为 2–120 字符。" }; }
    if (problem.length < 10 || problem.length > 2000) { problemInput.setAttribute("aria-invalid", "true"); return { error: "研究问题需为 10–2,000 字符。" }; }
    if (humanChallenge.length < 20 || humanChallenge.length > 2000) { challengeInput.setAttribute("aria-invalid", "true"); return { error: "人工质疑需为 20–2,000 字符，并应指出可改变初稿的具体问题。" }; }
    const materials = [];
    if (pasted) materials.push({ name: "judge-pasted-material.txt", text: pasted });
    if (state.labFile) materials.push({ name: state.labFile.name, text: state.labFile.text });
    if (!materials.length) { materialInput.setAttribute("aria-invalid", "true"); return { error: "请粘贴资料或导入一个本地文本文件。" }; }
    if (materials.some((item) => item.text.trim().length < 20)) { materialInput.setAttribute("aria-invalid", "true"); return { error: "每份资料正文至少需要 20 个字符。" }; }
    if (materials.reduce((total, item) => total + item.text.length, 0) > state.labLimits.totalMaterialChars) return { error: `资料总长度超过 ${state.labLimits.totalMaterialChars.toLocaleString("zh-CN")} 字符，请缩减后重试。` };
    return { apiKey, model, domain, problem, humanChallenge, materials };
  }

  async function dispatchJudgeLab(endpoint, resumeRunId = null) {
    showLabFormError("");
    const validated = validateLabRequest();
    if (validated.error) {
      showLabFormError(validated.error);
      toast("请先完成实验台输入预检");
      return;
    }

    if (resumeRunId !== null && (!state.labResumeAvailable || resumeRunId !== state.labResumeRunId)) {
      showLabFormError("服务端尚未授权恢复这个任务，请重新读取状态。");
      return;
    }

    let apiKey = validated.apiKey;
    const request = {
      model: validated.model,
      domain: validated.domain,
      problem: validated.problem,
      human_challenge: validated.humanChallenge,
      materials: validated.materials,
    };
    if (state.labServerCredentialAvailable !== true) request.api_key = apiKey;
    if (resumeRunId !== null) request.run_id = resumeRunId;
    let requestBody = JSON.stringify(request);
    if (Object.prototype.hasOwnProperty.call(request, "api_key")) request.api_key = "";
    validated.apiKey = "";
    apiKey = "";
    $("labApiKey").value = "";
    const encodedBytes = typeof TextEncoder === "function" ? new TextEncoder().encode(requestBody).byteLength : requestBody.length * 4;
    if (encodedBytes > state.labLimits.requestBytes) {
      requestBody = "";
      showLabFormError("请求总大小超过服务器安全上限，请缩减资料后重试；Key 已从页面清空。");
      setLabRunState("failed", "BLOCKED");
      setLabMessage("输入未通过请求大小预检，没有向百炼发送任何内容。");
      return;
    }
    state.labModelSubmitted = validated.model;
    resetLabAgents();
    renderHumanRevision({});
    $("labResult").dataset.state = "empty";
    $("labEligibility").dataset.state = "pending";
    setText("labEligibility", "运行中 · 尚未发布");
    setLabRunState("running", resumeRunId === null ? "LAUNCHING" : "RESUMING");
    setLabMessage(resumeRunId === null
      ? (state.labServerCredentialAvailable ? "输入预检通过，请求体未携带 Key，正在使用服务器安全凭证启动任务…" : (isPublicStatic ? "输入预检通过，Key 已从输入框清空；浏览器将只在本次任务内存中持有它并直连百炼。" : "输入预检通过，Key 已从页面清空，正在交给本地安全代理发起百炼任务…"))
      : "恢复输入已在浏览器完成预检；服务端将在任何 Qwen 调用前逐字核对原输入摘要与绝对截止时间。",
    );
    labRunButton.disabled = true;
    labResumeButton.disabled = true;

    try {
      const sendPromise = api(endpoint, { method: "POST", body: requestBody });
      requestBody = "";
      const payload = await sendPromise;
      const run = payload && payload.run;
      if (!run || typeof run !== "object" || !["running", "queued"].includes(run.state)) throw new Error("任务未进入可验证运行态");
      renderLabRun(run);
      toast(resumeRunId === null ? "多智能体科研挑战已启动，凭证输入已清空" : "服务端已接受安全恢复请求");
      scheduleLabPoll(500);
    } catch (error) {
      requestBody = "";
      failLabRun(error instanceof Error ? error.message : "无法启动科研挑战");
    }
  }

  async function startJudgeLab(event) {
    event.preventDefault();
    await dispatchJudgeLab("/api/lab/run");
  }

  async function resumeJudgeLab() {
    const resumeRunId = state.labResumeRunId;
    if (!resumeRunId || !state.labResumeAvailable) {
      showLabFormError("当前没有服务端授权的可恢复任务。");
      return;
    }
    await dispatchJudgeLab("/api/lab/resume", resumeRunId);
  }

  function openDialog(opener) {
    state.dialogOpener = opener;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog() {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  async function copyManifest() {
    const value = $("manifestFull").textContent;
    if (!value || value === "—") return;
    try {
      await navigator.clipboard.writeText(value);
      toast("Manifest SHA-256 已复制");
    } catch (_) {
      toast("浏览器未允许复制，请手动选择哈希");
    }
  }

  startButton.addEventListener("click", startDemo);
  verifyButton.addEventListener("click", verifyEvidence);
  document.querySelectorAll("[data-science-mode]").forEach((button) => {
    button.addEventListener("click", () => selectScienceMode(button.dataset.scienceMode));
  });
  document.querySelectorAll("[data-science-experiment]").forEach((button) => {
    button.addEventListener("click", () => selectScienceExperiment(button.dataset.scienceExperiment));
  });
  $("scienceExplorer").addEventListener("submit", (event) => event.preventDefault());
  $("runScience").addEventListener("click", runScience);
  $("downloadScienceJson").addEventListener("click", () => downloadScience("json"));
  $("downloadScienceMarkdown").addEventListener("click", () => downloadScience("markdown"));
  $("sendScienceToJudgeLab").addEventListener("click", sendScienceToJudgeLab);
  signalTourButton.addEventListener("click", toggleSignalTour);
  window.addEventListener("astrotwin:stellar-select-request", (event) => {
    const role = event && event.detail && event.detail.role;
    if (!SIGNAL_ROLES.includes(role) || !state.signalData) return;
    chooseSignalSample(role, { announce: true });
  });
  const signalTabs = Array.from(document.querySelectorAll("[data-signal-mode]"));
  signalTabs.forEach((button) => {
    button.addEventListener("click", () => chooseSignalMode(button.dataset.signalMode, { announce: true }));
    button.addEventListener("keydown", (event) => {
      const current = SIGNAL_MODES.indexOf(button.dataset.signalMode);
      let next = current;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % SIGNAL_MODES.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + SIGNAL_MODES.length) % SIGNAL_MODES.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = SIGNAL_MODES.length - 1;
      else return;
      event.preventDefault();
      chooseSignalMode(SIGNAL_MODES[next], { announce: true, focus: true });
    });
  });
  const signalSamples = Array.from(document.querySelectorAll("[data-signal-sample]"));
  signalSamples.forEach((button) => {
    button.addEventListener("click", () => chooseSignalSample(button.dataset.signalSample, { announce: true }));
    button.addEventListener("keydown", (event) => {
      const current = SIGNAL_ROLES.indexOf(button.dataset.signalSample);
      let next = current;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % SIGNAL_ROLES.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + SIGNAL_ROLES.length) % SIGNAL_ROLES.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = SIGNAL_ROLES.length - 1;
      else return;
      event.preventDefault();
      chooseSignalSample(SIGNAL_ROLES[next], { announce: true });
      signalSamples[next].focus();
    });
  });
  const scientificChainButtons = Array.from(document.querySelectorAll("[data-science-chain] .chain-trigger"));
  scientificChainButtons.forEach((button) => {
    const node = button.closest("[data-science-chain]");
    button.addEventListener("click", () => selectScientificChainStep(node.dataset.scienceChain, { announce: true }));
    button.addEventListener("keydown", (event) => {
      const current = SCIENTIFIC_CHAIN_ORDER.indexOf(node.dataset.scienceChain);
      let next = current;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % SCIENTIFIC_CHAIN_ORDER.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + SCIENTIFIC_CHAIN_ORDER.length) % SCIENTIFIC_CHAIN_ORDER.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = SCIENTIFIC_CHAIN_ORDER.length - 1;
      else return;
      event.preventDefault();
      selectScientificChainStep(SCIENTIFIC_CHAIN_ORDER[next], { announce: true, focus: true });
    });
  });
  const errorAtlasModalityButtons = Array.from(document.querySelectorAll("[data-error-atlas-modality]"));
  errorAtlasModalityButtons.forEach((button) => {
    button.addEventListener("click", () => selectErrorAtlasModality(button.dataset.errorAtlasModality));
    button.addEventListener("keydown", (event) => {
      const current = ERROR_ATLAS_MODALITIES.indexOf(button.dataset.errorAtlasModality);
      let next = current;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % ERROR_ATLAS_MODALITIES.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + ERROR_ATLAS_MODALITIES.length) % ERROR_ATLAS_MODALITIES.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = ERROR_ATLAS_MODALITIES.length - 1;
      else return;
      event.preventDefault();
      selectErrorAtlasModality(ERROR_ATLAS_MODALITIES[next], { focus: true });
    });
  });
  $("errorAtlasFilters").addEventListener("submit", (event) => event.preventDefault());
  $("errorAtlasTruthFilter").addEventListener("change", applyErrorAtlasFilters);
  $("errorAtlasTaxonomyFilter").addEventListener("change", applyErrorAtlasFilters);
  $("errorAtlasPixelFilter").addEventListener("change", applyErrorAtlasFilters);
  $("errorAtlasSearch").addEventListener("input", applyErrorAtlasFilters);
  $("errorAtlasRecords").addEventListener("click", (event) => {
    const button = event.target.closest("[data-error-atlas-record]");
    if (!button) return;
    selectErrorAtlasRecord(Number(button.dataset.errorAtlasRecord), { announce: true });
  });
  $("errorAtlasRecords").addEventListener("keydown", (event) => {
    const button = event.target.closest("[data-error-atlas-record]");
    if (!button) return;
    const current = state.errorAtlasFilteredRecords.findIndex((record) => record.index === Number(button.dataset.errorAtlasRecord));
    let next = current;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = Math.min(state.errorAtlasFilteredRecords.length - 1, current + 1);
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = Math.max(0, current - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = state.errorAtlasFilteredRecords.length - 1;
    else return;
    event.preventDefault();
    const record = state.errorAtlasFilteredRecords[next];
    if (record) selectErrorAtlasRecord(record.index, { announce: true, focus: true });
  });
  $("errorAtlasExperiments").addEventListener("click", (event) => {
    const button = event.target.closest("[data-error-atlas-experiment]");
    if (!button) return;
    state.errorAtlasSelectedExperimentIndex = Number(button.dataset.errorAtlasExperiment);
    $("errorAtlasExperiments").querySelectorAll("[data-error-atlas-experiment]").forEach((entry) => {
      entry.setAttribute("aria-pressed", String(entry === button));
    });
    setText("errorAtlasAnnouncer", `已选择后续实验 ${atlasValue(state.errorAtlasSelectedExperiments[state.errorAtlasSelectedExperimentIndex] && state.errorAtlasSelectedExperiments[state.errorAtlasSelectedExperimentIndex].title)}。`, "");
  });
  $("errorAtlasExperiments").addEventListener("keydown", (event) => {
    const buttons = Array.from($("errorAtlasExperiments").querySelectorAll("[data-error-atlas-experiment]"));
    const current = buttons.indexOf(event.target.closest("[data-error-atlas-experiment]"));
    if (current < 0) return;
    let next = current;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (current + 1) % buttons.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = (current - 1 + buttons.length) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else return;
    event.preventDefault();
    buttons[next].focus();
    buttons[next].click();
  });
  $("sendErrorAtlasToJudgeLab").addEventListener("click", prefillJudgeLabFromErrorAtlas);
  $("openEvidence").addEventListener("click", (event) => openDialog(event.currentTarget));
  $("openEvidenceBottom").addEventListener("click", closeDialog);
  $("closeEvidence").addEventListener("click", closeDialog);
  $("copyManifest").addEventListener("click", copyManifest);
  labForm.addEventListener("submit", startJudgeLab);
  labResumeButton.addEventListener("click", resumeJudgeLab);
  $("labQuestion").addEventListener("input", (event) => setText("questionCount", event.currentTarget.value.length, "0"));
  $("labHumanChallenge").addEventListener("input", (event) => setText("humanChallengeCount", event.currentTarget.value.length, "0"));
  $("labMaterial").addEventListener("input", (event) => setText("materialCount", event.currentTarget.value.length, "0"));
  $("labFile").addEventListener("change", (event) => loadLabFile(event.currentTarget.files && event.currentTarget.files[0]));
  $("clearLabFile").addEventListener("click", clearLabFile);
  const labFileDrop = $("labFileDrop");
  ["dragenter", "dragover"].forEach((name) => labFileDrop.addEventListener(name, (event) => {
    event.preventDefault();
    labFileDrop.dataset.drag = "true";
  }));
  ["dragleave", "drop"].forEach((name) => labFileDrop.addEventListener(name, (event) => {
    event.preventDefault();
    labFileDrop.dataset.drag = "false";
  }));
  labFileDrop.addEventListener("drop", (event) => loadLabFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]));
  dialog.addEventListener("close", () => {
    if (state.dialogOpener && typeof state.dialogOpener.focus === "function") state.dialogOpener.focus();
  });
  dialog.addEventListener("click", (event) => {
    const box = dialog.getBoundingClientRect();
    const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    if (outside) closeDialog();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.signalTourRunning) pauseSignalTour("页面进入后台，30 秒答辩动画已自动暂停。");
    if (!document.hidden && state.signalData) renderSignalCanvas(1);
    if (!document.hidden && state.run && state.run.state === "running") schedulePoll(100);
    if (!document.hidden && state.labRun && (state.labRun.state === "running" || state.labRun.state === "queued")) scheduleLabPoll(100);
  });
  if (typeof signalMotionQuery.addEventListener === "function") {
    signalMotionQuery.addEventListener("change", () => {
      cancelSignalReveal();
      if (state.signalData) renderSignalCanvas(1);
    });
  }
  window.addEventListener("resize", () => {
    if (state.signalResizeObserver || !state.signalData) return;
    window.clearTimeout(state.signalResizeTimer);
    state.signalResizeTimer = window.setTimeout(() => {
      cancelSignalReveal();
      if (state.signalData) renderSignalCanvas(1);
    }, 100);
  });
  window.addEventListener("pageshow", () => { $("labApiKey").value = ""; });

  const AUDIT_TABS = [["auditTabAtlas", "auditPanelAtlas"], ["auditTabPixel", "auditPanelPixel"], ["auditTabQwen", "auditPanelQwen"]];
  function selectAuditTab(tabId, focus = false) {
    AUDIT_TABS.forEach(([tab, panel]) => {
      const selected = tab === tabId;
      $(tab).setAttribute("aria-selected", String(selected));
      $(tab).tabIndex = selected ? 0 : -1;
      $(panel).hidden = !selected;
      if (selected && focus) $(tab).focus();
    });
  }
  AUDIT_TABS.forEach(([tab], index) => {
    $(tab).addEventListener("click", () => selectAuditTab(tab));
    $(tab).addEventListener("keydown", (event) => {
      const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        selectAuditTab(AUDIT_TABS[event.key === "Home" ? 0 : AUDIT_TABS.length - 1][0], true);
      } else if (offset) {
        event.preventDefault();
        selectAuditTab(AUDIT_TABS[(index + offset + AUDIT_TABS.length) % AUDIT_TABS.length][0], true);
      }
    });
  });

  const siteHeader = document.querySelector(".site-header");
  const updateHeader = () => { if (siteHeader) siteHeader.dataset.scrolled = String(window.scrollY > 24); };
  window.addEventListener("scroll", updateHeader, { passive: true });
  updateHeader();
  const navLinks = Array.from(document.querySelectorAll("[data-nav]"));
  if (navLinks.length && typeof IntersectionObserver === "function") {
    const navObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((link) => {
          if (link.dataset.nav === entry.target.id) link.setAttribute("aria-current", "true");
          else link.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    navLinks.forEach((link) => { const target = $(link.dataset.nav); if (target) navObserver.observe(target); });
  }

  loadEvidence();
  loadScienceOptions();
  loadLabOptions();
}());
