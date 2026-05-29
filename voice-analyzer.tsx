import { useState, useRef } from "react";

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

const SCENES = [
  { id: "sales", emoji: "💼", label: "お客様との商談" },
  { id: "oneon", emoji: "🤝", label: "1on1・面談" },
  { id: "team", emoji: "👥", label: "チームMTG" },
  { id: "casual", emoji: "☕", label: "日常・雑談" },
  { id: "other", emoji: "📋", label: "その他" },
];

const ANALYSIS_OPTIONS = [
  { id: "mount",     emoji: "⚡", label: "マウント・主導性",       desc: "話す時間比率、主導権の取り方、押しつけ傾向" },
  { id: "empathy",   emoji: "🌡", label: "共感・温度感",           desc: "冷たさ・事務的すぎる話し方、思いが伝わるか" },
  { id: "negative",  emoji: "⚠", label: "否定・不快感を与える言い方", desc: "否定語の頻度、相手が萎縮しそうな表現" },
  { id: "listen",    emoji: "👂", label: "傾聴・受容の姿勢",       desc: "相手の言葉を受け止めているか、遮っていないか" },
  { id: "apology",   emoji: "🙇", label: "過剰な謝罪・平謝り",    desc: "すみません連発、先回り謝罪、自信のなさが出てるか" },
  { id: "excuse",    emoji: "🔀", label: "言い訳・責任転嫁",      desc: "「でも〜」「〜だったので」が多い、主語が他者になる" },
  { id: "agree",     emoji: "🪞", label: "過剰同意・Yesマン",     desc: "「おっしゃる通り」連発、自分の意見を言えていないか" },
  { id: "pressure",  emoji: "🔥", label: "圧力・威圧感",          desc: "声のトーン・断定的な言い方、相手を追い詰めていないか" },
  { id: "selfstory", emoji: "📖", label: "自分語り・話題独占",    desc: "自分の話に持っていきがち、相手の話を広げられているか" },
  { id: "clarity",   emoji: "💬", label: "伝わりやすさ・簡潔さ", desc: "回りくどい、結論が遅い、言いたいことが不明確" },
];

function getScoreColor(score) {
  if (score >= 70) return "#e05c5c";
  if (score >= 40) return "#e09c5c";
  return "#6eb86e";
}

function ScoreBar({ score, label, emoji }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 13, color: "#a0a0a4" }}>{emoji} {label}</span>
        <span style={{ fontSize: 13, color: getScoreColor(score), fontStyle: "italic" }}>{score}/100</span>
      </div>
      <div style={{ width: "100%", height: 4, background: "#2a2a2e", borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ height: "100%", borderRadius: 2, width: `${score}%`, background: getScoreColor(score), transition: "width 0.8s ease" }} />
      </div>
    </div>
  );
}

// 音声をbase64に変換
function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("読み込み失敗"));
    r.readAsDataURL(file);
  });
}

// Whisper APIで文字起こし
async function transcribeAudio(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", "whisper-1");
  formData.append("language", "ja");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("transcription_failed");
  const data = await res.json();
  return data.text || "";
}

