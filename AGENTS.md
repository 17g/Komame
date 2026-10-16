# AGENTS.md

## 1. プロジェクト概要 & 技術スタック

- Framework: Next.js 15.1.6 (App Router) / React 19
- Language: TypeScript 5.7.3
- Database / ORM: PostgreSQL 16 / Drizzle ORM 0.38.4 (postgres.js)
- Styling: Tailwind CSS 3.4.17
- Package Manager: npm

## 2. 検証コマンド (Verification Ground Truth)

エージェントはコード修正後、以下のコマンドを実行して正常終了（Exit Code 0）を確認すること。

- 型チェック: `npx tsc --noEmit`
- ビルド検証: `npm run build`
- 総合テスト（※開発サーバー起動時）: `npx tsx scripts/comprehensive-test.ts`

## 3. 参照ディレクトリ

- 仕様書正本: `for_agent/` 配下のすべての .md ファイル
- ガードレール: `for_agent/guardrails.md`
- 進捗管理: `Plan.md`
- 変更ログ: `AICHANGELOG.md`
