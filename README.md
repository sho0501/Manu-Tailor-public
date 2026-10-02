# Manu-Tailor

**同じ手順を、一人ひとりの読みやすい形へ。**

PDF・画像・Word・テキストから原文を取り込み、情報表示の好みに合わせて個別化するWindows向けPoCです。生成・検品・管理者承認・公開・通知・原文確認まで動作します。医療的な診断は行いません。

このリポジトリは高専プロコンのソースコード閲覧用です。起動と操作の概要は以下に、構成と設計理由は [architecture.md](architecture.md) に、検証内容は [docs/verification.md](docs/verification.md) に記載しています。実行時に作成されるデータベース、取り込んだ原文、APIキーは含めていません。操作マニュアルPDFは大会の提出先へ別途提出してください。

## 最短で起動

必要環境：Windows、Python 3.11以降（検証は3.13）、Node.js 22以降、pnpm。uvがあれば使用し、なければvenv/pipを使用します。DockerやAndroid Studioは通常の開発に不要です。

1. このリポジトリを取得し、ルートの `setup.bat` を実行します。初回はネットワーク接続が必要です。
2. 同じ場所の `start.bat` を実行します。ブラウザが開きます。
3. 停止は `stop.bat` を実行します。

| 用途 | URL |
|---|---|
| ログイン | http://127.0.0.1:5173/login |
| 現場ホーム | http://127.0.0.1:5173/app |
| 管理者 | http://127.0.0.1:5173/admin |
| API仕様 | http://127.0.0.1:8000/docs |
| ヘルスチェック | http://127.0.0.1:8000/api/health |

ポート8000・5173が使用中の場合は起動を中断し、理由を表示します。既存のプロセスを無断で停止しません。

### iPhoneから同じLANのPCに接続する

PCとiPhoneを同じ信頼できるネットワークに接続し、PCで `start-lan.bat` を実行します。この起動方法ではAPIのポート8000をLANへ公開します。iPhone版の「接続先サーバー」に `http://<PCのLAN内IPアドレス>:8000` を入力します。`/api` は付けません。通常の `start.bat` はPC内からの接続だけを受け付けます。

iPhoneで表示されるローカルネットワークへのアクセス許可を承認してください。PCのファイアウォールが通信を止める場合は、管理者としてPowerShellを開き、`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/allow-lan-firewall.ps1` を一度実行します。TCP 8000だけをローカルサブネットから許可します。デモの初期パスワードを使用するため、共有・公衆ネットワークではこの方法で起動しないでください。別ネットワークからの利用にはHTTPSサーバーが必要です。

iOSビルドでは、`API_BASE_URL` 変数で接続先の初期サーバーを指定できます。アプリの「サーバーの詳細設定」で名前とURLを編集し、ほかのサーバーを追加・切替できます。切替時は前のサーバーのログイン状態と端末内の保存済みマニュアルを消し、再ログインします。PCのIPアドレスが変わった場合も、この画面でURLを更新してください。

管理者は「フォルダとカテゴリー」でフォルダを作り、その中にカテゴリーを作れます。登録時またはマニュアル詳細で仕分けると、利用者の一覧もフォルダ → カテゴリー → マニュアルの順に表示します。「AIで自動仕分け」は管理画面で指定した生成モデルにタイトルと原文の一部を送り、既存の分類を選ぶか新しい分類を提案させます。モデル未設定・接続失敗時は分類を変えず、管理者にエラーを表示します。

取説を登録するときに「取説を内容別のマニュアルに自動分割する」を選ぶと、PDFなどから先に文章と図を抽出し、設定済みの生成AIが製品フォルダ・作業カテゴリー・個別マニュアルを提案します。たとえば電子レンジ取説を「電子レンジ → 調理方法 → スチームレンジの使い方」と「電子レンジ → お手入れ → 庫内の掃除」に分けます。原文の手順IDをすべて一度ずつ使う提案のみ一括保存し、図は該当マニュアルに割り当てます。各マニュアルから従来どおり利用者向けの個別生成と検品を行います。分割後の利用者には取説全体の原本ファイルを公開せず、担当マニュアルに含まれる手順と図だけを表示します。

PDFやWordから取り出した図にはページタグを付けます。管理者はマニュアル詳細でタグを編集し、割合で切り抜き範囲を指定できます。編集は新しい原文バージョンとして保存され、過去の公開版は変わりません。生成したマニュアルにも対応する図とタグを保持します。

### デモアカウント

全アカウントの初期パスワード：`manutailor-demo`。初回DB作成時のみサンプルを投入します。

| ユーザー名 | 用途 |
|---|---|
| admin | 管理者 |
| demo | 大きな文字・短文 |
| visual | 図を先に表示 |
| detail | 細かい手順分割 |
| text | 文章中心 |

