/**
 * Komame PC用サイドバー ビューポート高固定・下部アクション常時表示 静的レイアウト検証スクリプト (Phase 17)
 *
 * 実行方法: npx tsx scripts/test-sidebar-layout-unit.ts
 * 検証対象:
 *   1. Sidebar.tsx <aside> のビューポート高固定 (h-screen / h-dvh)・sticky top-0・self-start・shrink-0・min-h-screen 排除
 *   2. Sidebar.tsx 上部エリアの独立縦スクロール指定 (flex-1 min-h-0 overflow-y-auto)
 *   3. Sidebar.tsx 下部フッター領域の下端常時固定指定 (shrink-0) と CSV / ログアウト配置
 *   4. src/app/page.tsx 親Flexコンテナに sticky 追従を阻害する overflow 指定がないこと
 */

import fs from "fs";
import path from "path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [ASSERTION FAILED]: ${message}`);
    throw new Error(message);
  } else {
    console.log(`✅ [PASS]: ${message}`);
  }
}

function extractClassTokens(tagSnippet: string): Set<string> {
  const match = tagSnippet.match(/className="([^"]+)"/);
  if (!match) {
    return new Set();
  }
  return new Set(match[1].split(/\s+/).filter(Boolean));
}

const readNormalized = (relPath: string): string =>
  fs.readFileSync(path.resolve(process.cwd(), relPath), "utf-8").replace(/\r\n/g, "\n");

console.log("=================================================");
console.log("🧭 Komame PC Sidebar Layout Unit & Static Tests");
console.log("=================================================\n");

const sidebarSrc = readNormalized("src/components/Sidebar.tsx");
const pageSrc = readNormalized("src/app/page.tsx");

// =========================================================
// 1. <aside> のビューポート高固定 & sticky 追従検証
// =========================================================
console.log("--- 1. Sidebar <aside> Viewport Height & Sticky Constraints ---");

const asideMatch = sidebarSrc.match(/<aside\s+[^>]*>/);
assert(Boolean(asideMatch), "Sidebar.tsx contains <aside> element");

const asideClasses = extractClassTokens(asideMatch![0]);
assert(
  asideClasses.has("hidden") && asideClasses.has("lg:flex"),
  "<aside> preserves responsive visibility (hidden lg:flex)"
);
assert(
  asideClasses.has("h-screen") || asideClasses.has("h-dvh"),
  "<aside> fixes height to viewport (h-screen or h-dvh)"
);
assert(
  !asideClasses.has("min-h-screen"),
  "<aside> does not use min-h-screen (prevents stretching with main area)"
);
assert(
  asideClasses.has("sticky") && asideClasses.has("top-0"),
  "<aside> sticks to viewport top (sticky top-0)"
);
assert(
  asideClasses.has("self-start"),
  "<aside> uses self-start to avoid flex-stretch inside parent container"
);
assert(
  asideClasses.has("shrink-0"),
  "<aside> uses shrink-0 to preserve fixed sidebar width"
);
assert(
  asideClasses.has("flex-col"),
  "<aside> uses flex-col for top-scrollable / bottom-fixed layout"
);
assert(
  asideClasses.has("overflow-hidden"),
  "<aside> uses overflow-hidden to keep scroll strictly within upper container"
);

// =========================================================
// 2. 上部エリア（ロゴ・ナビ・テーマ・言語）の独立縦スクロール検証
// =========================================================
console.log("\n--- 2. Sidebar Upper Scrollable Container ---");

const upperContainerMatch = sidebarSrc.match(
  /<aside\s+[^>]*>\s*\n\s*(<div\s+className="[^"]+">)/
);
assert(Boolean(upperContainerMatch), "Sidebar.tsx has upper container <div> directly under <aside>");

const upperClasses = extractClassTokens(upperContainerMatch![1]);
assert(upperClasses.has("flex-1"), "Upper container has flex-1");
assert(upperClasses.has("min-h-0"), "Upper container has min-h-0 (required for flex child scrolling)");
assert(upperClasses.has("overflow-y-auto"), "Upper container has overflow-y-auto for narrow viewports");

// =========================================================
// 3. 下部フッター（ユーザー情報・CSV・ログアウト）の常時下端固定検証
// =========================================================
console.log("\n--- 3. Sidebar Lower Fixed Footer Actions ---");

const footerMatch = sidebarSrc.match(
  /\{\/\*\s*下部 ユーザープロファイル & ログアウト\s*\*\/\}\s*\n\s*\{user && \(\s*\n\s*(<div\s+className="[^"]+">)([\s\S]*?)<\/aside>/
);
assert(Boolean(footerMatch), "Sidebar.tsx contains lower user/actions footer section");

const footerClasses = extractClassTokens(footerMatch![1]);
const footerBody = footerMatch![2];
assert(footerClasses.has("shrink-0"), "Lower footer has shrink-0 to remain pinned at sidebar bottom");
assert(footerBody.includes("user.email"), "Lower footer renders user email");
assert(footerBody.includes('href="/api/admin/csv"'), "Lower footer contains CSV download link");
assert(footerBody.includes("onLogout"), "Lower footer contains logout button handler");

// =========================================================
// 4. src/app/page.tsx 親Flexコンテナの sticky 非阻害検証
// =========================================================
console.log("\n--- 4. Parent Flex Container Sticky Compatibility (src/app/page.tsx) ---");

const parentContainerMatch = pageSrc.match(
  /\/\/\s*ログイン後:\s*本格レスポンシブ画面\s*\n\s*return \(\s*\n\s*(<div\s+className="[^"]+">)/
);
assert(Boolean(parentContainerMatch), "page.tsx contains authenticated root layout container");

const parentClasses = extractClassTokens(parentContainerMatch![1]);
assert(parentClasses.has("flex"), "Parent container uses flex layout");
assert(parentClasses.has("min-h-screen"), "Parent container uses min-h-screen");
for (const forbidden of ["overflow-hidden", "overflow-auto", "overflow-y-auto", "overflow-x-hidden", "overflow-scroll"]) {
  assert(
    !parentClasses.has(forbidden),
    `Parent container does not have "${forbidden}" (would break position: sticky)`
  );
}

console.log("\n=================================================");
console.log("🎉 ALL SIDEBAR LAYOUT UNIT & STATIC TESTS PASSED!");
console.log("=================================================");
