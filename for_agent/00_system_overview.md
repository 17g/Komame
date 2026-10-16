# 『Komame』システム概要・全体アーキテクチャ仕様書

## 1. プロダクト概要

**プロダクト名**: Komame（こまめ）  
**ビジョン**: 「こまめ（Komame）な記録が、確かな安心と資産の芽を育てる」  
**コンセプト**:
現代の決済手段（現金、クレジットカード、デビットカード、QRコード決済、銀行口座振替など）の多様化に伴い複雑化した「いつ・どこから・いくら引き落とされるのか」「引き落とし口座の原資は足りているか」を直感的に把握できる家庭用家計簿Webアプリケーション。

---

## 2. システムの主要機能

1. **マルチテナント・スキーマ完全分離**:
   - 単一PostgreSQL 16インスタンス内で世帯ごとにスキーマ（`tenant_{household_id}`）を分離。
   - 他家庭のデータとの混在を物理・論理レベルで100%防止。
2. **複数決済手段と口座残高・資金移動の一元掌握**:
   - 支出登録時に決済手段種別（現金/QR/デビットは即時減額、クレジットカードは引き落とし予定日に紐づく口座から減額）に応じて残高を自動計算。
   - 貯蓄・投資（NISA、定期預金等）への振替登録で、出金口座から減額し投資先口座へ同額加算する自動受入明細生成。
   - 口座内のバーチャル貯蓄（資金色分け・ロック）により、実質利用可能残高と総資産を分離表示。
3. **2段階一時保存（手動 ＆ 2秒デバウンス自動退避）**:
   - 入力中のデータを「手動保存」および「2秒キー入力停止後の自動保存」で退避。
   - 再開時に手動・自動スロットからワンタップ復元。
4. **24時間チェックポイントリバート機能**:
   - 操作ごとにチェックポイントを生成（有効期限24時間）。
   - 誤登録やインポートミス時に、特定チェックポイント以降の明細・残高を安全に一括ロールバック。
5. **ゲーミフィケーション・モチベーション向上**:
   - こまめ草生やし（Activity Bean Heatmap）: 記録頻度の濃淡カレンダー。
   - まめの樹（Bean Sprout）育成システム: 貯蓄目標や継続日数に応じた新芽の成長。
   - やさしいほめ言葉・アドバイス通知。
6. **5大画面テーマ即時切替**:
   - ①Natural Komame (枝豆グリーン・初期デフォルト)
   - ②Warm Latte & Washi (和モダン・温もりラテ)
   - ③Modern FinTech Indigo (洗練インディゴブルー)
   - ④Forest & Mint Clean (深呼吸フォレスト・北欧風)
   - ⑤Slate Minimal Dark (目に優しいスレートダーク)

---

## 3. 技術スタック

| レイヤー | 採用技術 | バージョン / 詳細 |
| :--- | :--- | :--- |
| **Framework** | Next.js (App Router) | 15.1.6 |
| **Core UI** | React / React DOM | 19.0.0 |
| **Language** | TypeScript | 5.7.3 |
| **Styling** | Tailwind CSS / Lucide React | 3.4.17 / 0.474.0 |
| **Database** | PostgreSQL | 16 (開発・本番共通) |
| **ORM / Driver** | Drizzle ORM / postgres (postgres.js) | 0.38.4 / 3.4.5 |
| **Authentication** | `@node-rs/argon2` + `jose` (JWT) | Argon2id + HS256 JWT |
| **Logging** | Pino + pino-pretty | 9.6.0 / 13.0.0 |
| **Testing** | Playwright / tsx | 1.63.0 / 4.19.2 |

---

## 4. プロジェクト構成

```
Komame/
├── docs/                      # オリジナル要件・設計書
├── for_agent/                 # エージェント用仕様書正本
│   ├── 00_system_overview.md
│   ├── 01_requirements_specification.md
│   ├── 02_architecture_and_tech_stack.md
│   ├── 03_database_design.md
│   ├── 04_api_specifications.md
│   ├── 05_ui_ux_and_design_system.md
│   ├── 06_operation_and_testing_guide.md
│   └── guardrails.md
├── mockup/                    # 静的モックアップ HTML
├── public/                    # 静的アセット（ロゴ画像等）
├── scripts/                   # テスト・検証スクリプト
├── src/
│   ├── app/                   # Next.js App Router (UI & API)
│   │   ├── api/               # REST API エンドポイント
│   │   ├── globals.css        # テーマ定義・CSS変数
│   │   ├── layout.tsx         # ルートレイアウト
│   │   └── page.tsx           # メインページ
│   ├── components/            # UIコンポーネント群
│   ├── db/                    # DB接続・スキーマ定義・マイグレーション
│   │   ├── index.ts
│   │   ├── migrate.ts
│   │   ├── seed.ts
│   │   └── schema/
│   │       ├── master.ts      # public スキーマ
│   │       └── tenant.ts      # tenant_xxx スキーマ
│   ├── lib/                   # ユーティリティ・認証・ロガー・i18n
│   └── types/                 # TypeScript型定義
├── AGENTS.md                  # エージェント憲章
├── AICHANGELOG.md             # 作業変更履歴
└── Plan.md                    # 実装計画・タスク管理
```
