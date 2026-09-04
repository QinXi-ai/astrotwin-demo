(function () {
  "use strict";

  const HASH_PATTERN = /^[0-9a-f]{64}$/;
  const ROLE_ORDER = ["canonical_correct", "periodic_binary", "hard_error"];
  const CLASS_NAMES = ["PC", "EB", "V", "IS"];
  const STEP_ORDER = ["observe", "witness", "pixel", "verdict", "population", "planner"];
  const BOSS_LAYOUT = [
    { key: "a", suffix: "A", bossId: "VISION_DISSENT", stellarRole: "canonical_correct" },
    { key: "b", suffix: "B", bossId: "PIXEL_REVERSAL", stellarRole: "periodic_binary" },
  ];
  const AUTO_CUES = [
    { delay: 0, step: "observe" },
    { delay: 4200, step: "witness" },
    { delay: 9800, step: "pixel" },
    { delay: 16400, step: "verdict" },
  ];
  const STEP_COPY = {
    ready: ["00 / EVIDENCE LOCK", "两颗真实目标已锁定"],
    observe: ["01 / BLIND OBSERVATION", "评委押注已封盘，先只看光变"],
    witness: ["02 / MODEL TESTIMONY", "三位证人亮票，但证词互相冲突"],
    pixel: ["03 / PHOTON EXTRACTION", "释放 1060×20×20 真实 TESSCut 光子"],
    verdict: ["04 / REVEALED VERDICT", "相反真值落锤，开放反事实模态手术"],
    population: ["05 / POPULATION TEST", "回到 40 条共同样本现场重算"],
    planner: ["06 / ACTIVE OBSERVATION", "把有限 Qwen 预算投向最值得看的星"],
    failed: ["EVIDENCE REJECTED", "证据链未通过，光子法庭拒绝启动"],
  };
  const AGENTS_BY_STEP = {
    observe: ["vision"],
    witness: ["hypothesis", "critic"],
    pixel: ["experiment", "pixel"],
    verdict: ["judge"],
    population: ["judge", "document"],
    planner: ["document"],
  };

  const evidenceState = document.getElementById("stellarPageEvidence");
  const court = document.getElementById("photonCourt");
  const launchButton = document.getElementById("courtLaunch");
  const announcer = document.getElementById("courtAnnouncer");
  const verifiedSamples = new Map();
  const state = {
    evidence: null,
    arena: null,
    arenaSha256: null,
    bosses: new Map(),
    ready: false,
    vote: null,
    step: "ready",
    cueTimers: [],
    population: null,
    plan: null,
    planEvaluation: null,
    resizeTimer: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = String(value);
  }

  function setEvidenceState(kind, message) {
    if (!evidenceState) return;
    evidenceState.dataset.state = kind;
    const label = evidenceState.querySelector("span");
    if (label) label.textContent = message;
  }

  function dispatchStellar(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function failClosed(message) {
    const reason = typeof message === "string" && message ? message : "光子法庭证据不可用";
    state.ready = false;
    state.step = "failed";
    clearCueTimers();
    setEvidenceState("failed", "证据未通过");
    if (court) {
      court.dataset.state = "failed";
      court.dataset.courtStep = "failed";
    }
    if (launchButton) launchButton.disabled = true;
    setText("courtStepIndex", STEP_COPY.failed[0]);
    setText("courtStepLabel", STEP_COPY.failed[1]);
    if (announcer) announcer.textContent = reason;
    dispatchStellar("astrotwin:stellar-failed", { message: reason });
  }

  function requireObject(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${label} 不是对象`);
    }
    return value;
  }

  function requireArray(value, length, label) {
    if (!Array.isArray(value) || (length !== null && value.length !== length)) {
      throw new Error(`${label} 数组长度不符合证据合同`);
    }
    return value;
  }

  function requireHash(value, label) {
    if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
      throw new Error(`${label} 缺少有效 SHA-256`);
    }
    return value;
  }

  function closeEnough(left, right, tolerance) {
    return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
  }

  function probabilityMapToArray(probabilities) {
    const mapping = requireObject(probabilities, "Error Atlas 概率");
    return CLASS_NAMES.map((name) => Number(mapping[name]));
  }

  function validateDistribution(values, label) {
    requireArray(values, CLASS_NAMES.length, label);
    const total = values.reduce((sum, value) => sum + Number(value), 0);
    if (values.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1)) {
      throw new Error(`${label} 含非法概率`);
    }
    if (!closeEnough(total, 1, 1e-6)) throw new Error(`${label} 概率和不为 1`);
  }

  async function sha256Text(text) {
    if (!window.crypto || !window.crypto.subtle || typeof TextEncoder !== "function") {
      throw new Error("浏览器缺少 SHA-256 验证能力");
    }
    const bytes = new TextEncoder().encode(text);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  }

  function validateStellarEvidence(evidence) {
    const stage = evidence && evidence.light_curve_stage;
    const stageHash = evidence && evidence.hashes && evidence.hashes.light_curve_stage_sha256;
    if (!evidence || evidence.effective_product_release_eligible !== true || evidence.verification_status !== "PASS") {
      throw new Error("当前证据包未取得发布资格");
    }
    requireObject(stage, "恒星孪生舞台");
    requireHash(stageHash, "恒星孪生舞台");
    requireArray(stage.samples, ROLE_ORDER.length, "恒星孪生样本");
    verifiedSamples.clear();
    stage.samples.forEach((sample, index) => {
      if (!sample || sample.role !== ROLE_ORDER[index]) {
        throw new Error("恒星剧场样本顺序与固定证据不一致");
      }
      verifiedSamples.set(sample.role, sample);
    });
    return { stage, stageHash };
  }

  function validateArenaShape(arena) {
    if (arena.artifact_type !== "P07_PHOTON_ARENA_BOSS_COLLECTION" || arena.schema_version !== "1.0") {
      throw new Error("Photon Arena 资产版本不受支持");
    }
    if (arena.arena_id !== "PHOTON-ARENA-V1") throw new Error("Photon Arena ID 不匹配");
    if (!arena.scientific_boundary || arena.scientific_boundary.status !== "DEVELOPMENT_REPLAY") {
      throw new Error("Photon Arena 未声明开发期重演边界");
    }
    const samples = requireArray(arena.samples, 2, "Photon Arena Boss");
    const ids = new Set(samples.map((sample) => sample && sample.boss_id));
    BOSS_LAYOUT.forEach((layout) => {
      if (!ids.has(layout.bossId)) throw new Error(`Photon Arena 缺少 ${layout.bossId}`);
    });
    samples.forEach((sample) => {
      requireObject(sample.sample, "Boss 样本");
      requireHash(sample.source_bindings.qlp_fits.sha256, "QLP FITS");
      requireHash(sample.source_bindings.tesscut_zip.sha256, "TESSCut ZIP");
      requireHash(sample.pixel_diagnostics.difference_image_sha256, "Difference image");
      requireArray(sample.phase_curve.points, 360, "相位曲线");
      if (sample.phase_curve.points.some((point) => !Number.isFinite(point.phase) || !Number.isFinite(point.flux) || typeof point.event !== "boolean")) {
        throw new Error("相位曲线点结构不合法");
      }
      if (String(sample.pixel_images.shape) !== "20,20" || sample.pixel_images.order !== "ROW_MAJOR") {
        throw new Error("Pixel 图像不是固定 20×20 行主序张量");
      }
      ["reference", "event", "difference"].forEach((name) => {
        const image = requireArray(sample.pixel_images[name], 400, `${name} Pixel 图`);
        if (image.some((value) => !Number.isFinite(Number(value)))) throw new Error(`${name} Pixel 图含非法值`);
      });
      const predictions = requireObject(sample.predictions, "Boss 预测");
      validateDistribution(predictions.baseline.class_probabilities, "Baseline 概率");
      validateDistribution(predictions.pixel.class_probabilities, "Pixel 概率");
      if (predictions.qwen.class_probabilities !== null || predictions.qwen.score_type !== "PROVIDER_REPORTED_PREDICTED_CLASS_CONFIDENCE_ONLY") {
        throw new Error("Qwen 证据合同被污染：历史接口没有四类概率分布");
      }
      if (predictions.comparison.qwen_full_distribution_available !== false || predictions.comparison.entropy_bits.qwen !== null) {
        throw new Error("Qwen 分布缺失边界未被保留");
      }
    });
    if (!arena.arena_summary || arena.arena_summary.joined_sample_count !== 40) {
      throw new Error("Photon Arena 40 样本总体绑定缺失");
    }
  }

  function crossCheckBoss(sample, record) {
    const predictions = sample.predictions;
    const expected = sample.sample;
    if (record.sample_id !== expected.sample_id || record.tic_id !== expected.tic_id || record.sector !== expected.sector || record.true_class !== expected.truth.class_name) {
      throw new Error(`TIC ${expected.tic_id} 与 Error Atlas 身份或真值不一致`);
    }
    if (!record.pixel || !record.pixel.baseline || !record.pixel.enhanced || !record.qwen) {
      throw new Error(`TIC ${expected.tic_id} 缺少三路证据`);
    }
    const routeChecks = [
      [predictions.baseline, record.pixel.baseline, "Baseline"],
      [predictions.pixel, record.pixel.enhanced, "Pixel"],
    ];
    routeChecks.forEach(([assetRoute, atlasRoute, label]) => {
      if (assetRoute.predicted_class !== atlasRoute.predicted_class || assetRoute.correct !== atlasRoute.correct) {
        throw new Error(`TIC ${expected.tic_id} 的 ${label} 裁决与 Error Atlas 不一致`);
      }
      const atlasDistribution = probabilityMapToArray(atlasRoute.probabilities);
      assetRoute.class_probabilities.forEach((value, index) => {
        if (!closeEnough(Number(value), atlasDistribution[index], 1e-12)) {
          throw new Error(`TIC ${expected.tic_id} 的 ${label} 概率与 Error Atlas 不一致`);
        }
      });
    });
    if (predictions.qwen.predicted_class !== record.qwen.predicted_class || predictions.qwen.correct !== record.qwen.correct || predictions.qwen.request_id !== record.qwen.request_id || !closeEnough(Number(predictions.qwen.predicted_class_probability), Number(record.qwen.confidence), 1e-12)) {
      throw new Error(`TIC ${expected.tic_id} 的 Qwen 历史凭证与 Error Atlas 不一致`);
    }
  }

  function bindAndValidateArena(arena, evidence, digest) {
    validateArenaShape(arena);
    const frontendAssets = requireArray(evidence.frontend_assets, null, "前端资产绑定");
    const assetBinding = frontendAssets.find((entry) => entry.path === "assets/photon-arena-v1.json");
    if (!assetBinding || assetBinding.sha256 !== digest || assetBinding.size_bytes <= 0) {
      throw new Error("Photon Arena 与当前证据包的静态 receipt 不一致");
    }
    const atlas = requireObject(evidence.error_atlas, "Error Atlas");
    const records = requireArray(atlas.records, 120, "Error Atlas 记录");
    state.bosses.clear();
    BOSS_LAYOUT.forEach((layout) => {
      const sample = arena.samples.find((candidate) => candidate.boss_id === layout.bossId);
      const record = records.find((candidate) => candidate.sample_id === sample.sample.sample_id);
      if (!record) throw new Error(`Error Atlas 缺少 Boss ${layout.bossId}`);
      crossCheckBoss(sample, record);
      state.bosses.set(layout.key, sample);
    });
  }

  function onSelectionRequest(event) {
    const role = event && event.detail && event.detail.role;
    if (!ROLE_ORDER.includes(role)) return;
    const sample = verifiedSamples.get(role);
    if (!sample) {
      failClosed("请求的恒星样本不在已验真证据中");
      return;
    }
    window.dispatchEvent(new CustomEvent("astrotwin:stellar-sample", {
      detail: { role, sample },
    }));
  }

  function selectStellarRole(role) {
    window.dispatchEvent(new CustomEvent("astrotwin:stellar-select-request", { detail: { role } }));
  }

  function courtCanvasSize(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(320, Math.round((rect.width || canvas.width || 640) * ratio));
    const height = Math.max(180, Math.round((rect.height || canvas.height || 230) * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return { width, height, ratio };
  }

  function drawCurve(layout, sample) {
    const canvas = $(`courtCurve${layout.suffix}`);
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器不能绘制真实 QLP 曲线");
    const { width, height, ratio } = courtCanvasSize(canvas);
    context.clearRect(0, 0, width, height);
    const points = sample.phase_curve.points;
    const phases = points.map((point) => Number(point.phase));
    const fluxes = points.map((point) => Number(point.flux));
    const phaseMin = Math.min(...phases);
    const phaseMax = Math.max(...phases);
    const sortedFlux = fluxes.slice().sort((left, right) => left - right);
    const lower = sortedFlux[Math.floor(sortedFlux.length * 0.01)];
    const upper = sortedFlux[Math.min(sortedFlux.length - 1, Math.ceil(sortedFlux.length * 0.99))];
    const fluxPad = Math.max((upper - lower) * 0.12, 0.002);
    const fluxMin = lower - fluxPad;
    const fluxMax = upper + fluxPad;
    const margin = { left: 36 * ratio, right: 17 * ratio, top: 22 * ratio, bottom: 26 * ratio };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const xFor = (phase) => margin.left + ((phase - phaseMin) / (phaseMax - phaseMin || 1)) * plotWidth;
    const yFor = (flux) => margin.top + (1 - (flux - fluxMin) / (fluxMax - fluxMin || 1)) * plotHeight;

    context.save();
    context.strokeStyle = "rgba(104, 172, 214, .12)";
    context.lineWidth = ratio;
    for (let index = 0; index <= 4; index += 1) {
      const y = margin.top + (index / 4) * plotHeight;
      context.beginPath();
      context.moveTo(margin.left, y);
      context.lineTo(width - margin.right, y);
      context.stroke();
    }
    context.beginPath();
    points.forEach((point, index) => {
      const x = xFor(Number(point.phase));
      const y = yFor(Math.max(fluxMin, Math.min(fluxMax, Number(point.flux))));
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = layout.key === "a" ? "rgba(92, 225, 255, .78)" : "rgba(255, 118, 202, .76)";
    context.lineWidth = 1.35 * ratio;
    context.stroke();
    points.filter((point) => point.event).forEach((point) => {
      context.beginPath();
      context.arc(xFor(Number(point.phase)), yFor(Math.max(fluxMin, Math.min(fluxMax, Number(point.flux)))), 2.1 * ratio, 0, Math.PI * 2);
      context.fillStyle = "rgba(255, 235, 151, .92)";
      context.fill();
    });
    context.fillStyle = "rgba(111, 139, 170, .78)";
    context.font = `${7 * ratio}px Consolas, monospace`;
    context.fillText(phaseMin.toFixed(2), margin.left, height - 8 * ratio);
    context.textAlign = "right";
    context.fillText(phaseMax.toFixed(2), width - margin.right, height - 8 * ratio);
    context.textAlign = "left";
    context.fillText("NORMALIZED FLUX", margin.left, 12 * ratio);
    context.restore();
    setText(`courtCurveMeta${layout.suffix}`, `QLP · ${points.length} POINTS · ${sample.phase_curve.event_point_count} EVENT`);
  }

  function heatColor(value, maxAbs) {
    const scaled = Math.max(-1, Math.min(1, value / (maxAbs || 1)));
    if (scaled >= 0) {
      const strength = Math.pow(scaled, 0.58);
      return `rgb(${Math.round(18 + 237 * strength)},${Math.round(28 + 111 * strength)},${Math.round(45 + 145 * strength)})`;
    }
    const strength = Math.pow(-scaled, 0.58);
    return `rgb(${Math.round(12 + 34 * strength)},${Math.round(26 + 151 * strength)},${Math.round(47 + 208 * strength)})`;
  }

  function drawPixel(layout, sample) {
    const canvas = $(`courtPixelCanvas${layout.suffix}`);
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器不能绘制 Pixel 差分图");
    const side = Math.max(260, Math.round(Math.min(canvas.getBoundingClientRect().width || 320, canvas.getBoundingClientRect().height || 320) * Math.min(window.devicePixelRatio || 1, 2)));
    canvas.width = side;
    canvas.height = side;
    context.clearRect(0, 0, side, side);
    const values = sample.pixel_images.difference.map(Number);
    const maxAbs = Math.max(...values.map((value) => Math.abs(value)), 1e-9);
    const cell = side / 20;
    values.forEach((value, index) => {
      const x = index % 20;
      const y = Math.floor(index / 20);
      context.fillStyle = heatColor(value, maxAbs);
      context.fillRect(x * cell, y * cell, Math.ceil(cell + 0.5), Math.ceil(cell + 0.5));
    });
    context.strokeStyle = "rgba(225, 249, 255, .11)";
    context.lineWidth = Math.max(1, side / 640);
    for (let index = 0; index <= 20; index += 1) {
      context.beginPath();
      context.moveTo(index * cell, 0);
      context.lineTo(index * cell, side);
      context.stroke();
      context.beginPath();
      context.moveTo(0, index * cell);
      context.lineTo(side, index * cell);
      context.stroke();
    }
    const centroid = sample.pixel_diagnostics.difference_centroid;
    const cx = (Number(centroid.x) + 0.5) * cell;
    const cy = (Number(centroid.y) + 0.5) * cell;
    context.strokeStyle = "rgba(255, 244, 151, .95)";
    context.lineWidth = Math.max(1.5, side / 180);
    context.beginPath();
    context.arc(cx, cy, cell * 0.72, 0, Math.PI * 2);
    context.moveTo(cx - cell * 1.15, cy);
    context.lineTo(cx + cell * 1.15, cy);
    context.moveTo(cx, cy - cell * 1.15);
    context.lineTo(cx, cy + cell * 1.15);
    context.stroke();
    setText(`courtPixelMetric${layout.suffix}`, `${sample.pixel_diagnostics.cadence_count}×20×20 · ${sample.pixel_diagnostics.quality_clean_event_cadence_count} CLEAN EVENT`);
    setText(`courtCentroid${layout.suffix}`, `Δ-centroid ${Number(centroid.offset_from_cutout_center_px).toFixed(3)} px · r4 depth ${(Number(sample.pixel_diagnostics.aperture_depths.r4) * 100).toFixed(3)}%`);
  }

  function clearPixel(layout) {
    const canvas = $(`courtPixelCanvas${layout.suffix}`);
    const context = canvas && canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(3, 9, 21, .94)";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  function formatPercent(value) {
    return `${(Number(value) * 100).toFixed(2)}%`;
  }

  function revealWitnesses() {
    BOSS_LAYOUT.forEach((layout) => {
      const sample = state.bosses.get(layout.key);
      const predictions = sample.predictions;
      setText(`courtBaseline${layout.suffix}`, predictions.baseline.predicted_class);
      setText(`courtBaselineConf${layout.suffix}`, `${formatPercent(predictions.baseline.predicted_class_probability)} · FULL P(4)`);
      setText(`courtQwen${layout.suffix}`, predictions.qwen.predicted_class);
      setText(`courtQwenConf${layout.suffix}`, `${formatPercent(predictions.qwen.predicted_class_probability)} · CLASS CONF ONLY`);
      setText(`courtPixel${layout.suffix}`, predictions.pixel.predicted_class);
      setText(`courtPixelConf${layout.suffix}`, `${formatPercent(predictions.pixel.predicted_class_probability)} · FULL P(4)`);
    });
  }

  function revealPixels() {
    BOSS_LAYOUT.forEach((layout) => drawPixel(layout, state.bosses.get(layout.key)));
  }

  function entropyBits(distribution) {
    return -distribution.reduce((sum, value) => sum + (value > 0 ? value * Math.log2(value) : 0), 0);
  }

  function klBits(left, right) {
    return left.reduce((sum, value, index) => sum + (value > 0 ? value * Math.log2(value / right[index]) : 0), 0);
  }

  function jsBits(left, right) {
    const mixture = left.map((value, index) => (value + right[index]) / 2);
    return (klBits(left, mixture) + klBits(right, mixture)) / 2;
  }

  function plurality(votes) {
    const counts = new Map();
    votes.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    const max = Math.max(...counts.values());
    const winners = Array.from(counts.entries()).filter((entry) => entry[1] === max).map((entry) => entry[0]);
    return winners.length === 1 ? winners[0] : "分歧";
  }

  function updateSurgery(layout) {
    const fieldset = document.querySelector(`[data-surgery-case="${layout.key}"]`);
    const sample = state.bosses.get(layout.key);
    if (!fieldset || !sample) return;
    const selected = Array.from(fieldset.querySelectorAll("input:checked"), (input) => input.value);
    const output = $(`courtSurgery${layout.suffix}`);
    if (!selected.length) {
      output.textContent = "请选择至少一个证据模态";
      return;
    }
    const predictions = sample.predictions;
    const votes = selected.map((route) => predictions[route].predicted_class);
    const result = [`类票 ${plurality(votes)} (${votes.join("/")})`];
    const numerical = selected.filter((route) => route === "baseline" || route === "pixel");
    if (numerical.length) {
      const mixture = CLASS_NAMES.map((_, index) => numerical.reduce((sum, route) => sum + Number(predictions[route].class_probabilities[index]), 0) / numerical.length);
      result.push(`H=${entropyBits(mixture).toFixed(3)} bit`);
    } else {
      result.push("H=不可计算");
    }
    if (numerical.length === 2) {
      result.push(`JS=${jsBits(predictions.baseline.class_probabilities, predictions.pixel.class_probabilities).toFixed(3)} bit`);
    } else {
      result.push("JS=不可计算");
    }
    if (selected.includes("qwen")) result.push(`Qwen=${formatPercent(predictions.qwen.predicted_class_probability)} 类别置信度，不参与分布熵`);
    output.textContent = result.join(" · ");
  }

  function revealVerdict() {
    BOSS_LAYOUT.forEach((layout) => {
      const sample = state.bosses.get(layout.key);
      const truth = sample.sample.truth.class_name;
      const card = $(`courtCase${layout.suffix}`);
      if (card) card.dataset.verdict = truth.toLowerCase();
      setText(`courtTruth${layout.suffix}`, `TIC ${sample.sample.tic_id} · TRUE ${truth}`);
      updateSurgery(layout);
    });
    const voteCopy = state.vote === "a" ? "你押了 A。" : state.vote === "b" ? "你押了 B。" : "你选择不先验押注。";
    setText("courtVerdictCopy", `${voteCopy} A 是 PC，由 Qwen 独立救回；B 是 EB，由 Pixel 独立救回。PC 仅表示行星候选体。`);
  }

  function clearCueTimers() {
    state.cueTimers.forEach((timer) => window.clearTimeout(timer));
    state.cueTimers = [];
  }

  function syncProgress(step) {
    const current = STEP_ORDER.indexOf(step);
    document.querySelectorAll("[data-court-progress]").forEach((node) => {
      const index = STEP_ORDER.indexOf(node.dataset.courtProgress);
      if (index < current) node.dataset.state = "complete";
      else if (index === current) node.dataset.state = "active";
      else delete node.dataset.state;
    });
  }

  function syncAgents(step) {
    const current = STEP_ORDER.indexOf(step);
    document.querySelectorAll("[data-court-agent]").forEach((node) => {
      const agent = node.dataset.courtAgent;
      const active = (AGENTS_BY_STEP[step] || []).includes(agent);
      const firstActiveStep = STEP_ORDER.findIndex((candidate) => (AGENTS_BY_STEP[candidate] || []).includes(agent));
      if (active) node.dataset.state = "active";
      else if (firstActiveStep >= 0 && firstActiveStep < current) node.dataset.state = "complete";
      else delete node.dataset.state;
    });
    document.querySelectorAll("[data-xray-stage]").forEach((node) => {
      const index = STEP_ORDER.indexOf(node.dataset.xrayStage);
      if (index < current) node.dataset.state = "complete";
      else if (index === current) node.dataset.state = "active";
      else delete node.dataset.state;
    });
  }

  function setCourtStep(step) {
    if (!court || (!STEP_ORDER.includes(step) && step !== "ready")) return;
    state.step = step;
    court.dataset.courtStep = step;
    const copy = STEP_COPY[step] || STEP_COPY.ready;
    setText("courtStepIndex", copy[0]);
    setText("courtStepLabel", copy[1]);
    syncProgress(step);
    syncAgents(step);
    if (announcer) announcer.textContent = copy[1];
    if (step === "observe") selectStellarRole("canonical_correct");
    if (step === "witness") {
      revealWitnesses();
      selectStellarRole("hard_error");
    }
    if (step === "pixel") {
      revealPixels();
      selectStellarRole("periodic_binary");
    }
    if (step === "verdict") revealVerdict();
  }

  function startCourt() {
    if (!state.ready || !state.vote) return;
    clearCueTimers();
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    AUTO_CUES.forEach((cue, index) => {
      const delay = reduced ? index * 900 : cue.delay;
      state.cueTimers.push(window.setTimeout(() => setCourtStep(cue.step), delay));
    });
  }

  function resetWitness(layout) {
    ["Baseline", "Qwen", "Pixel"].forEach((route) => {
      setText(`court${route}${layout.suffix}`, "SEALED");
      setText(`court${route}Conf${layout.suffix}`, "—");
    });
    setText(`courtTruth${layout.suffix}`, "TRUTH SEALED");
    setText(`courtPixelMetric${layout.suffix}`, "20×20 × 1060");
    setText(`courtCentroid${layout.suffix}`, "Δ-centroid sealed");
    const card = $(`courtCase${layout.suffix}`);
    if (card) card.dataset.verdict = "sealed";
    const fieldset = document.querySelector(`[data-surgery-case="${layout.key}"]`);
    if (fieldset) fieldset.querySelectorAll("input").forEach((input) => { input.checked = true; });
    setText(`courtSurgery${layout.suffix}`, "等待裁决");
    clearPixel(layout);
  }

  function resetCourt() {
    clearCueTimers();
    state.vote = null;
    state.population = null;
    state.plan = null;
    state.planEvaluation = null;
    document.querySelectorAll("[data-court-vote]").forEach((button) => button.setAttribute("aria-pressed", "false"));
    if (launchButton) launchButton.disabled = true;
    BOSS_LAYOUT.forEach(resetWitness);
    const population = $("courtPopulation");
    const planner = $("courtPlanner");
    if (population) {
      population.dataset.state = "idle";
      population.setAttribute("aria-hidden", "true");
    }
    if (planner) {
      planner.dataset.state = "idle";
      planner.setAttribute("aria-hidden", "true");
    }
    const board = $("courtPopulationBoard");
    if (board) board.replaceChildren();
    const queue = $("courtPlannerQueue");
    if (queue) {
      const item = document.createElement("li");
      item.textContent = "等待规划";
      queue.replaceChildren(item);
    }
    setText("courtBothCorrect", "—");
    setText("courtPixelOnly", "—");
    setText("courtQwenOnly", "—");
    setText("courtBothWrong", "—");
    setText("courtPopulationFinding", "将从当前已验真的 40 条共同 cohort 现场重算。");
    setText("courtPlanOutcome", "设置预算，生成下一观测序列。");
    const openPlanner = $("courtOpenPlanner");
    const reveal = $("courtRevealPlan");
    const budget = $("courtBudget");
    if (openPlanner) openPlanner.disabled = true;
    if (reveal) reveal.disabled = true;
    if (budget) budget.disabled = false;
    setCourtStep("ready");
    selectStellarRole("canonical_correct");
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    let payload;
    try {
      payload = await response.json();
    } catch (_error) {
      throw new Error(`${url} 未返回 JSON`);
    }
    if (!response.ok || !payload || payload.ok !== true) {
      const detail = payload && payload.error && (payload.error.message || payload.error.code);
      throw new Error(detail || `${url} 请求失败`);
    }
    return payload;
  }

  async function runPopulation() {
    const panel = $("courtPopulation");
    if (panel) {
      panel.setAttribute("aria-hidden", "false");
      panel.dataset.state = "running";
    }
    setCourtStep("population");
    setText("courtPopulationState", "COMPUTING 5,000×");
    try {
      const payload = await fetchJson("/api/science/run", {
        method: "POST",
        cache: "no-store",
        credentials: "omit",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ mode: "guided", experiment_id: "qwen_pixel_complementarity" }),
      });
      const result = requireObject(payload.result, "互补性实验结果");
      if (!result.cohort || result.cohort.sample_count !== 40 || result.experiment.id !== "qwen_pixel_complementarity") {
        throw new Error("互补性实验没有返回固定 40 条共同 cohort");
      }
      const pair = result.comparisons.find((item) => item.left_route === "pixel" && item.right_route === "qwen");
      if (!pair) throw new Error("互补性实验缺少 Pixel vs Qwen 配对矩阵");
      const counts = {
        both: pair.both_correct,
        pixel: pair.left_only_correct,
        qwen: pair.right_only_correct,
        wrong: pair.both_wrong,
      };
      if (Object.values(counts).reduce((sum, value) => sum + value, 0) !== 40) throw new Error("互补性配对矩阵总数不是 40");
      const expected = state.evidence.error_atlas.summary.cross_modal_complementarity;
      if (counts.both !== expected.both_correct || counts.pixel !== expected.qwen_wrong_pixel_correct || counts.qwen !== expected.qwen_correct_pixel_wrong || counts.wrong !== expected.both_wrong) {
        throw new Error("现场总体重算与 Error Atlas 固定摘要不一致");
      }
      const board = $("courtPopulationBoard");
      const nodes = [];
      Object.entries(counts).forEach(([outcome, count]) => {
        for (let index = 0; index < count; index += 1) {
          const dot = document.createElement("i");
          dot.dataset.outcome = outcome;
          dot.title = { both: "Qwen 与 Pixel 都正确", pixel: "仅 Pixel 正确", qwen: "仅 Qwen 正确", wrong: "双方都错" }[outcome];
          nodes.push(dot);
        }
      });
      board.replaceChildren(...nodes);
      setText("courtBothCorrect", counts.both);
      setText("courtPixelOnly", counts.pixel);
      setText("courtQwenOnly", counts.qwen);
      setText("courtBothWrong", counts.wrong);
      const pValue = Number(pair.mcnemar_exact_p_value);
      const interval = result.bootstrap && result.bootstrap.confidence_interval;
      const ci = Array.isArray(interval) && interval.length === 2 ? `[${Number(interval[0]).toFixed(3)}, ${Number(interval[1]).toFixed(3)}]` : "N/A";
      setText("courtPopulationFinding", `${result.finding.verdict} · ${result.finding.rationale} Pixel/Qwen 边际准确率差的 Exact McNemar p=${pValue.toFixed(4)}；Qwen−Pixel Macro-F1 的 5,000 次 target-group bootstrap 95% CI ${ci}。`);
      setText("courtPopulationState", `${result.analysis_id.slice(0, 10)} · PASS`);
      state.population = result;
      if (panel) panel.dataset.state = "ready";
      const openPlanner = $("courtOpenPlanner");
      if (openPlanner) openPlanner.disabled = false;
    } catch (error) {
      if (panel) panel.dataset.state = "failed";
      setText("courtPopulationState", "REJECTED");
      setText("courtPopulationFinding", error && error.message ? error.message : "总体检验失败");
    }
  }

  function openPlanner() {
    const planner = $("courtPlanner");
    if (planner) {
      planner.setAttribute("aria-hidden", "false");
      planner.dataset.state = "idle";
    }
    setCourtStep("planner");
  }

  function renderPlan(plan) {
    const queue = $("courtPlannerQueue");
    const selected = requireArray(plan.selected, plan.budget, "规划结果");
    const nodes = selected.map((candidate) => {
      const item = document.createElement("li");
      const name = document.createElement("strong");
      const score = document.createElement("b");
      const reason = document.createElement("span");
      name.textContent = `#${candidate.rank} · TIC ${candidate.tic_id}`;
      score.textContent = `priority ${Number(candidate.priority_score).toFixed(3)}`;
      reason.textContent = Array.isArray(candidate.reason_codes) ? candidate.reason_codes.join(" + ") : "LABEL-FREE";
      item.append(name, score, reason);
      return item;
    });
    queue.replaceChildren(...nodes);
  }

  async function requestPlan(reveal) {
    const budgetInput = $("courtBudget");
    const budget = state.plan ? state.plan.budget : Number(budgetInput.value);
    const planner = $("courtPlanner");
    if (planner) planner.dataset.state = "running";
    setText("courtPlanOutcome", reveal ? "观测队列已生成；正在回放历史 Qwen 结果并计算净救回。" : "正在融合熵、JS 分歧、低置信度与 Pixel 风险，生成下一观测序列……");
    try {
      const payload = await fetchJson("/api/arena/plan", {
        method: "POST",
        cache: "no-store",
        credentials: "omit",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ budget, reveal: Boolean(reveal) }),
      });
      const result = requireObject(payload.result, "观测规划响应");
      const plan = requireObject(result.plan, "观测计划");
      if (plan.budget !== budget || plan.status !== "DEVELOPMENT_SIMULATION") throw new Error("规划器返回了不一致的预算或边界");
      renderPlan(plan);
      state.plan = plan;
      budgetInput.disabled = true;
      const revealButton = $("courtRevealPlan");
      if (revealButton) revealButton.disabled = false;
      if (!reveal) {
        setText("courtPlanOutcome", `已生成 ${plan.selected_count}/${plan.candidate_count} 个下一观测目标。priority = 40% 混合熵 + 30% JS + 20% 低置信度 + 10% Pixel 风险。`);
      } else {
        const evaluation = requireObject(result.evaluation, "规划回放结果");
        if (evaluation.selected_count !== budget) throw new Error("规划回放没有评估同一冻结预算");
        const outcomes = evaluation.outcome_counts;
        state.planEvaluation = evaluation;
        setText("courtPlanOutcome", `观测收益回放：历史覆盖 ${evaluation.revealed_qwen_count}/${budget}；Qwen 独立救回 ${outcomes.qwen_independent_recovery}，回退 ${outcomes.qwen_regression}，无改变 ${outcomes.no_change}，其余 ${evaluation.qwen_not_revealed_count} 个等待新观测。净救回 ${evaluation.net_recoveries}。`);
        if (revealButton) revealButton.disabled = true;
      }
      if (planner) planner.dataset.state = "ready";
    } catch (error) {
      if (planner) planner.dataset.state = "failed";
      setText("courtPlanOutcome", error && error.message ? error.message : "规划器拒绝了请求");
    }
  }

  function toggleXray(open) {
    if (!court) return;
    const shouldOpen = typeof open === "boolean" ? open : court.dataset.xray !== "open";
    court.dataset.xray = shouldOpen ? "open" : "closed";
    const panel = $("courtXray");
    const toggle = $("courtXrayToggle");
    if (panel) panel.setAttribute("aria-hidden", shouldOpen ? "false" : "true");
    if (toggle) toggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  }

  function fillTechnicalXray() {
    const a = state.bosses.get("a");
    const b = state.bosses.get("b");
    const all = [a, b];
    setText("courtXrayPhase", all.map((sample) => `${sample.phase_curve.original_point_count}→${sample.phase_curve.point_count} pts / P=${Number(sample.phase_curve.period_days).toFixed(4)}d`).join(" · "));
    setText("courtXrayQwen", all.map((sample) => `${sample.predictions.qwen.model} · ${sample.predictions.qwen.request_id.slice(0, 18)}…`).join(" · "));
    setText("courtXrayTensor", all.map((sample) => `${sample.pixel_diagnostics.cadence_count}×${sample.pixel_images.shape.join("×")}`).join(" + "));
    setText("courtXrayFeatures", all.map((sample) => `Δc=${Number(sample.pixel_diagnostics.difference_centroid.offset_from_cutout_center_px).toFixed(3)}px / r4=${(Number(sample.pixel_diagnostics.aperture_depths.r4) * 100).toFixed(3)}%`).join(" · "));
    setText("courtAssetHash", `ARENA SHA-256 ${state.arenaSha256.slice(0, 16)}… · RECEIPT BOUND`);
  }

  function bindControls() {
    // The WebGL viewport is an ancestor and captures pointerdown for orbit drag.
    // Photon Court owns its interaction plane, so its controls must not bubble
    // into that renderer or a real click will be converted into a star drag.
    if (court) {
      court.addEventListener("pointerdown", (event) => event.stopPropagation());
      court.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
    }
    document.querySelectorAll("[data-court-vote]").forEach((button) => {
      button.addEventListener("click", () => {
        state.vote = button.dataset.courtVote;
        document.querySelectorAll("[data-court-vote]").forEach((candidate) => candidate.setAttribute("aria-pressed", candidate === button ? "true" : "false"));
        if (launchButton) launchButton.disabled = !state.ready;
      });
    });
    if (launchButton) launchButton.addEventListener("click", startCourt);
    $("courtRunPopulation")?.addEventListener("click", runPopulation);
    $("courtOpenPlanner")?.addEventListener("click", openPlanner);
    $("courtRunPlanner")?.addEventListener("click", () => requestPlan(false));
    $("courtRevealPlan")?.addEventListener("click", () => requestPlan(true));
    $("courtReplay")?.addEventListener("click", resetCourt);
    $("courtXrayToggle")?.addEventListener("click", () => toggleXray());
    $("courtXrayClose")?.addEventListener("click", () => toggleXray(false));
    const budget = $("courtBudget");
    if (budget) budget.addEventListener("input", () => setText("courtBudgetValue", `${budget.value} targets`));
    BOSS_LAYOUT.forEach((layout) => {
      const fieldset = document.querySelector(`[data-surgery-case="${layout.key}"]`);
      if (fieldset) fieldset.addEventListener("change", () => updateSurgery(layout));
    });
    window.addEventListener("resize", () => {
      window.clearTimeout(state.resizeTimer);
      state.resizeTimer = window.setTimeout(() => {
        if (!state.ready) return;
        BOSS_LAYOUT.forEach((layout) => drawCurve(layout, state.bosses.get(layout.key)));
        if (["pixel", "verdict"].includes(state.step)) revealPixels();
      }, 120);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") toggleXray(false);
      if (event.key === "x" && !event.ctrlKey && !event.metaKey && !event.altKey) toggleXray();
    });
  }

  async function loadEvidence() {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const evidencePromise = fetch("/api/evidence", {
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload || payload.ok !== true) throw new Error("本地证据服务未返回可验证包");
        return requireObject(payload.evidence, "本地证据包");
      });
      const arenaPromise = fetch("assets/photon-arena-v1.json", {
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      }).then(async (response) => {
        if (!response.ok) throw new Error("Photon Arena 静态资产不可用");
        const text = await response.text();
        return { arena: JSON.parse(text), digest: await sha256Text(text) };
      });
      const [evidence, arenaResult] = await Promise.all([evidencePromise, arenaPromise]);
      const stellar = validateStellarEvidence(evidence);
      bindAndValidateArena(arenaResult.arena, evidence, arenaResult.digest);
      state.evidence = evidence;
      state.arena = arenaResult.arena;
      state.arenaSha256 = arenaResult.digest;
      state.ready = true;
      if (court) {
        court.dataset.state = "ready";
        court.dataset.courtStep = "ready";
      }
      dispatchStellar("astrotwin:stellar-evidence", { stage: stellar.stage, sha256: stellar.stageHash, eligible: true });
      const firstSample = stellar.stage.samples.find((sample) => sample.role === "canonical_correct");
      if (firstSample) dispatchStellar("astrotwin:stellar-sample", { role: "canonical_correct", sample: firstSample });
      BOSS_LAYOUT.forEach((layout) => {
        drawCurve(layout, state.bosses.get(layout.key));
        clearPixel(layout);
      });
      fillTechnicalXray();
      setText("courtRunId", `${evidence.package_id} · DEVELOPMENT REPLAY`);
      setEvidenceState("ready", `${evidence.package_id} · PHOTON PASS`);
      setText("courtStepLabel", "两颗真实目标已锁定，等待评委押注");
      if (launchButton) launchButton.disabled = !state.vote;
      if (announcer) announcer.textContent = "双 Boss 证据与 Error Atlas 已逐字段对齐，可以开庭。";
      window.setTimeout(() => document.querySelector("button[data-stellar-quality='cinema']")?.click(), 180);
    } catch (error) {
      const message = error && error.name === "AbortError" ? "本地证据核验超时" : error && error.message;
      failClosed(message);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  window.addEventListener("astrotwin:stellar-select-request", onSelectionRequest);
  bindControls();
  loadEvidence();
}());