サンプルは「コピー機でA4資料をコピーする」と安全性重視の「台車に荷物を載せる」です。サンプル公開には `demo_seed_published` の監査履歴が残ります。実運用の認証・アカウント管理を備えたサービスとしてインターネットへ公開する前に、デモアカウントの廃止・HTTPS・運用認証・バックアップを整備してください。

## 通知デモ

別々のブラウザプロファイルまたは通常窓とプライベート窓を使います。

1. 利用者 `demo` でログインし、必要に応じて表示の好みを8問で設定。
2. 別窓で `admin` にログインし、標準マニュアルを登録。
3. 「青木 はる」を選び「個別変換と検品を開始」。
4. 検品画面の「原文と比較」と検査項目を確認し、「承認する」→「公開する」。
5. 利用者に「新しいマニュアルが届きました」と表示。
6. 通知を選択して対象の手順へ。「次へ」「戻る」「原文を確認」を試す。

Mock通知はアプリ起動中に4秒間隔で受信し、WebではService Workerへメッセージを渡します。通知許可がある場合はOS通知も表示します。アプリを閉じている間の配送にはWeb Push/FCM/APNsの資格情報が必要です。通知一覧はSQLiteに残ります。

## 技術とフォルダー

```text
apps/backend/          FastAPI・SQLite・生成A・独立検品B・通知Provider
apps/client/           React 19・TypeScript・Vite・Capacitor 8・PWA
packages/ui/           デザイントークン（基本部品はclient/src/ui.tsx）
tests/e2e/             Playwright
scripts/               Windows起動・ネイティブ設定・iOS署名
.github/workflows/     CI、Web、Android、iOS、Release
docs/                  要件、検証記録
database/              SQLite（Git対象外）
uploads/               原文ファイル・抽出画像（Git対象外）
logs/                  app.log / generation.log / consistency.log
cache/ temp/ models/ output/ .venv/  ローカル実行データ（Git対象外）
```

管理者も同一Viteアプリ内の `/admin` に分離しました。現場UIはWeb/PWA/Android/iOSで共有します。SQLiteのJSONカラムに原文セクション・生成ブロック・プロフィール・検品結果を保存し、各ブロックは安定した原文IDを持ちます。設計理由は [architecture.md](architecture.md) を参照してください。

## 原文・生成・検品

- 対応形式：PDF、PNG/JPEG、UTF-8/CP932のTXT/Markdown、DOCX。上限20MB、PDF100ページ。
- PDFはテキストレイヤーを優先します。埋め込み画像を保持し、テキストがないページのみOCRを試します。
- Tesseractと `jpn+eng` がPATH上にあればOCRを利用します。未導入でも画像を保存し、管理者が文章を入力できます。原文未抽出の画像だけでは個別生成を許可しません。
- 見出し、行単位の手順、注意文、画像ID、ページ、ブロック番号を保持。DOCXの表はセルを区切った文字列として保存。
- 生成Aはプロフィールと原文から変換し、各ブロックに理由と原文IDを付与。
- 検品Bは独立して、数字・単位・型番/引用語/URL・否定・警告・順序・画像・原文対応を検証。文字bigramの類似度を補助にし、別の意味検品Providerも使用します。
- 原文にない手順、欠落、数値変更等の失敗時は最大3回まで再生成。失敗のまま承認・公開することはできません。
- `DRAFT → VALIDATING → NEEDS_REVIEW → APPROVED → PUBLISHED`。本PoCでは通常モードも手動承認します。
- 原文更新は新しい版として保存。以前の生成結果に混ぜず、旧版表示と公開制限を行います。
- 生成時のプロフィール、モデル、原文版、検査、操作者、承認者を追跡できます。

Mockは原文の内容を保った文分割・表示変更です。LLMによる「やさしい日本語化」を実行したと装いません。Mock検品の第3層は原文同等性比較であり、LLM意味検証ではありません。

## AI API設定

`.env.example` を `.env` としてコピーします。`.env` はGitへ追加されません。

```dotenv
GENERATION_PROVIDER=openai_compatible
GENERATION_BASE_URL=http://127.0.0.1:8080/v1
GENERATION_MODEL=your-generation-model
GENERATION_API_KEY=
VALIDATION_PROVIDER=openai_compatible
VALIDATION_BASE_URL=http://127.0.0.1:8080/v1
VALIDATION_MODEL=your-review-model
VALIDATION_API_KEY=
GEMINI_API_KEY=
```

