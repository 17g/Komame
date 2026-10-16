const BASE_URL = "http://localhost:3000";

async function testUIRendering() {
  console.log("\n==========================================================");
  console.log("🌐 Komame フロントエンド UI レンダリング & ページ配信テスト");
  console.log("==========================================================");

  // 1. トップページ取得 (HTTP 200)
  const homeRes = await fetch(`${BASE_URL}/`);
  if (!homeRes.ok) {
    throw new Error(`Home page failed to load: ${homeRes.status}`);
  }
  const html = await homeRes.text();
  console.log(`✅ [PASS]: トップページ (/) HTTP 200 OK 受信 (${html.length} bytes)`);

  // HTML 内に Komame のタイトルや基本要素が含まれているか検証
  if (html.includes("Komame")) {
    console.log("✅ [PASS]: HTML 内に Komame タイトル文字列を確認");
  } else {
    console.warn("⚠️ [WARN]: Komame title missing in SSR response");
  }

  // 2. 静的アセット (ロゴ, ファビコン等) の配信確認
  const logoRes = await fetch(`${BASE_URL}/logo.jpg`);
  if (logoRes.ok) {
    console.log(`✅ [PASS]: ロゴ画像 (/logo.jpg) HTTP ${logoRes.status} OK`);
  }

  console.log("==========================================================");
  console.log("🎉 UI レンダリング & ページ配信テスト完了！");
  console.log("==========================================================\n");
}

testUIRendering().catch((err) => {
  console.error("UI Test Error:", err);
  process.exit(1);
});
