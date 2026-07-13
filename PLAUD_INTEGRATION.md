# Plaudノート連携

Plaud（AIボイスレコーダー）で録音・文字起こし・要約したノートを、この静的サイト上に表示する仕組みです。

- 表示ページ: [`notes.html`](./notes.html)
- データファイル: [`data/plaud-notes.json`](./data/plaud-notes.json)

`notes.html` はブラウザから `data/plaud-notes.json` を読み込んで自動描画します。
**このJSONを更新すれば表示内容が変わります。** いまは手動で編集する運用です。

---

## 1. データの書き方（手動運用）

`data/plaud-notes.json` の `notes` 配列に、ノートを1件ずつ追加します。

```json
{
  "notes": [
    {
      "id": "2026-07-13-team-sync",           // 一意なID（重複しないもの）
      "title": "定例チームミーティング",         // タイトル（必須）
      "date": "2026-07-13T10:00:00+09:00",    // ISO 8601形式の日時（必須）
      "duration": "32分",                       // 録音時間（任意）
      "tags": ["会議", "プロジェクトA"],         // タグ（任意・フィルターに使われる）
      "summary": "…要約…",                      // 要約（必須）
      "highlights": ["要点1", "要点2"],          // 箇条書きの要点（任意）
      "actionItems": [                          // アクション項目（任意）
        { "task": "やること", "owner": "担当者", "done": false }
      ],
      "transcript": "…文字起こし全文…"           // 全文（任意・クリックで展開）
    }
  ]
}
```

### フィールド一覧

| フィールド | 必須 | 内容 |
|---|---|---|
| `id` | ✅ | ノートを一意に識別するID |
| `title` | ✅ | ノートのタイトル |
| `date` | ✅ | 録音日時（ISO 8601）。新しい順に自動ソートされます |
| `summary` | ✅ | 要約テキスト |
| `duration` | | 録音時間（表示用の文字列） |
| `tags` | | タグの配列。ページ上部のフィルターに使われます |
| `highlights` | | 要点の配列（箇条書き表示） |
| `actionItems` | | `{ task, owner, done }` の配列 |
| `transcript` | | 文字起こし全文。カード内でクリック展開されます |

> メモ: 表示はすべて HTML エスケープされるため、要約や文字起こしに記号が含まれても安全に表示されます。

---

## 2. ローカルでの確認方法

`notes.html` を `file://` で直接開くと、ブラウザの制約で `fetch()` がブロックされます。
ローカルサーバー経由で開いてください。

```bash
# リポジトリのルートで実行
python3 -m http.server 8000
# → http://localhost:8000/notes.html を開く
```

GitHub Pages 上ではそのまま動作します。

---

## 3. 自動連携（将来ステップ / 未設定）

現状は手動更新ですが、次のいずれかで `data/plaud-notes.json` を自動更新すれば、
録音・要約するたびにサイトへ自動反映できます。

### 方式A: Zapier（ノーコード・推奨）

Plaud は Zapier の **トリガー** として「文字起こし完了 / 要約完了」を発火できます。

```
Plaud（Summary generated / Transcript generated）
   → Zapier
   → GitHub の data/plaud-notes.json を更新（コミット）
   → GitHub Pages が配信 → notes.html が自動表示
```

設定の流れ（概略）:

1. Plaud アプリ / Web（app.plaud.ai）で Zapier 連携を有効化する。
2. Zapier で新規 Zap を作成し、トリガーに **Plaud** の「Summary generated」等を選ぶ。
3. アクションで JSON を更新する。静的サイトなので、リポジトリのファイルに書き込むのが安全（ブラウザにキーを置かずに済む）。
   - 例1: **GitHub**（Zapier公式アクション）で既存 `data/plaud-notes.json` を取得 → 追記 → コミット。
   - 例2: **Webhooks by Zapier** で GitHub の Contents API（`PUT /repos/{owner}/{repo}/contents/data/plaud-notes.json`）を直接叩く。
   - 例3: GitHub Actions を `repository_dispatch` で起動し、ワークフロー側でJSONを組み立ててコミット。
4. Plaud のフィールド（summary / transcript / created 等）を、上記のJSONスキーマにマッピングする。

> 参考: Plaud は現状 Zapier の「トリガー」専用（他アプリから Plaud を操作することはできません）。

### 方式B: Plaud Developer API / SDK（開発者向け）

`docs.plaud.ai` の Developer Platform を使うと、Webhook で文字起こしを受け取れます。
ただし **申請・承認が必要** で、Webhook を受けるサーバー（バックエンド）が別途必要になります。
静的サイト単体では完結しないため、方式Aより大がかりです。

---

## セキュリティ注意

- APIキーやトークンを **`notes.html` や JSON に直接書かないでください**（GitHub Pages は公開されます）。
- 認証が必要な処理はすべて Zapier / GitHub Actions などサーバー側で行い、
  サイトには「公開してよい要約テキスト」だけを置く運用にしてください。
