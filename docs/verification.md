# 検証記録

2026-09-29 / Windows / Node.js 22.23.2 / Python 3.13.3。

## ローカル

| 確認 | 結果 |
|---|---|
| Backend pytest | 15 passed |
| Backend Ruff / mypy | PASS |
| Frontend unit tests | 3 passed |
| Frontend lint / typecheck / production build | PASS |
| Playwright Chromium E2E | 10 passed |
| setup / start / stop | PASS。起動時API healthとWeb HTTP 200を確認 |
| Git追跡ファイル | 秘密情報・DB・uploads・cache・ビルド出力の除外を確認 |

## E2Eで確認した操作

1. 管理者ログイン、原文登録、利用者指定、個別生成、検品、比較、承認、公開。
2. 利用者側のService Workerメッセージ受信、通知一覧から対象手順へ移動。
3. 実Service Worker上でNotificationを生成し、notificationclickイベントから該当URLへ遷移。
4. 次へ・戻る・進捗保存・原文Bottom Sheet・オフライン再読み込み。
5. 利用者作成、そのアカウントでのログイン、8問の好みチェック、表示設定保存。
6. 390×844、360×800、768×1024、1440×900。横スクロールなし。管理者360pxも確認。
7. Safety Modeのオフライン進行禁止。
8. 未ログインで開いたマニュアルDeep Linkがログイン後も保持されること。

通知クリックはOS画面の手動クリックではなく、実Service Workerに作成済みNotificationを渡したイベントで検証しています。通常のheadless shellは通知許可を拒否するため、Playwrightの `channel: chromium` を使っています。

## バックエンドの安全検査

- 10kg→100kg、mm→cm、固有語変更、禁止の反転をCRITICALとして検出。
- 必須保護メガネの手順欠落をCRITICALとして検出。
- 8手順→7手順、順序変更、原文ID不明、画像欠落を検出。
- 検品LLMが誤って合格を返しても、決定論的検証の失敗を優先。
- 不一致が続く場合に3回で停止し、承認・公開APIが409を返すことを確認。
- 利用者が管理者APIや未公開結果へアクセスできないことを確認。
- PDFテキストレイヤーではOCRを呼ばない。画像未OCR時に画像を保持。DOCX表とMarkdown見出しを保持。
- OpenAI互換アダプターはMockTransportでHTTPペイロードと生成・検品モデル/プロンプトの独立性を検証。

## GitHub Actions

PRIVATE `sho0501/Manu-Tailor` のmainへpush。CI（LinuxのBackend/FrontendとWindows setup）、Web、Android debug APK、macOS iOS Simulatorの成功を確認しています。各実行はGitHub Actionsの履歴とArtifactsで確認できます。

署名Secretsは未登録です。実機用IPAおよび署名付きAndroid release APKは未生成です。iOS Simulatorの成果物を実機IPAとして扱いません。

## 実環境で未検証の範囲

実LLMへの有料API通信、実FCM/APNs/VAPID配送、iOS/Android実機インストール、Appleコード署名。資格情報なしのPoCではMockを使用しています。OCRの自動読取はTesseractを別途導入した環境に依存します。


## 2026-09-29 適応型アセスメント追加

- Backend: 24テスト。難易度付きベイズ更新、回答速度を能力値へ使わないこと、形式比較、初期難易度とふりがな分岐、確信度と領域カバレッジによる終了、有限回生成とValidator拒否、合成A〜Dの表示差、同意付き小規模モデル学習、API所有権・正答非公開・重複回答・明示適用・閲覧監査・操作記録の同意を追加。
- Frontend: 5単体テスト。ふりがな／箇条書きでも数値と原文を残すこと、完全一致の否定文だけ補助を出すことを追加。
- E2E: 13テスト。漢字難易度上昇、誤答後のふりがな、文章と図の比較、長短文の正誤・時間差、確信度による早期終了、管理者記録、詳細モードの記憶課題と並べ替え、全領域の確認、A/Bの実マニュアル表示差を追加。
- ruff / mypy / eslint / tsc / Vite buildを確認。DB変更は追加テーブルのみで、既存データは削除していません。
- 人間による全例題レビュー、実利用者による難易度校正、実LLMによる質問候補生成は未検証。ロジスティック回帰は合成データで学習処理をテストしたのみで、実データ学習済みモデルは配布していません。
