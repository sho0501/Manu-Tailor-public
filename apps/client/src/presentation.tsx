import { useLocale } from "./i18n";
import { useEffect, useState } from "react";
import type { Profile } from "./types";
import { api } from "./api";
import { Button } from "./ui";
const READINGS: Record<string, string> = {
  確認: "かくにん",
  電源: "でんげん",
  原稿: "げんこう",
  用紙: "ようし",
  部数: "ぶすう",
  回収: "かいしゅう",
  作業: "さぎょう",
  注意: "ちゅうい",
  禁止: "きんし",
  装置: "そうち",
  使用: "しよう",
  安全: "あんぜん",
  保護: "ほご",
  右側: "みぎがわ",
  左側: "ひだりがわ",
  設定: "せってい",
  荷物: "にもつ",
  確実: "かくじつ",
  最大: "さいだい",
  積載: "せきさい",
  移動: "いどう",
};
const pattern = new RegExp(
  `(${Object.keys(READINGS)
    .sort((a, b) => b.length - a.length)
    .join("|")})`,
  "g",
);
export function PresentationText({
  text,
  profile,
}: {
  text: string;
  profile: Profile;
}) {
  const ruby = profile.use_furigana || profile.furigana;
  const lines = profile.use_bullets ? text.split("\n").filter(Boolean) : [text];
  return (
    <>
      {lines.map((line, n) => (
        <span
          key={n}
          className={lines.length > 1 ? "presentation-bullet" : undefined}
        >
          {line.split(pattern).map((part, i) =>
            ruby && READINGS[part] ? (
              <ruby key={i}>
                {part}
                <rt>{READINGS[part]}</rt>
              </ruby>
            ) : (
              part
            ),
          )}
        </span>
      ))}
      {profile.rewrite_negation_when_safe &&
        text.trim() === "電源を切らないでください。" && (
          <span className="negation-aid">
            確認の補助：電源はそのままにしてください。
          </span>
        )}
    </>
  );
}
export function recordPresentationEvent(
  profile: Profile,
  kind: string,
  value = 1,
) {
  if (profile.telemetry_consent)
    void api("/presentation-events", {
      method: "POST",
      body: JSON.stringify({ kind, value }),
    }).catch(() => {});
}
export function PresentationSettings({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (p: Profile) => void;
}) {
  const { t } = useLocale();
  const [suggestions, setSuggestions] = useState<
    {
      message: string;
      profile_patch: Partial<Profile>;
    }[]
  >([]);
  useEffect(() => {
    if (profile.telemetry_consent)
      void api<typeof suggestions>("/presentation-suggestions")
        .then(setSuggestions)
        .catch(() => {});
  }, [profile.telemetry_consent]);
  return (
    <section>
      <h3>{t("表示の細かい設定")}</h3>
      <label>
        <input
          type="checkbox"
          checked={profile.prefer_images ?? true}
          onChange={(e) =>
            onChange({ ...profile, prefer_images: e.target.checked })
          }
        />
        {t("画像を文章より先に表示")}
      </label>
      <label>
        <input
          type="checkbox"
          checked={!!profile.use_bullets}
          onChange={(e) =>
            onChange({ ...profile, use_bullets: e.target.checked })
          }
        />
        {t("改行した文章を箇条書きで表示")}
      </label>
      <label>
        <input
          type="checkbox"
          checked={profile.highlight_warnings ?? true}
          onChange={(e) =>
            onChange({ ...profile, highlight_warnings: e.target.checked })
          }
        />
        {t("注意事項を大きく強調")}
      </label>
      <label>
        {t("1画面の手順数")}
        <select
          value={profile.steps_per_screen || 1}
          onChange={(e) =>
            onChange({ ...profile, steps_per_screen: Number(e.target.value) })
          }
        >
          <option value="1">{t("1手順")}</option>
          <option value="2">{t("2手順")}</option>
          <option value="3">{t("3手順")}</option>
        </select>
      </label>
      <label>
        {t("行間")}
        <select
          value={profile.line_spacing || 1.7}
          onChange={(e) =>
            onChange({ ...profile, line_spacing: Number(e.target.value) })
          }
        >
          <option value="1.5">{t("標準")}</option>
          <option value="1.7">{t("少し広く")}</option>
          <option value="2">{t("広く")}</option>
        </select>
      </label>
      <label>
        {t("文章の折り返し目安")}
        <select
          value={profile.max_sentence_chars || 40}
          onChange={(e) =>
            onChange({ ...profile, max_sentence_chars: Number(e.target.value) })
          }
        >
          <option value="28">{t("短め（28文字）")}</option>
          <option value="40">{t("標準（40文字）")}</option>
          <option value="70">{t("長め（70文字）")}</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={!!(profile.use_furigana || profile.furigana)}
          onChange={(e) =>
            onChange({
              ...profile,
              use_furigana: e.target.checked,
              furigana: e.target.checked,
            })
          }
        />
        {t("ふりがな（対応する業務用語）")}
      </label>
      <label>
        <input
          type="checkbox"
          checked={!!profile.rewrite_negation_when_safe}
          onChange={(e) =>
            onChange({
              ...profile,
              rewrite_negation_when_safe: e.target.checked,
            })
          }
        />
        {t("検証済みの否定表現に補助説明を表示")}
      </label>
      <label>
        <input
          type="checkbox"
          checked={!!profile.telemetry_consent}
          onChange={(e) =>
            onChange({ ...profile, telemetry_consent: e.target.checked })
          }
        />
        {t("表示改善のため、戻る・原文確認・文字サイズ変更を記録する")}
      </label>
      <p className="muted">
        {t(
          "記録は本人の操作のみ、直近500件まで。提案を選んでも、設定を保存するまでは反映されません。",
        )}
      </p>
      {profile.telemetry_consent &&
        suggestions.map((s) => (
          <div key={s.message}>
            <p>{s.message}</p>
            <Button
              className="secondary"
              onClick={() => onChange({ ...profile, ...s.profile_patch })}
            >
              {t("提案を設定に取り込む")}
            </Button>
          </div>
        ))}
    </section>
  );
}
