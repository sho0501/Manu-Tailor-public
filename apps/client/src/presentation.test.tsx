import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PresentationText } from "./presentation";
import type { Profile } from "./types";

describe("presentation preserves original instructions", () => {
  it("adds known ruby and bullets while retaining quantities", () => {
    const profile = { use_furigana: true, use_bullets: true } as Profile;
    const html = renderToStaticMarkup(
      <PresentationText text={"電源を確認。\n10kgまで。"} profile={profile} />,
    );
    expect(html).toContain("<ruby>電源<rt>でんげん</rt></ruby>");
    expect(html).toContain("10kgまで。");
    expect(html).toContain("presentation-bullet");
  });
  it("only adds affirmative aid to the exact verified prohibition", () => {
    const profile = { rewrite_negation_when_safe: true } as Profile;
    const exact = renderToStaticMarkup(
      <PresentationText text="電源を切らないでください。" profile={profile} />,
    );
    expect(exact).toContain("電源を切らないでください。");
    expect(exact).toContain("電源はそのままにしてください。");
    const conditional = renderToStaticMarkup(
      <PresentationText
        text="作業中は電源を切らないでください。"
        profile={profile}
      />,
    );
    expect(conditional).not.toContain("negation-aid");
  });
});