llama.cpp等のOpenAI互換サーバーにも上記URLを指定できます。`/chat/completions` とJSONオブジェクト形式を使用します。APIキーは `.env` または管理画面の「設定」→「AI設定・監査」で登録できます。登録済みキーの値は画面やログに表示されません。管理画面で保存した設定が環境変数より優先されます。

生成と検品に同じモデルを指定することもできます。Geminiを使う場合は `.env` に `GEMINI_API_KEY` を設定するか、管理画面で生成用・検品用のキーを登録します。モデル名は利用可能なものを指定してください。キーはGitHubに保存されません。AnthropicはOpenAI互換ゲートウェイを使用する構成です。

Groqを使う場合は両方の Base URL を `https://api.groq.com/openai/v1` にし、Groqアカウントで利用できるモデル名を設定します。APIキーは `.env` の `GENERATION_API_KEY` と `VALIDATION_API_KEY` だけに入れます。UI翻訳や出題文の静的翻訳は `scripts/generate-locales.py` で作成済みなので、通常の表示チェックにキーは不要です。

## 表示チェックの言語

ログイン前から言語名をその言語の表記で示します。日本語、ひらがな中心の日本語、English、中文、Tiếng Việtを選べます。ブラウザの言語を初期値に使い、選択を端末に保存します。開始前の好みは1画面1問で選択します。日本語の最初の読み方の質問・選択肢はひらがなだけで表示し、「ひらがなは読める」なら以降をやさしい日本語へ切り替えます。「日本語は読めない」なら読める言語名を選んでもらいます。日本語以外では日本語の読みや使用頻度を尋ねません。希望言語の仮想問題を出し、日本語読解力は「未測定」のままにします。問題は飛ばせ、飛ばした回答を誤答として推定しません。管理画面では元の問題、選択理由、翻訳の暫定状態を確認できます。

多言語の問題文はGroqで翻訳し、選択肢の順番・数値・否定・正解の保持を機械検査と別のモデル呼び出しで確認しました。実利用者による校正は未実施です。標準マニュアル本文の自動翻訳は検品済みとみなさず、別言語の現場利用には管理者による翻訳と承認が必要です。

## 通知とDeep Link

`NotificationProvider` はサーバーとクライアントの双方にあり、Mock/Web Push/Android FCM/iOS APNsを分離しています。

| 方式 | 必要な設定 |
|---|---|
| Mock | なし。アプリ内通知とService Workerデモ |
| Web Push | VAPID_PUBLIC_KEY、VAPID_PRIVATE_KEY、VAPID_SUBJECT。HTTPSまたはlocalhost |
| Android FCM | サーバーのFCM_SERVICE_ACCOUNT_FILE。ビルド時GOOGLE_SERVICES_JSON_BASE64 |
| iOS APNs | APNS_KEY_FILE、APNS_KEY_ID、APNS_TEAM_ID、APNS_BUNDLE_ID、APNS_SANDBOX。Push対応Provisioning Profile |

資格情報ファイルは `secrets/` またはGit管理外に保存します。送信失敗時も通知一覧は保持します。送信エラーの種別のみログへ出力し、Push購読エンドポイントやトークンはログへ出しません。

Webの直接リンクは `/app/manual/:generationId`。ネイティブは `manutailor://open/app/manual/:generationId`。HTTPSのUniversal Links/App Linksには運用ドメインの関連付けファイルを別途配置する必要があります。

## オフラインと表示設定

- PWAのmanifest、Service Worker、ビルド済みJS/CSSの事前キャッシュを実装。
- 開いたマニュアル、原文、画像は利用者ID別にIndexedDBへ保存。ログアウトで削除。
- 通常モードは保存済みマニュアルを表示し、最新版でない可能性を明示。
- Safety Modeはオフライン/旧版の「次へ」を禁止し、各ステップの移動前にもサーバーで最新版を確認。
- 字の大きさ、短文/通常、情報量、図の好み、コントラスト、ライト/ダーク、読み上げ速度を設定。
- SpeechSynthesisで再生・停止・一時停止/再開。利用可能な音声は端末に依存。
- 文章内容や分割を変えるプロフィール設定は、管理者による次の個別生成で反映。文字サイズ等の表示設定は閲覧時にも変更できます。

## Android・iOS・Web配布

この公開リポジトリのActionsの実行ページからArtifactsを取得できます。署名などの資格情報が未設定の場合、一部のネイティブ成果物は生成されません。

| Workflow | 成果物 |
|---|---|
| CI | Python lint/typecheck/pytest、pnpm lint/typecheck/unit/build、Playwright、Windows setup |
| Web PWA | `Manu-Tailor-web`（distのZIP） |
| Android APK | `Manu-Tailor-android-debug.apk`。資格情報があればrelease APKも生成 |
| iOS build | `Manu-Tailor-ios-simulator`。署名時のみ `Manu-Tailor-ios.ipa` |
| Release builds | `v*`タグまたは手動実行で各ビルドをまとめて実行 |