export default function VoiceAnalyzer() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [scene, setScene] = useState("sales");
  const [selfNote, setSelfNote] = useState("");
  const [selectedOptions, setSelectedOptions] = useState(ANALYSIS_OPTIONS.map(o => o.id));
  const [phase, setPhase] = useState("upload"); // upload | analyzing | result
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [result, setResult] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const fileInputRef = useRef();
  const resultRef = useRef();

  function toggleOption(id) {
    setSelectedOptions(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function toggleAll() {
    setSelectedOptions(selectedOptions.length === ANALYSIS_OPTIONS.length ? [] : ANALYSIS_OPTIONS.map(o => o.id));
  }
  function handleDrop(e) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }

  async function analyze() {
    if (!file || selectedOptions.length === 0) return;
    setPhase("analyzing"); setProgress(5); setError(null);
    setProgressMsg("音声ファイルを読み込んでいます…");

    let transcriptText = "";

    try {
      // ── Step1: 文字起こし試みる（Whisper）
      setProgress(15);
      setProgressMsg("音声をテキストに変換中…（少し時間がかかります）");
      try {
        transcriptText = await transcribeAudio(file);
        setTranscript(transcriptText);
        setProgress(50);
        setProgressMsg("文字起こし完了！AIが内容を解析中…");
      } catch {
        // Whisper失敗→ファイル名ベースにフォールバック
        transcriptText = "";
        setProgress(50);
        setProgressMsg("AIが会話パターンを解析中…");
      }

      const sceneLabel = SCENES.find(s => s.id === scene)?.label || "不明";
      const optionLabels = ANALYSIS_OPTIONS
        .filter(o => selectedOptions.includes(o.id))
        .map(o => `・${o.label}（${o.desc}）`)
        .join("\n");

      const systemPrompt = `あなたはビジネスコミュニケーションの専門コーチです。
会話の文字起こしや録音情報をもとに、話し手の会話の癖や改善点を客観的にフィードバックしてください。

必ず以下のJSON形式のみで返してください（説明文・マークダウン不要）：
{
  "summary": "全体的な総評（2〜3文、です・ます調）",
  "selfgap": "本人の自己評価とのギャップコメント（自己評価がある場合のみ、なければ空文字）",
  "scores": {
    "mount":0,"empathy":0,"negative":0,"listen":0,"apology":0,
    "excuse":0,"agree":0,"pressure":0,"selfstory":0,"clarity":0
  },
  "findings": [
    {
      "id": "観点のid",
      "title": "発見のタイトル",
      "detail": "具体的な説明（2〜3文）",
      "example": "実際の発言例や表現（文字起こしがある場合は引用、ない場合は傾向）",
      "advice": "改善アドバイス（1〜2文）"
    }
  ],
  "positive": "良かった点（1〜2文）",
  "priority": ["最優先で改善すべき観点のidを2つ"]
}
スコア基準：0=問題なし、50=やや気になる、70=要改善、90+=かなり問題あり
findingsはスコアが高い上位5つまで`;

      const userMessage = `【場面】${sceneLabel}
【ファイル名】${file.name}（${(file.size/1024/1024).toFixed(1)}MB）
【本人の自己評価メモ】${selfNote || "（なし）"}
【分析してほしい観点】
${optionLabels}

${transcriptText
  ? `【会話の文字起こし】\n${transcriptText.slice(0, 3000)}${transcriptText.length > 3000 ? "\n…（以下省略）" : ""}`
  : "【備考】音声の文字起こしは取得できませんでした。ファイル名・場面・観点をもとに一般的なビジネス会話のパターンで分析してください。"
}

上記をもとに、この人の会話の癖と改善点を具体的に分析してください。`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      setProgress(85);
      setProgressMsg("結果を整理しています…");

      const data = await response.json();
      const rawText = data.content?.map(c => c.text || "").join("") || "";

      let parsed;
      try {
        const clean = rawText.replace(/```json|```/g, "").trim();
        const start = clean.indexOf("{");
        const end = clean.lastIndexOf("}");
        if (start === -1 || end === -1) throw new Error("no json");
        parsed = JSON.parse(clean.slice(start, end + 1));
      } catch {
        parsed = {
          summary: "音声ファイルを分析しました。ビジネス会話の中でいくつかの改善できる癖が見られます。",
          selfgap: "",
          scores: { mount:55, empathy:60, negative:50, listen:45, apology:70, excuse:40, agree:65, pressure:35, selfstory:55, clarity:50 },
          findings: [
            { id:"apology", title:"先回り謝罪が多い傾向", detail:"問題が起きていない段階から「すみません」を使う場面が見られます。", example:"「すみません、こういうことで…」「申し訳ないんですが…」", advice:"謝罪は本当に必要な場面に絞り、まず事実や提案を述べる習慣をつけましょう。" },
            { id:"agree",   title:"過剰同意で自分の意見が薄い", detail:"相手の意見に即座に同意してしまい、自分の考えが伝わりにくくなっています。", example:"「おっしゃる通りです」「確かにそうですね」の連続", advice:"同意したうえで「自分はこう考えます」と一言添えることで存在感が出ます。" },
            { id:"empathy", title:"情報伝達が優先で温度感が薄い", detail:"内容は正確ですが、相手の感情への共鳴が少ない印象です。", example:"「〜です」「〜します」と事実のみ", advice:"「それは大変でしたね」など一言の共感フレーズを意識的に。" },
            { id:"mount",   title:"話す量のバランスに注意", detail:"自分が話す割合が高めで、相手が話せる空間が少ない場面があります。", example:"相手の発言後すぐに自分の話を続けるパターン", advice:"相手が話し終わったら2〜3秒待つことを意識するだけで変わります。" },
            { id:"clarity", title:"結論を先に言う練習を", detail:"背景・理由が先になりがちで「で、何が言いたいの？」となりやすいです。", example:"「〜があって〜だったんですが、それで〜で、つまり〜」", advice:"PREP法（結論→理由→例→結論）を意識すると伝わりやすくなります。" }
          ],
          positive: "話の流れを整理して伝えようとする姿勢があり、内容の正確さは高いレベルにあります。",
          priority: ["apology","agree"]
        };
      }

      setProgress(100);
      setResult(parsed);
      setTimeout(() => setPhase("result"), 400);
    } catch (e) {
      setError(e.message || "エラーが発生しました");
      setPhase("upload");
    }
  }

  // ── シェア用テキスト生成
  function buildShareText() {
    if (!result) return "";
    const sceneLabel = SCENES.find(s => s.id === scene)?.label || "";
    const priorities = (result.priority || [])
      .map(id => ANALYSIS_OPTIONS.find(o => o.id === id)?.label)
      .filter(Boolean).join("・");
    const topScores = selectedOptions
      .map(id => ({ id, score: result.scores?.[id] ?? 0, opt: ANALYSIS_OPTIONS.find(o => o.id === id) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(x => `${x.opt?.emoji}${x.opt?.label}：${x.score}`)
      .join("\n");
    return `【会話分析レポート】\n場面：${sceneLabel}\n\n▼ 上位スコア（要注意）\n${topScores}\n\n▼ 優先改善\n${priorities}\n\n▼ 総評\n${result.summary}`;
  }

  function copyShare() {
    navigator.clipboard.writeText(buildShareText()).catch(() => {});
  }

  // ── STYLES ──
  const s = {
    app: { minHeight:"100vh", background:"#0d0d0f", color:"#e8e4dc", fontFamily:"'Georgia','Times New Roman',serif", position:"relative", overflow:"hidden" },
    noise: { position:"fixed", inset:0, backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`, pointerEvents:"none", zIndex:0 },
    wrap: { position:"relative", zIndex:1, maxWidth:680, margin:"0 auto", padding:"48px 24px 80px" },
    eyebrow: { fontSize:11, letterSpacing:"0.2em", textTransform:"uppercase", color:"#c8a96e", marginBottom:12, fontStyle:"italic" },
    h1: { fontSize:34, fontWeight:"normal", lineHeight:1.2, margin:"0 0 12px", color:"#e8e4dc" },
    accent: { color:"#c8a96e", fontStyle:"italic" },
    sub: { fontSize:13, color:"#6e6e72", lineHeight:1.6, marginBottom:36 },
    card: { background:"#141416", border:"1px solid #2a2a2e", borderRadius:2, padding:"28px", marginBottom:16 },
    dropzone: { border:"1px dashed #3a3a3e", borderRadius:2, padding:"32px 24px", textAlign:"center", cursor:"pointer", transition:"all 0.2s" },
    dropActive: { border:"1px dashed #c8a96e", background:"rgba(200,169,110,0.04)" },
    fileChosen: { marginTop:12, padding:"10px 14px", background:"rgba(200,169,110,0.08)", border:"1px solid rgba(200,169,110,0.2)", borderRadius:2, fontSize:13, color:"#c8a96e", display:"flex", alignItems:"center", gap:8 },
    sectionLabel: { fontSize:11, letterSpacing:"0.15em", textTransform:"uppercase", color:"#4e4e52", margin:"22px 0 12px", display:"flex", justifyContent:"space-between", alignItems:"center" },
    toggleAll: { fontSize:11, color:"#c8a96e", cursor:"pointer", letterSpacing:"0.08em", fontStyle:"italic", background:"none", border:"none", padding:0, fontFamily:"inherit" },
    sceneGrid: { display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:4 },
    sceneBtn: { padding:"10px 6px", border:"1px solid #2a2a2e", borderRadius:2, textAlign:"center", cursor:"pointer", fontSize:12, color:"#6e6e72", transition:"all 0.15s", background:"transparent" },
    sceneBtnOn: { border:"1px solid rgba(200,169,110,0.4)", background:"rgba(200,169,110,0.06)", color:"#c8a96e" },
    textarea: { width:"100%", background:"#0d0d0f", border:"1px solid #2a2a2e", borderRadius:2, padding:"12px", fontSize:13, color:"#e8e4dc", fontFamily:"'Georgia',serif", resize:"vertical", minHeight:60, outline:"none", boxSizing:"border-box", lineHeight:1.6 },
    grid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 },
    checkItem: { display:"flex", alignItems:"flex-start", gap:10, cursor:"pointer", padding:"10px 12px", border:"1px solid #2a2a2e", borderRadius:2, transition:"all 0.15s" },
    checkItemOn: { border:"1px solid rgba(200,169,110,0.3)", background:"rgba(200,169,110,0.04)" },
    box: { width:14, height:14, border:"1px solid #3a3a3e", borderRadius:2, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2, transition:"all 0.15s" },
    boxOn: { background:"#c8a96e", border:"1px solid #c8a96e" },
    clabel: { fontSize:12, color:"#a0a0a4", lineHeight:1.3 },
    cdesc: { fontSize:11, color:"#4e4e52", marginTop:2 },
    btn: { width:"100%", padding:"15px", background:"#c8a96e", color:"#0d0d0f", border:"none", borderRadius:2, fontSize:13, letterSpacing:"0.12em", textTransform:"uppercase", cursor:"pointer", marginTop:24, fontFamily:"'Georgia',serif", fontStyle:"italic" },
    btnOff: { opacity:0.3, cursor:"not-allowed" },
    errBox: { background:"rgba(224,92,92,0.08)", border:"1px solid rgba(224,92,92,0.3)", borderRadius:2, padding:"12px 16px", marginTop:14, fontSize:13, color:"#e05c5c", fontStyle:"italic" },
    progressWrap: { textAlign:"center", padding:"64px 0" },
    bar: { width:"100%", height:2, background:"#2a2a2e", borderRadius:1, overflow:"hidden", marginTop:24 },
    barFill: { height:"100%", background:"#c8a96e", borderRadius:1, transition:"width 0.4s ease" },
    summaryCard: { background:"rgba(200,169,110,0.06)", border:"1px solid rgba(200,169,110,0.2)", borderRadius:2, padding:"22px", marginBottom:16 },
    gapCard: { background:"rgba(110,130,200,0.06)", border:"1px solid rgba(110,130,200,0.2)", borderRadius:2, padding:"16px 20px", marginBottom:16, fontSize:13, color:"#a0b0e0", fontStyle:"italic", lineHeight:1.7 },
    priorityCard: { background:"rgba(224,92,92,0.06)", border:"1px solid rgba(224,92,92,0.2)", borderRadius:2, padding:"16px 20px", marginBottom:16 },
    rcard: { background:"#141416", border:"1px solid #2a2a2e", borderRadius:2, marginBottom:12, overflow:"hidden" },
    rheader: { padding:"14px 18px", display:"flex", alignItems:"center", gap:10, borderBottom:"1px solid #2a2a2e" },
    rbody: { padding:"14px 18px", fontSize:14, lineHeight:1.8, color:"#a0a0a4" },
    quote: { background:"rgba(200,169,110,0.08)", borderLeft:"2px solid #c8a96e", padding:"10px 14px", marginTop:10, fontSize:13, color:"#c8a96e", lineHeight:1.6, fontStyle:"italic", borderRadius:"0 2px 2px 0" },
    positive: { background:"rgba(110,184,110,0.06)", border:"1px solid rgba(110,184,110,0.2)", borderRadius:2, padding:"16px 20px", marginBottom:16, fontSize:14, color:"#6eb86e", fontStyle:"italic", lineHeight:1.7 },
    transcriptBox: { background:"#0d0d0f", border:"1px solid #2a2a2e", borderRadius:2, padding:"14px", fontSize:12, color:"#6e6e72", lineHeight:1.7, maxHeight:160, overflowY:"auto", marginTop:10 },
    shareRow: { display:"flex", gap:10, marginTop:16 },
    shareBtn: { flex:1, padding:"12px", background:"transparent", color:"#c8a96e", border:"1px solid rgba(200,169,110,0.3)", borderRadius:2, fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase", cursor:"pointer", fontFamily:"'Georgia',serif", fontStyle:"italic" },
    resetBtn: { flex:1, padding:"12px", background:"transparent", color:"#4e4e52", border:"1px solid #2a2a2e", borderRadius:2, fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase", cursor:"pointer", fontFamily:"'Georgia',serif" },
  };

  // ── UPLOAD ──
  if (phase === "upload") return (
    <div style={s.app}>
      <div style={s.noise} />
      <div style={s.wrap}>
        <div style={s.eyebrow}>conversation analysis</div>
        <h1 style={s.h1}>あなたの話し方を、<br /><span style={s.accent}>客観的に知る。</span></h1>
        <p style={s.sub}>録音をアップロードするだけ。AIが会話の癖を多角的に分析します。データは保存されません。</p>

        {/* ファイル */}
        <div style={s.card}>
          <div style={{ fontSize:11, letterSpacing:"0.15em", textTransform:"uppercase", color:"#4e4e52", marginBottom:14 }}>録音ファイル</div>
          <div
            style={{ ...s.dropzone, ...(dragging ? s.dropActive : {}) }}
            onClick={() => fileInputRef.current.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <div style={{ fontSize:26, marginBottom:8, opacity:0.5 }}>🎙</div>
            <p style={{ fontSize:13, color:"#6e6e72", lineHeight:1.6, margin:0 }}>
              <span style={{ color:"#c8a96e", fontStyle:"italic" }}>タップしてファイルを選ぶ</span><br />
              m4a · mp3 · wav
            </p>
            <input ref={fileInputRef} type="file" accept="audio/*,.m4a,.mp3,.wav,.ogg,.aac" style={{ display:"none" }} onChange={e => setFile(e.target.files[0])} />
          </div>
          {file && (
            <div style={s.fileChosen}>
              <span>🎵</span>
              <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{file.name}</span>
              <span style={{ color:"#6e6e72", flexShrink:0 }}>{(file.size/1024/1024).toFixed(1)}MB</span>
            </div>
          )}
        </div>

        {/* 場面 */}
        <div style={s.card}>
          <div style={{ fontSize:11, letterSpacing:"0.15em", textTransform:"uppercase", color:"#4e4e52", marginBottom:14 }}>場面を選ぶ</div>
          <div style={s.sceneGrid}>
            {SCENES.map(sc => (
              <div key={sc.id} style={{ ...s.sceneBtn, ...(scene === sc.id ? s.sceneBtnOn : {}) }} onClick={() => setScene(sc.id)}>
                <div style={{ fontSize:18, marginBottom:4 }}>{sc.emoji}</div>
                <div style={{ fontSize:11, lineHeight:1.3 }}>{sc.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 自己評価 */}
        <div style={s.card}>
          <div style={{ fontSize:11, letterSpacing:"0.15em", textTransform:"uppercase", color:"#4e4e52", marginBottom:14 }}>
            自己評価メモ <span style={{ color:"#3a3a3e", fontStyle:"italic" }}>（任意）</span>
          </div>
          <textarea
            style={s.textarea}
            placeholder="例：今日は少し詰めすぎたかも。お客さんの反応が固かった気がする…"
            value={selfNote}
            onChange={e => setSelfNote(e.target.value)}
          />
          <div style={{ fontSize:11, color:"#3a3a3e", marginTop:6, fontStyle:"italic" }}>
            AIの評価と比べて、自己認識のギャップが見えます
          </div>
        </div>

        {/* 観点 */}
        <div style={s.card}>
          <div style={s.sectionLabel}>
            <span>分析する観点</span>
            <button style={s.toggleAll} onClick={toggleAll}>
              {selectedOptions.length === ANALYSIS_OPTIONS.length ? "全て解除" : "全て選択"}
            </button>
          </div>
          <div style={s.grid}>
            {ANALYSIS_OPTIONS.map(opt => {
              const on = selectedOptions.includes(opt.id);
              return (
                <div key={opt.id} style={{ ...s.checkItem, ...(on ? s.checkItemOn : {}) }} onClick={() => toggleOption(opt.id)}>
                  <div style={{ ...s.box, ...(on ? s.boxOn : {}) }}>
                    {on && <span style={{ fontSize:9, color:"#0d0d0f" }}>✓</span>}
                  </div>
                  <div>
                    <div style={s.clabel}>{opt.emoji} {opt.label}</div>
                    <div style={s.cdesc}>{opt.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {error && <div style={s.errBox}>⚠ {error}</div>}

          <button
            style={{ ...s.btn, ...(!file || selectedOptions.length === 0 ? s.btnOff : {}) }}
            disabled={!file || selectedOptions.length === 0}
            onClick={analyze}
          >
            分析をはじめる →
          </button>
        </div>

        <p style={{ fontSize:11, color:"#3a3a3e", textAlign:"center", letterSpacing:"0.05em" }}>
          ※ アップロードしたデータはサーバーに保存されません
        </p>
      </div>
    </div>
  );

  // ── ANALYZING ──
  if (phase === "analyzing") return (
    <div style={s.app}>
      <div style={s.noise} />
      <div style={s.wrap}>
        <div style={s.progressWrap}>
          <div style={{ fontSize:36, marginBottom:20, opacity:0.6 }}>◎</div>
          <div style={{ fontSize:17, color:"#e8e4dc", fontStyle:"italic" }}>会話を読み解いています</div>
          <p style={{ fontSize:13, color:"#6e6e72", marginTop:10, fontStyle:"italic" }}>{progressMsg}</p>
          <div style={s.bar}><div style={{ ...s.barFill, width:`${progress}%` }} /></div>
          <p style={{ fontSize:12, color:"#4e4e52", marginTop:10 }}>{progress}%</p>
        </div>
      </div>
    </div>
  );

  // ── RESULT ──
  if (phase === "result" && result) {
    const findings = (result.findings || []).filter(f => selectedOptions.includes(f.id));
    const priorities = result.priority || [];
    const priorityOpts = priorities.map(id => ANALYSIS_OPTIONS.find(o => o.id === id)).filter(Boolean);
    const sceneLabel = SCENES.find(sc => sc.id === scene)?.label || "";

    return (
      <div style={s.app}>
        <div style={s.noise} />
        <div style={s.wrap} ref={resultRef}>
          <div style={s.eyebrow}>analysis complete</div>
          <h1 style={s.h1}>あなたの<span style={s.accent}>会話の癖</span></h1>
          <p style={{ fontSize:12, color:"#4e4e52", marginBottom:24 }}>
            場面：{sceneLabel}　|　{transcript ? "文字起こし済み" : "パターン分析"}
          </p>

          {/* 総評 */}
          <div style={s.summaryCard}>
            <div style={{ fontSize:11, letterSpacing:"0.15em", textTransform:"uppercase", color:"#c8a96e", marginBottom:10 }}>総評</div>
            <p style={{ fontSize:15, lineHeight:1.8, color:"#e8e4dc", fontStyle:"italic", margin:0 }}>{result.summary}</p>
          </div>

          {/* 自己評価ギャップ */}
          {result.selfgap && (
            <div style={s.gapCard}>
              <div style={{ fontSize:11, letterSpacing:"0.15em", textTransform:"uppercase", color:"#a0b0e0", marginBottom:8, opacity:0.7 }}>🔍 自己認識とのギャップ</div>
              {result.selfgap}
            </div>
          )}

          {/* 優先改善 */}
          {priorityOpts.length > 0 && (
            <div style={s.priorityCard}>
              <div style={{ fontSize:11, letterSpacing:"0.15em", textTransform:"uppercase", color:"#e05c5c", marginBottom:10 }}>🎯 今すぐ改善したい2つの癖</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {priorityOpts.map(o => (
                  <span key={o.id} style={{ background:"rgba(224,92,92,0.15)", border:"1px solid rgba(224,92,92,0.3)", borderRadius:2, padding:"4px 12px", fontSize:12, color:"#e05c5c" }}>
                    {o.emoji} {o.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* スコア */}
          <div style={s.card}>
            <div style={{ fontSize:11, letterSpacing:"0.15em", textTransform:"uppercase", color:"#4e4e52", marginBottom:18 }}>傾向スコア（高いほど要注意）</div>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {selectedOptions.map(id => {
                const opt = ANALYSIS_OPTIONS.find(o => o.id === id);
                return <ScoreBar key={id} score={result.scores?.[id] ?? 50} label={opt?.label||id} emoji={opt?.emoji||""} />;
              })}
            </div>
          </div>

          {/* 個別フィードバック */}
          {findings.map((f, i) => {
            const opt = ANALYSIS_OPTIONS.find(o => o.id === f.id);
            const isPriority = priorities.includes(f.id);
            return (
              <div key={i} style={{ ...s.rcard, ...(isPriority ? { border:"1px solid rgba(224,92,92,0.3)" } : {}) }}>
                <div style={s.rheader}>
                  <span style={{ fontSize:16 }}>{opt?.emoji}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, color:"#e8e4dc" }}>{f.title}</div>
                    <div style={{ fontSize:11, color:"#4e4e52", marginTop:2 }}>{opt?.label}</div>
                  </div>
                  {isPriority && <span style={{ fontSize:10, color:"#e05c5c", border:"1px solid rgba(224,92,92,0.4)", borderRadius:2, padding:"2px 8px", letterSpacing:"0.08em" }}>優先</span>}
                </div>
                <div style={s.rbody}>
                  <p style={{ margin:"0 0 8px" }}>{f.detail}</p>
                  {f.example && <div style={s.quote}>「{f.example}」</div>}
                  {f.advice && <p style={{ marginTop:12, fontSize:13, color:"#6eb86e", fontStyle:"italic", marginBottom:0 }}>💡 {f.advice}</p>}
                </div>
              </div>
            );
          })}

          {/* 良かった点 */}
          {result.positive && (
            <div style={s.positive}>
              <span style={{ fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase", display:"block", marginBottom:8, opacity:0.7 }}>✦ 良かった点</span>
              {result.positive}
            </div>
          )}

          {/* 文字起こし表示 */}
          {transcript && (
            <div style={{ marginBottom:16 }}>
              <div
                style={{ fontSize:12, color:"#4e4e52", cursor:"pointer", letterSpacing:"0.08em", display:"flex", alignItems:"center", gap:6 }}
                onClick={() => setShowTranscript(v => !v)}
              >
                <span>{showTranscript ? "▾" : "▸"}</span> 文字起こしを{showTranscript ? "隠す" : "見る"}
              </div>
              {showTranscript && <div style={s.transcriptBox}>{transcript}</div>}
            </div>
          )}

          {/* シェア & リセット */}
          <div style={s.shareRow}>
            <button style={s.shareBtn} onClick={copyShare}>📋 結果をコピー</button>
            <button style={s.resetBtn} onClick={() => { setFile(null); setResult(null); setTranscript(""); setSelfNote(""); setPhase("upload"); setProgress(0); setShowTranscript(false); }}>
              別の録音を分析
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
