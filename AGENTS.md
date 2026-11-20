# AGENTS.md

## 1. プロジェクト概要 & 技術スタック

- Framework: Next.js 15.5.28 (App Router) / React 19
- Language: TypeScript 5.7.3
- Database / ORM: PostgreSQL 16 / Drizzle ORM 0.45.4 (postgres.js)
- Styling: Tailwind CSS 3.4.17
- Package Manager: npm

## 2. 検証コマンド (Verification Ground Truth)

エージェントはコード修正後、以下のコマンドを実行して正常終了（Exit Code 0）を確認すること。
**機能追加および API・DB・UI の修正を行った際は、静的検証のみで完結せず、原則としてローカルの PostgreSQL（ポート 5532）および開発サーバー（`npm run dev` / ポート 3080）を起動した上で、総合テストや実画面・API の動作検証を必ず実施すること。**

- 型チェック: `npx tsc --noEmit`
- ビルド検証: `npm run build`
- 単体・セキュリティ検証: `npx tsx scripts/test-security-unit.ts`（および関連する `scripts/test-*-unit.ts`）
- 総合テスト（ローカル DB & 開発サーバー起動の上、原則実施）: `npx tsx scripts/comprehensive-test.ts`
  - 未起動時の準備: `npm run db:up` → 必要に応じて `npm run db:migrate` / `npm run db:seed` → バックグラウンドで `npm run dev` 起動後に実行（検証後は起動した開発サーバーを停止）。
  - Docker/DB 起動が環境制約により不可能な場合のみ、具体的な障害理由を明示して静的検証結果を報告すること。

## 3. 参照ディレクトリ

- 仕様書正本: `for_agent/` 配下のすべての .md ファイル
- ガードレール: `for_agent/guardrails.md`
- 進捗管理: `Plan.md`
- 変更ログ: `AICHANGELOG.md`