ネイティブプロジェクトはCIでCapacitorから再生成し、`scripts/configure-native.mjs` で必要設定を適用します。Windows上でSwift/設定コードを編集できます。iOSビルドはmacOS runnerのXcodeで行います。

端末から接続するバックエンドはHTTPSで到達できる必要があります。GitHub Repository Variable `API_BASE_URL` に設定するか、ネイティブアプリのログイン画面で入力します。Webを別ホストで配布する場合は `VITE_API_BASE_URL` とバックエンドの `CORS_ORIGINS` を設定し、SPAのルートをindex.htmlへ転送してください。

### 署名用GitHub Secrets

- Android：ANDROID_KEYSTORE_BASE64、ANDROID_KEYSTORE_PASSWORD、ANDROID_KEY_ALIAS、ANDROID_KEY_PASSWORD。
- iOS：APPLE_CERTIFICATE_BASE64、APPLE_CERTIFICATE_PASSWORD、APPLE_PROVISION_PROFILE_BASE64、APPLE_TEAM_ID、APPLE_BUNDLE_ID。
- 任意Variable：APPLE_EXPORT_METHOD（既定 `release-testing`。配布目的に適したProfileを使用）。

Apple署名がない実行はSimulatorビルド成功として報告し、`Manu-Tailor-ios-signing-required` に理由を保存します。実機IPAを生成したとは表示しません。Release全体ではIPA不足を明示して失敗させ、他のArtifactsは取得可能にします。

## テスト

```powershell
.\scripts\environment.ps1
pnpm lint
pnpm typecheck
pnpm test
pnpm build
Push-Location apps/backend
& ../../.venv/Scripts/python.exe -m pytest -q
& ../../.venv/Scripts/ruff.exe check --config pyproject.toml app tests
& ../../.venv/Scripts/mypy.exe --config-file pyproject.toml app
Pop-Location
pnpm exec playwright install chromium
$env:MANU_ROOT = "$PWD\temp\e2e"
pnpm test:e2e
```

E2Eは専用DBで実行します。既に起動しているサーバーを使う場合、そのDBにテストデータが作成されます。通常アプリを停止してから実行してください。画面キャプチャとトレースは `test-results/`、HTMLレポートは `playwright-report/` に出力されます。

数値10kg→100kg、禁止の反転、保護メガネ警告の欠落、8→7手順、画像欠落、APIアクセス制御、3回再試行後の公開拒否を検証します。UIでは登録・生成・検品・承認・公開・通知・原文表示、好み設定、オフライン、4画面サイズを確認します。

## 保存と既知の制限

- 依存・DB・アップロード・生成物・モデル用キャッシュはプロジェクト配下。`scripts/environment.ps1` でFドライブ側へ設定します。
- 初期調査に使ったCodex添付ファイルと既存のCodexランタイムはCドライブの既存配置です。最初のPythonテスト用一時DBはFドライブへ移動済み。Corepack/GitHub認証などツール自身の少量の設定・資格情報はOS既定保存先を使用します。
- 多段組PDF、図中矢印、複雑な表の意味・正確な領域対応は自動復元できません。画像は保持し、意味説明は未生成ならnullです。元PDFのページへ移動できますが、PDF内部の矩形ハイライトは実装していません。
- NLPは軽量な文字bigram/重要語比較です。一般的な日本語固有名詞NERや事実の安全性を保証するものではありません。検品・管理者確認を省略しません。
- 実AIサービス、FCM/APNs/Web Pushの外部配送、署名済みIPA/APKは、資格情報のない環境では実サービス検証できません。
- ブラウザ保存データは端末側のストレージ制限やユーザー操作で消える場合があります。

## 適応型表示チェック

固定の好み質問票を、回答に応じた問題選択・ベイズ更新・形式比較へ拡張しました。利用者の「表示の好みをチェック」から開始できます。管理者は「利用者 → 表示チェックの記録」で選問理由・推定・回答履歴を確認できます。

合成デモは `assessment-a` 〜 `assessment-d`（パスワード `manutailor-demo`）。表示提案、問題バンクの人間による確認、小規模モデルの学習手順、校正前の制限は [詳細説明](docs/adaptive-assessment.md) を参照してください。人間による問題レビューと実測校正は未完了です。

## 次の改良候補

日本語OCRの同梱、PDF座標付きハイライト、組織別SSO、Push再送ジョブ、複雑な図の検証、多言語、ふりがな辞書拡張、実利用者による問題校正、実機アクセシビリティテスト。
