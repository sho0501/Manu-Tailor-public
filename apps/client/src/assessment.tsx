import { setLocale, useLocale } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "./api";
import type { Profile } from "./types";
import { Alert, Button, Card } from "./ui";
interface Question {
  id: string;
  prompt: string;
  choices: string[];
  question_type: string;
  diagram?: boolean;
  memory_seconds?: number;
  recall?: string;
  format?: string;
  language?: string;
}
interface Assessment {
  id: string;
  status: string;
  answered: number;
  question: Question | null;
  result?: {
    profile: Profile;
    recommendations: string[];
    limitations: string;
  };
}
type IntroAnswers = {
  japanese_reading: "none" | "kana" | "comfortable";
  short: boolean;
  visual: number;
  furigana: boolean;
  font_scale: number;
  line_spacing: number;
  mode: "quick" | "detailed";
};
const initialIntro: IntroAnswers = {
  japanese_reading: "comfortable",
  short: true,
  visual: 0.5,
  furigana: false,
  font_scale: 1.2,
  line_spacing: 1.7,
  mode: "quick",
};
export function AdaptiveAssessment({
  onApply,
}: {
  onApply: (p: Profile) => void;
}) {
  const { t, locale } = useLocale();
  const [data, setData] = useState<Assessment | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [introStep, setIntroStep] = useState(0);
  const [introAnswers, setIntroAnswers] = useState<IntroAnswers>(initialIntro);
  const [chooseLanguage, setChooseLanguage] = useState(false);
  const navigate = useNavigate();
  const japanese = locale === "ja";
  const introQuestions: {
    id: keyof IntroAnswers;
    title: string;
    options: { value: string | number | boolean; label: string }[];
  }[] = [
    ...(japanese
      ? [
          {
            id: "japanese_reading" as const,
            title: "にほんごは どのくらい よめますか？",
            options: [
              { value: "none", label: "にほんごは まだ よめません" },
              {
                value: "kana",
                label: "ひらがなは よめます。かんじは むずかしいです",
              },
              {
                value: "comfortable",
                label: "かんじを ふくむ にほんごも よめます",
              },
            ],
          },
        ]
      : []),
    {
      id: "short",
      title: "どちらの文章が読みやすいですか？",
      options: [
        { value: true, label: "① 箱を開ける。② 中身を出す。" },
        { value: false, label: "箱を開けてから中身を出す。" },
      ],
    },
    {
      id: "visual",
      title: "図と文章、どの表示がよいですか？",
      options: [
        { value: 0, label: "文章を中心に" },
        { value: 0.5, label: "両方を使う" },
        { value: 1, label: "図を中心に" },
      ],
    },
    ...(japanese
      ? [
          {
            id: "furigana" as const,
            title: "漢字にふりがなを付けますか？",
            options: [
              { value: true, label: "ふりがなを使いたい" },
              { value: false, label: "ふりがなは必要ありません" },
            ],
          },
        ]
      : []),
    {
      id: "font_scale",
      title: "どの文字サイズが読みやすいですか？",
      options: [
        { value: 1, label: "標準" },
        { value: 1.2, label: "少し大きく" },
        { value: 1.4, label: "大きく" },
      ],
    },
    {
      id: "line_spacing",
      title: "どの行間が読みやすいですか？",
      options: [
        { value: 1.5, label: "標準" },
        { value: 1.7, label: "少し広く" },
        { value: 2, label: "広く" },
      ],
    },
    {
      id: "mode",
      title: "どのくらい詳しく確認しますか？",
      options: [
        { value: "quick", label: "約3分" },
        { value: "detailed", label: "もう少し詳しく（5〜10分）" },
      ],
    },
  ];
  const currentIntro =
    introQuestions[Math.min(introStep, introQuestions.length - 1)];
  useEffect(() => {
    setIntroStep(0);
    setIntroAnswers(initialIntro);
    setChooseLanguage(false);
  }, [locale]);
  async function request(path: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      setData(
        await api<Assessment>(path, {
          method: "POST",
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const readingGate = !data && japanese && introStep === 0;
  return (
    <div className="preference-test">
      <p className="eyebrow">
        {readingGate
          ? "よみやすさの かくにん"
          : t("表示の好みと、読みやすさの比較")}
      </p>
      <h1>
        {readingGate
          ? "あなたに あう ひょうじを みつけます"
          : t("あなたに合う表示を見つけます")}
      </h1>
      {!readingGate && (
        <p className="muted">
          {t(
            "画面の中の仮想問題です。実際の作業は行いません。途中で終えても、設定は自分で調整できます。",
          )}
        </p>
      )}
      {chooseLanguage && !data ? (
        <Card>
          <h2>Choose a language / よめる ことばを えらんでください</h2>
          <div
            className="choice-grid"
            role="group"
            aria-label="Choose a language"
          >
            <button className="choice" onClick={() => setLocale("en")}>
              English
            </button>
            <button className="choice" onClick={() => setLocale("zh")}>
              中文
            </button>
            <button className="choice" onClick={() => setLocale("vi")}>
              Tiếng Việt
            </button>
          </div>
          <Button
            className="secondary"
            onClick={() => setChooseLanguage(false)}
          >
            もどる
          </Button>
        </Card>
      ) : (
        !data && (
          <Card>
            <p className="eyebrow">
              {introStep + 1} / {introQuestions.length}
            </p>
            <h2>{t(currentIntro.title)}</h2>
            <div
              className="choice-grid"
              role="group"
              aria-label={t(currentIntro.title)}
            >
              {currentIntro.options.map((option) => (
                <button
                  className="choice"
                  key={String(option.value)}
                  disabled={busy}
                  onClick={() => {
                    if (
                      currentIntro.id === "japanese_reading" &&
                      option.value === "kana"
                    ) {
                      setLocale("ja-easy");
                      return;
                    }
                    if (
                      currentIntro.id === "japanese_reading" &&
                      option.value === "none"
                    ) {
                      setChooseLanguage(true);
                      return;
                    }
                    const next = {
                      ...introAnswers,
                      [currentIntro.id]: option.value,
                    } as IntroAnswers;
                    setIntroAnswers(next);
                    if (introStep < introQuestions.length - 1) {
                      setIntroStep(introStep + 1);
                    } else {
                      void request("/assessments", {
                        mode: next.mode,
                        preferences: {
                          language: locale,
                          japanese_reading:
                            locale === "ja"
                              ? next.japanese_reading
                              : locale === "ja-easy"
                                ? "kana"
                                : "none",
                          japanese_frequency: "not_asked",
                          short: next.short,
                          visual: next.visual,
                          furigana: locale === "ja" ? next.furigana : false,
                          font_scale: next.font_scale,
                          line_spacing: next.line_spacing,
                        },
                      });
                    }
                  }}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>
            {introStep > 0 && (
              <Button
                className="secondary"
                disabled={busy}
                onClick={() => setIntroStep(introStep - 1)}
              >
                {t("戻る")}
              </Button>
            )}
          </Card>
        )
      )}
      {data?.question && (
        <>
          <p aria-live="polite">
            {data.answered + 1}
            {t("問目 ・ 必要な情報が集まると終了します")}
          </p>
          <QuestionCard
            key={data.answered}
            q={data.question}
            busy={busy}
            onAnswer={(answer) =>
              request(`/assessments/${data.id}/answers`, answer)
            }
          />
          <Button
            className="secondary"
            disabled={busy}
            onClick={() => request(`/assessments/${data.id}/finish`)}
          >
            {t("ここまでで表示を提案")}
          </Button>
        </>
      )}
      {data?.result && (
        <Card>
          <h2>{t("あなたに合いそうな表示")}</h2>
          <ul className="recommendations">
            {data.result.recommendations.map((r) => (
              <li key={r}>✓ {t(r)}</li>
            ))}
          </ul>
          <p className="muted">{t(data.result.limitations)}</p>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const p = await api<Profile>(`/assessments/${data.id}/apply`, {
                  method: "POST",
                });
                onApply(p);
                navigate("/app/profile");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("この設定で使う")}
          </Button>
          <Link
            className="button secondary"
            to="/app/profile"
            state={{ recommended: data.result.profile }}
          >
            {t("自分で調整する")}
          </Link>
          <Button className="secondary" onClick={() => setData(null)}>
            {t("もう少し詳しく調べる")}
          </Button>
        </Card>
      )}
      {error && <Alert danger>{error}</Alert>}
      <p className="muted">
        {t("医学的な診断や能力の順位付けには使いません。")}
      </p>
    </div>
  );
}
function QuestionCard({
  q,
  busy,
  onAnswer,
}: {
  q: Question;
  busy: boolean;
  onAnswer: (a: unknown) => void;
}) {
  const { t } = useLocale();
  const [order, setOrder] = useState<number[]>([]);
  const [recall, setRecall] = useState(!q.memory_seconds);
  const clock = useRef({
    start: performance.now(),
    shown: new Date().toISOString(),
    interrupted: false,
  });
  useEffect(() => {
    const timer = q.memory_seconds
      ? window.setTimeout(() => setRecall(true), q.memory_seconds * 1000)
      : undefined;
    const visibility = () => {
      if (document.hidden) clock.current.interrupted = true;
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [q.memory_seconds]);
  function submit(answer: number | number[], skipped = false) {
    onAnswer({
      question_id: q.id,
      answer,
      skipped,
      shown_at: clock.current.shown,
      response_time_ms: Math.min(
        3600000,
        Math.round(performance.now() - clock.current.start),
      ),
      interrupted: clock.current.interrupted,
    });
  }
  return (
    <Card>
      <p className="muted">
        {t("読めないときや、わからないときは、飛ばしても大丈夫です。")}
      </p>
      {q.language === "ja" && (
        <p className="muted">
          {t("日本語の読解問題です。読めない場合は飛ばせます。")}
        </p>
      )}
      <h2
        className={q.format === "highlight" ? "assessment-warning" : ""}
        style={{ whiteSpace: "pre-line" }}
      >
        {q.memory_seconds && recall ? q.recall : q.prompt}
      </h2>
      {q.diagram && (
        <svg
          viewBox="0 0 360 120"
          role="img"
          aria-label={t("机の左に赤い箱、右に青い箱")}
          className="assessment-diagram"
        >
          <rect x="10" y="20" width="340" height="85" rx="8" fill="#e3edf1" />
          <rect x="40" y="35" width="70" height="45" fill="#a42b36" />
          <rect x="250" y="35" width="70" height="45" fill="#176aaf" />
          <text x="48" y="65" fill="white">
            {t("赤い箱")}
          </text>
          <text x="258" y="65" fill="white">
            {t("青い箱")}
          </text>
          <text x="55" y="100">
            {t("左")}
          </text>
          <text x="270" y="100">
            {t("右")}
          </text>
        </svg>
      )}
      {!recall && (
        <p role="status">
          {t("数秒後に説明を隠します。ゆっくり確認してください。")}
        </p>
      )}
      {recall && (
        <div className="choice-grid">
          {q.choices.map((choice, i) => (
            <button
              className="choice"
              key={i}
              disabled={busy || order.includes(i)}
              onClick={() =>
                q.question_type === "sequence"
                  ? setOrder([...order, i])
                  : submit(i)
              }
            >
              {choice}
            </button>
          ))}
        </div>
      )}
      {q.question_type === "sequence" && (
        <>
          <ol aria-label={t("選んだ順序")}>
            {order.map((i) => (
              <li key={i}>{q.choices[i]}</li>
            ))}
          </ol>
          <Button
            disabled={busy || order.length !== q.choices.length}
            onClick={() => submit(order)}
          >
            {t("この順序で進む")}
          </Button>
          <Button className="secondary" onClick={() => setOrder([])}>
            {t("並べ直す")}
          </Button>
        </>
      )}
      <Button
        disabled={busy}
        className="secondary"
        onClick={() => submit(0, true)}
      >
        {t("読めない・わからない／飛ばす")}
      </Button>
      {!(q.memory_seconds && recall) && (
        <Button
          className="secondary"
          onClick={() => {
            if (!("speechSynthesis" in window)) return;
            const utterance = new SpeechSynthesisUtterance(q.prompt);
            utterance.lang =
              q.language === "ja-easy" ? "ja" : q.language || "ja";
            speechSynthesis.cancel();
            speechSynthesis.speak(utterance);
          }}
        >
          {t("読み上げる")}
        </Button>
      )}
    </Card>
  );
}
type DebugSession = {
  id: string;
  created_at: string;
  selection_reason: string;
  skills: Record<
    string,
    {
      estimate: number;
      confidence: number;
      samples: number;
      average_response_time_ms: number;
    }
  >;
  result?: {
    recommendations: string[];
  };
  history: {
    question: Question & {
      skill_tags: string[];
      difficulty: number;
    };
    answer: number | number[];
    correct: boolean;
    response_time_ms: number;
    selection_reason: string;
    posterior: {
      estimate: number;
      confidence: number;
    };
  }[];
};
export function AssessmentDebug() {
  const { id } = useParams();
  const [data, setData] = useState<{
    labels: Record<string, string>;
    sessions: DebugSession[];
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{
      labels: Record<string, string>;
      sessions: DebugSession[];
    }>(`/admin/assessments/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);
  return (
    <>
      <h1>表示チェックの記録</h1>
      <p>
        この利用者の表示設定を確認するための暫定推定です。確信度は事前分布からの分散減少で、正しさの確率ではありません。
      </p>
      <Link to="/admin/question-bank">問題バンクを確認</Link>
      {error && <Alert danger>{error}</Alert>}
      {data?.sessions.length === 0 && (
        <Card>チェックの記録はまだありません。</Card>
      )}
      {data?.sessions.map((s) => (
        <Card key={s.id}>
          <h2>{new Date(s.created_at).toLocaleString("ja-JP")}</h2>
          <p>{s.result?.recommendations.join(" ・ ") || "チェック中"}</p>
          <div className="assessment-table">
            <table>
              <thead>
                <tr>
                  <th>項目</th>
                  <th>推定値</th>
                  <th>確信度</th>
                  <th>回答数</th>
                  <th>平均時間</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(s.skills).map(([k, v]) => (
                  <tr key={k}>
                    <th>{data.labels[k]}</th>
                    <td>{v.estimate.toFixed(2)}</td>
                    <td>{v.confidence.toFixed(2)}</td>
                    <td>{v.samples}</td>
                    <td>{(v.average_response_time_ms / 1000).toFixed(1)}秒</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>回答ごとの更新</h3>
          <AssessmentTimeline history={s.history} labels={data.labels} />
          <ol>
            {s.history.map((a, i) => (
              <li key={i}>
                <details>
                  <summary>
                    {i + 1}. {data.labels[a.question.skill_tags[0]]} ・{" "}
                    {a.correct ? "一致" : "追加の表示支援を検討"}
                  </summary>
                  <p>{a.question.prompt}</p>
                  <p>
                    選択：{JSON.stringify(a.answer)} / 難易度{" "}
                    {a.question.difficulty} /{" "}
                    {(a.response_time_ms / 1000).toFixed(1)}秒
                  </p>
                  <p>{a.selection_reason}</p>
                  <label>
                    推定値{" "}
                    <meter min="0" max="1" value={a.posterior.estimate} />
                  </label>
                  <label>
                    確信度{" "}
                    <meter min="0" max="1" value={a.posterior.confidence} />
                  </label>
                </details>
              </li>
            ))}
          </ol>
        </Card>
      ))}
    </>
  );
}
function AssessmentTimeline({
  history,
  labels,
}: {
  history: DebugSession["history"];
  labels: Record<string, string>;
}) {
  const [skill, setSkill] = useState("kanji_reading");
  const points = history
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.question.skill_tags.includes(skill));
  const coordinates = (key: "estimate" | "confidence") =>
    points
      .map(
        ({ a, i }) =>
          `${30 + (i * 420) / Math.max(1, history.length - 1)},${135 - a.posterior[key] * 110}`,
      )
      .join(" ");
  return (
    <div>
      <label>
        グラフの項目
        <select value={skill} onChange={(e) => setSkill(e.target.value)}>
          {Object.entries(labels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <svg
        className="assessment-diagram"
        viewBox="0 0 480 175"
        role="img"
        aria-label={`${labels[skill]}の回答ごとの推定値と確信度。詳細は下の回答履歴に記載。`}
      >
        <path d="M30 20V135H455" fill="none" stroke="currentColor" />
        <text x="5" y="25" fill="currentColor">
          1
        </text>
        <text x="5" y="135" fill="currentColor">
          0
        </text>
        <polyline
          points={coordinates("estimate")}
          stroke="#167e88"
          strokeWidth="3"
          fill="none"
        />
        <polyline
          points={coordinates("confidence")}
          stroke="#ad5600"
          strokeWidth="3"
          strokeDasharray="5 3"
          fill="none"
        />
        {points.map(({ a, i }) => (
          <circle
            key={i}
            cx={30 + (i * 420) / Math.max(1, history.length - 1)}
            cy={135 - a.posterior.estimate * 110}
            r="4"
            fill="#167e88"
          />
        ))}
        <text x="35" y="162" fill="currentColor">
          実線：推定値 / 点線：確信度 / 横軸：回答順
        </text>
      </svg>
    </div>
  );
}
export function QuestionBank() {
  type Q = Question & {
    version: number;
    correct_answer: number | number[];
    explanation: string;
    human_review: unknown;
  };
  const [data, setData] = useState<Q[]>([]);
  const [error, setError] = useState("");
  const load = () =>
    api<Q[]>("/admin/question-bank")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <h1>問題バンクの確認</h1>
      <p>
        初期問題は機械検証済みのPoC例題です。内容・正解・曖昧さを人間が確認した記録を残せます。実測による難易度校正はまだ行っていません。
      </p>
      {error && <Alert danger>{error}</Alert>}
      {data.map((q) => (
        <Card key={q.id}>
          <h2>
            {q.id} v{q.version}
          </h2>
          <p>{q.prompt}</p>
          <ol start={0}>
            {q.choices.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
          <p>
            正解：{JSON.stringify(q.correct_answer)} / {q.explanation}
          </p>
          {q.human_review ? (
            <p>確認済み</p>
          ) : (
            <Button
              onClick={async () => {
                try {
                  await api(`/admin/question-bank/${q.id}/review`, {
                    method: "POST",
                  });
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              内容と正解を確認済みとして記録
            </Button>
          )}
        </Card>
      ))}
    </>
  );
}
